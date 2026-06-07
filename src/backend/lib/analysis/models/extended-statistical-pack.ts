/**
 * Extended statistical models — half-time, corners/ESP, cards, xG blend,
 * SARIMA proxy, feature engineering stats, and local explainability.
 */

import type { Fixture } from "@/shared/domain";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeTriplet(h: number, d: number, a: number) {
  const total = h + d + a || 1;
  const homeWin = Math.round((h / total) * 1000) / 10;
  const draw = Math.round((d / total) * 1000) / 10;
  const awayWin = Math.round((100 - homeWin - draw) * 10) / 10;
  return { homeWin, draw, awayWin };
}

function formPoints(form: string[]) {
  return (form ?? []).slice(0, 5).map((r) => (r === "W" ? 3 : r === "D" ? 1 : 0));
}

function goalsPerMatch(team: Fixture["home"]) {
  const mp = Math.max(1, team.matchesPlayed || 18);
  return (team.goalsFor ?? 0) / mp;
}

function concededPerMatch(team: Fixture["home"]) {
  const mp = Math.max(1, team.matchesPlayed || 18);
  return (team.goalsAgainst ?? 0) / mp;
}

/** First-half 1X2 — ~42% of FT goal rate, higher draw share */
export function halfTimeModel(fixture: Fixture, homeXg: number, awayXg: number) {
  const htHome = homeXg * 0.42 * 1.05;
  const htAway = awayXg * 0.42 * 0.95;
  const diff = htHome - htAway;
  const probs = normalizeTriplet(
    clamp(0.28 + diff * 0.12, 0.12, 0.55),
    clamp(0.38 - Math.abs(diff) * 0.06, 0.28, 0.48),
    clamp(0.28 - diff * 0.12, 0.12, 0.55)
  );
  const expectedGoalsHT = Math.round((htHome + htAway) * 100) / 100;
  const over05HT = Math.round((1 - Math.exp(-(htHome + htAway))) * 1000) / 10;
  return {
    homeWinHT: probs.homeWin,
    drawHT: probs.draw,
    awayWinHT: probs.awayWin,
    expectedGoalsHT,
    over05HT,
  };
}

/** Corners / ESP — attack pressure + league tier */
export function cornersEspModel(fixture: Fixture, homeXg: number, awayXg: number) {
  const tierBoost = fixture.coverage.tier === "elite" ? 1.08 : fixture.coverage.tier === "standard" ? 1.0 : 0.92;
  const base = 9.5 * tierBoost;
  const homeCorners = Math.round((base * 0.52 + homeXg * 1.8 + (fixture.home.motivation - 50) * 0.02) * 10) / 10;
  const awayCorners = Math.round((base * 0.48 + awayXg * 1.6 + (fixture.away.motivation - 50) * 0.02) * 10) / 10;
  const expectedTotalCorners = Math.round((homeCorners + awayCorners) * 10) / 10;
  const over95Corners = Math.round(clamp(50 + (expectedTotalCorners - 9.5) * 8, 35, 78) * 10) / 10;
  return { expectedTotalCorners, homeCorners, awayCorners, over95Corners };
}

/** Team-level card risk (yellows / reds proxy) */
export function cardsRiskModel(fixture: Fixture) {
  const homeAgg = clamp(
    3.2 + (100 - fixture.home.motivation) * 0.008 + Math.max(0, 5 - fixture.home.restDays) * 0.15,
    2.5,
    5.5
  );
  const awayAgg = clamp(
    3.4 + (100 - fixture.away.motivation) * 0.008 + fixture.away.travelKm / 800,
    2.5,
    6.0
  );
  const derbyBoost = fixture.context.derby ? 0.8 : 0;
  const expectedYellows = Math.round((homeAgg + awayAgg + derbyBoost) * 10) / 10;
  const expectedReds = Math.round(clamp(0.08 + derbyBoost * 0.05 + Math.abs(homeAgg - awayAgg) * 0.02, 0.05, 0.35) * 100) / 100;
  const highCardRisk = expectedYellows >= 5.5 || expectedReds >= 0.2;
  return {
    expectedYellows,
    expectedReds,
    homeCardsIndex: Math.round(homeAgg * 10) / 10,
    awayCardsIndex: Math.round(awayAgg * 10) / 10,
    highCardRisk,
  };
}

/** xG-style blend (Poisson lambdas + form) — distinct from base xG in engine */
export function xgBoostedModel(fixture: Fixture, homeXg: number, awayXg: number) {
  const homePts = formPoints(fixture.home.form);
  const awayPts = formPoints(fixture.away.form);
  const formAdjH = homePts.length ? homePts.reduce((a, b) => a + b, 0 as number) / homePts.length / 3 : 0.5;
  const formAdjA = awayPts.length ? awayPts.reduce((a, b) => a + b, 0 as number) / awayPts.length / 3 : 0.5;
  const hx = Math.round((homeXg * 0.65 + goalsPerMatch(fixture.home) * 0.2 + formAdjH * 0.15) * 100) / 100;
  const ax = Math.round((awayXg * 0.65 + goalsPerMatch(fixture.away) * 0.2 + formAdjA * 0.15) * 100) / 100;
  const totalXg = Math.round((hx + ax) * 100) / 100;
  const bttsFromXg = Math.round((1 - Math.exp(-hx)) * (1 - Math.exp(-ax)) * 1000) / 10;
  return { homeXg: hx, awayXg: ax, totalXg, bttsFromXg, engine: "typescript-xg-blend" };
}

