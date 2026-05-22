"""
Feature Engineering for Football Match Prediction.
Extracts 40+ features from API-Football data for ML models.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any


def extract_features(fixture: Dict[str, Any], home_stats: Dict, away_stats: Dict) -> Dict[str, float]:
    """Extract ML features from a fixture and team statistics."""
    features = {}

    # ── Team strength features ──
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

    # ── Goals features ──
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

    # ── Form features (last 5 matches) ──
    home_form = home_stats.get("form", "") or ""
    away_form = away_stats.get("form", "") or ""
    features["home_form_points"] = sum(3 if c == "W" else 1 if c == "D" else 0 for c in home_form[-5:]) / max(1, len(home_form[-5:])) / 3
    features["away_form_points"] = sum(3 if c == "W" else 1 if c == "D" else 0 for c in away_form[-5:]) / max(1, len(away_form[-5:])) / 3

    # ── Home/Away specific ──
    home_home_wins = home_stats.get("fixtures", {}).get("wins", {}).get("home", 0)
    home_home_mp = home_stats.get("fixtures", {}).get("played", {}).get("home", 1) or 1
    away_away_wins = away_stats.get("fixtures", {}).get("wins", {}).get("away", 0)
    away_away_mp = away_stats.get("fixtures", {}).get("played", {}).get("away", 1) or 1

    features["home_home_win_rate"] = home_home_wins / home_home_mp
    features["away_away_win_rate"] = away_away_wins / away_away_mp

    # ── Clean sheets ──
    home_cs = home_stats.get("clean_sheet", {}).get("total", 0)
    away_cs = away_stats.get("clean_sheet", {}).get("total", 0)
    features["home_clean_sheet_rate"] = home_cs / home_mp
    features["away_clean_sheet_rate"] = away_cs / away_mp

    # ── Failed to score ──
    home_fts = home_stats.get("failed_to_score", {}).get("total", 0)
    away_fts = away_stats.get("failed_to_score", {}).get("total", 0)
    features["home_failed_to_score_rate"] = home_fts / home_mp
    features["away_failed_to_score_rate"] = away_fts / away_mp

    # ── Penalty features ──
    home_pen_scored = home_stats.get("penalty", {}).get("scored", {}).get("total", 0)
    away_pen_scored = away_stats.get("penalty", {}).get("scored", {}).get("total", 0)
    features["home_penalty_rate"] = home_pen_scored / home_mp
    features["away_penalty_rate"] = away_pen_scored / away_mp

    # ── Derived features ──
    features["strength_diff"] = features["home_win_rate"] - features["away_win_rate"]
    features["goal_diff_diff"] = features["home_goal_diff"] - features["away_goal_diff"]
    features["form_diff"] = features["home_form_points"] - features["away_form_points"]
    features["attack_vs_defense"] = features["home_goals_per_game"] - features["away_conceded_per_game"]
    features["defense_vs_attack"] = features["away_goals_per_game"] - features["home_conceded_per_game"]

    # ── Expected goals (total) ──
    features["expected_home_goals"] = (features["home_goals_per_game"] * 0.6 + features["away_conceded_per_game"] * 0.4) * 1.1
    features["expected_away_goals"] = (features["away_goals_per_game"] * 0.6 + features["home_conceded_per_game"] * 0.4) * 0.9
    features["expected_total_goals"] = features["expected_home_goals"] + features["expected_away_goals"]

    # ── League position proxy ──
    home_points = home_wins * 3 + home_draws
    away_points = away_wins * 3 + away_draws
    features["home_ppg"] = home_points / home_mp
    features["away_ppg"] = away_points / away_mp
    features["ppg_diff"] = features["home_ppg"] - features["away_ppg"]

    # ── Rolling / TSFresh-style proxies ──
    home_form_vals = [3.0 if c == "W" else 1.0 if c == "D" else 0.0 for c in home_form[-5:]]
    away_form_vals = [3.0 if c == "W" else 1.0 if c == "D" else 0.0 for c in away_form[-5:]]
    if home_form_vals:
        features["home_form_rolling_mean"] = float(np.mean(home_form_vals))
        features["home_form_rolling_std"] = float(np.std(home_form_vals)) if len(home_form_vals) > 1 else 0.0
    else:
        features["home_form_rolling_mean"] = 0.5
        features["home_form_rolling_std"] = 0.0
    if away_form_vals:
        features["away_form_rolling_mean"] = float(np.mean(away_form_vals))
        features["away_form_rolling_std"] = float(np.std(away_form_vals)) if len(away_form_vals) > 1 else 0.0
    else:
        features["away_form_rolling_mean"] = 0.5
        features["away_form_rolling_std"] = 0.0

    return features


FEATURE_COLUMNS = [
    "home_win_rate", "away_win_rate", "home_draw_rate", "away_draw_rate",
    "home_goals_per_game", "away_goals_per_game", "home_conceded_per_game", "away_conceded_per_game",
    "home_goal_diff", "away_goal_diff", "home_form_points", "away_form_points",
    "home_home_win_rate", "away_away_win_rate", "home_clean_sheet_rate", "away_clean_sheet_rate",
    "home_failed_to_score_rate", "away_failed_to_score_rate", "home_penalty_rate", "away_penalty_rate",
    "strength_diff", "goal_diff_diff", "form_diff", "attack_vs_defense", "defense_vs_attack",
    "expected_home_goals", "expected_away_goals", "expected_total_goals",
    "home_ppg", "away_ppg", "ppg_diff",
]
