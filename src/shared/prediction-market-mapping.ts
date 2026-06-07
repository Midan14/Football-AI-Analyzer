export type PredictionMarketKey =
  | "WIN_1X2"
  | "DOUBLE_CHANCE"
  | "OVER_UNDER"
  | "BTTS"
  | "ASIAN_HANDICAP"
  | "EXACT_SCORE"
  | "GOALS_ODD_EVEN"
  | "EUROPEAN_HANDICAP"
  | "WIN_TO_NIL"
  | "CLEAN_SHEET"
  | "TEAM_TO_SCORE"
  | "HT_RESULT"
  | "HT_FT"
  | "HT_OVER_UNDER"
  | "HT_BTTS"
  | "GOAL_BOTH_HALVES"
  | "CORNERS_OVER_UNDER"
  | "CORNERS_HANDICAP"
  | "CARDS_OVER_UNDER"
  | "RED_CARD_MATCH"
  | "PENALTY_MATCH"
  | "FIRST_GOAL_SCORER"
  | "ANYTIME_SCORER"
  | "HAT_TRICK"
  | "PLAYER_BOOKED";

export type PredictionMarketMapping = {
  market: PredictionMarketKey;
  prediction: string;
};

const MARKET_MAP: Record<string, PredictionMarketMapping> = {
  "Local gana": { market: "WIN_1X2", prediction: "HOME_WIN" },
  Empate: { market: "WIN_1X2", prediction: "DRAW" },
  "Visitante gana": { market: "WIN_1X2", prediction: "AWAY_WIN" },
  "Doble Chance 1X": { market: "DOUBLE_CHANCE", prediction: "1X" },
  "Doble Chance X2": { market: "DOUBLE_CHANCE", prediction: "X2" },
  "Doble Chance 12": { market: "DOUBLE_CHANCE", prediction: "12" },
  "Over 1.5": { market: "OVER_UNDER", prediction: "OVER_1.5" },
  "Over 2.5": { market: "OVER_UNDER", prediction: "OVER_2.5" },
  "Over 3.5": { market: "OVER_UNDER", prediction: "OVER_3.5" },
  "Under 1.5": { market: "OVER_UNDER", prediction: "UNDER_1.5" },
  "Under 2.5": { market: "OVER_UNDER", prediction: "UNDER_2.5" },
  "Under 3.5": { market: "OVER_UNDER", prediction: "UNDER_3.5" },
  "BTTS Sí": { market: "BTTS", prediction: "YES" },
  "BTTS Si": { market: "BTTS", prediction: "YES" },
  "BTTS No": { market: "BTTS", prediction: "NO" },
  "AH Local -1": { market: "ASIAN_HANDICAP", prediction: "HOME_-1" },
  "AH Visitante +1": { market: "ASIAN_HANDICAP", prediction: "AWAY_+1" },
};

export function normalizeRecommendationMarket(market: string): string {
  return market.startsWith("Sin cuota real disponible (")
    ? market.replace("Sin cuota real disponible (", "").replace(")", "")
    : market;
}

export function mapRecommendationMarket(market: string): PredictionMarketMapping | null {
  return MARKET_MAP[normalizeRecommendationMarket(market)] ?? null;
}

export function predictionMarketKey(market: string): PredictionMarketKey | null {
  return mapRecommendationMarket(market)?.market ?? null;
}
