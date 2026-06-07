"""
Hybrid prediction pipeline: Dixon-Coles → XGBoost → unified markets.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np

from dixon_coles import predict_goals
from features import HYBRID_FEATURE_COLUMNS, extract_hybrid_features
from markets import calcular_mercados

MODELS_DIR = Path(__file__).parent / "models"


class HybridPipeline:
    def __init__(self, models_dir: Path = MODELS_DIR):
        self.models_dir = models_dir
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.metadata: Dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        model_path = self.models_dir / "hybrid_xgb_1x2.joblib"
        scaler_path = self.models_dir / "hybrid_scaler.joblib"
        le_path = self.models_dir / "hybrid_label_encoder.joblib"
        meta_path = self.models_dir / "hybrid_metadata.json"

        if model_path.exists():
            self.model = joblib.load(model_path)
        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)
        if le_path.exists():
            self.label_encoder = joblib.load(le_path)
        if meta_path.exists():
            with open(meta_path) as f:
                self.metadata = json.load(f)

    @property
    def ready(self) -> bool:
        return self.model is not None and self.scaler is not None and self.label_encoder is not None

    @property
    def quality_gate_passed(self) -> bool:
        return bool(self.metadata.get("quality_gate_passed", False))

    def _apply_calibration(self, proba: np.ndarray) -> np.ndarray:
        """Apply persisted calibration. Supports temperature scaling (current) and
        legacy per-class Platt params for backward compatibility."""
        params = self.metadata.get("calibration")
        if not params:
            return proba
        try:
            # Temperature scaling: p_i^(1/T) renormalized (monotonic, preserves argmax).
            if isinstance(params, dict) and params.get("method") == "temperature":
                temperature = float(params.get("temperature", 1.0))
                if abs(temperature - 1.0) < 1e-6:
                    return proba
                p = np.clip(proba, 1e-12, 1.0) ** (1.0 / max(1e-3, temperature))
                total = p.sum()
                return p / total if total > 0 else proba

            # Legacy per-class Platt: sigmoid(A*logit(p)+B) renormalized.
            if isinstance(params, list) and len(params) == len(proba):
                calibrated = np.zeros_like(proba)
                for i in range(len(proba)):
                    p = min(1.0 - 1e-5, max(1e-5, float(proba[i])))
                    logit = np.log(p / (1.0 - p))
                    calibrated[i] = 1.0 / (1.0 + np.exp(params[i]["A"] * logit + params[i]["B"]))
                total = calibrated.sum()
                return calibrated / total if total > 0 else proba
        except Exception:
            return proba
        return proba

    def predict(
        self,
        fixture: Dict[str, Any],
        home_stats: Dict[str, Any],
        away_stats: Dict[str, Any],
    ) -> Dict[str, Any]:
        dc = predict_goals(home_stats, away_stats, fixture)
        features = extract_hybrid_features(fixture, home_stats, away_stats, dc_outputs=dc)

        bookmaker_odds = None
        market = fixture.get("market") or {}
        if market.get("homeWinOdds"):
            bookmaker_odds = {
                "home_win": market.get("homeWinOdds"),
                "draw": market.get("drawOdds"),
                "away_win": market.get("awayWinOdds"),
                "over_25": market.get("over25Odds"),
                "btts_yes": market.get("bttsYesOdds"),
            }

        if self.ready:
            X = np.array([[features.get(col, 0.0) for col in HYBRID_FEATURE_COLUMNS]])
            X_scaled = self.scaler.transform(X)
            proba = self.model.predict_proba(X_scaled)[0]
            proba = self._apply_calibration(proba)
            classes = list(self.label_encoder.classes_)
            class_map = {classes[i]: float(proba[i]) for i in range(len(classes))}
            prob_home = class_map.get("HOME_WIN", 0.33)
            prob_draw = class_map.get("DRAW", 0.33)
            prob_away = class_map.get("AWAY_WIN", 0.34)
            models_used = ["dixon-coles", "hybrid-xgb"]
            confidence = float(max(proba) * 100)
            feature_importance = None
            if hasattr(self.model, "feature_importances_"):
                imp = self.model.feature_importances_
                top = sorted(zip(HYBRID_FEATURE_COLUMNS, imp), key=lambda x: x[1], reverse=True)[:12]
                feature_importance = {name: round(float(v), 4) for name, v in top}
        else:
            # Honest fallback: DC matrix 1X2 only (no fake ML)
            from dixon_coles import score_matrix

            matrix = score_matrix(dc["lambda_local"], dc["mu_visitante"], dc["rho"])
            prob_home = float(sum(matrix[i, j] for i in range(matrix.shape[0]) for j in range(matrix.shape[1]) if i > j))
            prob_draw = float(sum(matrix[i, j] for i in range(matrix.shape[0]) for j in range(matrix.shape[1]) if i == j))
            prob_away = float(sum(matrix[i, j] for i in range(matrix.shape[0]) for j in range(matrix.shape[1]) if i < j))
            models_used = ["dixon-coles-fallback"]
            confidence = 52.0
            feature_importance = None

        markets = calcular_mercados(
            dc["lambda_local"],
            dc["mu_visitante"],
            prob_home,
            prob_draw,
            prob_away,
            rho=dc["rho"],
            bookmaker_odds=bookmaker_odds,
        )

        shap_top: List[Dict[str, float]] = []
        if feature_importance:
            shap_top = [{"feature": k, "impact": v} for k, v in list(feature_importance.items())[:8]]

        return {
            "pipeline": "hybrid-dc-xgb",
            "ready": self.ready,
            "quality_gate_passed": self.quality_gate_passed,
            "dixon_coles": dc,
            "probabilities": {
                "HOME_WIN": markets["1X2"]["Local"],
                "DRAW": markets["1X2"]["Empate"],
                "AWAY_WIN": markets["1X2"]["Visitante"],
            },
            "over_25": {
                "over": markets["Over_Under_2.5"]["Over"],
                "under": markets["Over_Under_2.5"]["Under"],
            },
            "over_35": {
                "over": markets["Over_Under_3.5"]["Over"],
                "under": markets["Over_Under_3.5"]["Under"],
            },
            "btts": {
                "yes": markets["BTTS"]["Si"],
                "no": markets["BTTS"]["No"],
            },
            "markets": markets,
            "features_used": {k: round(float(features.get(k, 0)), 4) for k in HYBRID_FEATURE_COLUMNS[:20]},
            "confidence": round(confidence, 1),
            "models_used": models_used,
            "feature_importance": feature_importance,
            "shap": {"top_features": shap_top},
            "metadata": self.metadata,
        }


_pipeline: Optional[HybridPipeline] = None


def get_hybrid_pipeline() -> HybridPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = HybridPipeline()
    return _pipeline
