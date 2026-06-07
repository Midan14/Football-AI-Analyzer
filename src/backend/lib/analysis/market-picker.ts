import type { AnalysisResult, Fixture } from "@/shared/domain";
import {
  expectedValuePerUnit,
  getBookmakerOdds,
  HEAVY_FAVORITE_MARKETS,
  HEAVY_FAVORITE_MIN_EDGE,
  HEAVY_FAVORITE_MIN_ODDS,
  MIN_RECOMMENDATION_ODDS,
} from "./shared-math";
import { kellyPortfolio, kellyStake, type KellyResult } from "./models/kelly-criterion";

export type ValueRow = AnalysisResult["valueTable"][number];

export {
  getBookmakerOdds,
  expectedValuePerUnit,
  meetsMinimumOdds,
  isBlockedHeavyFavorite,
  HEAVY_FAVORITE_MARKETS,
  MIN_RECOMMENDATION_ODDS,
  HEAVY_FAVORITE_MIN_ODDS,
  HEAVY_FAVORITE_MIN_EDGE,
} from "./shared-math";

const MIN_EDGE_FOR_LISTING = 3;

export function passesRecommendationFilters(
  market: string,
  bookmakerOdds: number,
  edge: number,
  stakeUnits: number
): boolean {
  if (bookmakerOdds < MIN_RECOMMENDATION_ODDS || stakeUnits <= 0) return false;
  if (HEAVY_FAVORITE_MARKETS.has(market)) {
    if (bookmakerOdds < HEAVY_FAVORITE_MIN_ODDS) return false;
    if (edge < HEAVY_FAVORITE_MIN_EDGE) return false;
  }
  return true;
}

/** Filters value-bet lists in the UI (hide inflated low-odds goal lines). */
export function isActionableValueListing(row: ValueRow, fixture: Fixture): boolean {
  if (row.edge < MIN_EDGE_FOR_LISTING || row.modelProbability <= 30) return false;
  const odds = getBookmakerOdds(fixture, row.market);
  if (odds <= 1.01) return false;
  if (HEAVY_FAVORITE_MARKETS.has(row.market)) {
    return odds >= HEAVY_FAVORITE_MIN_ODDS && row.edge >= HEAVY_FAVORITE_MIN_EDGE;
  }
  return odds >= MIN_RECOMMENDATION_ODDS;
}

export type PickBestMarketResult = {
  row: ValueRow;
  kellyBet: KellyResult | null;
  actionable: boolean;
};

function noClearValueRow(): ValueRow {
  return {
    market: "Sin valor claro",
    modelProbability: 0,
    marketProbability: 0,
    edge: 0,
    verdict: "No apostar",
  };
}

/**
 * Picks the recommended market using Kelly + EV, real book odds, and penalties
 * on heavy-favorite goal lines (Under 3.5, Over 1.5, etc.).
 */
export function pickBestMarket(
  valueTable: ValueRow[],
  _probabilities: AnalysisResult["probabilities"],
  fixture: Fixture,
  confidenceScore: number
): PickBestMarketResult {
  const positiveRows = valueTable.filter((row) => row.marketProbability > 0 && row.edge > 0);
  const portfolio = kellyPortfolio(positiveRows, fixture, confidenceScore);

  for (const bet of portfolio.bets) {
    if (!passesRecommendationFilters(bet.market, bet.bookmakerOdds, bet.edge, bet.stakeUnits)) {
      continue;
    }
    const row = valueTable.find((r) => r.market === bet.market);
    if (row) {
      return { row, kellyBet: bet, actionable: true };
    }
  }

  const bestEvRow = positiveRows
    .filter((row) => {
      const odds = getBookmakerOdds(fixture, row.market);
      if (odds < MIN_RECOMMENDATION_ODDS) return false;
      if (HEAVY_FAVORITE_MARKETS.has(row.market)) return false;
      const kelly = kellyStake(row.modelProbability, odds, confidenceScore, row.market);
      return kelly.stakeUnits <= 0 && row.edge >= MIN_EDGE_FOR_LISTING;
    })
    .sort(
      (a, b) =>
        expectedValuePerUnit(b.modelProbability, getBookmakerOdds(fixture, b.market)) -
        expectedValuePerUnit(a.modelProbability, getBookmakerOdds(fixture, a.market))
    )[0];

  if (bestEvRow) {
    return { row: bestEvRow, kellyBet: null, actionable: false };
  }

  return { row: noClearValueRow(), kellyBet: null, actionable: false };
}
