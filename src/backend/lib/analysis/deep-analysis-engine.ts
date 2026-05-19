import type { DeepAnalysisResult, Fixture } from "@/shared/domain";
import {
  round1,
  round2,
  impliedProbability,
  formScore,
  expectedGoals,
  buildPoissonMatrix,
  compute1X2Probabilities,
  computeExactScoreProbabilities,
  computeAllGoalMarkets,
  buildValueTable,
  analyzeH2H,
} from "./shared-math";
import {
  computeConfidence,
  computeStakeUnits,
  clampConfidenceForSample,
  applyContextualPenalties,
  floorBlackSwanProb,
} from "./risk-policy";

type ValueRow = DeepAnalysisResult["valueTable"][number];

function createSeededRng(seedInput: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedInput.length; i += 1) {
    seed ^= seedInput.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fallbackMarket(probabilities: DeepAnalysisResult["probabilities"]): ValueRow {
  const options = [
    ["Local gana", probabilities.homeWin],
    ["Empate", probabilities.draw],
    ["Visitante gana", probabilities.awayWin],
    ["Over 2.5", probabilities.over25],
    ["Under 3.5", probabilities.under35],
    ["BTTS Sí", probabilities.btts],
  ] as const;
  const [market, modelProbability] = [...options].sort((a, b) => b[1] - a[1])[0];
  return {
    market: `Sin cuota real disponible (${market})`,
    modelProbability,
    marketProbability: 0,
    edge: 0,
    verdict: "Sin cuotas",
  };
}

function monteCarloPoisson(lambda: number, iterations: number, noiseScale: number, rng: () => number): number[] {
  const dist: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = Math.max(0, Math.round(lambda + (rng() * 2 - 1) * noiseScale * Math.sqrt(lambda)));
    dist.push(sample);
  }
  return dist;
}

function build360Radar(fixture: Fixture) {
  const homeMP = Math.max(1, fixture.home.matchesPlayed);
  const awayMP = Math.max(1, fixture.away.matchesPlayed);

  const homeForm = formScore(fixture.home.form);
  const awayForm = formScore(fixture.away.form);

  // Attack: xG per match scaled so 2.5 ≈ 90
  const homeAttack = round1(Math.min(100, ((fixture.home.xgFor || fixture.home.goalsFor) / homeMP) * 35));
  const awayAttack = round1(Math.min(100, ((fixture.away.xgFor || fixture.away.goalsFor) / awayMP) * 35));

  // Defense: inverse of xG conceded per match, 1.0 ≈ 70, 2.5 ≈ 25
  const homeDefense = round1(Math.max(20, 100 - ((fixture.home.xgAgainst || fixture.home.goalsAgainst) / homeMP) * 30));
  const awayDefense = round1(Math.max(20, 100 - ((fixture.away.xgAgainst || fixture.away.goalsAgainst) / awayMP) * 30));

  const homeMotivation = round1(fixture.home.motivation);
  const awayMotivation = round1(fixture.away.motivation);

  const homeMomentum = homeForm;
  const awayMomentum = awayForm;

  // Psychological pressure affects each side differently
  const homePsych = round1(Math.max(20, 100 - (fixture.context.psychologicalPressure || 0) * 0.8 - (fixture.context.favoriteParalysis || 0) * 0.3));
  const awayPsych = round1(Math.max(20, 100 - (fixture.context.favoriteParalysis || 0) * 0.7 - (fixture.context.psychologicalPressure || 0) * 0.2 - (fixture.away.travelKm > 800 ? 5 : 0)));

  // Fatigue: local benefits from rest; visitor penalized by travel
  const homeFatigue = round1(Math.max(20, 100 - Math.abs(fixture.home.restDays - fixture.away.restDays) * 6));
  const awayFatigue = round1(Math.max(10, 100 - Math.abs(fixture.home.restDays - fixture.away.restDays) * 6 - fixture.away.travelKm / 25));

  return [
    { axis: "Forma", home: homeForm, away: awayForm },
    { axis: "Ataque", home: homeAttack, away: awayAttack },
    { axis: "Defensa", home: homeDefense, away: awayDefense },
    { axis: "Motivación", home: homeMotivation, away: awayMotivation },
    { axis: "Momento", home: homeMomentum, away: awayMomentum },
    { axis: "Psicológico", home: homePsych, away: awayPsych },
    { axis: "Fatiga", home: homeFatigue, away: awayFatigue },
  ];
}

