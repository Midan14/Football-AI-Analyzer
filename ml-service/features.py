"""
Hybrid feature engineering — Phase 1 variables for Dixon-Coles → XGBoost pipeline.

Expects fixture.ml_context from Node (Elo, odds movement, tactical proxies, motivation).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

BASE_ELO = 1500.0
HOME_ELO_ADV = 65.0


def _form_points(form: str, n: int = 5) -> float:
    chars = (form or "")[-n:]
    if not chars:
        return 0.5
    pts = sum(3 if c == "W" else 1 if c == "D" else 0 for c in chars)
    return pts / (len(chars) * 3)


def _form_points_home_away(recent: List[Dict[str, Any]], venue: str, n: int = 5) -> float:
    """Points rate from recentMatches filtered by home/away venue."""
    if not recent:
        return 0.5
    filtered = [m for m in recent if m.get("venue") == venue or (venue == "home" and m.get("isHome")) or (venue == "away" and m.get("isAway"))]
    if not filtered:
        filtered = recent[-n:]
    else:
        filtered = filtered[-n:]
    pts = 0
    for m in filtered:
        r = m.get("result", "")
        if r == "W":
            pts += 3
        elif r == "D":
            pts += 1
    return pts / (len(filtered) * 3) if filtered else 0.5


def _rolling_xg(recent: List[Dict[str, Any]], side: str, n: int = 5) -> tuple[float, float]:
    """Return (xg_for, xg_against) from recent matches; fallback to goals."""
    if not recent:
        return 0.0, 0.0
    chunk = recent[-n:]
    xg_for = []
    xg_against = []
    for m in chunk:
        if side == "home":
            xg_for.append(float(m.get("homeXg", m.get("homeGoals", 0))))
            xg_against.append(float(m.get("awayXg", m.get("awayGoals", 0))))
        else:
            xg_for.append(float(m.get("awayXg", m.get("awayGoals", 0))))
            xg_against.append(float(m.get("homeXg", m.get("homeGoals", 0))))
    return float(np.mean(xg_for)), float(np.mean(xg_against))


def _goal_trend(recent: List[Dict[str, Any]], side: str) -> float:
    """L3 avg total goals minus L10 avg total goals (for team involvement)."""
    if len(recent) < 3:
        return 0.0

    def avg_goals(chunk: List[Dict[str, Any]]) -> float:
        totals = []
        for m in chunk:
            totals.append(float(m.get("homeGoals", 0)) + float(m.get("awayGoals", 0)))
        return float(np.mean(totals)) if totals else 0.0

    l3 = avg_goals(recent[-3:])
    l10 = avg_goals(recent[-10:]) if len(recent) >= 10 else avg_goals(recent)
    return l3 - l10


def _ppda_proxy(possession: float, conceded_pg: float, tackles_proxy: float = 12.0) -> float:
    """
    PPDA proxy when premium pressing data unavailable.
    Lower value ≈ more intense press (fewer passes allowed per defensive action).
    """
    poss = max(5.0, min(75.0, possession))
    defensive_actions = max(5.0, tackles_proxy + conceded_pg * 8)
    passes_allowed = poss * 4.5
    return passes_allowed / defensive_actions


def _motivation_features(ctx: Dict[str, Any], ml_mot: Dict[str, Any]) -> Dict[str, float]:
    score = float(ctx.get("motivationScore", ml_mot.get("home_score", 50)))
    relegation = 1.0 if ctx.get("relegationRisk", 0) > 60 or ml_mot.get("relegation") else 0.0
    title = 1.0 if ctx.get("mustWinHome") or ctx.get("mustWinAway") or ml_mot.get("title_race") else 0.0
    dead_rubber = 1.0 if ml_mot.get("dead_rubber") or score < 25 else 0.0
    playoff = 1.0 if ctx.get("playoff") else 0.0
    return {
        "motivation_relegation": relegation,
        "motivation_title": title,
        "motivation_dead_rubber": dead_rubber,
        "motivation_playoff": playoff,
        "motivation_score_home": score / 100,
    }


def compute_elo_from_fixture(fixture: Dict[str, Any]) -> Dict[str, float]:
    """Use persisted Elo from ml_context or estimate from team snapshot."""
    ml_ctx = fixture.get("ml_context") or {}
    elo = ml_ctx.get("elo") or {}
    if elo.get("home") and elo.get("away"):
        home = float(elo["home"])
        away = float(elo["away"])
    else:
        home_snap = fixture.get("home") or {}
        away_snap = fixture.get("away") or {}
        home = BASE_ELO + (float(home_snap.get("pointsTotal", 0)) / max(1, home_snap.get("matchesPlayed", 18)) - 1.5) * 120
        away = BASE_ELO + (float(away_snap.get("pointsTotal", 0)) / max(1, away_snap.get("matchesPlayed", 18)) - 1.5) * 120
        home += HOME_ELO_ADV

    return {
        "elo_local": round(home, 1),
        "elo_visitante": round(away, 1),
        "delta_elo": round(home - away, 1),
    }


def extract_hybrid_features(
    fixture: Dict[str, Any],
    home_stats: Dict[str, Any],
    away_stats: Dict[str, Any],
    dc_outputs: Optional[Dict[str, float]] = None,
) -> Dict[str, float]:
    """Full hybrid feature vector including optional Dixon-Coles λ, μ."""
    features: Dict[str, float] = {}
    ml_ctx = fixture.get("ml_context") or {}
    league = ml_ctx.get("league") or {}
    league_avg_goals = float(league.get("avgGoals", 2.65))
    league_avg_xg = float(league.get("avgXg", league_avg_goals / 2))

    home_mp = max(1, home_stats.get("fixtures", {}).get("played", {}).get("total", 1))
    away_mp = max(1, away_stats.get("fixtures", {}).get("played", {}).get("total", 1))

    home_gf = home_stats.get("goals", {}).get("for", {}).get("total", {}).get("total", 0)
    home_ga = home_stats.get("goals", {}).get("against", {}).get("total", {}).get("total", 0)
    away_gf = away_stats.get("goals", {}).get("for", {}).get("total", {}).get("total", 0)
    away_ga = away_stats.get("goals", {}).get("against", {}).get("total", {}).get("total", 0)

    home_xg_for = float(home_stats.get("xg_for", fixture.get("home", {}).get("xgFor", home_gf / home_mp)))
    home_xg_against = float(home_stats.get("xg_against", fixture.get("home", {}).get("xgAgainst", home_ga / home_mp)))
    away_xg_for = float(away_stats.get("xg_for", fixture.get("away", {}).get("xgFor", away_gf / away_mp)))
    away_xg_against = float(away_stats.get("xg_against", fixture.get("away", {}).get("xgAgainst", away_ga / away_mp)))

    # ── 1. Elo ──
    features.update(compute_elo_from_fixture(fixture))

    # ── 2. Attack / defence rating per 90 (league-adjusted xG) ──
    features["home_attack_rating"] = home_xg_for / league_avg_xg
    features["home_defence_rating"] = home_xg_against / league_avg_xg
    features["away_attack_rating"] = away_xg_for / league_avg_xg
    features["away_defence_rating"] = away_xg_against / league_avg_xg
    features["attack_rating_diff"] = features["home_attack_rating"] - features["away_attack_rating"]
    features["defence_rating_diff"] = features["away_defence_rating"] - features["home_defence_rating"]

    # ── 3. Form L5 home/away ──
    home_form = home_stats.get("form", "") or ""
    away_form = away_stats.get("form", "") or ""
    if isinstance(home_form, list):
        home_form = "".join(home_form)
    if isinstance(away_form, list):
        away_form = "".join(away_form)

    home_recent = (fixture.get("home") or {}).get("recentMatches") or ml_ctx.get("home_recent") or []
    away_recent = (fixture.get("away") or {}).get("recentMatches") or ml_ctx.get("away_recent") or []

    features["home_form_points_l5"] = _form_points(home_form, 5)
    features["away_form_points_l5"] = _form_points(away_form, 5)
    features["home_points_l5_home"] = _form_points_home_away(home_recent, "home", 5)
    features["away_points_l5_away"] = _form_points_home_away(away_recent, "away", 5)

    # ── 4. Rolling xG L5 ──
    hxg_f, hxg_a = _rolling_xg(home_recent, "home", 5)
    axg_f, axg_a = _rolling_xg(away_recent, "away", 5)
    if hxg_f == 0:
        hxg_f, hxg_a = home_xg_for, home_xg_against
    if axg_f == 0:
        axg_f, axg_a = away_xg_for, away_xg_against
    features["home_xg_for_l5"] = hxg_f
    features["home_xg_against_l5"] = hxg_a
    features["away_xg_for_l5"] = axg_f
    features["away_xg_against_l5"] = axg_a
    features["xG_diff_5"] = hxg_f - axg_f
    features["xG_against_diff_5"] = axg_a - hxg_a

    # ── 5. Goal trend L3 vs L10 ──
    features["home_goal_trend_l3_l10"] = _goal_trend(home_recent, "home")
    features["away_goal_trend_l3_l10"] = _goal_trend(away_recent, "away")

    # ── 6. Tactical proxies ──
    tactical = ml_ctx.get("tactical") or {}
    home_poss = float(tactical.get("homePossession", home_stats.get("possession_avg", 50)))
    away_poss = float(tactical.get("awayPossession", away_stats.get("possession_avg", 50)))
    features["home_possession_pct"] = home_poss / 100
    features["away_possession_pct"] = away_poss / 100
    features["possession_diff"] = (home_poss - away_poss) / 100

    home_conceded_pg = home_ga / home_mp
    away_conceded_pg = away_ga / away_mp
    features["home_ppda_proxy"] = _ppda_proxy(home_poss, home_conceded_pg, float(tactical.get("homeTacklesProxy", 12)))
    features["away_ppda_proxy"] = _ppda_proxy(away_poss, away_conceded_pg, float(tactical.get("awayTacklesProxy", 12)))
    features["ppda_diff"] = features["home_ppda_proxy"] - features["away_ppda_proxy"]

    features["home_fast_break_proxy"] = float(tactical.get("homeFastBreaks", (home_gf / home_mp) * (1 - home_poss / 100) * 3))
    features["away_fast_break_proxy"] = float(tactical.get("awayFastBreaks", (away_gf / away_mp) * (1 - away_poss / 100) * 3))

    features["home_corners_avg"] = float(tactical.get("homeCornersAvg", home_stats.get("corners_avg", 5.0)))
    features["away_corners_avg"] = float(tactical.get("awayCornersAvg", away_stats.get("corners_avg", 4.5)))
    features["home_shots_on_target_avg"] = float(tactical.get("homeShotsOnTargetAvg", home_stats.get("shots_on_target_avg", 4.5)))
    features["away_shots_on_target_avg"] = float(tactical.get("awayShotsOnTargetAvg", away_stats.get("shots_on_target_avg", 4.0)))

    # ── 7. Context ──
    home_snap = fixture.get("home") or {}
    away_snap = fixture.get("away") or {}
    features["descanso_local"] = float(home_snap.get("restDays", ml_ctx.get("home_rest_days", 4)))
    features["descanso_visitante"] = float(away_snap.get("restDays", ml_ctx.get("away_rest_days", 4)))
    features["descanso_diff"] = features["descanso_local"] - features["descanso_visitante"]
    features["travel_km_away"] = float(away_snap.get("travelKm", ml_ctx.get("away_travel_km", 0))) / 1000

    ctx = fixture.get("context") or {}
    mot = _motivation_features(ctx, ml_ctx.get("motivation") or {})
    features.update(mot)
    features["motivation_score_away"] = float(away_snap.get("motivation", 50)) / 100

    # ── 8. Squad market value ──
    squad = ml_ctx.get("squad") or {}
    xi_val = float(squad.get("expectedXiValue", 0))
    squad_val = float(squad.get("squadValue", max(xi_val, 1)))
    features["squad_value_diff_ratio"] = (xi_val / squad_val) if squad_val > 0 else 0.5
    features["squad_xi_vs_away_ratio"] = float(squad.get("xiValueRatio", 1.0))

    # ── 9. Market / odds ──
    odds_ctx = ml_ctx.get("odds") or {}
    market = fixture.get("market") or {}
    home_odds = float(odds_ctx.get("openingHomeOdds") or market.get("homeWinOdds") or 2.5)
    draw_odds = float(odds_ctx.get("openingDrawOdds") or market.get("drawOdds") or 3.3)
    away_odds = float(odds_ctx.get("openingAwayOdds") or market.get("awayWinOdds") or 3.0)
    current_home = float(odds_ctx.get("currentHomeOdds") or home_odds)
    features["opening_implied_home"] = 1 / home_odds if home_odds > 1 else 0.4
    features["opening_implied_draw"] = 1 / draw_odds if draw_odds > 1 else 0.28
    features["opening_implied_away"] = 1 / away_odds if away_odds > 1 else 0.32
    features["movimiento_cuota_home"] = (1 / current_home - 1 / home_odds) if home_odds > 1 and current_home > 1 else 0.0
    features["movimiento_cuota_draw"] = float(odds_ctx.get("movementDraw", 0))
    features["movimiento_cuota_away"] = float(odds_ctx.get("movementAway", 0))

    # Betfair volume — not integrated; honest zero default
    features["exchange_volume_proxy"] = float(odds_ctx.get("exchangeVolume", ml_ctx.get("exchange_volume", 0)))

    # ── 10. Dixon-Coles outputs (filled at inference) ──
    if dc_outputs:
        features["lambda_local"] = float(dc_outputs.get("lambda_local", 1.3))
        features["mu_visitante"] = float(dc_outputs.get("mu_visitante", 1.1))
        features["dc_rho"] = float(dc_outputs.get("rho", -0.03))
    else:
        features["lambda_local"] = 0.0
        features["mu_visitante"] = 0.0
        features["dc_rho"] = 0.0

    # Legacy columns kept for backward-compatible /predict endpoint
    legacy = extract_features(fixture, home_stats, away_stats)
    features.update(legacy)

    return features


def extract_features(fixture: Dict[str, Any], home_stats: Dict, away_stats: Dict) -> Dict[str, float]:
    """Legacy feature set — preserved for existing trained models."""
    features: Dict[str, float] = {}

    home_mp = max(1, home_stats.get("fixtures", {}).get("played", {}).get("total", 1))
    away_mp = max(1, away_stats.get("fixtures", {}).get("played", {}).get("total", 1))

    home_wins = home_stats.get("fixtures", {}).get("wins", {}).get("total", 0)
    away_wins = away_stats.get("fixtures", {}).get("wins", {}).get("total", 0)
    home_draws = home_stats.get("fixtures", {}).get("draws", {}).get("total", 0)
    away_draws = away_stats.get("fixtures", {}).get("draws", {}).get("total", 0)

    features["home_win_rate"] = home_wins / home_mp
    features["away_win_rate"] = away_wins / away_mp
    features["home_draw_rate"] = home_draws / home_mp
    features["away_draw_rate"] = away_draws / away_mp

    home_gf = home_stats.get("goals", {}).get("for", {}).get("total", {}).get("total", 0)
    home_ga = home_stats.get("goals", {}).get("against", {}).get("total", {}).get("total", 0)
    away_gf = away_stats.get("goals", {}).get("for", {}).get("total", {}).get("total", 0)
    away_ga = away_stats.get("goals", {}).get("against", {}).get("total", {}).get("total", 0)

    features["home_goals_per_game"] = home_gf / home_mp
    features["away_goals_per_game"] = away_gf / away_mp
    features["home_conceded_per_game"] = home_ga / home_mp
    features["away_conceded_per_game"] = away_ga / away_mp
    features["home_goal_diff"] = (home_gf - home_ga) / home_mp
    features["away_goal_diff"] = (away_gf - away_ga) / away_mp

    home_form = home_stats.get("form", "") or ""
    away_form = away_stats.get("form", "") or ""
    if isinstance(home_form, list):
        home_form = "".join(home_form)
    if isinstance(away_form, list):
        away_form = "".join(away_form)

    features["home_form_points"] = _form_points(home_form, 5)
    features["away_form_points"] = _form_points(away_form, 5)

    home_home_wins = home_stats.get("fixtures", {}).get("wins", {}).get("home", 0)
    home_home_mp = home_stats.get("fixtures", {}).get("played", {}).get("home", 1) or 1
    away_away_wins = away_stats.get("fixtures", {}).get("wins", {}).get("away", 0)
    away_away_mp = away_stats.get("fixtures", {}).get("played", {}).get("away", 1) or 1

    features["home_home_win_rate"] = home_home_wins / home_home_mp
    features["away_away_win_rate"] = away_away_wins / away_away_mp

    home_cs = home_stats.get("clean_sheet", {}).get("total", 0)
    away_cs = away_stats.get("clean_sheet", {}).get("total", 0)
    features["home_clean_sheet_rate"] = home_cs / home_mp
    features["away_clean_sheet_rate"] = away_cs / away_mp

    home_fts = home_stats.get("failed_to_score", {}).get("total", 0)
    away_fts = away_stats.get("failed_to_score", {}).get("total", 0)
    features["home_failed_to_score_rate"] = home_fts / home_mp
    features["away_failed_to_score_rate"] = away_fts / away_mp

    home_pen = home_stats.get("penalty", {}).get("scored", {}).get("total", 0)
    away_pen = away_stats.get("penalty", {}).get("scored", {}).get("total", 0)
    features["home_penalty_rate"] = home_pen / home_mp
    features["away_penalty_rate"] = away_pen / away_mp

    features["strength_diff"] = features["home_win_rate"] - features["away_win_rate"]
    features["goal_diff_diff"] = features["home_goal_diff"] - features["away_goal_diff"]
    features["form_diff"] = features["home_form_points"] - features["away_form_points"]
    features["attack_vs_defense"] = features["home_goals_per_game"] - features["away_conceded_per_game"]
    features["defense_vs_attack"] = features["away_goals_per_game"] - features["home_conceded_per_game"]
    features["expected_home_goals"] = (features["home_goals_per_game"] * 0.6 + features["away_conceded_per_game"] * 0.4) * 1.1
    features["expected_away_goals"] = (features["away_goals_per_game"] * 0.6 + features["home_conceded_per_game"] * 0.4) * 0.9
    features["expected_total_goals"] = features["expected_home_goals"] + features["expected_away_goals"]

    home_points = home_wins * 3 + home_draws
    away_points = away_wins * 3 + away_draws
    features["home_ppg"] = home_points / home_mp
    features["away_ppg"] = away_points / away_mp
    features["ppg_diff"] = features["home_ppg"] - features["away_ppg"]

    home_form_vals = [3.0 if c == "W" else 1.0 if c == "D" else 0.0 for c in home_form[-5:]]
    away_form_vals = [3.0 if c == "W" else 1.0 if c == "D" else 0.0 for c in away_form[-5:]]
    features["home_form_rolling_mean"] = float(np.mean(home_form_vals)) if home_form_vals else 0.5
    features["home_form_rolling_std"] = float(np.std(home_form_vals)) if len(home_form_vals) > 1 else 0.0
    features["away_form_rolling_mean"] = float(np.mean(away_form_vals)) if away_form_vals else 0.5
    features["away_form_rolling_std"] = float(np.std(away_form_vals)) if len(away_form_vals) > 1 else 0.0

    return features


# Hybrid XGBoost input columns (explicit architecture spec)
HYBRID_FEATURE_COLUMNS = [
    "elo_local",
    "elo_visitante",
    "delta_elo",
    "home_attack_rating",
    "home_defence_rating",
    "away_attack_rating",
    "away_defence_rating",
    "attack_rating_diff",
    "defence_rating_diff",
    "home_form_points_l5",
    "away_form_points_l5",
    "home_points_l5_home",
    "away_points_l5_away",
    "home_xg_for_l5",
    "home_xg_against_l5",
    "away_xg_for_l5",
    "away_xg_against_l5",
    "xG_diff_5",
    "xG_against_diff_5",
    "home_goal_trend_l3_l10",
    "away_goal_trend_l3_l10",
    "home_ppda_proxy",
    "away_ppda_proxy",
    "ppda_diff",
    "home_possession_pct",
    "away_possession_pct",
    "possession_diff",
    "home_fast_break_proxy",
    "away_fast_break_proxy",
    "home_corners_avg",
    "away_corners_avg",
    "home_shots_on_target_avg",
    "away_shots_on_target_avg",
    "descanso_local",
    "descanso_visitante",
    "descanso_diff",
    "travel_km_away",
    "motivation_relegation",
    "motivation_title",
    "motivation_dead_rubber",
    "motivation_playoff",
    "motivation_score_home",
    "motivation_score_away",
    "squad_value_diff_ratio",
    "squad_xi_vs_away_ratio",
    "opening_implied_home",
    "opening_implied_draw",
    "opening_implied_away",
    "movimiento_cuota_home",
    "movimiento_cuota_draw",
    "movimiento_cuota_away",
    "exchange_volume_proxy",
    "lambda_local",
    "mu_visitante",
    "dc_rho",
]

# Legacy models still use this list
FEATURE_COLUMNS = [
    "home_win_rate",
    "away_win_rate",
    "home_draw_rate",
    "away_draw_rate",
    "home_goals_per_game",
    "away_goals_per_game",
    "home_conceded_per_game",
    "away_conceded_per_game",
    "home_goal_diff",
    "away_goal_diff",
    "home_form_points",
    "away_form_points",
    "home_home_win_rate",
    "away_away_win_rate",
    "home_clean_sheet_rate",
    "away_clean_sheet_rate",
    "home_failed_to_score_rate",
    "away_failed_to_score_rate",
    "home_penalty_rate",
    "away_penalty_rate",
    "strength_diff",
    "goal_diff_diff",
    "form_diff",
    "attack_vs_defense",
    "defense_vs_attack",
    "expected_home_goals",
    "expected_away_goals",
    "expected_total_goals",
    "home_ppg",
    "away_ppg",
    "ppg_diff",
    "home_form_rolling_mean",
    "home_form_rolling_std",
    "away_form_rolling_mean",
    "away_form_rolling_std",
]
