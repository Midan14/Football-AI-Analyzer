#!/usr/bin/env python3
"""
ML Prediction Service — Node.js callable via stdin/stdout
Usage:
    echo '{"fixture": {...}}' | python3 ml/predict.py
Output:
    JSON with predictions and SHAP explanation
"""

import json
import sys
import os
import warnings
from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from catboost import CatBoostClassifier
import xgboost as xgb
import lightgbm as lgb
import shap

warnings.filterwarnings("ignore")

MODELS_DIR = os.environ.get("ML_MODELS_DIR", "ml/models")

# Must match ml/train.py feature names (camelCase)
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


def load_models():
    models = {}
    cb_path = f"{MODELS_DIR}/catboost_1x2.cbm"
    xgb_path = f"{MODELS_DIR}/xgboost_1x2.json"
    lgb_path = f"{MODELS_DIR}/lgbm_1x2.txt"

    if os.path.exists(cb_path):
        cb = CatBoostClassifier()
        cb.load_model(cb_path)
        models["catboost"] = cb

    if os.path.exists(xgb_path):
        models["xgboost"] = xgb.XGBClassifier()
        models["xgboost"].load_model(xgb_path)

    if os.path.exists(lgb_path):
        models["lightgbm"] = lgb.Booster(model_file=lgb_path)

    with open(f"{MODELS_DIR}/meta.json") as f:
        meta = json.load(f)

    return models, meta


def fixture_to_features(fixture: dict) -> pd.DataFrame:
    """Convert a fixture JSON into a DataFrame row matching training features."""
    home = fixture.get("home", {})
    away = fixture.get("away", {})
    ctx = fixture.get("context", {})
    cov = fixture.get("coverage", {})
    ref = fixture.get("referee", {})
    mkt = fixture.get("market", {})

    row = {
        "homeTablePosition": home.get("tablePosition", 10),
        "homePoints": home.get("pointsTotal", 0),
        "homeMatchesPlayed": home.get("matchesPlayed", 1),
        "homeGoalsFor": home.get("goalsFor", 0),
        "homeGoalsAgainst": home.get("goalsAgainst", 0),
        "homeXgFor": home.get("xgFor", 0),
        "homeXgAgainst": home.get("xgAgainst", 0),
        "homeRestDays": home.get("restDays", 3),
        "homeMotivation": home.get("motivation", 50),
        "homeKeyPlayerStatus": home.get("keyPlayerStatus", "available"),

        "awayTablePosition": away.get("tablePosition", 10),
        "awayPoints": away.get("pointsTotal", 0),
        "awayMatchesPlayed": away.get("matchesPlayed", 1),
        "awayGoalsFor": away.get("goalsFor", 0),
        "awayGoalsAgainst": away.get("goalsAgainst", 0),
        "awayXgFor": away.get("xgFor", 0),
        "awayXgAgainst": away.get("xgAgainst", 0),
        "awayRestDays": away.get("restDays", 3),
        "awayTravelKm": away.get("travelKm", 0),
        "awayMotivation": away.get("motivation", 50),
        "awayKeyPlayerStatus": away.get("keyPlayerStatus", "available"),

        "derby": int(ctx.get("derby", False)),
        "mustWinHome": int(ctx.get("mustWinHome", False)),
        "mustWinAway": int(ctx.get("mustWinAway", False)),
        "lowDivision": int(ctx.get("lowDivision", False)),
        "weatherRisk": ctx.get("weatherRisk", "low"),
        "playoff": int(ctx.get("playoff", False)),
        "relegationRisk": ctx.get("relegationRisk", 0),
        "rivalRivalry": int(ctx.get("rivalRivalry", False)),
        "copaVsLeague": int(ctx.get("copaVsLeague", False)),
        "prizeMoney": ctx.get("prizeMoney", 0),
        "psychologicalPressure": ctx.get("psychologicalPressure", 0),
        "underdogFreedom": ctx.get("underdogFreedom", 0),
        "favoriteParalysis": ctx.get("favoriteParalysis", 0),

        "coverageTier": cov.get("tier", "standard"),
        "hasLineups": int(cov.get("hasLineups", False)),
        "hasOdds": int(cov.get("hasOdds", False)),
        "hasXg": int(cov.get("hasXg", False)),
        "hasInjuries": int(cov.get("hasInjuries", False)),
        "hasReferee": int(cov.get("hasReferee", False)),
        "refereeAvgCards": ref.get("avgCards", 3.5),
        "refereeHomeBias": ref.get("homeBias", 0),
        "refereeAvgPenalties": ref.get("avgPenalties", 0.2),
        "refereeStrictness": ref.get("strictness", "medium"),

        "homeWinOdds": mkt.get("homeWinOdds") or 0,
        "drawOdds": mkt.get("drawOdds") or 0,
        "awayWinOdds": mkt.get("awayWinOdds") or 0,
        "over25Odds": mkt.get("over25Odds") or 0,
        "bttsYesOdds": mkt.get("bttsYesOdds") or 0,
    }
    return pd.DataFrame([row])


