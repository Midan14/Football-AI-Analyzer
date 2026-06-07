import type { AnalysisResult } from "@/shared/domain";

export type PredictionRecord = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  kickoff: string;
  predictedMarket: string;
  predictedProbability: number;
  fairOdds: number;
  takenOdds?: number;
  closingOdds?: number;
  clvPercent?: number;
  bookmaker?: string;
  confidence: number;
  riskLevel: string;
  stakeUnits: number;
  createdAt: string;
  result?: {
    actualResult: string;
    actualGoalsHome: number;
    actualGoalsAway: number;
    predictionWon: boolean;
    profit: number;
  };
};

const STORAGE_KEY = "football-ai-prediction-history";

export function savePrediction(
  fixtureId: string,
  homeTeam: string,
  awayTeam: string,
  leagueName: string,
  kickoff: string,
  analysis: AnalysisResult,
  riskLevel: string
): void {
  try {
    const existing = getPredictionHistory();
    const record: PredictionRecord = {
      fixtureId,
      homeTeam,
      awayTeam,
      leagueName,
      kickoff,
      predictedMarket: analysis.recommendation.market,
      predictedProbability: analysis.valueTable.find(
        (row) => row.market === analysis.recommendation.market
      )?.modelProbability ?? 0,
      fairOdds: analysis.recommendation.fairOdds,
      confidence: analysis.confidence.score,
      riskLevel,
      stakeUnits: analysis.recommendation.stakeUnits,
      createdAt: new Date().toISOString(),
    };

    // Evitar duplicados por fixtureId
    const filtered = existing.filter((item) => item.fixtureId !== fixtureId);
    const updated = [record, ...filtered].slice(0, 100); // Máximo 100 registros

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn("Error saving prediction:", error);
  }
}

export function getPredictionHistory(): PredictionRecord[] {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    return item ? JSON.parse(item) : [];
  } catch {
    return [];
  }
}

export function updatePredictionResult(
  fixtureId: string,
  result: PredictionRecord["result"]
): void {
  try {
    const existing = getPredictionHistory();
    const updated = existing.map((item) =>
      item.fixtureId === fixtureId ? { ...item, result } : item
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn("Error updating prediction result:", error);
  }
}

export function getPredictionStats(): {
  total: number;
  withResult: number;
  won: number;
  lost: number;
  winRate: number;
  avgProfit: number;
  totalProfit: number;
} {
  const history = getPredictionHistory();
  const withResult = history.filter((item) => item.result);
  const won = withResult.filter((item) => item.result?.predictionWon);
  const lost = withResult.filter((item) => !item.result?.predictionWon);
  const totalProfit = withResult.reduce(
    (sum, item) => sum + (item.result?.profit ?? 0),
    0
  );

  return {
    total: history.length,
    withResult: withResult.length,
    won: won.length,
    lost: lost.length,
    winRate: withResult.length > 0 ? (won.length / withResult.length) * 100 : 0,
    avgProfit: withResult.length > 0 ? totalProfit / withResult.length : 0,
    totalProfit,
  };
}
