/**
 * Advanced 27-section report builder.
 *
 * Produces a structured, prose-rich report mirroring the "deep analysis" PDF
 * format, but populated ENTIRELY from the app's real computed analysis
 * (probabilities, value table, advancedModels) and fixture data — never
 * fabricated. Sections that would require data the provider does not cover
 * (xG in low-coverage leagues, biomechanics/tracking, etc.) are surfaced with
 * explicit caveats instead of invented numbers.
 *
 * Pure module (no jsPDF) so it is unit-testable; the renderer lives in
 * export-report.ts.
 */

import type { AnalysisResult, Fixture } from "@/shared/domain";

export type ReportFigure =
  | {
      kind: "bars";
      title: string;
      bars: Array<{ label: string; value: number; color?: [number, number, number] }>;
      max?: number;
      unit?: string;
    }
  | {
      kind: "groupedBars";
      title: string;
      groups: Array<{ label: string; model: number; market: number }>;
    }
  | {
      kind: "radar";
      title: string;
      axes: Array<{ axis: string; home: number; away: number }>;
    };

export type ReportTable = { columns: string[]; rows: string[][] };

export type ReportSection = {
  index: number;
  title: string;
  paragraphs: string[];
  table?: ReportTable;
  figure?: ReportFigure;
  caveats?: string[];
};

export type AdvancedReport = {
  title: string;
  subtitle: string;
  generatedAt: string;
  coverageCaveats: string[];
  sections: ReportSection[];
};

const pct = (n: number | undefined | null): string => `${(n ?? 0).toFixed(1)}%`;
const num = (n: number | undefined | null, d = 2): string => (n ?? 0).toFixed(d);

function formPoints(form: string[] | undefined): number {
  if (!form || form.length === 0) return 50;
  const last = form.slice(-5);
  const pts = last.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
  return Math.round((pts / (last.length * 3)) * 100);
}

function perGame(total: number, mp: number): number {
  return total / Math.max(1, mp);
}

/** Honest coverage caveats derived from the fixture's coverage chips. */
function coverageCaveats(fixture: Fixture): string[] {
  const out: string[] = [];
  if (fixture.coverage.tier === "low" || fixture.context.lowDivision) {
    out.push(
      "Liga de baja cobertura: se aplica una reduccion automatica de confianza y los eventos atipicos (cola gruesa) son mas probables. Las cifras finas (xG, microstats) pueden no estar disponibles en el proveedor."
    );
  }
  if (!fixture.coverage.hasXg) {
    out.push("xG real no disponible para esta liga/partido: se usa un proxy basado en goles. Interpretar las metricas de xG como estimacion, no como dato medido.");
  }
  if (!fixture.coverage.hasLineups) {
    out.push("Alineaciones no confirmadas: la confianza se limita hasta conocer el once oficial.");
  }
  if (!fixture.coverage.hasOdds) {
    out.push("Sin cuotas confiables de mercado: el analisis de valor (EV) es orientativo.");
  }
  const minMatches = Math.min(fixture.home.matchesPlayed, fixture.away.matchesPlayed);
  if (minMatches < 30) {
    out.push(`Muestra reducida (${minMatches} partidos del equipo con menos juegos): mayor varianza en las estimaciones.`);
  }
  return out;
}

