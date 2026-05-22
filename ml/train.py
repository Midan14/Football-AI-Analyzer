#!/usr/bin/env python3
"""
ML Training Pipeline — Football AI Analyzer
Trains CatBoost, XGBoost, LightGBM on historical matches stored in PostgreSQL.
Uses Optuna for hyperparameter tuning and SHAP for explainability.

Usage:
    python3 ml/train.py --min-samples 200 --trials 50

Outputs:
    ml/models/catboost_1x2.cbm
    ml/models/xgboost_1x2.json
    ml/models/lgbm_1x2.txt
    ml/models/ensemble_meta.pkl
    ml/models/meta.json
"""

import os
import sys
import json
import argparse
import warnings
from datetime import datetime
from typing import List, Tuple

import numpy as np
import pandas as pd
import psycopg2
from sklearn.model_selection import train_test_split
from sklearn.metrics import log_loss, accuracy_score
from sklearn.preprocessing import LabelEncoder
import joblib

from catboost import CatBoostClassifier
import xgboost as xgb
import lightgbm as lgb
import optuna
import shap

warnings.filterwarnings("ignore")

DB_URL = os.environ.get("DATABASE_URL", "postgresql://football_user:password@localhost:5432/football_ai")

NUMERIC_FEATURES = [
    "homeTablePosition", "homePoints", "homeMatchesPlayed",
    "homeGoalsFor", "homeGoalsAgainst", "homeXgFor", "homeXgAgainst",
    "homeRestDays", "homeMotivation",
    "awayTablePosition", "awayPoints", "awayMatchesPlayed",
    "awayGoalsFor", "awayGoalsAgainst", "awayXgFor", "awayXgAgainst",
    "awayRestDays", "awayTravelKm", "awayMotivation",
    "relegationRisk", "psychologicalPressure", "underdogFreedom", "favoriteParalysis",
    "prizeMoney",
    "refereeAvgCards", "refereeHomeBias", "refereeAvgPenalties",
    "homeWinOdds", "drawOdds", "awayWinOdds", "over25Odds", "bttsYesOdds",
]

CATEGORICAL_FEATURES = [
    "coverageTier", "weatherRisk", "refereeStrictness",
    "homeKeyPlayerStatus", "awayKeyPlayerStatus",
]

BOOLEAN_FEATURES = [
    "derby", "mustWinHome", "mustWinAway", "lowDivision",
    "playoff", "rivalRivalry", "copaVsLeague",
    "hasLineups", "hasOdds", "hasXg", "hasInjuries", "hasReferee",
]

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES + BOOLEAN_FEATURES

NUM_CLASSES = 3


def load_data(min_samples: int = 200) -> pd.DataFrame:
    conn = psycopg2.connect(DB_URL)
    query = f"""
    SELECT
      {', '.join(f'"{f}"' for f in ALL_FEATURES)},
      "actualResult", "actualBtts", "actualOver25",
      "actualHomeGoals", "actualAwayGoals"
    FROM "TrainingData"
    WHERE "actualResult" IS NOT NULL
    ORDER BY "matchDate" DESC
    LIMIT 50000
    """
    df = pd.read_sql(query, conn)
    conn.close()

    if len(df) < min_samples:
        print(f"WARNING: Only {len(df)} samples (min {min_samples}). Proceeding anyway.")

    for col in ["homeWinOdds", "drawOdds", "awayWinOdds", "over25Odds", "bttsYesOdds"]:
        if df[col].notna().sum() == 0:
            df[col] = 2.0
        else:
            df[col] = df[col].fillna(df[col].median())

    for col in ["homeXgFor", "homeXgAgainst", "awayXgFor", "awayXgAgainst"]:
        df[col] = df[col].fillna(0)

    for col in BOOLEAN_FEATURES:
        df[col] = df[col].astype(int)

    print(f"[Data] Loaded {len(df)} rows · Features {len(ALL_FEATURES)}")
    return df


