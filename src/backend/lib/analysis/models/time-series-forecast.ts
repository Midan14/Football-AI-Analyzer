/**
 * Time series ensemble — Prophet / ARIMA / TFT / N-BEATS (implementación ligera en TS).
 */

import type { Fixture } from "@/shared/domain";

export type TimeSeriesForecastResult = {
  prophet: { trend: number; seasonality: number; forecastHomeGoals: number; forecastAwayGoals: number };
  arima: { ar1: number; ar2: number; forecastHomeWin: number; forecastDraw: number; forecastAwayWin: number };
  tft: { attentionWeights: number[]; dominantWindow: string; homeWin: number; draw: number; awayWin: number };
  nbeats: { trendBlock: number; seasonBlock: number; residualBlock: number; homeWin: number; draw: number; awayWin: number };
  ensembleHomeWin: number;
  ensembleDraw: number;
  ensembleAwayWin: number;
};

function formToSeries(form: string[]): number[] {
  return form.map((r) => (r === "W" ? 1 : r === "D" ? 0.5 : 0));
}

function normalizeTriplet(h: number, d: number, a: number) {
  const total = h + d + a || 1;
  return {
    homeWin: Math.round((h / total) * 1000) / 10,
    draw: Math.round((d / total) * 1000) / 10,
    awayWin: Math.round((a / total) * 1000) / 10,
  };
}

export function timeSeriesForecastModel(fixture: Fixture): TimeSeriesForecastResult {
  const homeSeries = formToSeries(fixture.home.form);
  const awaySeries = formToSeries(fixture.away.form);

  // Prophet-like: trend + pseudo-weekly seasonality from form index
  const homeTrend = homeSeries.reduce((s, v, i) => s + v * (i + 1), 0) / Math.max(1, homeSeries.length);
  const awayTrend = awaySeries.reduce((s, v, i) => s + v * (i + 1), 0) / Math.max(1, awaySeries.length);
  const seasonality = Math.sin((fixture.home.matchesPlayed || 18) / 38 * Math.PI) * 0.15;
  const prophetHomeGoals = Math.max(0.4, (fixture.home.goalsFor / Math.max(1, fixture.home.matchesPlayed || 18)) * (1 + homeTrend * 0.2 + seasonality));
  const prophetAwayGoals = Math.max(0.3, (fixture.away.goalsFor / Math.max(1, fixture.away.matchesPlayed || 18)) * (1 + awayTrend * 0.2 - seasonality * 0.5));

  // ARIMA(2,0,0)-like on form series
  const ar1Home = homeSeries[0] ?? 0.5;
  const ar2Home = homeSeries[1] ?? ar1Home;
  const ar1Away = awaySeries[0] ?? 0.5;
  const ar2Away = awaySeries[1] ?? ar1Away;
  const arimaHome = 0.55 * ar1Home + 0.25 * ar2Home + 0.2 * (homeSeries.reduce((a, b) => a + b, 0) / Math.max(1, homeSeries.length));
  const arimaAway = 0.55 * ar1Away + 0.25 * ar2Away + 0.2 * (awaySeries.reduce((a, b) => a + b, 0) / Math.max(1, awaySeries.length));
  const arimaDiff = arimaHome - arimaAway;
  const arimaProbs = normalizeTriplet(
    Math.max(0.1, 0.35 + arimaDiff * 0.5),
    0.28,
    Math.max(0.1, 0.35 - arimaDiff * 0.5)
  );

  // TFT-like attention over last 5 results (more weight on recent)
  const weights = [0.35, 0.25, 0.2, 0.12, 0.08];
  const attnHome = homeSeries.slice(0, 5).reduce((s, v, i) => s + v * (weights[i] ?? 0.05), 0);
  const attnAway = awaySeries.slice(0, 5).reduce((s, v, i) => s + v * (weights[i] ?? 0.05), 0);
  const tftProbs = normalizeTriplet(attnHome + 0.15, 0.25, attnAway);

  // N-BEATS-like decomposition
  const trendBlock = (homeTrend + awayTrend) / 2;
  const seasonBlock = seasonality;
  const residualBlock = Math.abs(ar1Home - ar2Home) + Math.abs(ar1Away - ar2Away);
  const nbeatsProbs = normalizeTriplet(
    0.33 + trendBlock * 0.25 + seasonBlock,
    0.27 - residualBlock * 0.05,
    0.33 - trendBlock * 0.25
  );

  const ensemble = normalizeTriplet(
    (arimaProbs.homeWin + tftProbs.homeWin + nbeatsProbs.homeWin) / 3,
    (arimaProbs.draw + tftProbs.draw + nbeatsProbs.draw) / 3,
    (arimaProbs.awayWin + tftProbs.awayWin + nbeatsProbs.awayWin) / 3
  );

  return {
    prophet: {
      trend: Math.round(homeTrend * 100) / 100,
      seasonality: Math.round(seasonality * 100) / 100,
      forecastHomeGoals: Math.round(prophetHomeGoals * 100) / 100,
      forecastAwayGoals: Math.round(prophetAwayGoals * 100) / 100,
    },
    arima: {
      ar1: Math.round(ar1Home * 100) / 100,
      ar2: Math.round(ar2Home * 100) / 100,
      forecastHomeWin: arimaProbs.homeWin,
      forecastDraw: arimaProbs.draw,
      forecastAwayWin: arimaProbs.awayWin,
    },
    tft: {
      attentionWeights: weights.slice(0, homeSeries.length),
      dominantWindow: attnHome > attnAway ? "recent-home" : "recent-away",
      ...tftProbs,
    },
    nbeats: {
      trendBlock: Math.round(trendBlock * 100) / 100,
      seasonBlock: Math.round(seasonBlock * 100) / 100,
      residualBlock: Math.round(residualBlock * 100) / 100,
      ...nbeatsProbs,
    },
    ensembleHomeWin: ensemble.homeWin,
    ensembleDraw: ensemble.draw,
    ensembleAwayWin: ensemble.awayWin,
  };
}
