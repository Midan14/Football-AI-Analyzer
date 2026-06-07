"""
ML Prediction Server — FastAPI microservice.
Serves predictions from trained XGBoost, LightGBM, CatBoost, and Neural Network models.

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8000 --reload

The Next.js app calls this service at http://localhost:8000/predict
"""

import json
import logging
import numpy as np
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from features import extract_features, FEATURE_COLUMNS
from extended_models import library_status, run_extended_models, run_temporal_blend, run_bivariate_poisson
from hybrid_pipeline import get_hybrid_pipeline

app = FastAPI(title="Football AI ML Service", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = Path(__file__).parent / "models"

# Load models at startup
models = {}
scaler = None
label_encoder = None
metadata = None


@app.on_event("startup")
def load_models():
    global models, scaler, label_encoder, metadata

    print("🔄 Loading ML models...")

    # Load scaler
    scaler_path = MODELS_DIR / "feature_scaler.joblib"
    if scaler_path.exists():
        scaler = joblib.load(scaler_path)
        print("  ✓ Feature scaler loaded")

    # Load label encoder
    le_path = MODELS_DIR / "label_encoder.joblib"
    if le_path.exists():
        label_encoder = joblib.load(le_path)
        print(f"  ✓ Label encoder loaded: {label_encoder.classes_}")

    # Load XGBoost
    xgb_path = MODELS_DIR / "xgboost_1x2.joblib"
    if xgb_path.exists():
        models["xgboost"] = joblib.load(xgb_path)
        print("  ✓ XGBoost 1X2 loaded")

    # Load LightGBM
    lgb_path = MODELS_DIR / "lightgbm_goals.joblib"
    if lgb_path.exists():
        models["lightgbm"] = joblib.load(lgb_path)
        print("  ✓ LightGBM Over2.5 loaded")

    # Load CatBoost
    cat_path = MODELS_DIR / "catboost_btts.cbm"
    if cat_path.exists():
        from catboost import CatBoostClassifier
        models["catboost"] = CatBoostClassifier()
        models["catboost"].load_model(str(cat_path))
        print("  ✓ CatBoost BTTS loaded")

    # Load Random Forest
    rf_path = MODELS_DIR / "random_forest_1x2.joblib"
    if rf_path.exists():
        models["random_forest"] = joblib.load(rf_path)
        print("  ✓ Random Forest 1X2 loaded")

    # Load Voting ensemble (XGB + RF)
    vote_path = MODELS_DIR / "voting_ensemble.joblib"
    if vote_path.exists():
        models["voting"] = joblib.load(vote_path)
        print("  ✓ Voting ensemble loaded")

    # Load Neural Network
    nn_path = MODELS_DIR / "neural_net.keras"
    if nn_path.exists():
        try:
            import tensorflow as tf
            models["neural_net"] = tf.keras.models.load_model(str(nn_path))
            print("  ✓ Neural Network loaded")
        except ImportError:
            print("  ⚠️ TensorFlow not available, skipping NN")

    # Load metadata
    meta_path = MODELS_DIR / "model_metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            metadata = json.load(f)
        print(f"  ✓ Metadata loaded (trained: {metadata.get('trained_at', 'unknown')})")

    print(f"✅ {len(models)} models loaded and ready")


class PredictRequest(BaseModel):
    home_stats: Dict
    away_stats: Dict
    fixture: Optional[Dict] = None


class PredictResponse(BaseModel):
    probabilities: Dict[str, float]
    over_25: Dict[str, float]
    btts: Dict[str, float]
    confidence: float
    models_used: list
    feature_importance: Optional[Dict[str, float]] = None


class ExtendedPredictRequest(BaseModel):
    home_stats: Dict
    away_stats: Dict
    fixture: Optional[Dict] = None
    base_probabilities: Optional[Dict[str, float]] = None
    value_edges: Optional[list] = None


class HybridPredictResponse(BaseModel):
    pipeline: str
    ready: bool
    quality_gate_passed: bool = False
    backtest_gate_passed: bool = False
    dixon_coles: Dict
    probabilities: Dict[str, float]
    over_25: Dict[str, float]
    over_35: Dict[str, float]
    btts: Dict[str, float]
    markets: Dict
    confidence: float
    models_used: list
    feature_importance: Optional[Dict[str, float]] = None
    shap: Optional[Dict] = None
    metadata: Optional[Dict] = None


@app.get("/health")
def health():
    libs = library_status()
    hybrid = get_hybrid_pipeline()
    return {
        "status": "ok",
        "models_loaded": list(models.keys()),
        "n_models": len(models),
        "metadata": metadata,
        "extended_libraries": libs,
        "extended_ready": any(libs.values()),
        "hybrid_pipeline_ready": hybrid.ready,
        "hybrid_metadata": hybrid.metadata or None,
    }


@app.post("/predict/hybrid", response_model=HybridPredictResponse)
def predict_hybrid(request: PredictRequest):
    """Dixon-Coles → XGBoost → unified market derivation."""
    if not request.fixture:
        raise HTTPException(status_code=400, detail="fixture is required for hybrid pipeline")

    try:
        pipeline = get_hybrid_pipeline()
        result = pipeline.predict(request.fixture, request.home_stats, request.away_stats)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hybrid pipeline failed: {e}") from e


@app.get("/libraries")
def libraries():
    libs = library_status()
    return {
        "libraries": libs,
        "available_count": sum(1 for v in libs.values() if v),
        "total": len(libs),
    }


@app.post("/predict/extended")
def predict_extended(request: ExtendedPredictRequest):
    if not request.fixture:
        raise HTTPException(status_code=400, detail="fixture is required for extended models")

    try:
        result = run_extended_models(
            request.fixture,
            request.home_stats,
            request.away_stats,
            base_probs=request.base_probabilities,
            value_edges=request.value_edges,
        )
        return result
    except Exception as e:
        logger.warning("Extended models partial failure: %s", e)
        fixture = request.fixture or {}
        try:
            blend = run_temporal_blend(fixture)
            return {
                "libraries": library_status(),
                "models_run": 1,
                "temporalBlend": blend,
                "timeSeries": {
                    "prophetTrend": 0.0,
                    "arimaHomeWin": blend["homeWin"],
                    "tftHomeWin": blend["homeWin"],
                    "nbeatsHomeWin": blend["homeWin"],
                    "sarimaHomeWin": blend["homeWin"],
                    "sarimaSeasonality": 0.0,
                    "ensembleHomeWin": blend["homeWin"],
                    "ensembleDraw": blend["draw"],
                    "ensembleAwayWin": blend["awayWin"],
                    "source": "partial",
                },
                "error": str(e),
            }
        except Exception as inner:
            raise HTTPException(status_code=500, detail=f"Extended models failed: {inner}") from inner


def _heuristic_predict(fixture: Dict, home_stats: Dict, away_stats: Dict) -> PredictResponse:
    """Fallback when no .joblib models — uses extended statistical blend."""
    blend = run_temporal_blend(fixture or {})
    bvp = run_bivariate_poisson(fixture or {})
    home = (blend["homeWin"] + bvp["homeWin"]) / 2
    draw = (blend["draw"] + bvp["draw"]) / 2
    away = (blend["awayWin"] + bvp["awayWin"]) / 2
    total = home + draw + away or 1
    return PredictResponse(
        probabilities={
            "HOME_WIN": round(home / total * 100, 1),
            "DRAW": round(draw / total * 100, 1),
            "AWAY_WIN": round(100 - round(home / total * 100, 1) - round(draw / total * 100, 1), 1),
        },
        over_25={"over": 52.0, "under": 48.0},
        btts={"yes": 50.0, "no": 50.0},
        confidence=55.0,
        models_used=["heuristic-blend"],
        feature_importance=None,
    )


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    fixture = request.fixture or {}

    if not models or scaler is None or label_encoder is None:
        try:
            return _heuristic_predict(fixture, request.home_stats, request.away_stats)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"No ML models and heuristic failed: {e}") from e

    # Extract features
    try:
        features = extract_features(
            fixture,
            request.home_stats,
            request.away_stats,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Feature extraction failed: {str(e)}") from e

    # Build feature vector
    X = np.array([[features.get(col, 0.0) for col in FEATURE_COLUMNS]])
    X_scaled = scaler.transform(X)

    results = {}
    models_used = []

    # ── Voting ensemble (preferred when trained) ──
    if "voting" in models:
        proba = models["voting"].predict_proba(X_scaled)[0]
        classes = label_encoder.classes_
        results["voting_1x2"] = {classes[i]: float(proba[i]) for i in range(len(classes))}
        models_used.append("voting")

    # ── XGBoost 1X2 ──
    if "xgboost" in models:
        proba = models["xgboost"].predict_proba(X_scaled)[0]
        classes = label_encoder.classes_
        results["xgboost_1x2"] = {classes[i]: float(proba[i]) for i in range(len(classes))}
        models_used.append("xgboost")

    # ── LightGBM Over 2.5 ──
    if "lightgbm" in models:
        proba = models["lightgbm"].predict_proba(X_scaled)[0]
        results["lightgbm_over25"] = {"over_25": float(proba[1]), "under_25": float(proba[0])}
        models_used.append("lightgbm")

    # ── CatBoost BTTS ──
    if "catboost" in models:
        proba = models["catboost"].predict_proba(X_scaled)[0]
        results["catboost_btts"] = {"btts_yes": float(proba[1]), "btts_no": float(proba[0])}
        models_used.append("catboost")

    # ── Neural Network ──
    if "neural_net" in models:
        proba = models["neural_net"].predict(X_scaled, verbose=0)[0]
        classes = label_encoder.classes_
        results["neural_net_1x2"] = {classes[i]: float(proba[i]) for i in range(len(classes))}
        models_used.append("neural_net")

    # ── Ensemble probabilities ──
    home_probs = []
    draw_probs = []
    away_probs = []

    if "xgboost_1x2" in results:
        home_probs.append(results["xgboost_1x2"].get("HOME_WIN", 0.33))
        draw_probs.append(results["xgboost_1x2"].get("DRAW", 0.33))
        away_probs.append(results["xgboost_1x2"].get("AWAY_WIN", 0.33))

    if "neural_net_1x2" in results:
        home_probs.append(results["neural_net_1x2"].get("HOME_WIN", 0.33))
        draw_probs.append(results["neural_net_1x2"].get("DRAW", 0.33))
        away_probs.append(results["neural_net_1x2"].get("AWAY_WIN", 0.33))

    if "voting_1x2" in results:
        home_probs.append(results["voting_1x2"].get("HOME_WIN", 0.33))
        draw_probs.append(results["voting_1x2"].get("DRAW", 0.33))
        away_probs.append(results["voting_1x2"].get("AWAY_WIN", 0.33))

    if "random_forest" in models and "voting_1x2" not in results:
        proba = models["random_forest"].predict_proba(X_scaled)[0]
        classes = label_encoder.classes_
        results["rf_1x2"] = {classes[i]: float(proba[i]) for i in range(len(classes))}
        models_used.append("random_forest")
        home_probs.append(results["rf_1x2"].get("HOME_WIN", 0.33))
        draw_probs.append(results["rf_1x2"].get("DRAW", 0.33))
        away_probs.append(results["rf_1x2"].get("AWAY_WIN", 0.33))

    # Average ensemble (as fraction)
    ensemble_home = np.mean(home_probs) if home_probs else 0.333
    ensemble_draw = np.mean(draw_probs) if draw_probs else 0.333
    ensemble_away = np.mean(away_probs) if away_probs else 0.334

    # Apply calibration if present in metadata.json
    if metadata and "calibration" in metadata and metadata["calibration"]:
        try:
            params = metadata["calibration"]
            calibrated = []
            for i, p_val in enumerate([ensemble_home, ensemble_draw, ensemble_away]):
                p_clipped = min(1.0 - 1e-5, max(1e-5, float(p_val)))
                logit = np.log(p_clipped / (1.0 - p_clipped))
                calibrated.append(1.0 / (1.0 + np.exp(params[i]["A"] * logit + params[i]["B"])))
            
            total_cal = sum(calibrated)
            if total_cal > 0:
                ensemble_home = calibrated[0] / total_cal
                ensemble_draw = calibrated[1] / total_cal
                ensemble_away = calibrated[2] / total_cal
        except Exception:
            pass

    # Normalize and convert to percent
    total = ensemble_home + ensemble_draw + ensemble_away
    ensemble_home = round(ensemble_home / total * 100, 1)
    ensemble_draw = round(ensemble_draw / total * 100, 1)
    ensemble_away = round(100.0 - ensemble_home - ensemble_draw, 1)

    # Over 2.5
    over_25_prob = results.get("lightgbm_over25", {}).get("over_25", 0.5) * 100

    # BTTS
    btts_prob = results.get("catboost_btts", {}).get("btts_yes", 0.5) * 100

    # Confidence (based on model agreement)
    if len(home_probs) >= 2:
        std_dev = np.std(home_probs)
        confidence = max(40, min(95, 85 - std_dev * 200))
    else:
        confidence = 60.0

    # Feature importance (from XGBoost)
    feature_importance = None
    if "xgboost" in models:
        importances = models["xgboost"].feature_importances_
        top_features = sorted(
            zip(FEATURE_COLUMNS, importances),
            key=lambda x: x[1],
            reverse=True
        )[:10]
        feature_importance = {name: round(float(imp), 4) for name, imp in top_features}

    return PredictResponse(
        probabilities={
            "HOME_WIN": ensemble_home,
            "DRAW": ensemble_draw,
            "AWAY_WIN": ensemble_away,
        },
        over_25={
            "over": round(over_25_prob, 1),
            "under": round(100 - over_25_prob, 1),
        },
        btts={
            "yes": round(btts_prob, 1),
            "no": round(100 - btts_prob, 1),
        },
        confidence=round(confidence, 1),
        models_used=models_used,
        feature_importance=feature_importance,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