def prepare_1x2(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    le = LabelEncoder()
    y_raw = le.fit_transform(df["actualResult"])
    classes = list(le.classes_)
    print(f"[1X2] Classes: {classes}")
    X = df[ALL_FEATURES].copy()
    return X, pd.Series(y_raw, name="target"), classes


def safe_log_loss(y_true, y_pred, labels=None):
    if labels is None:
        labels = sorted(set(y_true))
    try:
        return log_loss(y_true, y_pred, labels=labels)
    except ValueError:
        return 999.0


def train_catboost(X_train, y_train, X_val, y_val, cat_features: List[str], trials: int = 30):
    skip_optuna = len(X_train) < 50

    def objective(trial):
        params = {
            "iterations": trial.suggest_int("iterations", 200, 1000),
            "depth": trial.suggest_int("depth", 4, 10),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1e-3, 10, log=True),
            "random_seed": 42,
            "verbose": False,
            "loss_function": "MultiClass",
            "classes_count": 3,
        }
        model = CatBoostClassifier(**params)
        model.fit(
            X_train, y_train,
            cat_features=cat_features,
            eval_set=(X_val, y_val),
            early_stopping_rounds=50,
            verbose=False,
        )
        preds = model.predict_proba(X_val)
        return log_loss(y_val, preds, labels=[0, 1, 2])

    if skip_optuna:
        model = CatBoostClassifier(iterations=300, depth=6, learning_rate=0.1, random_seed=42,
                                    verbose=False, loss_function="MultiClass", classes_count=3)
        model.fit(X_train, y_train, cat_features=cat_features, verbose=False)
        preds = model.predict_proba(X_val)
        loss = log_loss(y_val, preds, labels=[0, 1, 2])
        return model, loss

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=trials, show_progress_bar=True)

    best = study.best_params
    best["random_seed"] = 42
    best["verbose"] = False
    best["loss_function"] = "MultiClass"
    best["classes_count"] = 3

    model = CatBoostClassifier(**best)
    model.fit(X_train, y_train, cat_features=cat_features, verbose=False)
    return model, study.best_value


def train_xgboost(X_train, y_train, X_val, y_val, trials: int = 30):
    skip_optuna = len(X_train) < 50

    def objective(trial):
        params = {
            "max_depth": trial.suggest_int("max_depth", 3, 10),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "n_estimators": trial.suggest_int("n_estimators", 100, 800),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 1.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 1.0, log=True),
            "objective": "multi:softprob",
            "num_class": 3,
            "eval_metric": "mlogloss",
            "random_state": 42,
            "use_label_encoder": False,
        }
        model = xgb.XGBClassifier(**params)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        preds = model.predict_proba(X_val)
        return log_loss(y_val, preds, labels=[0, 1, 2])

    if skip_optuna:
        model = xgb.XGBClassifier(max_depth=6, learning_rate=0.1, n_estimators=300,
                                   objective="multi:softprob", num_class=3,
                                   eval_metric="mlogloss", random_state=42)
        model.fit(X_train, y_train, verbose=False)
        preds = model.predict_proba(X_val)
        loss = log_loss(y_val, preds, labels=[0, 1, 2])
        return model, loss

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=trials, show_progress_bar=True)

    best = study.best_params
    best["objective"] = "multi:softprob"
    best["num_class"] = 3
    best["eval_metric"] = "mlogloss"
    best["random_state"] = 42
    best["use_label_encoder"] = False

    model = xgb.XGBClassifier(**best)
    model.fit(X_train, y_train, verbose=False)
    return model, study.best_value


def train_lightgbm(X_train, y_train, X_val, y_val, trials: int = 30):
    skip_optuna = len(X_train) < 50

    def objective(trial):
        params = {
            "num_leaves": trial.suggest_int("num_leaves", 20, 150),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "n_estimators": trial.suggest_int("n_estimators", 100, 800),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 1.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 1.0, log=True),
            "objective": "multiclass",
            "num_class": 3,
            "metric": "multi_logloss",
            "random_state": 42,
            "verbose": -1,
        }
        model = lgb.LGBMClassifier(**params)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)])
        preds = model.predict_proba(X_val)
        return log_loss(y_val, preds, labels=[0, 1, 2])

    if skip_optuna:
        model = lgb.LGBMClassifier(num_leaves=31, learning_rate=0.1, n_estimators=300,
                                    objective="multiclass", num_class=3,
                                    metric="multi_logloss", random_state=42, verbose=-1)
        model.fit(X_train, y_train)
        preds = model.predict_proba(X_val)
        loss = log_loss(y_val, preds, labels=[0, 1, 2])
        return model, loss

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=trials, show_progress_bar=True)

    best = study.best_params
    best["objective"] = "multiclass"
    best["num_class"] = 3
    best["metric"] = "multi_logloss"
    best["random_state"] = 42
    best["verbose"] = -1

    model = lgb.LGBMClassifier(**best)
    model.fit(X_train, y_train)
    return model, study.best_value