export function buildAdvancedReport(fixture: Fixture, analysis: AnalysisResult): AdvancedReport {
  const adv = analysis.advancedModels;
  const home = fixture.home;
  const away = fixture.away;
  const ctx = fixture.context;
  const homeMP = Math.max(1, home.matchesPlayed);
  const awayMP = Math.max(1, away.matchesPlayed);

  const homeGF = perGame(home.goalsFor, homeMP);
  const homeGA = perGame(home.goalsAgainst, homeMP);
  const awayGF = perGame(away.goalsFor, awayMP);
  const awayGA = perGame(away.goalsAgainst, awayMP);
  const homeForm = formPoints(home.form);
  const awayForm = formPoints(away.form);

  const probs = analysis.probabilities;
  const sections: ReportSection[] = [];
  const add = (s: ReportSection) => sections.push(s);

  // 1. Factores Contextuales
  add({
    index: 1,
    title: "Factores Contextuales",
    paragraphs: [
      `${home.name} (posicion #${home.tablePosition}, ${home.pointsTotal} pts en ${homeMP} jornadas) recibe a ${away.name} (#${away.tablePosition}, ${away.pointsTotal} pts en ${awayMP}). ` +
        `La localia, el descanso (${home.restDays}d local vs ${away.restDays}d visitante) y la motivacion (${home.motivation}/100 vs ${away.motivation}/100) ajustan las probabilidades base del modelo Poisson.`,
      `${ctx.mustWinHome ? `${home.name} afronta un escenario "must-win" que el motor traduce en un incremento ofensivo. ` : ""}` +
        `${ctx.mustWinAway ? `${away.name} llega con urgencia clasificatoria. ` : ""}` +
        `${ctx.derby || ctx.rivalRivalry ? "Es un encuentro con componente de rivalidad/derbi, lo que eleva la intensidad y el riesgo disciplinario. " : ""}` +
        `${ctx.playoff ? "Partido con implicaciones de playoff. " : ""}`.trim() ||
        "Sin factores contextuales extraordinarios registrados; dominan los fundamentos estadisticos.",
    ],
    table: {
      columns: ["Factor", home.name, away.name],
      rows: [
        ["Posicion", `#${home.tablePosition}`, `#${away.tablePosition}`],
        ["Puntos", `${home.pointsTotal}`, `${away.pointsTotal}`],
        ["Localia", "Local", "Visitante"],
        ["Descanso (dias)", `${home.restDays}`, `${away.restDays}`],
        ["Motivacion", `${home.motivation}/100`, `${away.motivation}/100`],
        ["Must-win", ctx.mustWinHome ? "Si" : "No", ctx.mustWinAway ? "Si" : "No"],
        ["Riesgo descenso", `${ctx.relegationRisk}%`, "-"],
      ],
    },
  });

  // 2. Estado de Plantilla y Dinamica Real
  const homeInj = fixture.squad?.home.injuries ?? [];
  const awayInj = fixture.squad?.away.injuries ?? [];
  add({
    index: 2,
    title: "Estado de Plantilla y Dinamica Real",
    paragraphs: [
      `Rotacion estimada: ${home.name} ${home.squadRotationRisk}% vs ${away.name} ${away.squadRotationRisk}%. ` +
        `Jugador clave local: ${home.keyPlayer} (${home.keyPlayerStatus}); visitante: ${away.keyPlayer} (${away.keyPlayerStatus}).`,
      homeInj.length || awayInj.length
        ? `Bajas reportadas — ${home.name}: ${homeInj.map((i) => `${i.player} (${i.status})`).join(", ") || "ninguna"}; ` +
          `${away.name}: ${awayInj.map((i) => `${i.player} (${i.status})`).join(", ") || "ninguna"}.`
        : "Sin bajas confirmadas en el proveedor. La disponibilidad real puede variar hasta el dia del partido.",
    ],
    table: {
      columns: ["Variable", home.name, away.name],
      rows: [
        ["Goles a favor/partido", num(homeGF), num(awayGF)],
        ["Goles en contra/partido", num(homeGA), num(awayGA)],
        ["Riesgo de rotacion", `${home.squadRotationRisk}%`, `${away.squadRotationRisk}%`],
        ["Jugador clave", `${home.keyPlayerStatus}`, `${away.keyPlayerStatus}`],
        ["Bajas", `${homeInj.length}`, `${awayInj.length}`],
      ],
    },
    caveats: !fixture.coverage.hasInjuries ? ["Datos de lesiones limitados para esta liga."] : undefined,
  });

  // 3. H2H
  const h2h = fixture.h2h ?? [];
  add({
    index: 3,
    title: "Analisis Head-to-Head (H2H)",
    paragraphs: [
      h2h.length
        ? `Se registran ${h2h.length} enfrentamientos directos recientes. El historial alimenta el ajuste bayesiano y la deteccion de regresion a la media tras resultados atipicos.`
        : "No hay historial H2H disponible en el proveedor para este emparejamiento; el modelo se apoya en la fuerza relativa de cada equipo.",
    ],
    table: h2h.length
      ? {
          columns: ["Fecha", "Local", "Marcador", "Visitante"],
          rows: h2h.slice(0, 7).map((r) => [
            r.date ?? "-",
            r.home ?? "-",
            `${r.homeGoals}-${r.awayGoals}`,
            r.away ?? "-",
          ]),
        }
      : undefined,
  });

  // 4. Microestadisticas Avanzadas
  const xgM = adv?.xgModel;
  add({
    index: 4,
    title: "Microestadisticas Avanzadas (xG / xA)",
    paragraphs: [
      `xG del modelo — ${home.name}: ${num(xgM?.homeXg ?? home.xgFor / homeMP)} | ${away.name}: ${num(xgM?.awayXg ?? away.xgFor / awayMP)}. ` +
        `xG total esperado ${num(xgM?.totalXg ?? (home.xgFor / homeMP + away.xgFor / awayMP))}, BTTS desde xG ${pct(xgM?.bttsFromXg)}.`,
    ],
    table: {
      columns: ["Metrica", home.name, away.name],
      rows: [
        ["xG/partido", num(home.xgFor / homeMP), num(away.xgFor / awayMP)],
        ["xG en contra/partido", num(home.xgAgainst / homeMP), num(away.xgAgainst / awayMP)],
        ["Goles/partido", num(homeGF), num(awayGF)],
        ["Clean sheet aprox", "-", "-"],
      ],
    },
    caveats: !fixture.coverage.hasXg ? ["xG estimado por proxy de goles (sin xG medido para esta liga)."] : undefined,
  });

  // 5. Fatiga y Logistica
  add({
    index: 5,
    title: "Analisis de Fatiga y Logistica",
    paragraphs: [
      `Descanso: ${home.name} ${home.restDays} dias, ${away.name} ${away.restDays} dias. ` +
        `Viaje del visitante: ${away.travelKm} km${away.travelKm > 800 ? " (viaje extenso — penalizacion de fatiga aplicada)" : ""}.`,
      adv?.cornersEsp
        ? `El modelo proyecta ${num(adv.cornersEsp.expectedTotalCorners, 1)} corners totales y un perfil fisico coherente con el estilo de ambos equipos.`
        : "",
    ].filter(Boolean),
  });

  // 6. Tacticas
  const xt = adv?.xThreat;
  add({
    index: 6,
    title: "Tacticas y Ajuste en Vivo",
    paragraphs: [
      xt
        ? `Amenaza esperada (xThreat): ${home.name} ${num(xt.homeThreat, 0)} vs ${away.name} ${num(xt.awayThreat, 0)} — dominancia: ${xt.dominance}.`
        : "Perfil tactico derivado de la fuerza ofensiva/defensiva relativa.",
      adv?.kalman
        ? `Tendencia (Kalman): ataque local ${num(adv.kalman.homeAttack, 2)}/${adv.kalman.homeTrend}, ataque visitante ${num(adv.kalman.awayAttack, 2)}/${adv.kalman.awayTrend}.`
        : "",
    ].filter(Boolean),
  });

  // 7. Arbitro
  const ref = fixture.referee;
  add({
    index: 7,
    title: "Arbitro Designado",
    paragraphs: [
      ref?.name
        ? `Arbitro: ${ref.name}. Promedio ${num(ref.avgCards, 1)} tarjetas/partido, ${num(ref.avgPenalties ?? 0, 2)} penales/partido, rigor ${ref.strictness ?? "medio"}.`
        : "Arbitro no asignado al momento del analisis: se incorpora una incertidumbre adicional en los mercados de tarjetas.",
      adv?.cardsRisk
        ? `Riesgo de tarjetas del modelo: ${num(adv.cardsRisk.expectedYellows, 1)} amarillas esperadas${adv.cardsRisk.highCardRisk ? " (riesgo alto)" : ""}.`
        : "",
    ].filter(Boolean),
    caveats: !ref?.name ? ["Sin arbitro confirmado: +incertidumbre en mercados disciplinarios."] : undefined,
  });

  // 8. Simulacion Monte Carlo
  const topScores = analysis.topExactScores ?? [];
  add({
    index: 8,
    title: "Simulacion de Escenarios (Monte Carlo)",
    paragraphs: [
      `La matriz Poisson ajustada por Dixon-Coles (rho ${num(adv?.dixonColes?.rho ?? 0, 3)}) genera la distribucion de marcadores. ` +
        `1X2: ${pct(probs.homeWin)} / ${pct(probs.draw)} / ${pct(probs.awayWin)}. Over 2.5: ${pct(probs.over25)} · BTTS: ${pct(probs.btts)}.`,
    ],
    figure: topScores.length
      ? {
          kind: "bars",
          title: "Marcadores mas probables (%)",
          bars: topScores.slice(0, 8).map((s) => ({ label: s.score, value: s.probability })),
          unit: "%",
        }
      : undefined,
    table: topScores.length
      ? { columns: ["Marcador", "Probabilidad"], rows: topScores.slice(0, 8).map((s) => [s.score, pct(s.probability)]) }
      : undefined,
  });

  // 9. Explicacion de Lineas de Apuesta (value)
  add({
    index: 9,
    title: "Explicacion de Lineas de Apuesta",
    paragraphs: [
      `Comparativa entre la probabilidad del modelo y la implicita del mercado (descontado el margen del bookmaker). ` +
        `El edge (EV%) positivo identifica valor potencial.`,
    ],
    figure: {
      kind: "groupedBars",
      title: "Modelo vs Mercado (1X2)",
      groups: [
        { label: "Local", model: probs.homeWin, market: impliedFromOdds(fixture.market.homeWinOdds) },
        { label: "Empate", model: probs.draw, market: impliedFromOdds(fixture.market.drawOdds) },
        { label: "Visita", model: probs.awayWin, market: impliedFromOdds(fixture.market.awayWinOdds) },
      ],
    },
    table: {
      columns: ["Mercado", "Modelo", "Mercado", "Edge", "Veredicto"],
      rows: analysis.valueTable.map((r) => [
        r.market,
        pct(r.modelProbability),
        pct(r.marketProbability),
        `${r.edge > 0 ? "+" : ""}${num(r.edge, 1)}%`,
        r.verdict,
      ]),
    },
  });

  // 10. Motivacion y Posicion
  add({
    index: 10,
    title: "Motivacion y Posicion en Tabla",
    paragraphs: [
      `Presion psicologica ${ctx.psychologicalPressure}%, paralisis de favorito ${ctx.favoriteParalysis}%, libertad de underdog ${ctx.underdogFreedom}%. ` +
        (adv?.causalSurvival ? `Lift causal estimado ${num(adv.causalSurvival.causalLift, 3)}.` : ""),
    ],
  });

  // 11. Insights Accionables
  add({
    index: 11,
    title: "Insights Accionables",
    paragraphs: [
      `Recomendacion principal: ${analysis.recommendation.market} (cuota justa ${num(analysis.recommendation.fairOdds, 2)}, stake ${analysis.recommendation.stakeUnits}u). ` +
        `${analysis.recommendation.rationale}`,
    ],
    table: analysis.kelly?.bets.length
      ? {
          columns: ["Mercado", "Stake", "Edge", "Riesgo"],
          rows: analysis.kelly.bets.map((b) => [b.market, `${b.stakeUnits}u`, `+${num(b.edge, 1)}%`, b.riskLevel]),
        }
      : undefined,
  });

  // 12. Preguntas de Validacion Contextual
  add({
    index: 12,
    title: "Preguntas de Validacion Contextual",
    paragraphs: ["Matriz de validacion: cada chequeo ajusta la confianza del modelo de forma explicita."],
    table: {
      columns: ["Validacion", "Estado", "Impacto"],
      rows: [
        ["Cobertura de division", fixture.coverage.tier === "low" || ctx.lowDivision ? "Baja" : "OK", fixture.coverage.tier === "low" || ctx.lowDivision ? "-confianza" : "neutro"],
        ["Alineaciones", fixture.coverage.hasLineups ? "Confirmadas" : "Pendientes", fixture.coverage.hasLineups ? "neutro" : "tope confianza"],
        ["xG disponible", fixture.coverage.hasXg ? "Si" : "Proxy", fixture.coverage.hasXg ? "neutro" : "estimacion"],
        ["Muestra >=30", Math.min(homeMP, awayMP) >= 30 ? "Si" : "No", Math.min(homeMP, awayMP) >= 30 ? "neutro" : "+varianza"],
        ["Cuotas de mercado", fixture.coverage.hasOdds ? "Si" : "No", fixture.coverage.hasOdds ? "neutro" : "EV orientativo"],
      ],
    },
    caveats: analysis.riskFlags.slice(0, 6).map((f) => f.label),
  });

  // 13. Framework Tecnologico (honest)
  add({
    index: 13,
    title: "Framework Tecnologico: Datos y Pipeline",
    paragraphs: [
      "Los datos provienen del proveedor configurado (API-Football) con cache y limitacion de tasa. " +
        "El pipeline de entrenamiento construye features point-in-time (sin fuga de datos), incorporando xG real cuando la liga lo cubre.",
    ],
  });

  // 14. Machine Learning y AutoML
  add({
    index: 14,
    title: "Machine Learning y AutoML",
    paragraphs: [
      adv?.autoMl
        ? `Stack: ${adv.autoMl.engines.join(", ")} (campeon: ${adv.autoMl.championModel}). ` +
          `El modelo hibrido Dixon-Coles -> XGBoost se entrena sobre resultados reales y solo influye en las probabilidades si supera al baseline en backtest (quality gate).`
        : "Ensemble de gradient boosting sobre features reales, con quality gate.",
      adv?.hybridPipeline
        ? `Pipeline hibrido ${adv.hybridPipeline.active ? "ACTIVO (supero el gate)" : "en modo display (no supero el gate; manda el Poisson)"}; lambda local ${num(adv.hybridPipeline.lambdaLocal)}, mu visitante ${num(adv.hybridPipeline.muVisitante)}.`
        : "",
    ].filter(Boolean),
  });

  // 15. Computacion Cuantica (honest / experimental)
  add({
    index: 15,
    title: "Optimizacion (Modulo Cuantico Experimental)",
    paragraphs: [
      adv?.quantumOptimizer
        ? `Optimizador de exposicion: metodo ${adv.quantumOptimizer.method}, mercado top ${adv.quantumOptimizer.topMarket ?? "n/d"}, exposicion ${num(adv.quantumOptimizer.optimalExposure, 1)}.`
        : "Modulo de optimizacion de cartera de apuestas.",
    ],
    caveats: [
      "Modulo EXPERIMENTAL. La optimizacion 'cuantica' es ilustrativa y NO altera las probabilidades del partido; estas provienen del motor Poisson/Dixon-Coles (y del hibrido solo si pasa el quality gate).",
    ],
  });

  // 16. Series Temporales
  const ts = adv?.timeSeries;
  add({
    index: 16,
    title: "Series Temporales y Forecasting",
    paragraphs: [
      ts
        ? `Forecast de forma — tendencia Prophet ${num(ts.prophetTrend, 3)}; ensamble 1X2 ${pct(ts.ensembleHomeWin)} / ${pct(ts.ensembleDraw)} / ${pct(ts.ensembleAwayWin)}.`
        : "Modelos de forma/momentum sobre las ultimas jornadas.",
    ],
    caveats: ["Las series temporales se construyen sobre la forma reciente (W/D/L) y goles; con pocas jornadas su senal es limitada."],
  });

  // 17. Modelos Matematicos Especializados
  add({
    index: 17,
    title: "Modelos Matematicos Especializados",
    paragraphs: [
      adv
        ? `Poisson jerarquico (lambda ${num(adv.hierarchical?.lambdaHome)}/${num(adv.hierarchical?.lambdaAway)}), ` +
          `Bivariate Poisson (kappa ${num(adv.bivariatePoisson?.kappa, 3)}), Skellam (dif. esperada ${num(adv.skellam?.expectedDiff, 2)}), ` +
          `Zero-Inflated (P(0-0) ${pct(adv.zip?.prob00)}) y supervivencia (P(sin gol min 60) ${pct(adv.causalSurvival?.survivalProbNoGoal60)}).`
        : "Familia de modelos de goles (Poisson jerarquico, Skellam, bivariate, ZIP, supervivencia).",
    ],
  });

  // 18. Infraestructura de computo (reframed honest)
  add({
    index: 18,
    title: "Infraestructura de Computo",
    paragraphs: [
      "La inferencia corre en un microservicio Python (FastAPI) junto al motor TypeScript. El entrenamiento del modelo hibrido es por lotes (offline) y se promociona solo si pasa el backtest.",
    ],
  });

  // 19. Modelos Bio-Inspirados (honest caveat)
  add({
    index: 19,
    title: "Factores Psicologicos (Neurociencia Aplicada)",
    paragraphs: [
      `Presion modelada como respuesta no lineal (saturacion/'choking'): presion ${ctx.psychologicalPressure}%, paralisis ${ctx.favoriteParalysis}%. ` +
        "Estos factores ajustan los lambda del modelo de goles dentro de limites acotados.",
    ],
    caveats: ["La calibracion fina de estos coeficientes psicologicos es heuristica, no entrenada end-to-end."],
  });

  // 20. Analisis Fisico/Biomecanico (honest: no tracking)
  add({
    index: 20,
    title: "Analisis Fisico y Biomecanico",
    paragraphs: [
      "La fatiga se estima por descanso, densidad de calendario y viaje. No se dispone de datos de tracking/biomecanica por jugador en este proveedor, por lo que esta seccion es aproximada.",
    ],
    caveats: ["Sin datos de tracking GPS/biomecanica: estimacion indirecta de carga fisica."],
  });

  // 21. Gobernanza, Calidad y MLOps
  const ops = adv?.mlOps;
  add({
    index: 21,
    title: "Gobernanza, Calidad y MLOps",
    paragraphs: [
      ops
        ? `Validacion de esquema: ${ops.schemaValid ? "OK" : "fallida"}. Drift: ${ops.driftStatus} (${num(ops.driftScore, 1)}). ` +
          `Completitud de features ${num(ops.featureCompleteness, 0)}%. Quality gate del modelo: ${ops.qualityGatePassed ? "PASADO" : "NO pasado (manda el baseline)"}.`
        : "Monitoreo de drift, completitud de datos y quality gate del modelo.",
    ],
  });

  // 22. Variables Contextuales Adicionales
  add({
    index: 22,
    title: "Variables Contextuales Adicionales",
    paragraphs: [
      `Clima/logistica: ${ctx.weatherRisk}. Premio economico estimado: $${ctx.prizeMoney}K. ` +
        `Sentimiento social — local ${num(fixture.socialSentiment?.homePositive ?? 0, 0)}%, visita ${num(fixture.socialSentiment?.awayPositive ?? 0, 0)}%.`,
    ],
  });

  // 23. Implementacion Tecnica y Visualizaciones (radar)
  add({
    index: 23,
    title: "Visualizaciones: Radar Comparativo",
    paragraphs: ["Perfil multivariable de ambos equipos en los ejes clave del rendimiento."],
    figure: {
      kind: "radar",
      title: "Radar comparativo",
      axes: [
        { axis: "Forma", home: homeForm, away: awayForm },
        { axis: "Ataque", home: clamp(homeGF * 35), away: clamp(awayGF * 35) },
        { axis: "Defensa", home: clamp(100 - homeGA * 30), away: clamp(100 - awayGA * 30) },
        { axis: "Motivacion", home: home.motivation, away: away.motivation },
        { axis: "Descanso", home: clamp(home.restDays * 12), away: clamp(away.restDays * 12) },
      ],
    },
  });

  // 24. Deep Learning
  add({
    index: 24,
    title: "Deep Learning y Redes Neuronales",
    paragraphs: [
      ts
        ? `Componentes neuronales de series (TFT ${pct(ts.tftHomeWin)}, N-BEATS ${pct(ts.nbeatsHomeWin)}) aportan senal de forma; su peso final esta sujeto al quality gate.`
        : "Componentes neuronales de forma; su peso esta sujeto al quality gate.",
      adv?.explainability ? `Explicabilidad (${adv.explainability.method}): resultado dominante ${adv.explainability.dominantOutcome}.` : "",
    ].filter(Boolean),
  });

  // 25. ML Clasico y Ensemble
  add({
    index: 25,
    title: "Machine Learning Clasico y Ensemble",
    paragraphs: [
      analysis.ensemble
        ? `Ensemble: acuerdo entre modelos ${num(analysis.ensemble.modelAgreement, 0)}%, dominante ${analysis.ensemble.dominantModel}. ` +
          `1X2 ensamble ${pct(analysis.ensemble.homeWin)} / ${pct(analysis.ensemble.draw)} / ${pct(analysis.ensemble.awayWin)}.`
        : "Ensemble de modelos de arbol + Poisson.",
    ],
  });

  // 26. Big Data / Tiempo Real
  add({
    index: 26,
    title: "Big Data y Procesamiento en Tiempo Real",
    paragraphs: [
      "Durante partidos en vivo, el motor reajusta probabilidades con actualizacion bayesiana segun eventos (goles, tarjetas). La latencia depende del proveedor de datos en vivo.",
    ],
  });

  // 27. Recomendacion de Mercado Segura
  add({
    index: 27,
    title: "Recomendacion de Mercado Segura",
    paragraphs: [
      `Tras integrar todos los ejes, el mercado recomendado es ${analysis.recommendation.market} ` +
        `(cuota justa ${num(analysis.recommendation.fairOdds, 2)}, minima ${num(analysis.recommendation.minimumOdds, 2)}, stake ${analysis.recommendation.stakeUnits}u, confianza ${num(analysis.confidence.score, 0)}/100).`,
      "Ninguna apuesta es segura: las cifras incorporan reducciones por cobertura y un piso de probabilidad para eventos atipicos. Apuesta responsable.",
    ],
  });

  return {
    title: "Analisis Predictivo Avanzado",
    subtitle: `${home.name} vs ${away.name} — ${fixture.leagueName}`,
    generatedAt: new Date().toISOString(),
    coverageCaveats: coverageCaveats(fixture),
    sections,
  };
}

function impliedFromOdds(odds: number | undefined | null): number {
  if (!odds || odds <= 1) return 0;
  return Math.round((100 / odds) * 10) / 10;
}

function clamp(n: number, min = 5, max = 100): number {
  return Math.round(Math.max(min, Math.min(max, n)) * 10) / 10;
}
