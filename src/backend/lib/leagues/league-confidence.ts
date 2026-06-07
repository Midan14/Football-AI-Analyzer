import type { CoverageTier, LeagueCoverageCapabilities, LeagueCoverageReport } from "@/shared/domain";

function capabilityScore(capabilities: LeagueCoverageCapabilities): number {
  const weights: Array<[keyof LeagueCoverageCapabilities, number]> = [
    ["fixtures", 8],
    ["standings", 6],
    ["odds", 14],
    ["lineups", 10],
    ["xg", 8],
    ["injuries", 6],
    ["referee", 4],
    ["h2h", 6],
    ["momentum", 4],
  ];

  return weights.reduce((sum, [key, weight]) => sum + (capabilities[key] ? weight : 0), 0);
}

function tierBaseScore(tier: CoverageTier): number {
  if (tier === "elite") return 72;
  if (tier === "standard") return 58;
  return 42;
}

export function computeCoverageScore(
  tier: CoverageTier,
  capabilities: LeagueCoverageCapabilities
): number {
  const raw = tierBaseScore(tier) + capabilityScore(capabilities) * 0.35;
  return Math.min(100, Math.max(20, Math.round(raw)));
}

export function buildConfidenceImpact(
  tier: CoverageTier,
  capabilities: LeagueCoverageCapabilities,
  coverageScore: number
): string {
  const gaps: string[] = [];
  if (!capabilities.odds) gaps.push("sin cuotas");
  if (!capabilities.lineups) gaps.push("sin alineaciones");
  if (!capabilities.xg) gaps.push("sin xG");
  if (!capabilities.injuries) gaps.push("sin lesiones");
  if (tier === "low") gaps.push("liga de baja cobertura");

  if (coverageScore >= 85) {
    return "Alta confianza del modelo: datos completos para mercados 1X2, goles y BTTS.";
  }
  if (coverageScore >= 70) {
    return gaps.length
      ? `Confianza media-alta. Penalizaciones posibles: ${gaps.join(", ")}.`
      : "Confianza media-alta: la mayoría de fuentes están disponibles.";
  }
  if (coverageScore >= 55) {
    return `Confianza moderada. El AI reduce stake cuando falta: ${gaps.join(", ") || "contexto parcial"}.`;
  }
  return `Confianza baja (${coverageScore}/100). Usa el análisis como orientación, no como señal fuerte.`;
}

export function buildInferredCoverageReport(params: {
  leagueId: string;
  leagueName: string;
  tier: CoverageTier;
  provider: string;
  season: string;
  capabilities?: Partial<LeagueCoverageCapabilities>;
}): LeagueCoverageReport {
  const capabilities: LeagueCoverageCapabilities = {
    fixtures: true,
    standings: params.capabilities?.standings ?? params.tier !== "low",
    odds: params.capabilities?.odds ?? params.tier !== "low",
    lineups: params.capabilities?.lineups ?? params.tier === "elite",
    xg: params.capabilities?.xg ?? params.tier === "elite",
    injuries: params.capabilities?.injuries ?? params.tier !== "low",
    referee: params.capabilities?.referee ?? true,
    h2h: params.capabilities?.h2h ?? params.tier !== "low",
    momentum: params.capabilities?.momentum ?? params.tier === "elite",
  };

  const coverageScore = computeCoverageScore(params.tier, capabilities);

  return {
    leagueId: params.leagueId,
    leagueName: params.leagueName,
    tier: params.tier,
    coverageScore,
    provider: params.provider,
    season: params.season,
    capabilities,
    confidenceImpact: buildConfidenceImpact(params.tier, capabilities, coverageScore),
    source: "inferred",
  };
}