def evaluate(model, X_test, y_test, name: str, classes: List[str]):
    preds = model.predict_proba(X_test)
    pred_cls = np.argmax(preds, axis=1)
    acc = accuracy_score(y_test, pred_cls)
    ll = safe_log_loss(y_test, preds, labels=list(range(len(classes))))
    print(f"[{name}] Accuracy={acc:.3f} · LogLoss={ll:.4f}")
    return {"accuracy": acc, "log_loss": ll}


def shap_summary(models: dict, X_sample: pd.DataFrame, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    for name, model in models.items():
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_sample.iloc[:min(100, len(X_sample))])
            shap.summary_plot(shap_values, X_sample.iloc[:min(100, len(X_sample))], show=False)
            import matplotlib.pyplot as plt
            plt.savefig(f"{output_dir}/shap_{name}.png", bbox_inches="tight")
            plt.close()
            print(f"[SHAP] {name} summary saved")
        except Exception as e:
            print(f"[SHAP] {name} skipped: {e}")


def save_models(models: dict, feature_names: List[str], classes: List[str], output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    for name, model in models.items():
        path = f"{output_dir}/{name}_1x2"
        if name == "catboost":
            model.save_model(f"{path}.cbm")
        elif name == "xgboost":
            model.save_model(f"{path}.json")
        elif name == "lightgbm":
            model.booster_.save_model(f"{path}.txt")
        print(f"[Save] {name} -> {path}")

    meta = {"feature_names": feature_names, "classes": classes, "trained_at": datetime.utcnow().isoformat()}
    with open(f"{output_dir}/meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    joblib.dump({"names": list(models.keys())}, f"{output_dir}/ensemble_meta.pkl")


def main():
    parser = argparse.ArgumentParser(description="Train ML models on football historical data")
    parser.add_argument("--min-samples", type=int, default=200)
    parser.add_argument("--trials", type=int, default=30, help="Optuna trials per model")
    parser.add_argument("--output", type=str, default="ml/models")
    args = parser.parse_args()

    df = load_data(args.min_samples)
    X, y, classes = prepare_1x2(df)

    X_enc = X.copy()
    for col in CATEGORICAL_FEATURES:
        X_enc[col] = LabelEncoder().fit_transform(X_enc[col].astype(str))

    X_train, X_test, y_train, y_test = train_test_split(X_enc, y, test_size=max(1, int(len(X_enc) * 0.2)), random_state=42)
    if len(X_train) > 20:
        X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42)
    else:
        X_val, y_val = X_train, y_train

    print(f"[Split] Train={len(X_train)} · Val={len(X_val)} · Test={len(X_test)}")

    cb_model, _ = train_catboost(X_train, y_train, X_val, y_val, CATEGORICAL_FEATURES, args.trials)
    evaluate(cb_model, X_test, y_test, "CatBoost", classes)

    xgb_model, _ = train_xgboost(X_train, y_train, X_val, y_val, args.trials)
    evaluate(xgb_model, X_test, y_test, "XGBoost", classes)

    lgb_model, _ = train_lightgbm(X_train, y_train, X_val, y_val, args.trials)
    evaluate(lgb_model, X_test, y_test, "LightGBM", classes)

    cb_proba = cb_model.predict_proba(X_test)
    xgb_proba = xgb_model.predict_proba(X_test)
    lgb_proba = lgb_model.predict_proba(X_test)
    ensemble_proba = (cb_proba + xgb_proba + lgb_proba) / 3
    ensemble_pred = np.argmax(ensemble_proba, axis=1)
    ensemble_acc = accuracy_score(y_test, ensemble_pred)
    ensemble_ll = safe_log_loss(y_test, ensemble_proba, labels=list(range(len(classes))))
    print(f"[Ensemble] Accuracy={ensemble_acc:.3f} · LogLoss={ensemble_ll:.4f}")

    models = {"catboost": cb_model, "xgboost": xgb_model, "lightgbm": lgb_model}
    save_models(models, ALL_FEATURES, classes, args.output)
    shap_summary(models, X_test, args.output)

    print(f"\n[Done] Models saved to {args.output}")


if __name__ == "__main__":
    main()
