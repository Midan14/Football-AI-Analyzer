import type { Fixture, FixtureMarket } from "@/shared/domain";
import {
  TRACKED_ODDS_MARKETS,
  computeClvPercent,
  impliedProbabilityFromDecimal,
  type BookmakerCompareResult,
  type BookmakerMarketCompareRow,
  type LineMovementAlert,
  type OddsQualityBucket,
  type OddsQualityReport,
} from "@/shared/odds-intelligence";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function readMarketOdds(market: FixtureMarket, field: keyof FixtureMarket): number {
  const value = market[field];
  return typeof value === "number" && value > 1.01 ? value : 0;
}

export function compareBookmakerOdds(
  fixtureId: string,
  bookmakers: Record<string, FixtureMarket>,
  bookmakerA?: string,
  bookmakerB?: string
): BookmakerCompareResult {
  const names = Object.keys(bookmakers).filter((name) => {
    const m = bookmakers[name];
    return m.homeWinOdds > 1.01;
  });

  const focus =
    bookmakerA && bookmakerB && bookmakers[bookmakerA] && bookmakers[bookmakerB]
      ? [bookmakerA, bookmakerB]
      : names.slice(0, 2);

  const rows: BookmakerMarketCompareRow[] = [];

  for (const tracked of TRACKED_ODDS_MARKETS) {
    const oddsByBookmaker: Record<string, number> = {};
    for (const name of names) {
      const odd = readMarketOdds(bookmakers[name], tracked.field);
      if (odd > 0) oddsByBookmaker[name] = odd;
    }
    const values = Object.values(oddsByBookmaker);
    if (values.length < 2) continue;

    const med = median(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spreadPercent = med > 0 ? round1(((max - min) / med) * 100) : 0;

    let outlierBookmaker: string | null = null;
    let outlierDeviationPercent: number | null = null;
    let maxDev = 0;
    for (const [bm, odd] of Object.entries(oddsByBookmaker)) {
      const dev = med > 0 ? Math.abs((odd - med) / med) * 100 : 0;
      if (dev > maxDev && dev >= 4) {
        maxDev = dev;
        outlierBookmaker = bm;
        outlierDeviationPercent = round1(dev);
      }
    }

    rows.push({
      marketKey: tracked.key,
      label: tracked.label,
      oddsByBookmaker,
      medianOdds: round1(med),
      spreadPercent,
      outlierBookmaker,
      outlierDeviationPercent,
    });
  }

  const compareRows =
    focus.length === 2
      ? rows.filter((row) => focus.every((bm) => row.oddsByBookmaker[bm] > 0))
      : rows;

  const spreads = compareRows.map((r) => r.spreadPercent);
  const avgSpreadPercent =
    spreads.length > 0 ? round1(spreads.reduce((a, b) => a + b, 0) / spreads.length) : 0;

  return {
    fixtureId,
    bookmakers: names,
    rows: compareRows,
    avgSpreadPercent,
    outlierCount: compareRows.filter((r) => r.outlierBookmaker).length,
  };
}

export function buildOddsQualityReport(
  date: string,
  groupBy: "league" | "market",
  fixtures: Array<{ fixture: Fixture; compare: BookmakerCompareResult }>
): OddsQualityReport {
  const bucketMap = new Map<string, OddsQualityBucket>();

  for (const { fixture, compare } of fixtures) {
    if (compare.bookmakers.length < 2) continue;

    if (groupBy === "league") {
      const key = fixture.leagueId || fixture.leagueName || "unknown";
      const label = fixture.leagueName || key;
      const bucket = bucketMap.get(key) ?? {
        key,
        label,
        sampleSize: 0,
        avgSpreadPercent: 0,
        avgOutlierPercent: 0,
        fixturesWithOdds: 0,
      };
      bucket.fixturesWithOdds += 1;
      bucket.sampleSize += compare.rows.length;
      bucket.avgSpreadPercent += compare.avgSpreadPercent;
      bucket.avgOutlierPercent += compare.outlierCount;
      bucketMap.set(key, bucket);
    } else {
      for (const row of compare.rows) {
        const bucket = bucketMap.get(row.marketKey) ?? {
          key: row.marketKey,
          label: row.label,
          sampleSize: 0,
          avgSpreadPercent: 0,
          avgOutlierPercent: 0,
          fixturesWithOdds: 0,
        };
        bucket.sampleSize += 1;
        bucket.avgSpreadPercent += row.spreadPercent;
        bucket.avgOutlierPercent += row.outlierBookmaker ? (row.outlierDeviationPercent ?? 0) : 0;
        bucket.fixturesWithOdds += 1;
        bucketMap.set(row.marketKey, bucket);
      }
    }
  }

  const buckets = [...bucketMap.values()]
    .map((bucket) => ({
      ...bucket,
      avgSpreadPercent:
        bucket.sampleSize > 0 ? round1(bucket.avgSpreadPercent / bucket.sampleSize) : 0,
      avgOutlierPercent:
        bucket.sampleSize > 0 ? round1(bucket.avgOutlierPercent / bucket.sampleSize) : 0,
    }))
    .sort((a, b) => b.avgSpreadPercent - a.avgSpreadPercent);

  const multi = fixtures.filter((f) => f.compare.bookmakers.length >= 2);
  const allSpreads = multi.map((f) => f.compare.avgSpreadPercent);

  return {
    date,
    groupBy,
    buckets,
    summary: {
      fixturesScanned: fixtures.length,
      fixturesWithMultiBook: multi.length,
      avgSpreadPercent:
        allSpreads.length > 0
          ? round1(allSpreads.reduce((a, b) => a + b, 0) / allSpreads.length)
          : 0,
    },
  };
}

export type SnapshotPoint = {
  fixtureId: string;
  bookmaker: string;
  marketKey: string;
  label: string;
  odds: number;
  impliedProb: number;
  capturedAt: Date;
};

export function detectLineMovements(
  snapshots: SnapshotPoint[],
  thresholdPercent = 5
): LineMovementAlert[] {
  const groups = new Map<string, SnapshotPoint[]>();
  for (const snap of snapshots) {
    const key = `${snap.fixtureId}|${snap.bookmaker}|${snap.marketKey}`;
    const list = groups.get(key) ?? [];
    list.push(snap);
    groups.set(key, list);
  }

  const alerts: LineMovementAlert[] = [];

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime()
    );
    const prev = sorted[sorted.length - 2];
    const curr = sorted[sorted.length - 1];
    const movementPercent = round1(((curr.odds - prev.odds) / prev.odds) * 100);
    const impliedShiftPercent = round1(curr.impliedProb - prev.impliedProb);

    if (Math.abs(movementPercent) >= thresholdPercent) {
      alerts.push({
        fixtureId: curr.fixtureId,
        bookmaker: curr.bookmaker,
        marketKey: curr.marketKey,
        label: curr.label,
        previousOdds: prev.odds,
        currentOdds: curr.odds,
        movementPercent,
        impliedShiftPercent,
        capturedAt: curr.capturedAt.toISOString(),
      });
    }
  }

  return alerts.sort((a, b) => Math.abs(b.movementPercent) - Math.abs(a.movementPercent));
}

export function flattenBookmakerMarkets(
  fixtureId: string,
  bookmakers: Record<string, FixtureMarket>,
  source = "provider"
): Array<{
  fixtureId: string;
  bookmaker: string;
  marketKey: string;
  selection: string;
  odds: number;
  impliedProb: number;
  source: string;
}> {
  const rows: Array<{
    fixtureId: string;
    bookmaker: string;
    marketKey: string;
    selection: string;
    odds: number;
    impliedProb: number;
    source: string;
  }> = [];

  for (const [bookmaker, market] of Object.entries(bookmakers)) {
    for (const tracked of TRACKED_ODDS_MARKETS) {
      const odd = readMarketOdds(market, tracked.field);
      if (odd <= 1.01) continue;
      rows.push({
        fixtureId,
        bookmaker,
        marketKey: tracked.key,
        selection: tracked.label,
        odds: odd,
        impliedProb: impliedProbabilityFromDecimal(odd),
        source,
      });
    }
  }

  return rows;
}

export { computeClvPercent };
