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
    ml/models/feature_names.json
    ml/models/shap_summary.png
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
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import log_loss, accuracy_score, roc_auc_score
from sklearn.preprocessing import LabelEncoder
import joblib

# ML libraries
from catboost import CatBoostClassifier, Pool
import xgboost as xgb
import lightgbm as lgb
import optuna
import shap

warnings.filterwarnings("ignore")

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/football_ai")

# Feature columns used for training
NUMERIC_FEATURES = [
    "home_table_position", "home_points", "home_matches_played",
    "home_goals_for", "home_goals_against", "home_xg_for", "home_xg_against",
    "home_rest_days", "home_motivation",
    "away_table_position", "away_points", "away_matches_played",
    "away_goals_for", "away_goals_against", "away_xg_for", "away_xg_against",
    "away_rest_days", "away_travel_km", "away_motivation",
    "relegation_risk", "psychological_pressure", "underdog_freedom", "favorite_paralysis",
    "prize_money",
    "referee_avg_cards", "referee_home_bias", "referee_avg_penalties",
    "home_win_odds", "draw_odds", "away_win_odds", "over25_odds", "btts_yes_odds",
]

CATEGORICAL_FEATURES = [
    "coverage_tier", "weather_risk", "referee_strictness",
    "home_key_player_status", "away_key_player_status",
]

BOOLEAN_FEATURES = [
    "derby", "must_win_home", "must_win_away", "low_division",
    "playoff", "rival_rivalry", "copa_vs_league",
    "has_lineups", "has_odds", "has_xg", "has_injuries", "has_referee",
]

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES + BOOLEAN_FEATURES


def load_data(min_samples: int = 200) -> pd.DataFrame:
    conn = psycopg2.connect(DB_URL)
    query = f"""
    SELECT
      {', '.join(ALL_FEATURES)},
      actual_result,
      actual_btts,
      actual_over25,
      actual_home_goals,
      actual_away_goals
    FROM "TrainingData"
    WHERE actual_result IS NOT NULL
      AND home_win_odds IS NOT NULL
      AND away_win_odds IS NOT NULL
    ORDER BY match_date DESC
    LIMIT 50000
    """
    df = pd.read_sql(query, conn)
    conn.close()

    if len(df) < min_samples:
        print(f"ERROR: Only {len(df)} samples found (min {min_samples}). Run extractor first.")
        sys.exit(1)

    # Fill missing numeric odds with median
    for col in ["home_win_odds", "draw_odds", "away_win_odds", "over25_odds", "btts_yes_odds"]:
        df[col] = df[col].fillna(df[col].median())

    # Fill missing xG with 0
    for col in ["home_xg_for", "home_xg_against", "away_xg_for", "away_xg_against"]:
        df[col] = df[col].fillna(0)

    # Encode booleans as int
    for col in BOOLEAN_FEATURES:
        df[col] = df[col].astype(int)

    print(f"[Data] Loaded {len(df)} rows · Features {len(ALL_FEATURES)}")
    return df


def prepare_1x2(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    le = LabelEncoder()
    y = le.fit_transform(df["actual_result"])  # HOME_WIN=1, AWAY_WIN=0, DRAW=2 (order depends)
    classes = list(le.classes_)
    print(f"[1X2] Classes: {classes}")
    X = df[ALL_FEATURES].copy()
    return X, pd.Series(y, name="target"), classes


def train_catboost(X_train, y_train, X_val, y_val, cat_features: List[str], trials: int = 30):
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
        return log_loss(y_val, preds)

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
        return log_loss(y_val, preds)

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
        return log_loss(y_val, preds)

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
    ll = log_loss(y_test, preds)
    print(f"[{name}] Accuracy={acc:.3f} · LogLoss={ll:.4f}")
    return {"accuracy": acc, "log_loss": ll}


def shap_summary(models: dict, X_sample: pd.DataFrame, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    for name, model in models.items():
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_sample.iloc[:100])
            shap.summary_plot(shap_values, X_sample.iloc[:100], show=False)
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

    # Save ensemble weights (simple accuracy-based)
    joblib.dump({"names": list(models.keys())}, f"{output_dir}/ensemble_meta.pkl")


def main():
    parser = argparse.ArgumentParser(description="Train ML models on football historical data")
    parser.add_argument("--min-samples", type=int, default=200)
    parser.add_argument("--trials", type=int, default=30, help="Optuna trials per model")
    parser.add_argument("--output", type=str, default="ml/models")
    args = parser.parse_args()

    df = load_data(args.min_samples)
    X, y, classes = prepare_1x2(df)

    # Encode categoricals for XGB/LGBM (CatBoost handles them natively)
    X_enc = X.copy()
    cat_encoders = {}
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        X_enc[col] = le.fit_transform(X_enc[col].astype(str))
        cat_encoders[col] = le

    X_train, X_test, y_train, y_test = train_test_split(X_enc, y, test_size=0.2, random_state=42, stratify=y)
    X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42, stratify=y_train)

    print(f"[Split] Train={len(X_train)} · Val={len(X_val)} · Test={len(X_test)}")

    # CatBoost (uses original categoricals)
    cb_model, cb_loss = train_catboost(X_train, y_train, X_val, y_val, CATEGORICAL_FEATURES, args.trials)
    cb_eval = evaluate(cb_model, X_test, y_test, "CatBoost", classes)

    # XGBoost
    xgb_model, xgb_loss = train_xgboost(X_train, y_train, X_val, y_val, args.trials)
    xgb_eval = evaluate(xgb_model, X_test, y_test, "XGBoost", classes)

    # LightGBM
    lgb_model, lgb_loss = train_lightgbm(X_train, y_train, X_val, y_val, args.trials)
    lgb_eval = evaluate(lgb_model, X_test, y_test, "LightGBM", classes)

    # Ensemble: simple average of probabilities
    cb_proba = cb_model.predict_proba(X_test)
    xgb_proba = xgb_model.predict_proba(X_test)
    lgb_proba = lgb_model.predict_proba(X_test)
    ensemble_proba = (cb_proba + xgb_proba + lgb_proba) / 3
    ensemble_pred = np.argmax(ensemble_proba, axis=1)
    ensemble_acc = accuracy_score(y_test, ensemble_pred)
    ensemble_ll = log_loss(y_test, ensemble_proba)
    print(f"[Ensemble] Accuracy={ensemble_acc:.3f} · LogLoss={ensemble_ll:.4f}")

    models = {"catboost": cb_model, "xgboost": xgb_model, "lightgbm": lgb_model}
    save_models(models, ALL_FEATURES, classes, args.output)
    shap_summary(models, X_test, args.output)

    print(f"\n[Done] Models saved to {args.output}")


if __name__ == "__main__":
    main()
