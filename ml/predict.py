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

# Must match training script features
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
        "home_table_position": home.get("tablePosition", 10),
        "home_points": home.get("pointsTotal", 0),
        "home_matches_played": home.get("matchesPlayed", 1),
        "home_goals_for": home.get("goalsFor", 0),
        "home_goals_against": home.get("goalsAgainst", 0),
        "home_xg_for": home.get("xgFor", 0),
        "home_xg_against": home.get("xgAgainst", 0),
        "home_rest_days": home.get("restDays", 3),
        "home_motivation": home.get("motivation", 50),
        "home_key_player_status": home.get("keyPlayerStatus", "available"),

        "away_table_position": away.get("tablePosition", 10),
        "away_points": away.get("pointsTotal", 0),
        "away_matches_played": away.get("matchesPlayed", 1),
        "away_goals_for": away.get("goalsFor", 0),
        "away_goals_against": away.get("goalsAgainst", 0),
        "away_xg_for": away.get("xgFor", 0),
        "away_xg_against": away.get("xgAgainst", 0),
        "away_rest_days": away.get("restDays", 3),
        "away_travel_km": away.get("travelKm", 0),
        "away_motivation": away.get("motivation", 50),
        "away_key_player_status": away.get("keyPlayerStatus", "available"),

        "derby": int(ctx.get("derby", False)),
        "must_win_home": int(ctx.get("mustWinHome", False)),
        "must_win_away": int(ctx.get("mustWinAway", False)),
        "low_division": int(ctx.get("lowDivision", False)),
        "weather_risk": ctx.get("weatherRisk", "low"),
        "playoff": int(ctx.get("playoff", False)),
        "relegation_risk": ctx.get("relegationRisk", 0),
        "rival_rivalry": int(ctx.get("rivalRivalry", False)),
        "copa_vs_league": int(ctx.get("copaVsLeague", False)),
        "prize_money": ctx.get("prizeMoney", 0),
        "psychological_pressure": ctx.get("psychologicalPressure", 0),
        "underdog_freedom": ctx.get("underdogFreedom", 0),
        "favorite_paralysis": ctx.get("favoriteParalysis", 0),

        "coverage_tier": cov.get("tier", "standard"),
        "has_lineups": int(cov.get("hasLineups", False)),
        "has_odds": int(cov.get("hasOdds", False)),
        "has_xg": int(cov.get("hasXg", False)),
        "has_injuries": int(cov.get("hasInjuries", False)),
        "has_referee": int(cov.get("hasReferee", False)),
        "referee_avg_cards": ref.get("avgCards", 3.5),
        "referee_home_bias": ref.get("homeBias", 0),
        "referee_avg_penalties": ref.get("avgPenalties", 0.2),
        "referee_strictness": ref.get("strictness", "medium"),

        "home_win_odds": mkt.get("homeWinOdds") or 0,
        "draw_odds": mkt.get("drawOdds") or 0,
        "away_win_odds": mkt.get("awayWinOdds") or 0,
        "over25_odds": mkt.get("over25Odds") or 0,
        "btts_yes_odds": mkt.get("bttsYesOdds") or 0,
    }
    return pd.DataFrame([row])


def encode_for_xgboost_lgbm(df: pd.DataFrame) -> pd.DataFrame:
    """Label-encode categoricals so XGB/LGBM can consume them."""
    df_enc = df.copy()
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        df_enc[col] = le.fit_transform(df_enc[col].astype(str))
    return df_enc


def predict(fixture: dict, models: dict, meta: dict):
    df = fixture_to_features(fixture)
    df_enc = encode_for_xgboost_lgbm(df)

    classes = meta.get("classes", ["AWAY_WIN", "DRAW", "HOME_WIN"])
    probabilities = {}

    if "catboost" in models:
        cb = models["catboost"]
        proba = cb.predict_proba(df)[0]
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
            shap_values = explainer.shap_values(df)
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
