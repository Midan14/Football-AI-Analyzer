import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { impliedProbability } from "@/backend/lib/analysis/shared-math";
import type { Fixture } from "@/shared/domain";

const ONE_X_TWO_MARKETS = new Set(["Local gana", "Empate", "Visitante gana"]);
const MIN_VALUE_EDGE = 3;
const MIN_ML_GAP = 8;
const MIN_ML_CONFIDENCE = 60;

export type FixtureEdgeHint = {
  edge: number;
  market: string;
  hasValue: boolean;
  hasMlSignal: boolean;
};

function marketOdds(fixture: Fixture, market: string): number {
  switch (market) {
    case "Local gana":
      return fixture.market.homeWinOdds;
    case "Empate":
      return fixture.market.drawOdds;
    case "Visitante gana":
      return fixture.market.awayWinOdds;
    default:
      return 0;
  }
}

export function computeFixtureEdgeHint(fixture: Fixture): FixtureEdgeHint | null {
  if (fixture.market.homeWinOdds <= 0) return null;

  const analysis = analyzeFixture(fixture);
  const oneXtwoRows = analysis.valueTable.filter((row) => ONE_X_TWO_MARKETS.has(row.market));
  if (oneXtwoRows.length === 0) return null;

  const best = oneXtwoRows.reduce((top, row) => (row.edge > top.edge ? row : top), oneXtwoRows[0]);
  const hasValue = best.edge >= MIN_VALUE_EDGE;

  const topModel = oneXtwoRows.reduce((top, row) =>
    row.modelProbability > top.modelProbability ? row : top
  , oneXtwoRows[0]);
  const marketOdd = marketOdds(fixture, topModel.market);
  const marketImplied = impliedProbability(marketOdd);
  const modelGap = topModel.modelProbability - marketImplied;
  const hasMlSignal =
    analysis.confidence.score >= MIN_ML_CONFIDENCE && modelGap >= MIN_ML_GAP;

  if (!hasValue && !hasMlSignal) return null;

  return {
    edge: Math.round(best.edge * 10) / 10,
    market: best.market,
    hasValue,
    hasMlSignal,
  };
}

export function computeFixtureEdgeHints(
  fixtures: Fixture[]
): Record<string, FixtureEdgeHint> {
  const hints: Record<string, FixtureEdgeHint> = {};
  for (const fixture of fixtures) {
    const hint = computeFixtureEdgeHint(fixture);
    if (hint) hints[fixture.id] = hint;
  }
  return hints;
}
