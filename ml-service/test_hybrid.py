"""Unit tests for hybrid ML pipeline."""

import pytest

from dixon_coles import predict_goals, score_matrix
from features import HYBRID_FEATURE_COLUMNS, extract_hybrid_features
from markets import calcular_mercados


FIXTURE = {
    "home": {"restDays": 5, "travelKm": 0, "motivation": 70, "xgFor": 1.6, "xgAgainst": 1.1, "pointsTotal": 45, "matchesPlayed": 20},
    "away": {"restDays": 3, "travelKm": 450, "motivation": 55, "xgFor": 1.2, "xgAgainst": 1.4, "pointsTotal": 32, "matchesPlayed": 20},
    "context": {"relegationRisk": 10, "playoff": False, "mustWinHome": True},
    "market": {"homeWinOdds": 1.85, "drawOdds": 3.4, "awayWinOdds": 4.2, "over25Odds": 1.9, "bttsYesOdds": 1.75},
    "ml_context": {
        "elo": {"home": 1620, "away": 1510},
        "odds": {"openingHomeOdds": 2.0, "currentHomeOdds": 1.85, "movementDraw": 0, "movementAway": 0.02},
        "tactical": {"homePossession": 58, "awayPossession": 42, "homeCornersAvg": 6.2, "awayCornersAvg": 4.1},
        "league": {"avgGoals": 2.7, "avgXg": 1.35},
    },
}

HOME_STATS = {
    "fixtures": {"played": {"total": 20, "home": 10}, "wins": {"total": 11, "home": 7}, "draws": {"total": 4}},
    "goals": {"for": {"total": {"total": 34, "home": 20}}, "against": {"total": {"total": 22}}},
    "form": "WWDWL",
    "xg_for": 1.55,
    "xg_against": 1.05,
}

AWAY_STATS = {
    "fixtures": {"played": {"total": 20, "away": 10}, "wins": {"total": 7, "away": 3}, "draws": {"total": 6}},
    "goals": {"for": {"total": {"total": 26, "away": 9}}, "against": {"total": {"total": 30}}},
    "form": "LDWDL",
    "xg_for": 1.15,
    "xg_against": 1.35,
}


def test_dixon_coles_predict_goals():
    dc = predict_goals(HOME_STATS, AWAY_STATS, FIXTURE)
    assert dc["lambda_local"] > 0.5
    assert dc["mu_visitante"] > 0.3
    assert -0.2 < dc["rho"] < 0.2


def test_hybrid_features_complete():
    dc = predict_goals(HOME_STATS, AWAY_STATS, FIXTURE)
    feats = extract_hybrid_features(FIXTURE, HOME_STATS, AWAY_STATS, dc_outputs=dc)
    for col in HYBRID_FEATURE_COLUMNS:
        assert col in feats, f"missing {col}"
    assert feats["delta_elo"] == pytest.approx(110, abs=1)
    assert feats["lambda_local"] == dc["lambda_local"]


def test_calcular_mercados_sums():
    dc = predict_goals(HOME_STATS, AWAY_STATS, FIXTURE)
    m = calcular_mercados(dc["lambda_local"], dc["mu_visitante"], 0.48, 0.27, 0.25, rho=dc["rho"])
    total_1x2 = m["1X2"]["Local"] + m["1X2"]["Empate"] + m["1X2"]["Visitante"]
    assert total_1x2 == pytest.approx(100, abs=0.5)
    assert m["BTTS"]["Si"] + m["BTTS"]["No"] == pytest.approx(100, abs=0.5)
    assert len(m["ExactScore"]) >= 5


def test_score_matrix_normalized():
    matrix = score_matrix(1.4, 1.1, -0.03)
    assert matrix.sum() == pytest.approx(1.0, abs=0.01)
