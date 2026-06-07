import type { FixtureMarket } from "@/shared/domain";

export type OddsMarketField = {
  key: string;
  label: string;
  field: keyof FixtureMarket;
};

/** Canonical markets tracked for compare, snapshots and line movement. */
export const TRACKED_ODDS_MARKETS: OddsMarketField[] = [
  { key: "1X2_HOME", label: "Local gana", field: "homeWinOdds" },
  { key: "1X2_DRAW", label: "Empate", field: "drawOdds" },
  { key: "1X2_AWAY", label: "Visitante gana", field: "awayWinOdds" },
  { key: "OU15_OVER", label: "Over 1.5", field: "over15Odds" },
  { key: "OU25_OVER", label: "Over 2.5", field: "over25Odds" },
  { key: "OU35_OVER", label: "Over 3.5", field: "over35Odds" },
  { key: "OU15_UNDER", label: "Under 1.5", field: "under15Odds" },
  { key: "OU25_UNDER", label: "Under 2.5", field: "under25Odds" },
  { key: "OU35_UNDER", label: "Under 3.5", field: "under35Odds" },
  { key: "BTTS_YES", label: "BTTS Sí", field: "bttsYesOdds" },
  { key: "BTTS_NO", label: "BTTS No", field: "bttsNoOdds" },
];

export type BookmakerMarketCompareRow = {
  marketKey: string;
  label: string;
  oddsByBookmaker: Record<string, number>;
  medianOdds: number;
  spreadPercent: number;
  outlierBookmaker: string | null;
  outlierDeviationPercent: number | null;
};

export type BookmakerCompareResult = {
  fixtureId: string;
  bookmakers: string[];
  rows: BookmakerMarketCompareRow[];
  avgSpreadPercent: number;
  outlierCount: number;
};

export type OddsQualityBucket = {
  key: string;
  label: string;
  sampleSize: number;
  avgSpreadPercent: number;
  avgOutlierPercent: number;
  fixturesWithOdds: number;
};

export type OddsQualityReport = {
  date: string;
  groupBy: "league" | "market";
  buckets: OddsQualityBucket[];
  summary: {
    fixturesScanned: number;
    fixturesWithMultiBook: number;
    avgSpreadPercent: number;
  };
};

export type LineMovementAlert = {
  fixtureId: string;
  bookmaker: string;
  marketKey: string;
  label: string;
  previousOdds: number;
  currentOdds: number;
  movementPercent: number;
  impliedShiftPercent: number;
  capturedAt: string;
};

export type ClvSummary = {
  sampleSize: number;
  avgClvPercent: number;
  positiveClvRate: number;
  avgTakenOdds: number;
  avgClosingOdds: number;
  byLeague: Array<{ leagueId: string; sampleSize: number; avgClvPercent: number }>;
};

export function impliedProbabilityFromDecimal(odds: number): number {
  if (odds <= 1) return 0;
  return Math.round((100 / odds) * 10) / 10;
}

/** Positive CLV = obtuviste mejor cuota que el cierre. */
export function computeClvPercent(takenOdds: number, closingOdds: number): number {
  if (takenOdds <= 1 || closingOdds <= 1) return 0;
  return Math.round((takenOdds / closingOdds - 1) * 1000) / 10;
}

export function marketLabelFromKey(marketKey: string): string {
  return TRACKED_ODDS_MARKETS.find((m) => m.key === marketKey)?.label ?? marketKey;
}

export function marketKeyFromRecommendationLabel(label: string): string | null {
  const clean = label.startsWith("Sin cuota real disponible (")
    ? label.replace("Sin cuota real disponible (", "").replace(")", "")
    : label;
  const row = TRACKED_ODDS_MARKETS.find((m) => m.label === clean);
  return row?.key ?? null;
}
