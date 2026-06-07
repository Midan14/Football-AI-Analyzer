import type { Fixture } from "@/shared/domain";
import { analyzeMatch } from "@/backend/server/football/football-service";
import { cache, cacheKeys } from "@/lib/cache";

export type FixtureInsight = {
  fixtureId: string;
  confidence: number;
  topEdge: number;
  market: string;
  riskLevel: "BAJO" | "MODERADO" | "ALTO";
};

function riskFromConfidence(score: number): FixtureInsight["riskLevel"] {
  if (score >= 72) return "BAJO";
  if (score >= 58) return "MODERADO";
  return "ALTO";
}

export async function scanFixtureInsights(candidates: Fixture[]): Promise<FixtureInsight[]> {
  const insights: FixtureInsight[] = [];

  for (const candidate of candidates) {
    try {
      const cacheAnalysisKey = cacheKeys.analysis(candidate.id);
      let analysisData = await cache.get<Awaited<ReturnType<typeof analyzeMatch>>>(cacheAnalysisKey);
      if (!analysisData) {
        analysisData = await analyzeMatch(candidate.id);
        await cache.set(cacheAnalysisKey, analysisData, candidate.status === "live" ? 15 : 60);
      }

      const analysis = analysisData.analysis;
      if (!analysis) continue;

      const confidence = analysis.confidence?.score ?? 0;
      const topValue = analysis.valueTable?.reduce(
        (best, row) => (row.edge > best.edge ? row : best),
        { edge: 0, market: analysis.recommendation?.market ?? "—" }
      );

      insights.push({
        fixtureId: candidate.id,
        confidence,
        topEdge: topValue?.edge ?? 0,
        market: analysis.recommendation?.market ?? topValue?.market ?? "—",
        riskLevel: riskFromConfidence(confidence),
      });
    } catch {
      // Skip fixtures that fail analysis
    }
  }

  return insights;
}

export function topFixtureInsights(insights: FixtureInsight[], limit = 5): FixtureInsight[] {
  return [...insights]
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.topEdge - a.topEdge;
    })
    .slice(0, limit);
}