export function analyzeFixtureDeep(fixture: Fixture): DeepAnalysisResult {
  const xg = expectedGoals(fixture);
  const matrix = buildPoissonMatrix(xg);
  const probabilities = compute1X2Probabilities(matrix);
  const topExactScores = computeExactScoreProbabilities(matrix);
  const goalMarkets = computeAllGoalMarkets(matrix);

  const penalties: Array<{ id: string; label: string; points: number }> = [];
  const riskFlags: Array<{ id: string; label: string; severity: "low" | "medium" | "high" }> = [];
  const addPenalty = (id: string, label: string, points: number, severity: "low" | "medium" | "high") => {
    penalties.push({ id, label, points });
    riskFlags.push({ id, label, severity });
  };

  const marketHomeWinPct = impliedProbability(fixture.market.homeWinOdds);
  applyContextualPenalties(fixture, probabilities.homeWin, marketHomeWinPct, addPenalty);

  const rawConfidence = computeConfidence(penalties);
  const confidenceScore = clampConfidenceForSample(
    rawConfidence,
    fixture.home.matchesPlayed,
    fixture.away.matchesPlayed
  );
  const stakeUnits = computeStakeUnits(confidenceScore);

  // Pure H2H summary — surfaced in insights below if present.
  const h2hSummary = analyzeH2H(fixture);

  const valueTable = buildValueTable(probabilities, fixture);

  // Pick best market: balance edge, conviction, and odds attractiveness
  const attractiveMarkets = valueTable
    .filter((row) => {
      const impliedOdds = 100 / row.modelProbability;
      return row.edge > 0 && impliedOdds >= 1.4 && impliedOdds <= 8.0;
    })
    .sort((a, b) => {
      const scoreA = a.edge * Math.sqrt(a.modelProbability);
      const scoreB = b.edge * Math.sqrt(b.modelProbability);
      return scoreB - scoreA;
    });

  const best = attractiveMarkets[0]
    ?? valueTable.filter((row) => row.edge > 0).sort((a, b) => b.edge - a.edge)[0]
    ?? valueTable.sort((a, b) => b.edge - a.edge)[0]
    ?? fallbackMarket(probabilities);

  // --- Monte Carlo ---
  const iterations = 1000;
  const noiseHome = 0.35;
  const noiseAway = 0.35;
  const rng = createSeededRng(`${fixture.id}:${round2(xg.home)}:${round2(xg.away)}`);
  const homeDist = monteCarloPoisson(xg.home, iterations, noiseHome, rng);
  const awayDist = monteCarloPoisson(xg.away, iterations, noiseAway, rng);
  let over25Count = 0;
  let totalOutcomes = 0;
  const simulationResults: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const h = homeDist[i];
    const a = awayDist[i];
    totalOutcomes += 1;
    if (h > a) simulationResults.push(1);
    else if (h === a) simulationResults.push(0);
    else simulationResults.push(-1);
    if (h + a >= 3) over25Count += 1;
  }

  const mean = simulationResults.reduce((s, v) => s + v, 0) / simulationResults.length;
  const variance =
    simulationResults.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (simulationResults.length - 1);
  const stdDev = Math.sqrt(variance);
  const sharpRatio = stdDev > 0 ? round2(mean / stdDev) : 0;
  const over25Confidence = round1((over25Count / totalOutcomes) * 100);

  // --- Heavy tail / t-Student ---
  const outlierCount = fixture.historicalOutliers?.length ?? 0;
  const controversyCount = fixture.referee?.controversyHistory?.length ?? 0;
  const weatherBoost = fixture.context.weatherRisk === "high" ? 2 : fixture.context.weatherRisk === "medium" ? 1 : 0;
  const lowDivisionBoost = fixture.context.lowDivision ? 3 : 0;
  const degreesOfFreedom = Math.max(2, 2 + outlierCount + weatherBoost + lowDivisionBoost);
  const avgOutlierProb =
    (fixture.historicalOutliers ?? []).reduce((s, o) => s + o.probability, 0) / Math.max(1, outlierCount);
  const maxOutlierProb = Math.max(0, ...(fixture.historicalOutliers ?? []).map((o) => o.probability), 0);
  const heavyTailScore = round2(
    avgOutlierProb * 0.5 + controversyCount * 2 + weatherBoost * 1.5 + lowDivisionBoost * 3
  );
  const blackSwanProb = round1(
    floorBlackSwanProb(
      Math.min(95, heavyTailScore + (fixture.context.relegationRisk || 0) * 0.3 + (fixture.context.underdogFreedom || 0) * 0.1)
    )
  );
  const maxSurpriseScore = round1(
    Math.min(100, maxOutlierProb * 5 + (fixture.context.relegationRisk || 0) * 0.5 + (fixture.context.underdogFreedom || 0) * 0.3)
  );

  // --- Game theory ---
  const positionGap = Math.abs(fixture.home.tablePosition - fixture.away.tablePosition);
  const homeMustWin = fixture.context.mustWinHome ? 1 : 0;
  const awayMustWin = fixture.context.mustWinAway ? 1 : 0;
  const motivationDiff = fixture.away.motivation - fixture.home.motivation;

  const payoffMatrix = [
    {
      strategy: "Local presiona alto",
      homePayoff: round1(30 + positionGap * 0.8 + homeMustWin * 15),
      awayPayoff: round1(60 - positionGap * 0.5 + awayMustWin * 12 + motivationDiff * 0.3),
    },
    {
      strategy: "Visitante controla ritmo",
      homePayoff: round1(25 - positionGap * 0.3 + homeMustWin * 10),
      awayPayoff: round1(70 + positionGap * 0.7 + awayMustWin * 15 + motivationDiff * 0.4),
    },
    {
      strategy: "Ambos conservadores",
      homePayoff: round1(40 + homeMustWin * 8),
      awayPayoff: round1(45 + awayMustWin * 8 + motivationDiff * 0.2),
    },
    {
      strategy: "Transición rápida visita",
      homePayoff: round1(20 - positionGap * 0.4),
      awayPayoff: round1(65 + positionGap * 0.6 + awayMustWin * 10 + motivationDiff * 0.5),
    },
  ];

  const homeDominantStrategy =
    payoffMatrix.reduce(
      (best, row) => (row.homePayoff > best.payoff ? { name: row.strategy, payoff: row.homePayoff } : best),
      { name: payoffMatrix[0].strategy, payoff: payoffMatrix[0].homePayoff }
    ).name;

  const awayDominantStrategy =
    payoffMatrix.reduce(
      (best, row) => (row.awayPayoff > best.payoff ? { name: row.strategy, payoff: row.awayPayoff } : best),
      { name: payoffMatrix[0].strategy, payoff: payoffMatrix[0].awayPayoff }
    ).name;

  const nashDescription =
    positionGap > 8
      ? "Ventaja significativa para visitante — equilibrio en control de ritmo visitante"
      : positionGap > 4
        ? "Brecha moderada — equilibrio posible en juego conservador o contraataque"
        : "Posiciones cercanas — equilibrio en presión alta mutua";

  // --- Psychological ---
  const chokingRisk = round1(
    Math.min(95, fixture.context.favoriteParalysis * 0.7 + (fixture.context.psychologicalPressure || 0) * 0.4 + (fixture.away.travelKm > 800 ? 8 : 0))
  );
  const motivationAdvantage = motivationDiff > 0 ? Math.abs(motivationDiff) : 0;
  const pressureHandlingScore = round1(
    Math.max(10, 100 - (fixture.context.psychologicalPressure || 0) * 0.8 - (fixture.context.favoriteParalysis || 0) * 0.5)
  );
  const momentumScore = round1(
    formScore(fixture.away.form) * 0.55 + formScore(fixture.home.form) * 0.45
  );

  // --- Referee ---
  const expectedCards = round1(Number(fixture.referee?.avgCards ?? 3.5));
  const homeBiasAdj = round2(Number(fixture.referee?.homeBias ?? 0) / 100);
  const penaltyRisk = round1(
    Math.min(90, (fixture.referee?.avgPenalties ?? 0.2) * 25 + (fixture.referee?.controversyHistory?.length ?? 0) * 8)
  );

  // --- Safe market ---
  // Find the BEST market to bet on, not just the highest probability.
  // A "safe" market must have: decent odds (>= 1.4 fair odds), positive edge, and good conviction.
  // Under 3.5 @ 1.1 is NOT a useful recommendation even if probability is 90%.
  const allMarketRows = [...valueTable].sort((a, b) => {
    // Score = edge * sqrt(modelProbability) * odds attractiveness
    const oddsA = 100 / a.modelProbability;
    const oddsB = 100 / b.modelProbability;
    const scoreA = a.edge * Math.sqrt(a.modelProbability) * (oddsA >= 1.5 ? 1.2 : oddsA >= 1.3 ? 0.8 : 0.4);
    const scoreB = b.edge * Math.sqrt(b.modelProbability) * (oddsB >= 1.5 ? 1.2 : oddsB >= 1.3 ? 0.8 : 0.4);
    return scoreB - scoreA;
  });

  let safeMarket: DeepAnalysisResult["safeMarket"];

  // Priority 1: High edge + attractive odds (fair odds >= 1.5)
  const premiumRow = allMarketRows.find(
    (row) => row.edge > 3 && (100 / row.modelProbability) >= 1.5 && row.modelProbability >= 30
  );
  // Priority 2: Good edge + moderate odds (fair odds >= 1.3)
  const goodRow = allMarketRows.find(
    (row) => row.edge > 2 && (100 / row.modelProbability) >= 1.3 && row.modelProbability >= 40
  );
  // Priority 3: Any positive edge with decent probability
  const fallbackRow = allMarketRows.find(
    (row) => row.edge > 0 && row.modelProbability >= 50
  );

  if (premiumRow) {
    const fairOdds = (100 / premiumRow.modelProbability).toFixed(2);
    safeMarket = {
      market: premiumRow.market,
      confidence: premiumRow.modelProbability,
      edge: premiumRow.edge,
      explanation: `Mercado con edge +${premiumRow.edge}% y cuota atractiva (justa ${fairOdds}). Modelo ${premiumRow.modelProbability}% vs mercado ${premiumRow.marketProbability}%. Relación riesgo/recompensa óptima.`,
      riskGrade: premiumRow.edge > 8 ? "A" : "B",
    };
  } else if (goodRow) {
    const fairOdds = (100 / goodRow.modelProbability).toFixed(2);
    safeMarket = {
      market: goodRow.market,
      confidence: goodRow.modelProbability,
      edge: goodRow.edge,
      explanation: `Mercado con edge moderado +${goodRow.edge}% y cuota justa ${fairOdds}. Modelo ${goodRow.modelProbability}% vs mercado ${goodRow.marketProbability}%.`,
      riskGrade: "B",
    };
  } else if (fallbackRow) {
    safeMarket = {
      market: fallbackRow.market,
      confidence: fallbackRow.modelProbability,
      edge: fallbackRow.edge,
      explanation: `Mejor opción disponible con edge +${fallbackRow.edge}%. Probabilidad modelo ${fallbackRow.modelProbability}% vs mercado ${fallbackRow.marketProbability}%. Precaución: edge bajo.`,
      riskGrade: "C",
    };
  } else {
    safeMarket = {
      market: best.market,
      confidence: best.modelProbability,
      edge: best.edge,
      explanation: "No se encontró mercado con edge positivo significativo. Monitorear movimiento de cuotas antes del partido.",
      riskGrade: "D",
    };
  }

  // --- Insights ---
  const insights: DeepAnalysisResult["insights"] = [];

  if (fixture.away.travelKm > 800) {
    insights.push({
      category: "Viaje",
      finding: `${fixture.away.name} viaja ${fixture.away.travelKm}km, fatiga acumulada posible en segundo tiempo.`,
      action: `Considerar apuesta en vivo si ${fixture.away.name} no anota antes del minuto 30.`,
      confidence: 74,
    });
  }

  if (fixture.context.relegationRisk > 20) {
    insights.push({
      category: "Presión",
      finding: `${fixture.home.name} con ${fixture.context.relegationRisk}% de riesgo de descenso. Juegan con urgencia defensiva pero libertad ofensiva (nada que perder).`,
      action: `Cuidado con under 2.5 si ${fixture.home.name} se encierra. Buscar corners a favor de ${fixture.away.name} si presionan.`,
      confidence: 68,
    });
  }

  if (fixture.context.underdogFreedom > 60) {
    insights.push({
      category: "Psicológico",
      finding: `${fixture.home.name} tiene ${fixture.context.underdogFreedom}% de libertad de underdog — motivación extra sin presión de resultado.`,
      action: `No descartar gol de ${fixture.home.name}. Pueden sorprender en contragolpe o balón parado.`,
      confidence: 65,
    });
  }

  if ((fixture.referee?.controversyHistory?.length ?? 0) > 0) {
    insights.push({
      category: "Arbitraje",
      finding: `${fixture.referee?.name ?? "Árbitro"} con historial polémico: ${fixture.referee?.controversyHistory.join("; ")}. Promedia ${fixture.referee?.avgCards} tarjetas/partido.`,
      action: "Mercado de tarjetas over podría tener valor. Monitorear rigor en primeros 15 minutos.",
      confidence: 72,
    });
  }

  if (h2hSummary && h2hSummary.sample >= 3) {
    const trendTeam =
      h2hSummary.biasScore > 0 ? fixture.home.name :
      h2hSummary.biasScore < 0 ? fixture.away.name : "ambos por igual";
    insights.push({
      category: "H2H",
      finding:
        `${h2hSummary.sample} encuentros directos: ${h2hSummary.homeWins}-${h2hSummary.draws}-${h2hSummary.awayWins} (V/E/D para local). ` +
        `Promedio de goles ${h2hSummary.homeGoalsAvg}-${h2hSummary.awayGoalsAvg}. ` +
        `BTTS histórico ${h2hSummary.bttsRate}% | Over 2.5 ${h2hSummary.over25Rate}%.`,
      action:
        `Sesgo H2H hacia ${trendTeam}. ` +
        (h2hSummary.over25Rate >= 60 ? "Over 2.5 con respaldo histórico." :
         h2hSummary.over25Rate <= 40 ? "Under 3.5 con respaldo histórico." :
         "Mercado de goles sin tendencia clara."),
      confidence: Math.min(85, 60 + h2hSummary.sample * 4),
    });
  }

  const homeFormPts = formScore(fixture.home.form);
  const awayFormPts = formScore(fixture.away.form);
  if (Math.abs(homeFormPts - awayFormPts) > 20) {
    const stronger = awayFormPts > homeFormPts ? fixture.away.name : fixture.home.name;
    const weaker = awayFormPts > homeFormPts ? fixture.home.name : fixture.away.name;
    insights.push({
      category: "Forma",
      finding: `${stronger} (${Math.max(homeFormPts, awayFormPts)}pts forma) domina ampliamente a ${weaker} (${Math.min(homeFormPts, awayFormPts)}pts forma) en momento actual.`,
      action: `Momento de forma respalda a ${stronger}. Considerar AH -1 si es visita.`,
      confidence: 77,
    });
  }

  if (fixture.context.prizeMoney > 0) {
    insights.push({
      category: "Económico",
      finding: `Premio económico estimado de $${fixture.context.prizeMoney}K — incentivo adicional pero no determinante en esta fase.`,
      action: "Incentivo moderado. No ajusta significativamente la motivación base.",
      confidence: 42,
    });
  }

  const homeInjuryImpact = (fixture.squad?.home.injuries ?? []).reduce((s, i) => s + i.impact, 0);
  const awayInjuryImpact = (fixture.squad?.away.injuries ?? []).reduce((s, i) => s + i.impact, 0);
  if (homeInjuryImpact > 0) {
    insights.push({
      category: "Lesiones",
      finding: `${fixture.home.name}: ${fixture.squad?.home.injuries.map((i) => `${i.player} (${i.status})`).join(", ")}. Impacto total: ${homeInjuryImpact}/10.`,
      action: "Plantilla mermada. Vulnerabilidad en transiciones defensivas.",
      confidence: 70,
    });
  }
  if (awayInjuryImpact > 0) {
    insights.push({
      category: "Lesiones",
      finding: `${fixture.away.name}: ${fixture.squad?.away.injuries.map((i) => `${i.player} (${i.status})`).join(", ")}. Impacto total: ${awayInjuryImpact}/10.`,
      action: "Plantilla visitante mermada. Ventaja para el local en juego físico.",
      confidence: 68,
    });
  }

  // --- AI Prompt ---
  const aiPrompt = [
    `=== ANÁLISIS PROFUNDO: ${fixture.home.name} vs ${fixture.away.name} ===`,
    `Liga: ${fixture.leagueName} | País: ${fixture.countryId} | Fecha: ${fixture.kickoff} | Estado: ${fixture.status}`,
    "",
    "== EQUIPOS ==",
    `Local: ${fixture.home.name} (#${fixture.home.tablePosition}) | Pts: ${fixture.home.pointsTotal} | PJ: ${fixture.home.matchesPlayed} | GF: ${fixture.home.goalsFor} | GC: ${fixture.home.goalsAgainst} | xGf: ${fixture.home.xgFor} | xGa: ${fixture.home.xgAgainst}`,
    `Forma: ${fixture.home.form.join(" - ")} | Motivación: ${fixture.home.motivation}/100 | Descanso: ${fixture.home.restDays}d | Rotación: ${fixture.home.squadRotationRisk}%`,
    `Jugadora clave: ${fixture.home.keyPlayer} (${fixture.home.keyPlayerStatus})`,
    "",
    `Visitante: ${fixture.away.name} (#${fixture.away.tablePosition}) | Pts: ${fixture.away.pointsTotal} | PJ: ${fixture.away.matchesPlayed} | GF: ${fixture.away.goalsFor} | GC: ${fixture.away.goalsAgainst} | xGf: ${fixture.away.xgFor} | xGa: ${fixture.away.xgAgainst}`,
    `Forma: ${fixture.away.form.join(" - ")} | Motivación: ${fixture.away.motivation}/100 | Descanso: ${fixture.away.restDays}d | Viaje: ${fixture.away.travelKm}km | Rotación: ${fixture.away.squadRotationRisk}%`,
    `Jugadora clave: ${fixture.away.keyPlayer} (${fixture.away.keyPlayerStatus})`,
    "",
    "== PROBABILIDADES POISSON ==",
    `xG esperados — Local: ${round2(xg.home)} | Visitante: ${round2(xg.away)}`,
    `1: ${probabilities.homeWin}% | X: ${probabilities.draw}% | 2: ${probabilities.awayWin}%`,
    `Over 1.5: ${probabilities.over15}% | Over 2.5: ${probabilities.over25}% | Under 3.5: ${probabilities.under35}% | BTTS: ${probabilities.btts}%`,
    "",
    "== MONTE CARLO (1000 iteraciones) ==",
    `Distribución 1X2: Sharp Ratio ${sharpRatio}`,
    `Confianza Over 2.5: ${over25Confidence}%`,
    "",
    "== COLA PESADA / BLACK SWAN ==",
    `Distribución: t-Student con ${degreesOfFreedom} grados de libertad`,
    `Probabilidad de evento outlier: ${blackSwanProb}% | Score máximo sorpresa: ${maxSurpriseScore}/100`,
    `Outliers históricos registrados: ${outlierCount}`,
    fixture.historicalOutliers?.length
      ? fixture.historicalOutliers.map((o) => `  - ${o.date}: ${o.match} — ${o.description} (prob: ${o.probability}%)`).join("\n")
      : "  Sin outliers históricos registrados.",
    "",
    "== TEORÍA DE JUEGOS ==",
    `Matriz de pagos:`,
    ...payoffMatrix.map((row) => `  ${row.strategy}: Home ${row.homePayoff} | Away ${row.awayPayoff}`),
    `Estrategia dominante local: ${homeDominantStrategy}`,
    `Estrategia dominante visitante: ${awayDominantStrategy}`,
    `Equilibrio Nash: ${nashDescription}`,
    "",
    "== ANÁLISIS PSICOLÓGICO ==",
    `Riesgo de choking: ${chokingRisk}% | Ventaja motivacional: ${motivationAdvantage}pts`,
    `Manejo de presión: ${pressureHandlingScore}/100 | Score momento: ${momentumScore}/100`,
    `Presión psicológica: ${fixture.context.psychologicalPressure}% | Parálisis de favorito: ${fixture.context.favoriteParalysis}% | Libertad underdog: ${fixture.context.underdogFreedom}%`,
    "",
    "== IMPACTO ARBITRAL ==",
    `Árbitro: ${fixture.referee?.name ?? "No asignado"}`,
    `Tarjetas esperadas: ${expectedCards} | Riesgo de penal: ${penaltyRisk}% | Sesgo local: ${homeBiasAdj}`,
    `Rigor: ${fixture.referee?.strictness ?? "N/A"} | Partidos arbitrados: ${fixture.referee?.lastMatches ?? "N/A"}`,
    `Controversias: ${fixture.referee?.controversyHistory?.join("; ") ?? "Ninguna"}`,
    "",
    "== MERCADO SEGURO ==",
    `Mercado: ${safeMarket.market} | Grado: ${safeMarket.riskGrade} | Confianza: ${safeMarket.confidence}% | Edge: ${safeMarket.edge}%`,
    safeMarket.explanation,
    "",
    "== MERCADOS ==",
    `homeWin: ${fixture.market.homeWinOdds} | draw: ${fixture.market.drawOdds} | awayWin: ${fixture.market.awayWinOdds}`,
    `over25: ${fixture.market.over25Odds} | under35: ${fixture.market.under35Odds} | bttsYes: ${fixture.market.bttsYesOdds}`,
    "",
    "== INSIGHTS ACCIONABLES ==",
    ...insights.map((i) => `[${i.category}] ${i.finding} → ${i.action} (${i.confidence}%)`),
    "",
    "== CONTEXTO ==",
    `Derby: ${fixture.context.derby} | Must-win local: ${fixture.context.mustWinHome} | Must-win visita: ${fixture.context.mustWinAway}`,
    `Playoff: ${fixture.context.playoff} | Riesgo descenso: ${fixture.context.relegationRisk}% | Rivalidad: ${fixture.context.rivalRivalry}`,
    `Premio: $${fixture.context.prizeMoney}K | Clima: ${fixture.context.weatherRisk}`,
    "",
    "== SQUAD ==",
    `Bajas locales: ${fixture.squad?.home.injuries.map((i) => `${i.player} (${i.position}, ${i.status})`).join(", ") ?? "Ninguna"}`,
    `Bajas visitantes: ${fixture.squad?.away.injuries.map((i) => `${i.player} (${i.position}, ${i.status})`).join(", ") ?? "Ninguna"}`,
    `Última alineación local: ${fixture.squad?.home.lastLineup.join(", ") ?? "N/D"}`,
    `Última alineación visita: ${fixture.squad?.away.lastLineup.join(", ") ?? "N/D"}`,
    "",
    "== SENTIMIENTO SOCIAL ==",
    `Local: ${fixture.socialSentiment?.homePositive ?? 0}% | Visita: ${fixture.socialSentiment?.awayPositive ?? 0}% | Neutral: ${fixture.socialSentiment?.neutral ?? 0}%`,
    "",
    "== CONFIANZA DEL MODELO ==",
    `Score: ${confidenceScore}/100 | Penalizaciones: ${penalties.length}`,
    penalties.map((p) => `  - ${p.label} (${p.points}pts)`).join("\n"),
  ].join("\n");

  const drawDist: number[] = [];
  for (let i = 0; i < Math.min(100, homeDist.length); i += 1) {
    drawDist.push(homeDist[i] === awayDist[i] ? 1 : 0);
  }

  return {
    fixtureId: fixture.id,
    probabilities,
    topExactScores,
    goalMarkets,
    confidence: { score: confidenceScore, penalties },
    riskFlags,
    radar: build360Radar(fixture),
    recommendation: {
      market: best.market,
      fairOdds: round1(100 / best.modelProbability),
      minimumOdds: round1((100 / best.modelProbability) * 1.05),
      stakeUnits,
      rationale: `${best.market}: modelo ${best.modelProbability}% vs mercado ${best.marketProbability}% (edge +${best.edge}%). Cuota justa ${round1(100 / best.modelProbability)}. Confianza ${confidenceScore}/100.`,
    },
    valueTable,
    monteCarlo: {
      iterations,
      homeWinDist: homeDist.slice(0, 100),
      drawDist,
      awayWinDist: awayDist.slice(0, 100),
      over25Confidence,
      sharpRatio,
    },
    heavyTail: {
      distribution: "t-student",
      degreesOfFreedom,
      blackSwanProb,
      maxSurpriseScore,
    },
    gameTheory: {
      nashEquilibrium: nashDescription,
      homeDominantStrategy,
      awayDominantStrategy,
      payoffMatrix,
    },
    psychological: {
      chokingRisk,
      motivationAdvantage,
      pressureHandlingScore,
      momentumScore,
    },
    referee: {
      expectedCards,
      homeBiasAdj,
      penaltyRisk,
    },
    safeMarket,
    insights,
    aiPrompt,
  };
}
