"""
Backtest the probabilistic models on the chronological holdout of real data.

Compares three probability sources on the SAME 1X2 outcomes:
    - poisson  : Dixon-Coles score-matrix baseline (no ML)
    - market   : bookmaker implied probabilities (de-vigged), when odds exist
    - hybrid   : trained + calibrated XGBoost pipeline (if a model is present)

Metrics: accuracy, log-loss, multiclass Brier, and ROI per unit for flat-stake
value bets vs the market. The hybrid model only earns the quality gate if it
beats the Poisson baseline on log-loss AND is not worse than the market.

Usage:
    python backtest.py
    python backtest.py --holdout 0.2
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from dixon_coles import predict_goals, score_matrix
from hybrid_pipeline import get_hybrid_pipeline

DATA_DIR = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent / "models"
CLASSES = ["HOME_WIN", "DRAW", "AWAY_WIN"]
CLASS_IDX = {c: i for i, c in enumerate(CLASSES)}


def _load_samples() -> List[dict]:
    path = DATA_DIR / "training_data.json"
    if not path.exists():
        return []
    with open(path) as f:
        rows = json.load(f)
    rows = [r for r in rows if r.get("result")]
    rows.sort(key=lambda r: r.get("date", ""))
    return rows


def _sample_to_fixture(sample: dict) -> dict:
    return {
        "home": {"id": str(sample.get("home_team_id", "")),
                 "restDays": sample.get("home_rest_days", 4),
                 "matchesPlayed": sample.get("home_matches_played", 18),
                 "pointsTotal": sample.get("home_points", 30),
                 "recentMatches": sample.get("home_recent", [])},
        "away": {"id": str(sample.get("away_team_id", "")),
                 "restDays": sample.get("away_rest_days", 4),
                 "matchesPlayed": sample.get("away_matches_played", 18),
                 "pointsTotal": sample.get("away_points", 28),
                 "recentMatches": sample.get("away_recent", [])},
        "context": sample.get("context", {}),
        "market": sample.get("market", {}),
        "ml_context": sample.get("ml_context", {}),
    }


def _poisson_probs(sample: dict) -> np.ndarray:
    fixture = _sample_to_fixture(sample)
    dc = predict_goals(sample.get("home_stats", {}), sample.get("away_stats", {}), fixture)
    matrix = score_matrix(dc["lambda_local"], dc["mu_visitante"], dc["rho"])
    home = sum(matrix[i, j] for i in range(matrix.shape[0]) for j in range(matrix.shape[1]) if i > j)
    draw = sum(matrix[i, j] for i in range(matrix.shape[0]) for j in range(matrix.shape[1]) if i == j)
    away = sum(matrix[i, j] for i in range(matrix.shape[0]) for j in range(matrix.shape[1]) if i < j)
    total = home + draw + away or 1.0
    return np.array([home / total, draw / total, away / total])


def _market_probs(sample: dict) -> Optional[np.ndarray]:
    market = sample.get("market") or {}
    h = float(market.get("homeWinOdds", 0) or 0)
    d = float(market.get("drawOdds", 0) or 0)
    a = float(market.get("awayWinOdds", 0) or 0)
    if h <= 1 or d <= 1 or a <= 1:
        return None
    raw = np.array([1 / h, 1 / d, 1 / a])
    return raw / raw.sum()  # de-vig


def _hybrid_probs(sample: dict, pipeline) -> Optional[np.ndarray]:
    if not pipeline.ready:
        return None
    try:
        fixture = _sample_to_fixture(sample)
        result = pipeline.predict(fixture, sample.get("home_stats", {}), sample.get("away_stats", {}))
        p = result["probabilities"]
        raw = np.array([p["HOME_WIN"], p["DRAW"], p["AWAY_WIN"]], dtype=float)
        if raw.max() > 1:
            raw = raw / 100.0
        total = raw.sum() or 1.0
        return raw / total
    except Exception:
        return None


def _metrics(probs: np.ndarray, outcomes: np.ndarray) -> Dict[str, float]:
    eps = 1e-12
    p = np.clip(probs, eps, 1.0)
    n = len(outcomes)
    onehot = np.eye(3)[outcomes]
    acc = float(np.mean(np.argmax(p, axis=1) == outcomes))
    ll = float(-np.mean(np.sum(onehot * np.log(p), axis=1)))
    brier = float(np.mean(np.sum((p - onehot) ** 2, axis=1)))
    return {"accuracy": round(acc, 4), "log_loss": round(ll, 4), "brier": round(brier, 4), "n": n}


def _roi_value_bets(
    model_probs: np.ndarray,
    samples: List[dict],
    outcomes: np.ndarray,
    min_edge: float = 0.03,
) -> Optional[Dict[str, float]]:
    """Flat-stake ROI: back any outcome where model prob > market implied + edge."""
    staked = 0
    pnl = 0.0
    wins = 0
    for k, sample in enumerate(samples):
        market = sample.get("market") or {}
        odds = [
            float(market.get("homeWinOdds", 0) or 0),
            float(market.get("drawOdds", 0) or 0),
            float(market.get("awayWinOdds", 0) or 0),
        ]
        for c in range(3):
            if odds[c] <= 1:
                continue
            implied = 1.0 / odds[c]
            if model_probs[k, c] - implied >= min_edge:
                staked += 1
                if outcomes[k] == c:
                    pnl += odds[c] - 1.0
                    wins += 1
                else:
                    pnl -= 1.0
    if staked == 0:
        return None
    return {
        "bets": staked,
        "roi_per_unit": round(pnl / staked, 4),
        "hit_rate": round(wins / staked, 4),
    }


def run_backtest(holdout: float = 0.2) -> Dict[str, Any]:
    samples = _load_samples()
    if len(samples) < 50:
        return {"error": "Not enough real samples to backtest. Run collect_data.py first.", "n": len(samples)}

    cutoff = int(len(samples) * (1 - holdout))
    test = samples[cutoff:]
    outcomes = np.array([CLASS_IDX[s["result"]] for s in test])

    pipeline = get_hybrid_pipeline()

    poisson_p = np.array([_poisson_probs(s) for s in test])
    report: Dict[str, Any] = {
        "n_total": len(samples),
        "n_test": len(test),
        "poisson": _metrics(poisson_p, outcomes),
    }

    # Market (only on the subset that has odds)
    market_mask = []
    market_rows = []
    for s in test:
        mp = _market_probs(s)
        market_mask.append(mp is not None)
        market_rows.append(mp if mp is not None else np.array([np.nan, np.nan, np.nan]))
    market_mask = np.array(market_mask)
    if market_mask.any():
        mp = np.array([market_rows[i] for i in range(len(test)) if market_mask[i]])
        report["market"] = _metrics(mp, outcomes[market_mask])
    else:
        report["market"] = None

    # Hybrid model
    hybrid_p = None
    if pipeline.ready:
        rows = [_hybrid_probs(s, pipeline) for s in test]
        if all(r is not None for r in rows):
            hybrid_p = np.array(rows)
            report["hybrid"] = _metrics(hybrid_p, outcomes)
            report["hybrid_roi"] = _roi_value_bets(hybrid_p, test, outcomes)
        else:
            report["hybrid"] = None
    else:
        report["hybrid"] = None

    report["poisson_roi"] = _roi_value_bets(poisson_p, test, outcomes)

    # Quality gate: hybrid must beat poisson on log-loss and not be worse than market.
    gate = False
    reason = "no hybrid model"
    if hybrid_p is not None and report.get("hybrid"):
        beats_poisson = report["hybrid"]["log_loss"] < report["poisson"]["log_loss"]
        not_worse_than_market = (
            report.get("market") is None
            or report["hybrid"]["log_loss"] <= report["market"]["log_loss"] + 0.02
        )
        gate = bool(beats_poisson and not_worse_than_market)
        reason = (
            f"hybrid log_loss={report['hybrid']['log_loss']} vs poisson={report['poisson']['log_loss']}"
            + (f" vs market={report['market']['log_loss']}" if report.get("market") else "")
        )
    report["quality_gate_recommended"] = gate
    report["quality_gate_reason"] = reason
    return report


def _sync_metadata_gate(gate: bool) -> None:
    meta_path = MODELS_DIR / "hybrid_metadata.json"
    if not meta_path.exists():
        return
    try:
        with open(meta_path) as f:
            meta = json.load(f)
        meta["backtest_gate"] = bool(gate)
        if gate:
            meta["quality_gate_passed"] = True
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--holdout", type=float, default=0.2, help="Fraction of newest data used for testing")
    parser.add_argument("--sync-gate", action="store_true", help="Write the backtest gate into hybrid_metadata.json")
    args = parser.parse_args()

    report = run_backtest(args.holdout)
    print(json.dumps(report, indent=2))

    if args.sync_gate and "quality_gate_recommended" in report:
        _sync_metadata_gate(report["quality_gate_recommended"])
        print(f"\nSynced quality gate -> {report['quality_gate_recommended']}")


if __name__ == "__main__":
    main()
