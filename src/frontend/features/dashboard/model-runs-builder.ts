import type { Fixture, AnalysisResult } from "@/shared/domain";
import { formPoints, clampToPercent } from "./dashboard-utils";
import type { ModelMode } from "./dashboard-config";

export type ModelRun = {
  id: string;
  name: string;
  status: "pending" | "running" | "complete";
  output: string;
  score: number;
};

function actionableInsight(fixture: Fixture, analysis: AnalysisResult, market: string) {
  if (!fixture.coverage.hasLineups) return `no subir stake en ${market} hasta verificar titulares`;
  if (fixture.context.lowDivision) return `reducir stake: división baja y outliers altos`;
  if (analysis.riskFlags.some((flag) => flag.severity === "high")) return `esperar confirmación manual antes de ${market}`;
  return `${market} es el mercado de menor varianza relativa, no una apuesta segura`;
}

export function buildModelRuns(
  fixture: Fixture,
  analysis: AnalysisResult,
  confidence: number,
  riskLevel: string,
  modelMode: ModelMode
): ModelRun[] {
  const bestEdge = analysis.valueTable.slice().sort((a, b) => b.edge - a.edge)[0];
  const goalBias =
    analysis.probabilities.over25 >= 58
      ? "tendencia over"
      : analysis.probabilities.under35 >= 62
        ? "tendencia under"
        : "goles balanceados";
  const formGap = formPoints(fixture.home.form) - formPoints(fixture.away.form);
  const restGap = fixture.home.restDays - fixture.away.restDays;
  const travelRisk = Math.min(100, Math.round(fixture.away.travelKm / 8));
  const motivationGap = fixture.home.motivation - fixture.away.motivation;
  const favoriteRotationRisk = fixture.context.mustWinHome || fixture.context.mustWinAway ? 24 : 58;
  const blackSwanRisk =
    fixture.coverage.tier === "low" || fixture.context.lowDivision
      ? 12
      : fixture.context.weatherRisk === "high"
        ? 10
        : 8;
  const manualScore =
    [fixture.coverage.hasLineups, fixture.coverage.hasInjuries, fixture.coverage.hasReferee, fixture.coverage.hasOdds].filter(Boolean).length * 25;

  return [
    {
      id: "poisson",
      name: "Poisson Goals",
      status: "pending" as const,
      output: `${goalBias}: O2.5 ${analysis.probabilities.over25}% / U3.5 ${analysis.probabilities.under35}%`,
      score: Math.round((analysis.probabilities.over25 + analysis.probabilities.under35) / 2),
    },
    {
      id: "monte-carlo",
      name: "Monte Carlo 1X2",
      status: "pending" as const,
      output: `1 ${analysis.probabilities.homeWin}% · X ${analysis.probabilities.draw}% · 2 ${analysis.probabilities.awayWin}%`,
      score: Math.max(analysis.probabilities.homeWin, analysis.probabilities.draw, analysis.probabilities.awayWin),
    },
    {
      id: "market-edge",
      name: "Market Edge",
      status: "pending" as const,
      output: `${bestEdge?.market ?? "Sin mercado"} ${bestEdge && bestEdge.edge > 0 ? "+" : ""}${bestEdge?.edge ?? 0}% edge`,
      score: Math.max(0, Math.min(100, Math.round(50 + (bestEdge?.edge ?? 0) * 3))),
    },
    {
      id: "risk-gate",
      name: "Risk Gate",
      status: "pending" as const,
      output: `${riskLevel} · ${analysis.riskFlags.length} flags · cobertura ${fixture.coverage.tier}`,
      score: confidence,
    },
    {
      id: "stake-engine",
      name: "Stake Engine",
      status: "pending" as const,
      output: `${modelMode}: ${analysis.recommendation.stakeUnits}u en ${analysis.recommendation.market}`,
      score: Math.round(analysis.recommendation.stakeUnits * 100),
    },
    {
      id: "contextual",
      name: "Contexto partido",
      status: "pending" as const,
      output: `descanso ${fixture.home.restDays}d/${fixture.away.restDays}d · viaje ${fixture.away.travelKm}km · must-win ${fixture.context.mustWinHome || fixture.context.mustWinAway ? "sí" : "no"}`,
      score: clampToPercent(70 + restGap * 4 - travelRisk / 3 + (fixture.context.mustWinHome || fixture.context.mustWinAway ? 8 : 0)),
    },
    {
      id: "squad-dynamics",
      name: "Plantilla real",
      status: "pending" as const,
      output: `${fixture.coverage.hasLineups ? "lineups OK" : "lineups sin confirmar"} · lesiones ${fixture.coverage.hasInjuries ? "disponibles" : "no confirmadas"}`,
      score: fixture.coverage.hasLineups ? 86 : 54,
    },
    {
      id: "h2h-style",
      name: "H2H + estilos",
      status: "pending" as const,
      output: `forma gap ${formGap > 0 ? "+" : ""}${formGap}pts · GF/GA proxy ${fixture.home.goalsFor}-${fixture.home.goalsAgainst} vs ${fixture.away.goalsFor}-${fixture.away.goalsAgainst} · compatibilidad estilos por tabla`,
      score: clampToPercent(52 + Math.abs(formGap) * 2),
    },
    {
      id: "microstats",
      name: "Microestadísticas",
      status: "pending" as const,
      output: `${fixture.coverage.hasXg ? "xG real" : "xG proxy"} · GF/GA ${fixture.home.goalsFor}-${fixture.home.goalsAgainst} vs ${fixture.away.goalsFor}-${fixture.away.goalsAgainst}`,
      score: fixture.coverage.hasXg ? 82 : 56,
    },
    {
      id: "fatigue-logistics",
      name: "Fatiga logística",
      status: "pending" as const,
      output: `descanso gap ${restGap}d · viaje visitante ${fixture.away.travelKm}km`,
      score: clampToPercent(76 + restGap * 5 - travelRisk),
    },
    {
      id: "tactical-live",
      name: "Táctica en vivo",
      status: "pending" as const,
      output: fixture.status === "live"
        ? `en vivo ${fixture.elapsed ?? 0}' — ajustes tácticos requieren feed minuto a minuto`
        : `pre-partido: sin feed en vivo — ajustes tácticos solo post-análisis estático`,
      score: fixture.status === "live" ? 62 : 38,
    },
    {
      id: "referee-profile",
      name: "Perfil árbitro",
      status: "pending" as const,
      output: `${fixture.coverage.hasReferee ? "árbitro disponible" : "sin árbitro designado"} · impacto tarjetas/penales requiere histórico`,
      score: fixture.coverage.hasReferee ? 70 : 35,
    },
    {
      id: "heavy-tail",
      name: "Cola gruesa",
      status: "pending" as const,
      output: `black swan ${blackSwanRisk}% · baja división multiplica outliers 2-3x`,
      score: clampToPercent(100 - blackSwanRisk * 5),
    },
    {
      id: "betting-lines",
      name: "Líneas de apuesta",
      status: "pending" as const,
      output: `${bestEdge?.market ?? "sin mercado"} es menor varianza relativa; no se marca como apuesta segura`,
      score: Math.max(0, Math.min(100, Math.round(55 + (bestEdge?.edge ?? 0) * 2))),
    },
    {
      id: "motivation-position",
      name: "Motivación-posición",
      status: "pending" as const,
      output: `tabla ${fixture.home.tablePosition}° vs ${fixture.away.tablePosition}° · motivación gap ${motivationGap}`,
      score: clampToPercent(60 + Math.abs(motivationGap) / 2 + (fixture.context.mustWinHome || fixture.context.mustWinAway ? 12 : 0)),
    },
    {
      id: "favorite-relaxation",
      name: "Rotación favorito",
      status: "pending" as const,
      output: `rotacion_relajacion_favorito ${favoriteRotationRisk > 50 ? "posible" : "baja"} · no asumir sin lineups oficiales`,
      score: clampToPercent(100 - favoriteRotationRisk),
    },
    {
      id: "manual-verification",
      name: "Verificación manual",
      status: "pending" as const,
      output: `alineaciones/lesiones/árbitro/odds verificados ${manualScore}%`,
      score: manualScore,
    },
    {
      id: "low-division",
      name: "Contexto división baja",
      status: "pending" as const,
      output: `${fixture.context.lowDivision ? "ajuste -30% confianza" : "sin ajuste automático"} · cobertura ${fixture.coverage.tier}`,
      score: fixture.context.lowDivision ? 42 : 84,
    },
    {
      id: "actionable-insight",
      name: "Insight accionable",
      status: "pending" as const,
      output: actionableInsight(fixture, analysis, bestEdge?.market ?? analysis.recommendation.market),
      score: confidence,
    },
  ];
}