def encode_for_xgboost_lgbm(df: pd.DataFrame) -> pd.DataFrame:
    """Label-encode categoricals so XGB/LGBM can consume them."""
    df_enc = df.copy()
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        df_enc[col] = le.fit_transform(df_enc[col].astype(str))
    return df_enc


def align_feature_columns(df: pd.DataFrame, meta: dict) -> pd.DataFrame:
    """Reorder columns to match training order from meta.json."""
    feature_names = meta.get("feature_names")
    if not feature_names:
        return df[ALL_FEATURES]
    for col in feature_names:
        if col not in df.columns:
            df[col] = 0
    return df[feature_names]


def predict(fixture: dict, models: dict, meta: dict):
    df = align_feature_columns(fixture_to_features(fixture), meta)
    df_enc = encode_for_xgboost_lgbm(df)

    classes = meta.get("classes", ["AWAY_WIN", "DRAW", "HOME_WIN"])
    probabilities = {}

    if "catboost" in models:
        cb = models["catboost"]
        # Training uses label-encoded categoricals for all models
        proba = cb.predict_proba(df_enc)[0]
        probabilities["catboost"] = {cls: round(float(proba[i]), 4) for i, cls in enumerate(classes)}

    if "xgboost" in models:
        xgb_m = models["xgboost"]
        proba = xgb_m.predict_proba(df_enc)[0]
        probabilities["xgboost"] = {cls: round(float(proba[i]), 4) for i, cls in enumerate(classes)}

    if "lightgbm" in models:
        lgb_m = models["lightgbm"]
        proba = lgb_m.predict(df_enc)[0]
        probabilities["lightgbm"] = {cls: round(float(proba[i]), 4) for i, cls in enumerate(classes)}

    # Ensemble average
    all_probs = []
    for p in probabilities.values():
        all_probs.append([p[c] for c in classes])
    ensemble = np.mean(all_probs, axis=0)
    probabilities["ensemble"] = {cls: round(float(ensemble[i]), 4) for i, cls in enumerate(classes)}

    # Best class
    best_idx = int(np.argmax(ensemble))
    best_class = classes[best_idx]
    best_prob = round(float(ensemble[best_idx]), 4)

    # SHAP explanation (top 3 drivers)
    shap_explanation = {"top_features": []}
    if "catboost" in models:
        try:
            explainer = shap.TreeExplainer(models["catboost"])
            shap_values = explainer.shap_values(df_enc)
            # shap_values is list of 3 arrays (one per class) for multiclass
            if isinstance(shap_values, list) and len(shap_values) == len(classes):
                class_shap = shap_values[best_idx][0]
                top_idx = np.argsort(-np.abs(class_shap))[:3]
                shap_explanation["top_features"] = [
                    {"feature": ALL_FEATURES[i], "impact": round(float(class_shap[i]), 4)}
                    for i in top_idx
                ]
        except Exception as e:
            shap_explanation["error"] = str(e)

    return {
        "prediction": best_class,
        "confidence": best_prob,
        "probabilities": probabilities,
        "classes": classes,
        "shap": shap_explanation,
    }


def main():
    input_data = json.load(sys.stdin)
    fixture = input_data.get("fixture", {})

    if not os.path.exists(f"{MODELS_DIR}/meta.json"):
        print(json.dumps({"error": "Models not trained. Run ml/train.py first."}))
        sys.exit(1)

    models, meta = load_models()
    result = predict(fixture, models, meta)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
