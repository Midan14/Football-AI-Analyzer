"""
Unified market derivation from Dixon-Coles λ, μ and hybrid 1X2 probabilities.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from dixon_coles import score_matrix


def _pct(prob: float) -> float:
    return round(float(prob) * 100, 1)


def calcular_mercados(
    lambda_local: float,
    mu_visitante: float,
    prob_home: float,
    prob_draw: float,
    prob_away: float,
    rho: float = -0.03,
    max_goals: int = 8,
    bookmaker_odds: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Derive all goal-based markets from Poisson/Dixon-Coles matrix + XGB 1X2.
    prob_* are fractions 0-1 (or 0-100 — auto-detected).
    """
    if prob_home > 1 or prob_draw > 1 or prob_away > 1:
        prob_home /= 100
        prob_draw /= 100
        prob_away /= 100

    matrix = score_matrix(lambda_local, mu_visitante, rho, max_goals)

    over_15 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j >= 2)
    over_25 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j >= 3)
    over_35 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j >= 4)
    under_25 = 1 - over_25
    under_35 = 1 - over_35

    local_no_score = float(matrix[0, :].sum())
    visit_no_score = float(matrix[:, 0].sum())
    p00 = float(matrix[0, 0])
    btts_yes = 1 - (local_no_score + visit_no_score - p00)
    btts_no = 1 - btts_yes

    exact_scores: List[Dict[str, Any]] = []
    for i in range(min(6, max_goals + 1)):
        for j in range(min(6, max_goals + 1)):
            p = float(matrix[i, j])
            if p >= 0.005:
                exact_scores.append({"score": f"{i}-{j}", "probability": _pct(p)})

    exact_scores.sort(key=lambda x: x["probability"], reverse=True)

    # Asian handicap from matrix
    ah_home_minus_1 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i - j >= 2)
    ah_home_minus_05 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i - j >= 1)
    ah_away_plus_1 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if j - i >= 2)
    ah_away_plus_05 = sum(matrix[i, j] for i in range(max_goals + 1) for j in range(max_goals + 1) if j - i >= 1)

    markets = {
        "1X2": {
            "Local": _pct(prob_home),
            "Empate": _pct(prob_draw),
            "Visitante": _pct(prob_away),
        },
        "Over_Under_1.5": {"Over": _pct(over_15), "Under": _pct(1 - over_15)},
        "Over_Under_2.5": {"Over": _pct(over_25), "Under": _pct(under_25)},
        "Over_Under_3.5": {"Over": _pct(over_35), "Under": _pct(under_35)},
        "BTTS": {"Si": _pct(btts_yes), "No": _pct(btts_no)},
        "ExactScore": exact_scores[:12],
        "AsianHandicap": {
            "Home_Minus_0.5": {"Home": _pct(ah_home_minus_05), "Away": _pct(1 - ah_home_minus_05)},
            "Home_Minus_1": {"Home": _pct(ah_home_minus_1), "Away": _pct(1 - ah_home_minus_1)},
            "Away_Plus_0.5": {"Away": _pct(ah_away_plus_05), "Home": _pct(1 - ah_away_plus_05)},
            "Away_Plus_1": {"Away": _pct(ah_away_plus_1), "Home": _pct(1 - ah_away_plus_1)},
        },
        "dixonColes": {
            "lambda_local": round(lambda_local, 4),
            "mu_visitante": round(mu_visitante, 4),
            "rho": round(rho, 4),
        },
    }

    if bookmaker_odds:
        value_bets = []
        mapping = [
            ("HOME_WIN", markets["1X2"]["Local"], bookmaker_odds.get("home_win")),
            ("DRAW", markets["1X2"]["Empate"], bookmaker_odds.get("draw")),
            ("AWAY_WIN", markets["1X2"]["Visitante"], bookmaker_odds.get("away_win")),
            ("OVER_2.5", markets["Over_Under_2.5"]["Over"], bookmaker_odds.get("over_25")),
            ("BTTS_YES", markets["BTTS"]["Si"], bookmaker_odds.get("btts_yes")),
        ]
        for market, model_pct, odds in mapping:
            if not odds or odds <= 1:
                continue
            implied = 100 / odds
            edge = round(model_pct - implied, 1)
            if edge > 0:
                value_bets.append(
                    {
                        "market": market,
                        "modelProbability": model_pct,
                        "marketProbability": round(implied, 1),
                        "edge": edge,
                        "odds": odds,
                    }
                )
        markets["ValueBets"] = sorted(value_bets, key=lambda x: x["edge"], reverse=True)

    return markets
