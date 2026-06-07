import type { AnalysisResult, Fixture } from "@/shared/domain";
import { getBookmakerOdds } from "@/backend/lib/analysis/shared-math";
import type { PredictionRecord } from "./prediction-history";
import { getPredictionHistory, updatePredictionResult } from "./prediction-history";
import { mapRecommendationMarket, type PredictionMarketKey } from "@/shared/prediction-market-mapping";


export type PredictionMarket = PredictionMarketKey;

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
  const mapped = mapRecommendationMarket(analysis.recommendation.market);
  if (!mapped) {
    console.warn("No prediction mapping for market:", analysis.recommendation.market);
    return;
  }

  const probability = getProbabilityForMarket(analysis.recommendation.market, analysis);
  const takenOdds = getBookmakerOdds(fixture, analysis.recommendation.market);

  const payload = {
    fixtureId: fixture.id,
    leagueId: fixture.leagueId,
    market: mapped.market,
    prediction: mapped.prediction,
    probability,
    odds: takenOdds > 1.01 ? takenOdds : null,
    fairOdds: analysis.recommendation.fairOdds || null,
    bookmaker: takenOdds > 1.01 ? fixture.market.bookmakerName ?? "Proveedor sin nombre" : null,
    stakeUnits: analysis.recommendation.stakeUnits,
    notes: `Auto-guardado desde análisis. Modelo: ${analysis.ensemble?.dominantModel ?? analysis.advancedModels?.autoMl.championModel ?? "current-engine"}. Riesgo: ${riskLevel}. Rationale: ${analysis.recommendation.rationale ?? ""}`,
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
  leagueId?: string | null;
  market: string;
  prediction: string;
  probability: number;
  odds: number | null;
  fairOdds?: number | null;
  closingOdds?: number | null;
  clvPercent?: number | null;
  bookmaker?: string | null;
  stakeUnits: number;
  status: "OPEN" | "WON" | "LOST" | "VOID" | "CANCELED";
  roi: number | null;
  notes?: string | null;
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

const MARKET_LABELS: Record<string, string> = {
  HOME_WIN: "Local gana",
  DRAW: "Empate",
  AWAY_WIN: "Visitante gana",
  "1X": "Doble Chance 1X",
  X2: "Doble Chance X2",
  "12": "Doble Chance 12",
  "OVER_1.5": "Over 1.5",
  "OVER_2.5": "Over 2.5",
  "OVER_3.5": "Over 3.5",
  "UNDER_1.5": "Under 1.5",
  "UNDER_2.5": "Under 2.5",
  "UNDER_3.5": "Under 3.5",
  YES: "BTTS Sí",
  NO: "BTTS No",
};

function parseRiskFromNotes(notes: string | null | undefined): string {
  if (!notes) return "MODERADO";
  const match = notes.match(/Riesgo:\s*(BAJO|MODERADO|ALTO)/i);
  return match ? match[1].toUpperCase() : "MODERADO";
}

async function fetchFixtureMeta(fixtureId: string): Promise<{
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  kickoff: string;
} | null> {
  try {
    const res = await fetch(`/api/match/${encodeURIComponent(fixtureId)}`);
    if (!res.ok) return null;
    const envelope = await res.json();
    const fixture = (envelope.data ?? envelope) as {
      home: { name: string };
      away: { name: string };
      leagueName: string;
      kickoff: string;
    };
    return {
      homeTeam: fixture.home.name,
      awayTeam: fixture.away.name,
      leagueName: fixture.leagueName,
      kickoff: fixture.kickoff,
    };
  } catch {
    return null;
  }
}

/** Predictions from API enriched with fixture labels for the history UI. */
export async function fetchPredictionRecordsForDisplay(): Promise<PredictionRecord[]> {
  const backend = await fetchPredictions();
  const metaCache = new Map<string, Awaited<ReturnType<typeof fetchFixtureMeta>>>();

  const records: PredictionRecord[] = [];
  for (const pred of backend) {
    let meta = metaCache.get(pred.fixtureId);
    if (meta === undefined) {
      meta = await fetchFixtureMeta(pred.fixtureId);
      metaCache.set(pred.fixtureId, meta);
    }

    const marketLabel =
      MARKET_LABELS[pred.prediction] ?? `${pred.market} · ${pred.prediction}`;
    const confidence = Math.round(pred.probability * (pred.probability <= 1 ? 100 : 1));
    const hasResult = pred.status === "WON" || pred.status === "LOST";

    records.push({
      fixtureId: pred.fixtureId,
      homeTeam: meta?.homeTeam ?? `Partido ${pred.fixtureId}`,
      awayTeam: meta?.awayTeam ?? "",
      leagueName: meta?.leagueName ?? pred.leagueId ?? "—",
      kickoff: meta?.kickoff ?? pred.createdAt,
      predictedMarket: marketLabel,
      predictedProbability: pred.probability,
      fairOdds: pred.fairOdds ?? pred.odds ?? 0,
      takenOdds: pred.odds ?? undefined,
      closingOdds: pred.closingOdds ?? undefined,
      clvPercent: pred.clvPercent ?? undefined,
      bookmaker: pred.bookmaker ?? undefined,
      confidence,
      riskLevel: parseRiskFromNotes(pred.notes),
      stakeUnits: pred.stakeUnits,
      createdAt: pred.createdAt,
      result: hasResult
        ? {
            actualResult: pred.prediction,
            actualGoalsHome: 0,
            actualGoalsAway: 0,
            predictionWon: pred.status === "WON",
            profit: pred.roi ?? 0,
          }
        : undefined,
    });
  }

  return records;
}

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
