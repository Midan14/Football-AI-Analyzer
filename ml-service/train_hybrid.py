"""
Train the hybrid Dixon-Coles -> XGBoost 1X2 model on REAL historical matches.

Pipeline:
    1. Load point-in-time samples from data/training_data.json (collect_data.py).
    2. Fit Dixon-Coles team strengths (MLE) and persist them for inference.
    3. Build the hybrid feature matrix (Dixon-Coles outputs included).
    4. Chronological train/valid/test split (NO random shuffle — avoids temporal leak).
    5. Train XGBoost, fit per-class Platt calibration on the validation fold.
    6. Persist model + scaler + encoder + calibration + a quality gate flag.

Usage:
    python train_hybrid.py
    python train_hybrid.py --synthetic 4000   # DEV ONLY smoke test (never trusted)
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.optimize import minimize_scalar
from sklearn.metrics import accuracy_score, classification_report, log_loss
from sklearn.preprocessing import LabelEncoder, StandardScaler

from dixon_coles import fit_team_strengths, predict_goals, save_team_strengths
from features import HYBRID_FEATURE_COLUMNS, extract_hybrid_features

DATA_DIR = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Minimum real samples required to trust the trained model (quality gate input).
MIN_REAL_SAMPLES = 400


def _sample_to_fixture(sample: dict) -> dict:
    return {
        "home": {
            "id": str(sample.get("home_team_id", "")),
            "xgFor": sample.get("home_xg_for", 1.3),
            "xgAgainst": sample.get("home_xg_against", 1.2),
            "restDays": sample.get("home_rest_days", 4),
            "travelKm": 0,
            "motivation": sample.get("home_motivation", 50),
            "pointsTotal": sample.get("home_points", 30),
            "matchesPlayed": sample.get("home_matches_played", 18),
            "recentMatches": sample.get("home_recent", []),
        },
        "away": {
            "id": str(sample.get("away_team_id", "")),
            "xgFor": sample.get("away_xg_for", 1.2),
            "xgAgainst": sample.get("away_xg_against", 1.3),
            "restDays": sample.get("away_rest_days", 4),
            "travelKm": sample.get("away_travel_km", 0),
            "motivation": sample.get("away_motivation", 50),
            "pointsTotal": sample.get("away_points", 28),
            "matchesPlayed": sample.get("away_matches_played", 18),
            "recentMatches": sample.get("away_recent", []),
        },
        "context": sample.get("context", {}),
        "market": sample.get("market", {}),
        "ml_context": sample.get("ml_context", {}),
    }


def load_rows_from_json() -> list[dict]:
    path = DATA_DIR / "training_data.json"
    if not path.exists():
        return []
    with open(path) as f:
        rows = json.load(f)
    # Keep chronological order; samples carry a `date` field from the collector.
    rows = [r for r in rows if r.get("result")]
    rows.sort(key=lambda r: r.get("date", ""))
    return rows


def fit_and_save_strengths(samples: list[dict]) -> dict | None:
    matches = [
        {
            "home_team_id": s.get("home_team_id"),
            "away_team_id": s.get("away_team_id"),
            "home_goals": s.get("home_goals"),
            "away_goals": s.get("away_goals"),
        }
        for s in samples
        if s.get("home_team_id") and s.get("away_team_id")
        and s.get("home_goals") is not None and s.get("away_goals") is not None
    ]
    if len(matches) < 50:
        print("  Not enough matches to fit Dixon-Coles strengths — skipping")
        return None
    strengths = fit_team_strengths(matches)
    if strengths:
        save_team_strengths(strengths)
        print(
            f"  Dixon-Coles strengths fitted: {strengths['n_teams']} teams, "
            f"{strengths['n_matches']} matches, converged={strengths['converged']}"
        )
    return strengths


def build_feature_rows(samples: list[dict]) -> pd.DataFrame:
    rows = []
    for sample in samples:
        try:
            fixture = _sample_to_fixture(sample)
            home_stats = sample.get("home_stats", {})
            away_stats = sample.get("away_stats", {})
            dc = predict_goals(home_stats, away_stats, fixture)
            feats = extract_hybrid_features(fixture, home_stats, away_stats, dc_outputs=dc)
            feats["result"] = sample["result"]
            rows.append(feats)
        except Exception:
            continue
    return pd.DataFrame(rows)


def generate_synthetic_hybrid(n: int = 4000) -> pd.DataFrame:
    """DEV-ONLY smoke dataset. Never marked as trustworthy (quality gate fails)."""
    rng = np.random.default_rng(42)
    rows = []
    for _ in range(n):
        home_str = rng.beta(3, 3)
        away_str = rng.beta(3, 3)
        sample = {
            "home_stats": {
                "fixtures": {"played": {"total": 20, "home": 10, "away": 10},
                             "wins": {"total": int(home_str * 12), "home": int(home_str * 7)},
                             "draws": {"total": 4}},
                "goals": {"for": {"total": {"total": int(home_str * 35)}},
                          "against": {"total": {"total": int((1 - home_str) * 28)}}},
                "form": "WDLWW" if home_str > 0.5 else "LDWDL",
                "xg_for": 0.8 + home_str * 1.4, "xg_against": 0.9 + (1 - home_str) * 1.1,
            },
            "away_stats": {
                "fixtures": {"played": {"total": 20, "home": 10, "away": 10},
                             "wins": {"total": int(away_str * 10), "away": int(away_str * 5)},
                             "draws": {"total": 5}},
                "goals": {"for": {"total": {"total": int(away_str * 30)}},
                          "against": {"total": {"total": int((1 - away_str) * 32)}}},
                "form": "WWDLW" if away_str > 0.5 else "DLLWD",
                "xg_for": 0.7 + away_str * 1.3, "xg_against": 1.0 + (1 - away_str) * 1.2,
            },
            "home_team_id": int(rng.integers(1, 999)),
            "away_team_id": int(rng.integers(1, 999)),
            "home_rest_days": int(rng.integers(3, 8)),
            "away_rest_days": int(rng.integers(3, 8)),
            "ml_context": {"elo": {"home": 1500 + home_str * 200, "away": 1500 + away_str * 180}},
        }
        fixture = _sample_to_fixture(sample)
        dc = predict_goals(sample["home_stats"], sample["away_stats"], fixture)
        feats = extract_hybrid_features(fixture, sample["home_stats"], sample["away_stats"], dc_outputs=dc)
        home_p = 0.35 + (feats["delta_elo"] / 800) + feats["form_diff"] * 0.1 + 0.06
        draw_p = 0.28 - abs(feats["delta_elo"]) / 1200
        away_p = max(0.05, 1 - home_p - draw_p)
        probs = np.array([home_p, draw_p, away_p])
        probs = probs / probs.sum()
        feats["result"] = rng.choice(["HOME_WIN", "DRAW", "AWAY_WIN"], p=probs)
        rows.append(feats)
    return pd.DataFrame(rows)


def _chronological_split(n: int, valid_frac: float = 0.15, test_frac: float = 0.15):
    test_size = int(n * test_frac)
    valid_size = int(n * valid_frac)
    train_end = n - valid_size - test_size
    valid_end = n - test_size
    return slice(0, train_end), slice(train_end, valid_end), slice(valid_end, n)


def _apply_temperature(proba: np.ndarray, temperature: float) -> np.ndarray:
    """Power (temperature) scaling: p_i^(1/T) renormalized. Monotonic -> preserves argmax."""
    eps = 1e-12
    p = np.clip(proba, eps, 1.0) ** (1.0 / max(1e-3, temperature))
    totals = p.sum(axis=1, keepdims=True)
    totals[totals == 0] = 1.0
    return p / totals


def _fit_temperature(proba_valid: np.ndarray, y_valid: np.ndarray) -> float:
    """Fit a single temperature minimizing validation log-loss.

    Temperature scaling is the standard, robust multiclass calibration: one
    parameter, no overflow, and (being monotonic) it never changes which class
    is predicted — so it cannot make accuracy worse, only sharpen/soften
    confidence. Falls back to T=1 (no-op) if it does not improve over raw.
    """
    eps = 1e-12
    n_classes = proba_valid.shape[1]
    onehot = np.eye(n_classes)[y_valid]

    def nll(temperature: float) -> float:
        p = _apply_temperature(proba_valid, temperature)
        return float(-np.mean(np.sum(onehot * np.log(np.clip(p, eps, 1.0)), axis=1)))

    try:
        res = minimize_scalar(nll, bounds=(0.25, 8.0), method="bounded")
        temperature = float(res.x) if res.success else 1.0
    except Exception:
        temperature = 1.0
    # Guard: only keep calibration if it actually improves over no-op (T=1).
    return temperature if nll(temperature) < nll(1.0) - 1e-6 else 1.0


def train(synthetic: int = 0) -> dict:
    samples = load_rows_from_json()
    data_source = "real"
    strengths = None

    if samples and synthetic == 0:
        print(f"Loaded {len(samples)} real point-in-time samples")
        strengths = fit_and_save_strengths(samples)
        df = build_feature_rows(samples)
    else:
        if synthetic == 0:
            synthetic = 4000
        print(f"No real training_data.json — DEV synthetic smoke set ({synthetic}); model will NOT pass quality gate")
        data_source = "synthetic"
        df = generate_synthetic_hybrid(synthetic)

    if df.empty:
        raise RuntimeError("No training rows available")

    # Preserve chronological order from the (already sorted) samples.
    df = df.reset_index(drop=True)
    X = df[HYBRID_FEATURE_COLUMNS].fillna(0).values
    y = df["result"].values

    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n = len(df)
    train_sl, valid_sl, test_sl = _chronological_split(n)
    X_train, y_train = X_scaled[train_sl], y_enc[train_sl]
    X_valid, y_valid = X_scaled[valid_sl], y_enc[valid_sl]
    X_test, y_test = X_scaled[test_sl], y_enc[test_sl]

    if len(X_train) == 0 or len(X_test) == 0:
        raise RuntimeError("Dataset too small for a chronological split")

    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.5,
        objective="multi:softprob",
        num_class=len(le.classes_),
        eval_metric="mlogloss",
        tree_method="hist",
        random_state=42,
    )
    eval_set = [(X_valid, y_valid)] if len(X_valid) else [(X_test, y_test)]
    model.fit(X_train, y_train, eval_set=eval_set, verbose=False)

    # Temperature calibration on the validation fold (falls back to test if empty).
    cal_X = X_valid if len(X_valid) else X_test
    cal_y = y_valid if len(X_valid) else y_test
    proba_valid = model.predict_proba(cal_X)
    temperature = _fit_temperature(proba_valid, cal_y)
    calibration = {"method": "temperature", "temperature": round(temperature, 4)}

    # Test-set evaluation (raw + calibrated).
    proba_test = model.predict_proba(X_test)
    y_pred = np.argmax(proba_test, axis=1)
    acc = accuracy_score(y_test, y_pred)
    ll = log_loss(y_test, proba_test, labels=list(range(len(le.classes_))))

    proba_test_cal = _apply_temperature(proba_test, temperature)
    cal_ll = log_loss(y_test, proba_test_cal, labels=list(range(len(le.classes_))))
    onehot = np.eye(len(le.classes_))[y_test]
    brier = float(np.mean(np.sum((proba_test_cal - onehot) ** 2, axis=1)))

    print(classification_report(y_test, y_pred, target_names=le.classes_, zero_division=0))
    print(f"  accuracy={acc:.4f} log_loss={ll:.4f} calibrated_log_loss={cal_ll:.4f} brier={brier:.4f}")

    # Quality gate: trustworthy only with enough REAL data and a sane log-loss
    # (random 3-way baseline log-loss ~= 1.0986; we require a margin below it).
    quality_gate = bool(
        data_source == "real"
        and n >= MIN_REAL_SAMPLES
        and cal_ll < 1.03
    )

    joblib.dump(model, MODELS_DIR / "hybrid_xgb_1x2.joblib")
    joblib.dump(scaler, MODELS_DIR / "hybrid_scaler.joblib")
    joblib.dump(le, MODELS_DIR / "hybrid_label_encoder.joblib")

    metadata = {
        "trained_at": datetime.now().isoformat(),
        "pipeline": "dixon-coles-xgb-hybrid",
        "n_samples": int(n),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "n_features": len(HYBRID_FEATURE_COLUMNS),
        "feature_columns": HYBRID_FEATURE_COLUMNS,
        "classes": le.classes_.tolist(),
        "accuracy": round(float(acc), 4),
        "log_loss": round(float(ll), 4),
        "calibrated_log_loss": round(float(cal_ll), 4),
        "brier_score": round(float(brier), 4),
        "calibration": calibration,
        "split": "chronological",
        "data_source": data_source,
        "quality_gate_passed": quality_gate,
        "dixon_coles_strengths": bool(strengths),
    }
    with open(MODELS_DIR / "hybrid_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    try:
        import mlflow

        mlflow.set_experiment("football-hybrid-pipeline")
        with mlflow.start_run(run_name="hybrid-xgb-1x2"):
            mlflow.log_param("n_samples", n)
            mlflow.log_param("data_source", data_source)
            mlflow.log_metric("accuracy", acc)
            mlflow.log_metric("log_loss", ll)
            mlflow.log_metric("calibrated_log_loss", cal_ll)
            mlflow.log_metric("brier_score", brier)
    except Exception:
        pass

    gate_msg = "PASSED" if quality_gate else "NOT PASSED (will not pollute Poisson)"
    print(f"Hybrid model saved — accuracy {acc:.4f}, samples {n}, quality gate {gate_msg}")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic", type=int, default=0, help="DEV-only: force N synthetic samples")
    args = parser.parse_args()
    train(synthetic=args.synthetic)
