import type { Fixture } from "@/shared/domain";

export const round1 = (value: number) => Math.round(value * 10) / 10;
export const round2 = (value: number) => Math.round(value * 100) / 100;

export function poisson(lambda: number, goals: number) {
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

export function impliedProbability(odds: number) {
  return odds > 0 ? 100 / odds : 0;
}

export function formScore(form: string[]) {
  const points = form.reduce((total, result) => total + (result === "W" ? 3 : result === "D" ? 1 : 0), 0);
  return (points / (form.length * 3)) * 100;
}

/**
 * Multiplicative adjustment to a team's expected goals based on the status
 * of its key player. Industry rule of thumb: losing a top-3 contributor
 * costs ~8-15% of attacking output. Defaults to 1 (no effect) when status
 * is unknown.
 */
export function keyPlayerMultiplier(status: string | undefined): number {
  switch (status) {
    case "injured":
    case "suspended":
      return 0.88; // -12% expected output
    case "doubtful":
      return 0.94; // -6%
    case "available":
    default:
      return 1.0;
  }
}

/**
 * Referee home-bias adjustment. `homeBias` in the domain is a 0-100 score
 * where 50 is neutral, >50 favors home, <50 favors away. Translates into
 * a small ±3% multiplier on home xG (and inverse on away). Conservative
 * because referee bias is one of the noisiest signals in football data.
 */
export function refereeHomeBiasFactors(homeBias: number | undefined): { home: number; away: number } {
  if (homeBias === undefined) return { home: 1, away: 1 };
  const delta = (homeBias - 50) / 50; // -1..+1
  const adj = Math.max(-0.03, Math.min(0.03, delta * 0.03));
  return { home: 1 + adj, away: 1 - adj };
}

export function expectedGoals(fixture: Fixture) {
  const matches = fixture.home.matchesPlayed || 18;
  const homeAttack = fixture.coverage.hasXg ? fixture.home.xgFor / matches : fixture.home.goalsFor / matches;
  const awayDefense = fixture.coverage.hasXg ? fixture.away.xgAgainst / matches : fixture.away.goalsAgainst / matches;
  const awayAttack = fixture.coverage.hasXg ? fixture.away.xgFor / matches : fixture.away.goalsFor / matches;
  const homeDefense = fixture.coverage.hasXg ? fixture.home.xgAgainst / matches : fixture.home.goalsAgainst / matches;
  const homeMotivation = fixture.context.mustWinHome ? 0.12 : 0;
  const awayMotivation = fixture.context.mustWinAway ? 0.12 : 0;
  const travelDrag = Math.min(0.18, fixture.away.travelKm / 1600);

  const baseHome = (homeAttack * 0.58 + awayDefense * 0.42) + 0.18 + homeMotivation;
  const baseAway = (awayAttack * 0.56 + homeDefense * 0.44) + awayMotivation - travelDrag;

  // Squad / referee adjustments — applied multiplicatively after the base
  // formula so that "no data" defaults to multiplier 1 (zero effect).
  const homeKp = keyPlayerMultiplier(fixture.home.keyPlayerStatus);
  const awayKp = keyPlayerMultiplier(fixture.away.keyPlayerStatus);
  const ref = refereeHomeBiasFactors(fixture.referee?.homeBias);

  return {
    home: Math.max(0.35, baseHome * homeKp * ref.home),
    away: Math.max(0.25, baseAway * awayKp * ref.away),
  };
}

/**
 * Pure H2H summary. Returns null when no history is available so callers
 * decide whether to skip or surface the fact. Only uses fields guaranteed
 * by `H2HRecord` — nothing inferred from team names.
 *
 * Bias score is a signed integer in [-N, +N]: positive favors HOME team,
 * negative favors AWAY team, where N = number of records considered.
 */
export function analyzeH2H(fixture: Fixture, lastN = 5) {
  const records = (fixture.h2h ?? []).slice(0, lastN);
  if (records.length === 0) return null;

  // The H2H record stores generic "home"/"away" of that historical match,
  // not necessarily the current home/away. We approximate by name prefix —
  // imperfect but the only signal H2HRecord exposes today.
  const homeNamePrefix = fixture.home.name.split(" ")[0].toLowerCase();
  const awayNamePrefix = fixture.away.name.split(" ")[0].toLowerCase();

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;
  let homeFirstHalfGoals = 0;
  let awayFirstHalfGoals = 0;
  let bttsCount = 0;
  let over25Count = 0;

  for (const r of records) {
    const histHomeIsCurrentHome = r.home.toLowerCase().includes(homeNamePrefix);
    const currentHomeGoals = histHomeIsCurrentHome ? r.homeGoals : r.awayGoals;
    const currentAwayGoals = histHomeIsCurrentHome ? r.awayGoals : r.homeGoals;
    const ftHomeGoals = histHomeIsCurrentHome ? r.firstHalfHome : r.firstHalfAway;
    const ftAwayGoals = histHomeIsCurrentHome ? r.firstHalfAway : r.firstHalfHome;

    homeGoalsTotal += currentHomeGoals;
    awayGoalsTotal += currentAwayGoals;
    homeFirstHalfGoals += ftHomeGoals;
    awayFirstHalfGoals += ftAwayGoals;
    if (currentHomeGoals > 0 && currentAwayGoals > 0) bttsCount += 1;
    if (currentHomeGoals + currentAwayGoals >= 3) over25Count += 1;

    if (currentHomeGoals > currentAwayGoals) homeWins += 1;
    else if (currentHomeGoals < currentAwayGoals) awayWins += 1;
    else draws += 1;
  }

  const sample = records.length;
  const biasScore = homeWins - awayWins;

  return {
    sample,
    homeWins,
    awayWins,
    draws,
    homeGoalsAvg: round2(homeGoalsTotal / sample),
    awayGoalsAvg: round2(awayGoalsTotal / sample),
    firstHalfHomeAvg: round2(homeFirstHalfGoals / sample),
    firstHalfAwayAvg: round2(awayFirstHalfGoals / sample),
    bttsRate: round1((bttsCount / sample) * 100),
    over25Rate: round1((over25Count / sample) * 100),
    biasScore,
    /**
     * xG multiplier suggestion. Conservative: capped at ±5% even when bias
     * is unanimous, because H2H samples are tiny (≤5 matches).
     */
    xgMultiplier: {
      home: 1 + Math.max(-0.05, Math.min(0.05, biasScore * 0.015)),
      away: 1 - Math.max(-0.05, Math.min(0.05, biasScore * 0.015)),
    },
  };
}

export function buildPoissonMatrix(xg: { home: number; away: number }) {
  const matrix: Array<{ home: number; away: number; probability: number }> = [];
  for (let home = 0; home <= 8; home += 1) {
    for (let away = 0; away <= 8; away += 1) {
      matrix.push({ home, away, probability: poisson(xg.home, home) * poisson(xg.away, away) });
    }
  }
  return matrix;
}

export function compute1X2Probabilities(
  matrix: Array<{ home: number; away: number; probability: number }>
) {
  const rawHome = matrix.filter((row) => row.home > row.away).reduce((sum, row) => sum + row.probability, 0);
  const rawDraw = matrix.filter((row) => row.home === row.away).reduce((sum, row) => sum + row.probability, 0);
  const rawAway = matrix.filter((row) => row.home < row.away).reduce((sum, row) => sum + row.probability, 0);
  const total1x2 = rawHome + rawDraw + rawAway;

  return {
    homeWin: round1((rawHome / total1x2) * 100),
    draw: round1((rawDraw / total1x2) * 100),
    awayWin: round1((rawAway / total1x2) * 100),
    over15: round1(matrix.filter((row) => row.home + row.away >= 2).reduce((sum, row) => sum + row.probability, 0) * 100),
    over25: round1(matrix.filter((row) => row.home + row.away >= 3).reduce((sum, row) => sum + row.probability, 0) * 100),
    under35: round1(matrix.filter((row) => row.home + row.away <= 3).reduce((sum, row) => sum + row.probability, 0) * 100),
    btts: round1(matrix.filter((row) => row.home > 0 && row.away > 0).reduce((sum, row) => sum + row.probability, 0) * 100),
  };
}

/**
 * Probabilities for every market the Poisson matrix can resolve directly
 * (Tier 1: goals only). Derived by summing the right cells, so all values
 * are model-consistent with each other and with `compute1X2Probabilities`.
 */
export function computeAllGoalMarkets(
  matrix: Array<{ home: number; away: number; probability: number }>
) {
  const sum = (pred: (r: { home: number; away: number }) => boolean) =>
    round1(matrix.filter(pred).reduce((s, r) => s + r.probability, 0) * 100);

  return {
    doubleChance: {
      "1X": sum((r) => r.home >= r.away),
      "X2": sum((r) => r.home <= r.away),
      "12": sum((r) => r.home !== r.away),
    },
    overUnder: {
      "OVER_0.5": sum((r) => r.home + r.away >= 1),
      "OVER_1.5": sum((r) => r.home + r.away >= 2),
      "OVER_2.5": sum((r) => r.home + r.away >= 3),
      "OVER_3.5": sum((r) => r.home + r.away >= 4),
      "OVER_4.5": sum((r) => r.home + r.away >= 5),
      "UNDER_2.5": sum((r) => r.home + r.away <= 2),
      "UNDER_3.5": sum((r) => r.home + r.away <= 3),
    },
    exactTotalGoals: {
      "0": sum((r) => r.home + r.away === 0),
      "1": sum((r) => r.home + r.away === 1),
      "2": sum((r) => r.home + r.away === 2),
      "3": sum((r) => r.home + r.away === 3),
      "4_PLUS": sum((r) => r.home + r.away >= 4),
    },
    goalsOddEven: {
      ODD: sum((r) => (r.home + r.away) % 2 === 1),
      EVEN: sum((r) => (r.home + r.away) % 2 === 0),
    },
    winToNil: {
      HOME: sum((r) => r.home > 0 && r.away === 0),
      AWAY: sum((r) => r.away > 0 && r.home === 0),
    },
    cleanSheet: {
      HOME: sum((r) => r.away === 0),
      AWAY: sum((r) => r.home === 0),
    },
    teamToScore: {
      HOME: sum((r) => r.home > 0),
      AWAY: sum((r) => r.away > 0),
    },
  };
}

/**
 * Top-N most likely exact scores from the Poisson matrix.
 * Returns scores as "H-A" strings with their probability in percent.
 * The matrix is already complete (0-0..8-8), so this is just sort + slice.
 */
export function computeExactScoreProbabilities(
  matrix: Array<{ home: number; away: number; probability: number }>,
  topN = 6
) {
  return [...matrix]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topN)
    .map((row) => ({
      score: `${row.home}-${row.away}`,
      probability: round1(row.probability * 100),
    }));
}

