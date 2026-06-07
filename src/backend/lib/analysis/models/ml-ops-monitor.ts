/**
 * ML Ops monitor — validación estilo Great Expectations / drift Evidently / metadata MLflow.
 */

import type { AnalysisResult, Fixture } from "@/shared/domain";
import { formScore } from "../shared-math";

export type MlOpsMonitorResult = {
  runId: string;
  schemaValid: boolean;
  schemaIssues: string[];
  driftScore: number;
  driftStatus: "stable" | "warning" | "critical";
  featureCompleteness: number;
  experimentTag: string;
  modelsLogged: string[];
  qualityGatePassed: boolean;
};

export function mlOpsMonitor(fixture: Fixture, analysis: AnalysisResult): MlOpsMonitorResult {
  const schemaIssues: string[] = [];
  if (!fixture.home.matchesPlayed) schemaIssues.push("home.matchesPlayed missing");
  if (!fixture.away.matchesPlayed) schemaIssues.push("away.matchesPlayed missing");
  if (fixture.home.form.length < 3) schemaIssues.push("home.form too short");
  if (fixture.away.form.length < 3) schemaIssues.push("away.form too short");
  if (!fixture.coverage.hasOdds && fixture.coverage.tier !== "low") {
    schemaIssues.push("odds expected but missing");
  }

  const seasonHomePpg = fixture.home.pointsTotal / Math.max(1, fixture.home.matchesPlayed || 18);
  const seasonAwayPpg = fixture.away.pointsTotal / Math.max(1, fixture.away.matchesPlayed || 18);
  const recentHomePpg = formScore(fixture.home.form) / 100 * 3;
  const recentAwayPpg = formScore(fixture.away.form) / 100 * 3;
  const driftHome = Math.abs(recentHomePpg - seasonHomePpg) / Math.max(0.5, seasonHomePpg);
  const driftAway = Math.abs(recentAwayPpg - seasonAwayPpg) / Math.max(0.5, seasonAwayPpg);
  const driftScore = Math.round(((driftHome + driftAway) / 2) * 100);

  const driftStatus: MlOpsMonitorResult["driftStatus"] =
    driftScore >= 45 ? "critical" : driftScore >= 25 ? "warning" : "stable";

  const coverageFlags = [
    fixture.coverage.hasOdds,
    fixture.coverage.hasXg,
    fixture.coverage.hasLineups,
    fixture.coverage.hasH2H,
    fixture.coverage.hasInjuries,
    fixture.coverage.hasReferee,
  ];
  const featureCompleteness = Math.round((coverageFlags.filter(Boolean).length / coverageFlags.length) * 100);

  const modelsLogged = [
    "poisson",
    "ensemble",
    "dixon-coles",
    "bivariate-poisson",
    "temporal-blend",
    "time-series",
    "causal-survival",
    "quantum-optimizer",
    analysis.ensemble ? "ensemble-v2" : "",
  ].filter(Boolean);

  const qualityGatePassed = schemaIssues.length === 0 && driftStatus !== "critical" && featureCompleteness >= 40;

  return {
    runId: `run_${fixture.id}_${Date.now().toString(36)}`,
    schemaValid: schemaIssues.length === 0,
    schemaIssues,
    driftScore,
    driftStatus,
    featureCompleteness,
    experimentTag: `football-ai-v2.4.1-${fixture.coverage.tier}`,
    modelsLogged,
    qualityGatePassed,
  };
}
