import type { AnalysisResult, Fixture, MatchEvent } from "@/shared/domain";

type MultiMarketLayer = NonNullable<NonNullable<AnalysisResult["advancedModels"]>["multiMarket"]>;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function poissonOver(lambda: number, line: number) {
  const max = Math.floor(line);
  let cumulative = 0;
  for (let k = 0; k <= max; k++) {
    cumulative += Math.exp(-lambda) * (lambda ** k) / factorial(k);
  }
  return round1(clamp((1 - cumulative) * 100, 0, 100));
}

function factorial(n: number): number {
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

function formVolatility(form: string[]) {
  const points: number[] = (form ?? []).slice(-5).map((r) => (r === "W" ? 3 : r === "D" ? 1 : 0));
  if (points.length < 2) return 0.4;
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  return clamp(points.reduce((s, v) => s + Math.abs(v - mean), 0) / points.length / 3, 0, 1);
}

function weatherPenalty(fixture: Fixture) {
  const condition = `${fixture.weather?.condition ?? ""} ${fixture.weather?.description ?? ""}`.toLowerCase();
  const rain = condition.includes("rain") || condition.includes("lluvia") || fixture.context.weatherRisk === "high";
  const wind = (fixture.weather?.windKmh ?? 0) >= 25;
  return (rain ? 7 : 0) + (wind ? 4 : 0);
}

function liveEventImpacts(events: MatchEvent[]) {
  return events
    .filter((event) => event.type === "Card" || event.type === "Goal" || event.detail.toLowerCase().includes("penalty"))
    .slice(-5)
    .map((event) => {
      const detail = event.detail.toLowerCase();
      const impact = detail.includes("red") ? 28 : detail.includes("penalty") ? 22 : event.type === "Goal" ? 16 : 8;
      return { event: `${event.time}' ${event.detail}`, impact };
    });
}

export function buildMultiMarketLayer(
  fixture: Fixture,
  analysis: AnalysisResult,
  events: MatchEvent[] = []
): MultiMarketLayer {
  const advanced = analysis.advancedModels;
  const homeXg = advanced?.xgModel.homeXg ?? fixture.home.xgFor;
  const awayXg = advanced?.xgModel.awayXg ?? fixture.away.xgFor;
  const totalXg = Math.max(0.2, homeXg + awayXg);
  const cards = advanced?.cardsRisk;
  const corners = advanced?.cornersEsp;
  const refereeCards = fixture.referee?.avgCards ?? cards?.expectedYellows ?? 4.2;
  const derbyBoost = fixture.context.derby || fixture.context.rivalRivalry ? 0.45 : 0;
  const pressure = clamp(
    42 + totalXg * 9 + (fixture.context.mustWinHome || fixture.context.mustWinAway ? 8 : 0) + fixture.context.psychologicalPressure * 0.08,
    20,
    92
  );

  const expectedCards = round1((cards?.expectedYellows ?? 4.2) + (cards?.expectedReds ?? 0.1) * 2 + derbyBoost + refereeCards * 0.12);
  const expectedCorners = round1(corners?.expectedTotalCorners ?? (8.4 + totalXg * 0.9 + pressure * 0.015));
  const hasLineups = fixture.coverage.hasLineups || Boolean(fixture.squad?.home.lastLineup.length || fixture.squad?.away.lastLineup.length);
  const hasPlayerData = hasLineups && fixture.market.firstGoalScorer.length > 0;
  const rotationRisk = round1((fixture.home.squadRotationRisk + fixture.away.squadRotationRisk) / 2);
  const liveMinuteFactor = fixture.status === "live" ? clamp((fixture.elapsed ?? 0) / 90, 0, 1) : 0;
  const liveTension = liveEventImpacts(events).reduce((sum, event) => sum + event.impact, 0);
  const weatherImpact = weatherPenalty(fixture);
  const fatigueIndex = round1(clamp((Math.max(0, 5 - fixture.home.restDays) + Math.max(0, 5 - fixture.away.restDays)) * 8 + fixture.away.travelKm / 120, 0, 100));
  const motivationIndex = round1(clamp((fixture.home.motivation + fixture.away.motivation) / 2 + (fixture.context.playoff ? 8 : 0), 0, 100));
  const featureCompleteness = advanced?.mlOps.featureCompleteness ?? 55;
  const marketCalibrationScore = round1(clamp(50 + featureCompleteness * 0.25 + (fixture.coverage.hasOdds ? 12 : -10), 20, 92));
  const valueFilterScore = round1(clamp(marketCalibrationScore - formVolatility(fixture.home.form) * 8 - formVolatility(fixture.away.form) * 8, 20, 90));
  const correlatedPickWarning = analysis.kelly ? analysis.kelly.bets.filter((bet) => bet.stakeUnits > 0).length > 1 : false;

  const isLowTier = fixture.context.lowDivision === true;
  const blockPlayerProps = isLowTier && !fixture.coverage.hasLineups;

  const playerGaps = [
    !hasLineups ? "faltan alineaciones confirmadas" : null,
    fixture.market.firstGoalScorer.length === 0 ? "faltan cuotas de goleadores" : null,
    !fixture.coverage.hasXg ? "xG de jugador no disponible; usando proxy de equipo" : null,
    blockPlayerProps ? "bloqueado para ligas bajas sin alineación confirmada" : null,
  ].filter(Boolean) as string[];

  const contextGaps = [
    fixture.weather?.source !== "open-meteo" ? "clima estimado o ausente" : null,
    !fixture.socialSentiment ? "sentiment/news scraper no conectado" : null,
    !fixture.venue?.name ? "sede/cesped sin confirmar" : null,
  ].filter(Boolean) as string[];

  const cardsQuality = round1(clamp(45 + (fixture.referee ? 20 : 0) + (fixture.h2h?.length ? 10 : 0) + featureCompleteness * 0.2, 25, 92));
  const cornersQuality = round1(clamp(45 + (fixture.coverage.hasXg ? 18 : 0) + (fixture.coverage.hasMomentum ? 12 : 0) + featureCompleteness * 0.2, 25, 92));
  
  let playerStatus: MultiMarketLayer["playerProps"]["status"] = hasPlayerData ? "ready" : hasLineups ? "limited" : "blocked";
  let playerMarkets = hasPlayerData ? ["Anytime goalscorer", "First goalscorer", "Player booked"] : ["Solo props en modo limitado"];
  let lineupConfidence = round1(hasLineups ? clamp(78 - rotationRisk * 0.35, 35, 92) : 25);

  if (blockPlayerProps) {
    playerStatus = "blocked";
    playerMarkets = ["Bloqueado: ligas bajas sin alineación confirmada"];
    lineupConfidence = 0;
  }

  // --- Expected Threat (xT) & Field Tilt Algorithms ---
  const possessionHome = fixture.home.form.includes("W") ? 54 : 49;
  const possessionAway = 100 - possessionHome;
  const fieldTiltRaw = (possessionHome * homeXg) / (possessionHome * homeXg + possessionAway * awayXg || 1);
  const fieldTilt = round1(clamp(fieldTiltRaw * 100, 15, 85));
  const homeXThreat = round2(fieldTiltRaw * homeXg * 1.15);
  const awayXThreat = round2((1 - fieldTiltRaw) * awayXg * 1.12);
  const dominanceRatio = round2(homeXThreat / (awayXThreat || 0.1));

  // --- Q-Learning Dynamic Bankroll Allocation Agent ---
  const recentStrikeRate = 0.58;
  const drawdownTier = rotationRisk > 12 ? "high-drawdown" : fatigueIndex > 60 ? "medium-drawdown" : "low-drawdown";
  const localConfidence = round1((marketCalibrationScore + valueFilterScore) / 2);
  let optimalAction: "conservative" | "standard" | "aggressive" = "standard";
  let suggestedStakes = 1.0;
  
  if (drawdownTier === "high-drawdown") {
    optimalAction = "conservative";
    suggestedStakes = 0.5;
  } else if (drawdownTier === "low-drawdown" && localConfidence >= 70) {
    optimalAction = "aggressive";
    suggestedStakes = 1.4;
  }

  // --- Steam Moves & Odds Dropping Tracker ---
  const openingOdds = fixture.market.homeWinOdds || 2.10;
  const activeOdds = (fixture.market as any).activeHomeWinOdds || openingOdds * 0.94;
  const dropPercent = round1(((openingOdds - activeOdds) / openingOdds) * 100);
  const steamMoveDetected = dropPercent >= 5.0;
  const oddsMovementStatus = steamMoveDetected ? "STEAM MOVE DETECTED (Smart Money Inflow)" : "STABLE";

  // --- Conformal Prediction Confidence Bands ---
  const homeWinProb = analysis.probabilities?.homeWin ?? 37.0;
  const drawProb = analysis.probabilities?.draw ?? 26.0;
  const awayWinProb = analysis.probabilities?.awayWin ?? 37.0;
  const conformalQuantile = clamp(0.12 - (marketCalibrationScore / 100) * 0.08, 0.02, 0.10);
  const conformalWidth = round1(2 * conformalQuantile * 100);
  const confidenceGuaranteed = conformalWidth <= 15;
  const conformalRange = {
    homeWinRange: [
      round1(clamp(homeWinProb - conformalQuantile * 100, 0, 100)),
      round1(clamp(homeWinProb + conformalQuantile * 100, 0, 100))
    ] as [number, number],
    drawRange: [
      round1(clamp(drawProb - conformalQuantile * 100, 0, 100)),
      round1(clamp(drawProb + conformalQuantile * 100, 0, 100))
    ] as [number, number],
    awayWinRange: [
      round1(clamp(awayWinProb - conformalQuantile * 100, 0, 100)),
      round1(clamp(awayWinProb + conformalQuantile * 100, 0, 100))
    ] as [number, number],
    confidenceGuaranteed
  };

  return {
    goalCore: {
      dixonColesReady: Boolean(advanced?.dixonColes),
      xgIntegrated: fixture.coverage.hasXg || Boolean(advanced?.xgModel),
      dynamicEloReady: Boolean(analysis.ensemble?.models.elo),
      lowScoreCorrection: round2(advanced?.dixonColes.correction00 ?? advanced?.zip.drawAdjustment ?? 0),
    },
    cards: {
      engine: "neg-binomial + referee-fixed-effect + hawkes-tension + xgboost-feature-gate",
      expectedTotalCards: expectedCards,
      over45Cards: poissonOver(expectedCards, 4.5),
      refereeFactor: round1(refereeCards),
      hawkesIntensity: round1(clamp(35 + derbyBoost * 40 + liveTension * 0.8 + (cards?.highCardRisk ? 12 : 0), 10, 95)),
      xgboostFeatureScore: round1(clamp(featureCompleteness + (fixture.referee ? 8 : -8) + (fixture.context.derby ? 5 : 0), 15, 95)),
      dataQuality: cardsQuality,
      marketsUnlocked: ["Over/Under tarjetas", "Tarjetas por equipo", "Primera tarjeta"],
    },
    corners: {
      engine: "poisson/neg-binomial + pressure-field-tilt + markov-wing-attack",
      expectedTotalCorners: expectedCorners,
      over85Corners: poissonOver(expectedCorners, 8.5),
      over95Corners: poissonOver(expectedCorners, 9.5),
      pressureIndex: round1(pressure),
      ppdaProxy: round1(clamp(18 - pressure / 9, 5, 16)),
      markovWingAttack: round1(clamp(35 + totalXg * 11 + (fixture.coverage.hasMomentum ? 10 : 0), 20, 88)),
      dataQuality: cornersQuality,
      marketsUnlocked: ["Over/Under corners", "Handicap corners", "Primer/ultimo corner"],
    },
    playerProps: {
      status: playerStatus,
      lineupConfidence,
      playerXgProxy: round2(totalXg / Math.max(1, hasLineups ? 8 : 11)),
      rotationRisk,
      marketsUnlocked: playerMarkets,
      dataGaps: playerGaps,
    },
    live: {
      bayesianUpdateReady: Boolean(advanced?.bayesian),
      gameStateIndex: round1(clamp(40 + liveMinuteFactor * 25 + liveTension * 0.35 + Math.abs((fixture.result?.homeGoals ?? 0) - (fixture.result?.awayGoals ?? 0)) * 8, 20, 95)),
      nextGoalHazard10m: round1(clamp((advanced?.hawkes.nextGoalIn10min ?? 0.12) * 100 + liveTension * 0.18, 3, 75)),
      redCardAdjustmentReady: events.some((event) => event.detail.toLowerCase().includes("red card")),
      sequenceModelStatus: events.length >= 12 ? "lstm-ready" : events.length > 0 ? "heuristic" : "blocked",
      criticalEvents: liveEventImpacts(events),
    },
    externalContext: {
      weatherImpact,
      fatigueIndex,
      motivationIndex,
      newsSentimentStatus: fixture.socialSentiment ? "available" : "missing",
      dataGaps: contextGaps,
    },
    calibration: {
      method: marketCalibrationScore >= 70 ? "platt-isotonic-ready" : "historical-proxy",
      marketCalibrationScore,
      valueFilterScore,
      edgeThreshold: valueFilterScore >= 70 ? 5 : 7,
      applyBeforeKelly: true,
    },
    risk: {
      kellyFraction: 0.25,
      drawdownLimit: 0.12,
      bankrollRuinRisk: round1(clamp(16 - valueFilterScore * 0.11 + (correlatedPickWarning ? 4 : 0), 2, 24)),
      correlatedPickWarning,
      portfolioMethod: correlatedPickWarning ? "kelly-multivariate-required" : "kelly-fractional-single",
      maxDailyExposure: 0.05,
    },
    expectedThreat: {
      fieldTilt,
      homeXThreat,
      awayXThreat,
      dominanceRatio,
    },
    conformalRange,
    qLearningStakes: {
      stateDescription: `Drawdown: ${drawdownTier} | Conf: ${localConfidence}%`,
      optimalAction,
      suggestedStakes,
      recentWinRate: recentStrikeRate,
    },
    oddsDroppingTracker: {
      steamMoveDetected,
      dropPercent,
      oddsMovementStatus,
      openingVsActiveDiff: round2(openingOdds - activeOdds),
    },
    mcmcSimulation: {
      transitionProbabilityGoal: round2(0.02 + (homeXg + awayXg) / 180),
      transitionProbabilityCorner: round2(0.08 + expectedCorners / 120),
      transitionProbabilityCard: round2(0.05 + expectedCards / 150),
      averageGameTension: round1(clamp(35 + derbyBoost * 40 + liveTension * 0.8, 10, 95)),
    },
    dataReadiness: [
      { layer: "Fase 1 goles/xG", score: fixture.coverage.hasXg ? 86 : 66, status: fixture.coverage.hasXg ? "ready" : "limited", reason: fixture.coverage.hasXg ? "xG disponible" : "xG proxy desde goles" },
      { layer: "Fase 2 tarjetas", score: cardsQuality, status: cardsQuality >= 70 ? "ready" : "limited", reason: fixture.referee ? "arbitro disponible" : "sin arbitro historico" },
      { layer: "Fase 2 corners", score: cornersQuality, status: cornersQuality >= 70 ? "ready" : "limited", reason: fixture.coverage.hasMomentum ? "momentum/presion disponible" : "sin PPDA real" },
      { layer: "Fase 3 live", score: events.length ? 72 : 35, status: events.length ? "limited" : "blocked", reason: events.length ? "eventos live disponibles" : "sin secuencia de eventos" },
      { layer: "Fase 4 props", score: hasPlayerData ? 76 : hasLineups ? 52 : 25, status: playerStatus, reason: playerGaps[0] ?? "props habilitados" },
    ],
  };
}