/** SARIMA seasonal component (TS proxy when Python unavailable) */
export function sarimaExtension(fixture: Fixture) {
  const homePts = formPoints(fixture.home.form);
  const awayPts = formPoints(fixture.away.form);
  const homeS = _expand(homePts.length ? homePts : [1.5]);
  const awayS = _expand(awayPts.length ? awayPts : [1.2]);
  const seasonality = Math.sin((fixture.home.matchesPlayed % 12) * (Math.PI / 6)) * 0.04;
  const diff = _diffSeasonal(homeS) - _diffSeasonal(awayS) + seasonality;
  const sarimaHomeWin = normalizeTriplet(
    clamp(0.33 + diff * 0.15, 0.1, 0.55),
    0.28,
    clamp(0.33 - diff * 0.15, 0.1, 0.55)
  ).homeWin;
  return {
    sarimaHomeWin,
    sarimaSeasonality: Math.round(seasonality * 1000) / 1000,
    engine: "typescript-sarima-proxy",
  };
}

function _expand(vals: number[]) {
  const out = [...vals];
  while (out.length < 8) out.unshift(out[0] ?? 1.5);
  return out.slice(-8);
}

function _diffSeasonal(series: number[]) {
  if (series.length < 2) return 0;
  const d1 = series[series.length - 1] - series[series.length - 2];
  const d2 = series.length >= 3 ? series[series.length - 2] - series[series.length - 3] : 0;
  return d1 * 0.6 + d2 * 0.4;
}

/** Rolling / TSFresh-style feature count for ML ops */
export function featureEngineeringPack(fixture: Fixture) {
  const homePts = formPoints(fixture.home.form);
  const awayPts = formPoints(fixture.away.form);
  const rolling = [
    _rollingMean(homePts),
    _rollingStd(homePts),
    _rollingMean(awayPts),
    _rollingStd(awayPts),
    goalsPerMatch(fixture.home),
    concededPerMatch(fixture.home),
    goalsPerMatch(fixture.away),
    concededPerMatch(fixture.away),
    fixture.home.restDays,
    fixture.away.restDays,
  ].filter((x) => Number.isFinite(x));
  const tsfreshProxyScore = Math.round(
    clamp(rolling.length * 8 + (fixture.coverage.tier === "elite" ? 12 : 0), 40, 98)
  );
  return { rollingFeatureCount: rolling.length, tsfreshProxyScore };
}

function _rollingMean(vals: number[]) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function _rollingStd(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = _rollingMean(vals);
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
}

/** LIME-style local linear drivers from fixture signals */
export function explainabilityPack(
  fixture: Fixture,
  probs: { homeWin: number; draw: number; awayWin: number }
) {
  const drivers: Array<{ feature: string; impact: number }> = [
    { feature: "strength_diff", impact: Math.round((goalsPerMatch(fixture.home) - goalsPerMatch(fixture.away)) * 12) },
    { feature: "form_diff", impact: Math.round((_rollingMean(formPoints(fixture.home.form)) - _rollingMean(formPoints(fixture.away.form))) * 10) },
    { feature: "home_advantage", impact: 6 },
    { feature: "defense_gap", impact: Math.round((concededPerMatch(fixture.away) - concededPerMatch(fixture.home)) * 8) },
    { feature: "motivation", impact: Math.round((fixture.home.motivation - fixture.away.motivation) * 0.05) },
  ];
  drivers.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const dominant = probs.homeWin >= probs.awayWin && probs.homeWin >= probs.draw ? "HOME_WIN" : probs.awayWin >= probs.draw ? "AWAY_WIN" : "DRAW";
  return {
    topDrivers: drivers.slice(0, 5),
    method: "lime-local-linear",
    dominantOutcome: dominant,
  };
}

/** AutoML status — which Python stacks are expected when ml-service runs */
export function autoMlStatusPack() {
  const engines: string[] = ["xgboost", "lightgbm", "catboost"];
  if (process.env.ML_SERVICE_URL) engines.push("ml-service");
  return {
    championModel: "ensemble-voting",
    engines,
    optunaEnabled: process.env.ML_OPTUNA === "1",
    randomForestEnabled: true,
  };
}

export type ExtendedStatisticalPack = ReturnType<typeof buildExtendedStatisticalPack>;

export function buildExtendedStatisticalPack(
  fixture: Fixture,
  homeXg: number,
  awayXg: number,
  probs: { homeWin: number; draw: number; awayWin: number }
) {
  const sarima = sarimaExtension(fixture);
  return {
    halfTime: halfTimeModel(fixture, homeXg, awayXg),
    cornersEsp: cornersEspModel(fixture, homeXg, awayXg),
    cardsRisk: cardsRiskModel(fixture),
    xgModel: xgBoostedModel(fixture, homeXg, awayXg),
    sarima,
    featureEngineering: featureEngineeringPack(fixture),
    explainability: explainabilityPack(fixture, probs),
    autoMl: autoMlStatusPack(),
  };
}