export function buildValueTable(
  probabilities: ReturnType<typeof compute1X2Probabilities>,
  fixture: Fixture
) {
  // All possible markets with their model probability and real bookmaker odds
  const allMarkets: Array<[string, number, number]> = [
    ["Local gana", probabilities.homeWin, fixture.market.homeWinOdds],
    ["Empate", probabilities.draw, fixture.market.drawOdds],
    ["Visitante gana", probabilities.awayWin, fixture.market.awayWinOdds],
    ["Doble Chance 1X", probabilities.homeWin + probabilities.draw, fixture.market.dc1xOdds ?? 0],
    ["Doble Chance X2", probabilities.draw + probabilities.awayWin, fixture.market.dcx2Odds ?? 0],
    ["Doble Chance 12", probabilities.homeWin + probabilities.awayWin, fixture.market.dc12Odds ?? 0],
    ["Over 1.5", probabilities.over15, fixture.market.over15Odds],
    ["Over 2.5", probabilities.over25, fixture.market.over25Odds],
    ["Over 3.5", 100 - probabilities.under35 + (probabilities.under35 - probabilities.over25 > 0 ? 0 : 5), fixture.market.over35Odds ?? 0],
    ["Under 1.5", 100 - probabilities.over15, fixture.market.under15Odds ?? 0],
    ["Under 2.5", 100 - probabilities.over25, fixture.market.under25Odds ?? 0],
    ["Under 3.5", probabilities.under35, fixture.market.under35Odds],
    ["BTTS Sí", probabilities.btts, fixture.market.bttsYesOdds],
    ["BTTS No", 100 - probabilities.btts, fixture.market.bttsNoOdds],
    ["AH Local -1", probabilities.homeWin * 0.75, fixture.market.ahHomeMinus1],
    ["AH Visitante +1", (probabilities.draw + probabilities.awayWin) * 0.85, fixture.market.ahAwayPlus1],
  ];

  // ONLY include markets that have REAL odds from the bookmaker (odds > 0)
  // This prevents fake edge calculations with default/invented odds
  return allMarkets
    .filter(([, , odds]) => odds > 1.01) // Only real odds from API
    .map(([market, modelProbability, odds]) => {
      const marketProbability = impliedProbability(Number(odds));
      const edge = round1(Number(modelProbability) - marketProbability);
      return {
        market: String(market),
        modelProbability: round1(Number(modelProbability)),
        marketProbability: round1(marketProbability),
        edge,
        verdict: edge > 7 ? "Valor" : edge > 3 ? "Posible" : edge < -7 ? "Evitar" : "Justo",
      } as const;
    });
}
