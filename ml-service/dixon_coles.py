"""
Dixon-Coles goal model — MLE-style attack/defence strengths + rho correction.

Provides λ (home) and μ (away) expected goals for hybrid pipeline input.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import poisson

HOME_ADVANTAGE = 1.12
BASE_RHO = -0.03
MAX_GOALS = 8

MODELS_DIR = Path(__file__).parent / "models"
STRENGTHS_PATH = MODELS_DIR / "dc_strengths.json"

_strengths_cache: Optional[Dict[str, Any]] = None
_strengths_loaded = False


def _safe_div(num: float, den: float, default: float = 0.0) -> float:
    return num / den if den else default


def _team_attack_defence(
    stats: Dict[str, Any],
    league_avg_goals: float,
    is_home_team: bool,
    has_xg: bool = False,
) -> Tuple[float, float]:
    mp = max(1, stats.get("fixtures", {}).get("played", {}).get("total", 1))
    gf = stats.get("goals", {}).get("for", {}).get("total", {}).get("total", 0)
    ga = stats.get("goals", {}).get("against", {}).get("total", {}).get("total", 0)

    xg_for = stats.get("xg_for", stats.get("expected_goals_for"))
    xg_against = stats.get("xg_against", stats.get("expected_goals_against"))

    is_real_xg = has_xg and xg_for is not None and xg_against is not None
    attack_raw = float(xg_for) if is_real_xg else gf / mp
    defence_raw = float(xg_against) if is_real_xg else ga / mp

    league_attack = max(0.8, league_avg_goals / 2)
    attack_strength_raw = attack_raw / league_attack
    defence_strength_raw = defence_raw / league_attack

    # Apply shrinkage estimator: pull toward 1.0 (league mean) based on data fidelity
    alpha = 0.95 if is_real_xg else 0.65
    attack_strength = alpha * attack_strength_raw + (1.0 - alpha) * 1.0
    defence_strength = alpha * defence_strength_raw + (1.0 - alpha) * 1.0

    if is_home_team:
        home_mp = max(1, stats.get("fixtures", {}).get("played", {}).get("home", mp // 2 or 1))
        home_gf = stats.get("goals", {}).get("for", {}).get("total", {}).get("home", gf * 0.55)
        attack_strength *= 1 + 0.08 * _safe_div(home_gf, home_mp, attack_raw) / league_attack

    else:
        away_mp = max(1, stats.get("fixtures", {}).get("played", {}).get("away", mp // 2 or 1))
        away_gf = stats.get("goals", {}).get("for", {}).get("total", {}).get("away", gf * 0.45)
        attack_strength *= 1 + 0.06 * _safe_div(away_gf, away_mp, attack_raw) / league_attack

    return attack_strength, defence_strength


def estimate_rho(lambda_home: float, lambda_away: float, fixture: Optional[Dict[str, Any]] = None) -> float:
    total = lambda_home + lambda_away
    rho = BASE_RHO
    if total < 1.8:
        rho += 0.08
    elif total < 2.2:
        rho += 0.04
    if total > 3.5:
        rho -= 0.06
    elif total > 3.0:
        rho -= 0.03

    ctx = (fixture or {}).get("context") or {}
    ml_ctx = (fixture or {}).get("ml_context") or {}
    motivation = ml_ctx.get("motivation") or {}

    if ctx.get("lowDivision") or motivation.get("dead_rubber"):
        rho *= 0.5
    if ctx.get("derby") or ctx.get("rivalRivalry"):
        rho += 0.04
    if ctx.get("mustWinHome") or ctx.get("mustWinAway"):
        rho -= 0.03

    return float(np.clip(rho, -0.15, 0.15))


def tau(x: int, y: int, lambda_home: float, lambda_away: float, rho: float) -> float:
    if x == 0 and y == 0:
        return 1 - lambda_home * lambda_away * rho
    if x == 0 and y == 1:
        return 1 + lambda_home * rho
    if x == 1 and y == 0:
        return 1 + lambda_away * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


def predict_goals(
    home_stats: Dict[str, Any],
    away_stats: Dict[str, Any],
    fixture: Optional[Dict[str, Any]] = None,
) -> Dict[str, float]:
    """Predict expected goals λ (home) and μ (away).

    Prefers MLE-fitted team strengths (dc_strengths.json) when both teams are
    known; otherwise falls back to the league-relative heuristic.
    """
    mle = _predict_goals_from_strengths(fixture)
    if mle is not None:
        return mle
    return _predict_goals_heuristic(home_stats, away_stats, fixture)


def _predict_goals_heuristic(
    home_stats: Dict[str, Any],
    away_stats: Dict[str, Any],
    fixture: Optional[Dict[str, Any]] = None,
) -> Dict[str, float]:
    """Heuristic λ/μ from league-relative attack/defence ratios (no fitted model)."""
    league_avg = 2.65
    ml_ctx = (fixture or {}).get("ml_context") or {}
    league = ml_ctx.get("league") or {}
    if league.get("avgGoals"):
        league_avg = float(league["avgGoals"])

    has_xg = False
    if fixture:
        cov = fixture.get("coverage") or {}
        has_xg = cov.get("hasXg") or cov.get("has_xg") or False

    home_attack, home_defence = _team_attack_defence(home_stats, league_avg, True, has_xg)
    away_attack, away_defence = _team_attack_defence(away_stats, league_avg, False, has_xg)

    league_half = max(0.9, league_avg / 2)
    lambda_home = max(0.15, home_attack * away_defence * league_half * HOME_ADVANTAGE)
    mu_away = max(0.15, away_attack * home_defence * league_half)

    # Contextual fatigue adjustment
    rest_diff = float(ml_ctx.get("rest_days_diff", 0))
    lambda_home *= 1 + min(0.08, max(-0.08, rest_diff * 0.015))
    mu_away *= 1 - min(0.08, max(-0.08, rest_diff * 0.012))

    rho = estimate_rho(lambda_home, mu_away, fixture)
    return {
        "lambda_local": round(lambda_home, 4),
        "mu_visitante": round(mu_away, 4),
        "rho": round(rho, 4),
        "expected_total_goals": round(lambda_home + mu_away, 4),
    }


def fit_rho_mle(matches: List[Dict[str, Any]], lambda_home: float, lambda_away: float) -> float:
    """Optional MLE rho from list of {home_goals, away_goals}."""
    if len(matches) < 30:
        return estimate_rho(lambda_home, lambda_away)

    def neg_log_likelihood(rho_arr: np.ndarray) -> float:
        rho = float(np.clip(rho_arr[0], -0.2, 0.2))
        ll = 0.0
        for m in matches:
            x = int(m.get("home_goals", 0))
            y = int(m.get("away_goals", 0))
            if x > MAX_GOALS or y > MAX_GOALS:
                continue
            p = poisson.pmf(x, lambda_home) * poisson.pmf(y, lambda_away) * tau(x, y, lambda_home, lambda_away, rho)
            ll += math.log(max(p, 1e-12))
        return -ll

    res = minimize(neg_log_likelihood, x0=np.array([BASE_RHO]), method="L-BFGS-B", bounds=[(-0.2, 0.2)])
    return float(res.x[0]) if res.success else BASE_RHO


def score_matrix(
    lambda_home: float,
    lambda_away: float,
    rho: float,
    max_goals: int = MAX_GOALS,
) -> np.ndarray:
    matrix = np.zeros((max_goals + 1, max_goals + 1))
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            matrix[i, j] = (
                poisson.pmf(i, lambda_home)
                * poisson.pmf(j, lambda_away)
                * tau(i, j, lambda_home, lambda_away, rho)
            )
    total = matrix.sum()
    if total > 0:
        matrix /= total
    return matrix


# ── MLE team-strength estimation ──────────────────────────────────────────────

def _vectorized_tau_log(hg: np.ndarray, ag: np.ndarray, lam: np.ndarray, mu: np.ndarray, rho: float) -> np.ndarray:
    """log(tau) for the Dixon-Coles low-score correction, vectorized + clipped."""
    tau_arr = np.ones_like(lam)
    m00 = (hg == 0) & (ag == 0)
    m01 = (hg == 0) & (ag == 1)
    m10 = (hg == 1) & (ag == 0)
    m11 = (hg == 1) & (ag == 1)
    tau_arr[m00] = 1.0 - lam[m00] * mu[m00] * rho
    tau_arr[m01] = 1.0 + lam[m01] * rho
    tau_arr[m10] = 1.0 + mu[m10] * rho
    tau_arr[m11] = 1.0 - rho
    return np.log(np.clip(tau_arr, 1e-6, None))


def fit_team_strengths(
    matches: List[Dict[str, Any]],
    ridge: float = 0.02,
    max_iter: int = 200,
    min_matches_per_team: int = 4,
) -> Optional[Dict[str, Any]]:
    """MLE attack/defence per team + home advantage + rho via Dixon-Coles.

    Each match: {home_team_id, away_team_id, home_goals, away_goals}.
    Model: log λ_home = c + home_adv + att[i] - def[j]
           log μ_away = c +           att[j] - def[i]
    Returns a serializable dict, or None if there is not enough data.
    """
    counts: Dict[str, int] = {}
    for m in matches:
        for key in ("home_team_id", "away_team_id"):
            tid = str(m.get(key, ""))
            if tid:
                counts[tid] = counts.get(tid, 0) + 1

    teams = sorted(t for t, c in counts.items() if c >= min_matches_per_team)
    if len(teams) < 4:
        return None
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)

    rows = [
        m for m in matches
        if str(m.get("home_team_id", "")) in idx and str(m.get("away_team_id", "")) in idx
    ]
    if len(rows) < n * 2:
        return None

    home_idx = np.array([idx[str(m["home_team_id"])] for m in rows], dtype=int)
    away_idx = np.array([idx[str(m["away_team_id"])] for m in rows], dtype=int)
    hg = np.array([min(MAX_GOALS, int(m["home_goals"])) for m in rows], dtype=float)
    ag = np.array([min(MAX_GOALS, int(m["away_goals"])) for m in rows], dtype=float)
    lg_hg = gammaln(hg + 1.0)
    lg_ag = gammaln(ag + 1.0)

    avg_goals = float(np.mean(hg + ag)) if len(rows) else 2.65
    c0 = math.log(max(0.5, avg_goals / 2.0))

    # theta = [c, home_adv, att(n), def(n), rho]
    theta0 = np.zeros(2 + 2 * n + 1)
    theta0[0] = c0
    theta0[1] = math.log(HOME_ADVANTAGE)
    theta0[-1] = BASE_RHO

    def unpack(theta: np.ndarray):
        c = theta[0]
        home_adv = theta[1]
        att = theta[2:2 + n]
        deff = theta[2 + n:2 + 2 * n]
        rho = float(np.clip(theta[-1], -0.2, 0.2))
        return c, home_adv, att, deff, rho

    def neg_log_likelihood(theta: np.ndarray) -> float:
        c, home_adv, att, deff, rho = unpack(theta)
        log_lam = c + home_adv + att[home_idx] - deff[away_idx]
        log_mu = c + att[away_idx] - deff[home_idx]
        log_lam = np.clip(log_lam, -3.0, 2.5)
        log_mu = np.clip(log_mu, -3.0, 2.5)
        lam = np.exp(log_lam)
        mu = np.exp(log_mu)
        ll = (hg * log_lam - lam - lg_hg) + (ag * log_mu - mu - lg_ag)
        ll += _vectorized_tau_log(hg, ag, lam, mu, rho)
        penalty = ridge * (np.sum(att ** 2) + np.sum(deff ** 2))
        return float(-np.sum(ll) + penalty)

    bounds = [(-2.0, 2.0), (-1.0, 1.0)] + [(-2.0, 2.0)] * (2 * n) + [(-0.2, 0.2)]
    res = minimize(
        neg_log_likelihood,
        theta0,
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": max_iter},
    )
    theta = res.x if res.x is not None else theta0
    c, home_adv, att, deff, rho = unpack(theta)

    # Center attack/defence for identifiability.
    att = att - float(np.mean(att))
    deff = deff - float(np.mean(deff))

    return {
        "c": float(c),
        "home_adv": float(home_adv),
        "rho": float(rho),
        "league_avg_goals": round(avg_goals, 4),
        "n_teams": n,
        "n_matches": len(rows),
        "converged": bool(res.success),
        "attack": {teams[i]: round(float(att[i]), 4) for i in range(n)},
        "defence": {teams[i]: round(float(deff[i]), 4) for i in range(n)},
    }


def save_team_strengths(strengths: Dict[str, Any]) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(STRENGTHS_PATH, "w") as f:
        json.dump(strengths, f, indent=2)
    _invalidate_strengths_cache()


def load_team_strengths() -> Optional[Dict[str, Any]]:
    global _strengths_cache, _strengths_loaded
    if _strengths_loaded:
        return _strengths_cache
    _strengths_loaded = True
    if STRENGTHS_PATH.exists():
        try:
            with open(STRENGTHS_PATH) as f:
                _strengths_cache = json.load(f)
        except Exception:
            _strengths_cache = None
    return _strengths_cache


def _invalidate_strengths_cache() -> None:
    global _strengths_cache, _strengths_loaded
    _strengths_cache = None
    _strengths_loaded = False


def _predict_goals_from_strengths(fixture: Optional[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    strengths = load_team_strengths()
    if not strengths or not fixture:
        return None
    attack = strengths.get("attack") or {}
    defence = strengths.get("defence") or {}
    home_id = str((fixture.get("home") or {}).get("id", ""))
    away_id = str((fixture.get("away") or {}).get("id", ""))
    if home_id not in attack or away_id not in attack:
        return None

    c = float(strengths.get("c", 0.0))
    home_adv = float(strengths.get("home_adv", math.log(HOME_ADVANTAGE)))
    log_lam = float(np.clip(c + home_adv + attack[home_id] - defence.get(away_id, 0.0), -3.0, 2.5))
    log_mu = float(np.clip(c + attack[away_id] - defence.get(home_id, 0.0), -3.0, 2.5))
    lambda_home = max(0.15, math.exp(log_lam))
    mu_away = max(0.15, math.exp(log_mu))

    ml_ctx = (fixture or {}).get("ml_context") or {}
    rest_diff = float(ml_ctx.get("rest_days_diff", 0))
    lambda_home *= 1 + min(0.08, max(-0.08, rest_diff * 0.015))
    mu_away *= 1 - min(0.08, max(-0.08, rest_diff * 0.012))

    rho = float(strengths.get("rho", BASE_RHO))
    rho = estimate_rho(lambda_home, mu_away, fixture) if rho == 0 else rho
    return {
        "lambda_local": round(lambda_home, 4),
        "mu_visitante": round(mu_away, 4),
        "rho": round(rho, 4),
        "expected_total_goals": round(lambda_home + mu_away, 4),
        "source": "mle-strengths",
    }
