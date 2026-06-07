import type { AnalysisResult, Fixture } from "@/shared/domain";
import type { KalmanResult } from "./models/kalman-filter";
import type { ExpectedThreatResult } from "./models/expected-threat";
import type { ValueBetReport } from "./models/value-bet-calculator";
import { round1 } from "./shared-math";

export type TacticalRadarAxis = {
  axis: string;
  home: number;
  away: number;
  value: number;
};

function clampMetric(value: number) {
  return round1(Math.max(0, Math.min(100, value)));
}

function axisRow(axis: string, home: number, away: number): TacticalRadarAxis {
  const h = clampMetric(home);
  const a = clampMetric(away);
  return { axis, home: h, away: a, value: round1((h + a) / 2) };
}

type TacticalRadarContext = {
  fixture: Fixture;
  homeForm: number;
  awayForm: number;
  homeXg: number;
  awayXg: number;
  ensemble: NonNullable<AnalysisResult["ensemble"]>;
  kalman: KalmanResult;
  xThreat: ExpectedThreatResult;
  hawkes: NonNullable<AnalysisResult["advancedModels"]>["hawkes"];
  valueBetReport: ValueBetReport;
  halfTime: NonNullable<AnalysisResult["advancedModels"]>["halfTime"];
  confidenceScore: number;
};

function coverageScore(fixture: Fixture) {
  if (fixture.coverage.tier === "elite") return 94;
  if (fixture.coverage.tier === "standard") return 74;
  return 45;
}

function marketAxis(homeWin: number, awayWin: number, hasOdds: boolean) {
  const base = hasOdds ? 72 : 35;
  return axisRow(
    "Mercado",
    clampMetric(base * 0.55 + homeWin * 0.45),
    clampMetric(base * 0.55 + awayWin * 0.45)
  );
}

function outlierAxis(fixture: Fixture, kalman: KalmanResult, modelAgreement: number) {
  const agreementPenalty = Math.max(0, 100 - modelAgreement) * 0.35;
  const base = fixture.context.lowDivision ? 34 : 62;
  return axisRow(
    "Outlier",
    clampMetric(base + kalman.homeInnovation * 0.25 - agreementPenalty * 0.4),
    clampMetric(base + kalman.awayInnovation * 0.25 - agreementPenalty * 0.4)
  );
}

function fatigueAxis(fixture: Fixture, scale = 1) {
  const restGap = Math.abs(fixture.home.restDays - fixture.away.restDays);
  const homeFatigue = Math.max(20, 100 - restGap * 6 * scale);
  const awayFatigue = Math.max(
    10,
    100 - restGap * 6 * scale - (fixture.away.travelKm / 25) * scale
  );
  return axisRow("Fatiga", homeFatigue, awayFatigue);
}

function attackAxis(homeXg: number, awayXg: number, kalman: KalmanResult, xThreat: ExpectedThreatResult) {
  return axisRow(
    "Ataque",
    homeXg * 31 + kalman.homeAttackStrength * 0.22 + xThreat.homeThreat * 0.12,
    awayXg * 31 + kalman.awayAttackStrength * 0.22 + xThreat.awayThreat * 0.12
  );
}

function defenseAxis(fixture: Fixture, kalman: KalmanResult) {
  const homeMp = Math.max(1, fixture.home.matchesPlayed);
  const awayMp = Math.max(1, fixture.away.matchesPlayed);
  const homeGa = (fixture.home.xgAgainst || fixture.home.goalsAgainst) / homeMp;
  const awayGa = (fixture.away.xgAgainst || fixture.away.goalsAgainst) / awayMp;
  return axisRow(
    "Defensa",
    Math.max(20, 100 - awayGa * 30) * 0.45 + kalman.homeDefenseStrength * 0.55,
    Math.max(20, 100 - homeGa * 30) * 0.45 + kalman.awayDefenseStrength * 0.55
  );
}

export function buildTacticalRadar(ctx: TacticalRadarContext): {
  radar: TacticalRadarAxis[];
  radarHalfTime: TacticalRadarAxis[];
} {
  const { fixture, homeForm, awayForm, homeXg, awayXg, ensemble, kalman, xThreat, hawkes, valueBetReport, halfTime, confidenceScore } = ctx;
  const coverage = coverageScore(fixture);

  const momentumHome = clampMetric(homeForm * 0.55 + hawkes.homeMomentum * 0.45);
  const momentumAway = clampMetric(awayForm * 0.55 + hawkes.awayMomentum * 0.45);

  const valueBoostHome =
    valueBetReport.bestBet?.market === "Local gana" ? valueBetReport.bestBet.evPercent * 0.8 : 0;
  const valueBoostAway =
    valueBetReport.bestBet?.market === "Visitante gana" ? valueBetReport.bestBet.evPercent * 0.8 : 0;

  const radar: TacticalRadarAxis[] = [
    axisRow("Forma", homeForm, awayForm),
    attackAxis(homeXg, awayXg, kalman, xThreat),
    defenseAxis(fixture, kalman),
    axisRow("Motivación", fixture.home.motivation, fixture.away.motivation),
    fatigueAxis(fixture),
    marketAxis(ensemble.homeWin, ensemble.awayWin, fixture.coverage.hasOdds),
    axisRow("Cobertura", coverage + confidenceScore * 0.04, coverage + confidenceScore * 0.02),
    outlierAxis(fixture, kalman, ensemble.modelAgreement),
  ].map((row) => {
    if (row.axis === "Mercado") {
      return axisRow(row.axis, row.home + valueBoostHome, row.away + valueBoostAway);
    }
    if (row.axis === "Motivación") {
      return axisRow(
        row.axis,
        row.home + (xThreat.territorialDominance === "home" ? xThreat.dominanceScore * 0.08 : 0),
        row.away + (xThreat.territorialDominance === "away" ? xThreat.dominanceScore * 0.08 : 0)
      );
    }
    return row;
  });

  const htHomeXg = homeXg * 0.42 * 1.05;
  const htAwayXg = awayXg * 0.42 * 0.95;
  const htHomeAttack = htHomeXg * 40 + momentumHome * 0.15;
  const htAwayAttack = htAwayXg * 40 + momentumAway * 0.15;

  const radarHalfTime: TacticalRadarAxis[] = [
    axisRow("Forma", homeForm * 0.92, awayForm * 0.92),
    axisRow("Ataque", htHomeAttack, htAwayAttack),
    axisRow("Defensa", Math.max(20, 100 - htAwayXg * 35), Math.max(20, 100 - htHomeXg * 35)),
    axisRow("Motivación", fixture.home.motivation * 0.98, fixture.away.motivation * 0.95),
    fatigueAxis(fixture, 1.12),
    marketAxis(halfTime.homeWinHT, halfTime.awayWinHT, fixture.coverage.hasOdds),
    axisRow("Cobertura", coverage * 0.96, coverage * 0.94),
    outlierAxis(fixture, kalman, ensemble.modelAgreement),
  ];

  return { radar, radarHalfTime };
}
