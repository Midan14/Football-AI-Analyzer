import type { AnalysisResult, Fixture } from "@/shared/domain";


export type PredictionMarket =
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

function mapMarketName(market: string): { market: PredictionMarket; prediction: string } | null {
  // Strip fallback prefix if present
  const clean = market.startsWith("Sin cuota real disponible (")
    ? market.replace("Sin cuota real disponible (", "").replace(")", "")
    : market;

  const map: Record<string, { market: PredictionMarket; prediction: string }> = {
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
    "BTTS No": { market: "BTTS", prediction: "NO" },
    "AH Local -1": { market: "ASIAN_HANDICAP", prediction: "HOME_-1" },
    "AH Visitante +1": { market: "ASIAN_HANDICAP", prediction: "AWAY_+1" },
  };

  return map[clean] ?? null;
}

function getProbabilityForMarket(market: string, analysis: AnalysisResult): number {
  const row = analysis.valueTable.find((r) => r.market === market);
  if (row) return row.modelProbability;

  // Fallback: strip prefix
  const clean = market.startsWith("Sin cuota real disponible (")
    ? market.replace("Sin cuota real disponible (", "").replace(")", "")
    : market;
  const row2 = analysis.valueTable.find((r) => r.market === clean);
  if (row2) return row2.modelProbability;

  // Hard fallback to overall confidence score
  return analysis.confidence.score;
}

export async function createPredictionFromAnalysis(
  fixture: Fixture,
  analysis: AnalysisResult,
  riskLevel: string
): Promise<void> {
  const mapped = mapMarketName(analysis.recommendation.market);
  if (!mapped) {
    console.warn("No prediction mapping for market:", analysis.recommendation.market);
    return;
  }

  const probability = getProbabilityForMarket(analysis.recommendation.market, analysis);

  const payload = {
    fixtureId: fixture.id,
    leagueId: fixture.leagueId,
    market: mapped.market,
    prediction: mapped.prediction,
    probability,
    odds: analysis.recommendation.fairOdds || null,
    stakeUnits: analysis.recommendation.stakeUnits,
    notes: `Auto-guardado desde análisis. Riesgo: ${riskLevel}. Rationale: ${analysis.recommendation.rationale ?? ""}`,
  };

  const res = await fetch("/api/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    if (res.status === 401) return; // Not authenticated — non-blocking
    const text = await res.text().catch(() => "unknown");
    console.warn("Prediction API save failed:", text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend sync — resolve + refresh local history
// ─────────────────────────────────────────────────────────────────────────────

type BackendPrediction = {
  id: string;
  fixtureId: string;
  market: string;
  prediction: string;
  probability: number;
  odds: number | null;
  stakeUnits: number;
  status: "OPEN" | "WON" | "LOST" | "VOID" | "CANCELED";
  roi: number | null;
  createdAt: string;
};

export async function resolvePredictions(): Promise<{
  resolved: number;
  skipped: number;
  predictions: Array<{ id: string; status: string; roi: number; reason: string }>;
}> {
  const res = await fetch("/api/predictions/resolve", { method: "POST" });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Inicia sesión para resolver predicciones.");
    const text = await res.text().catch(() => "unknown");
    throw new Error(`Resolve failed: ${text}`);
  }
  const envelope = await res.json();
  return envelope.data ?? envelope;
}

export async function fetchPredictions(): Promise<BackendPrediction[]> {
  const res = await fetch("/api/predictions");
  if (!res.ok) {
    if (res.status === 401) return [];
    throw new Error("Failed to fetch predictions");
  }
  const envelope = await res.json();
  return (envelope.data ?? envelope) as BackendPrediction[];
}

import { updatePredictionResult, getPredictionHistory } from "./prediction-history";

export async function syncPredictionResultsFromBackend(): Promise<{ updated: number; skipped: number }> {
  const backend = await fetchPredictions();
  let updated = 0;
  let skipped = 0;

  for (const pred of backend) {
    if (pred.status === "OPEN" || pred.status === "CANCELED") {
      skipped++;
      continue;
    }

    const local = getPredictionHistory().find((p) => p.fixtureId === pred.fixtureId);
    if (!local) {
      skipped++;
      continue;
    }

    // Avoid overwriting already-synced results unless roi changed
    if (local.result && local.result.profit === (pred.roi ?? 0)) {
      skipped++;
      continue;
    }

    const predictionWon = pred.status === "WON";
    const profit = pred.roi ?? 0;
    updatePredictionResult(pred.fixtureId, {
      actualResult: pred.prediction,
      actualGoalsHome: 0,
      actualGoalsAway: 0,
      predictionWon,
      profit,
    });
    updated++;
  }

  return { updated, skipped };
}
