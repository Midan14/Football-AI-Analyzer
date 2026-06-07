import type { Fixture } from "@/shared/domain";
import { impliedProbability, poisson, round1 } from "./shared-math";

export type Hybrid1X2Probabilities = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type HybridConsistencyFlag =
  | "hybrid_away_market_contradiction"
  | "hybrid_home_market_contradiction"
  | "hybrid_goal_model_contradiction";

export type ReconcileHybridProbabilitiesInput = {
  fixture: Fixture;
  hybridProbabilities: Hybrid1X2Probabilities;
  dixonColes: {
    lambdaHome: number;
    lambdaAway: number;
    rho?: number;
  };
  modelAgreement: number;
};

export type ReconcileHybridProbabilitiesResult = {
  probabilities: Hybrid1X2Probabilities;
  dixonColesProbabilities: Hybrid1X2Probabilities;
  marketPrior: Hybrid1X2Probabilities | null;
  flags: HybridConsistencyFlag[];
};

const MAX_GOALS = 8;

function normalizeTriplet(probabilities: Hybrid1X2Probabilities): Hybrid1X2Probabilities {
  const total = probabilities.homeWin + probabilities.draw + probabilities.awayWin;
  if (!Number.isFinite(total) || total <= 0) {
    return { homeWin: 33.3, draw: 33.3, awayWin: 33.4 };
  }

  return {
    homeWin: round1((probabilities.homeWin / total) * 100),
    draw: round1((probabilities.draw / total) * 100),
    awayWin: round1((probabilities.awayWin / total) * 100),
  };
}

function dixonColesTau(homeGoals: number, awayGoals: number, lambdaHome: number, lambdaAway: number, rho: number) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function dixonColes1X2(lambdaHome: number, lambdaAway: number, rho = 0): Hybrid1X2Probabilities {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let total = 0;

  for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals += 1) {
      const probability =
        poisson(lambdaHome, homeGoals) *
        poisson(lambdaAway, awayGoals) *
        Math.max(0.05, dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho));

      total += probability;
      if (homeGoals > awayGoals) homeWin += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else awayWin += probability;
    }
  }

  return normalizeTriplet({
    homeWin: (homeWin / total) * 100,
    draw: (draw / total) * 100,
    awayWin: (awayWin / total) * 100,
  });
}

function marketPrior(fixture: Fixture): Hybrid1X2Probabilities | null {
  const homeWin = impliedProbability(fixture.market.homeWinOdds);
  const draw = impliedProbability(fixture.market.drawOdds);
  const awayWin = impliedProbability(fixture.market.awayWinOdds);

  if (fixture.market.homeWinOdds <= 1.01 || fixture.market.drawOdds <= 1.01 || fixture.market.awayWinOdds <= 1.01) {
    return null;
  }

  return normalizeTriplet({ homeWin, draw, awayWin });
}

function blend(
  hybrid: Hybrid1X2Probabilities,
  dixonColes: Hybrid1X2Probabilities,
  market: Hybrid1X2Probabilities | null
): Hybrid1X2Probabilities {
  const hybridWeight = 0.25;
  const dixonWeight = market ? 0.55 : 0.75;
  const marketWeight = market ? 0.2 : 0;

  return normalizeTriplet({
    homeWin: hybrid.homeWin * hybridWeight + dixonColes.homeWin * dixonWeight + (market?.homeWin ?? 0) * marketWeight,
    draw: hybrid.draw * hybridWeight + dixonColes.draw * dixonWeight + (market?.draw ?? 0) * marketWeight,
    awayWin: hybrid.awayWin * hybridWeight + dixonColes.awayWin * dixonWeight + (market?.awayWin ?? 0) * marketWeight,
  });
}

export function reconcileHybridProbabilities(
  input: ReconcileHybridProbabilitiesInput
): ReconcileHybridProbabilitiesResult {
  const hybridProbabilities = normalizeTriplet(input.hybridProbabilities);
  const dixonColesProbabilities = dixonColes1X2(
    input.dixonColes.lambdaHome,
    input.dixonColes.lambdaAway,
    input.dixonColes.rho ?? 0
  );
  const market = marketPrior(input.fixture);
  const flags: HybridConsistencyFlag[] = [];

  const awayInflatedByGoals = hybridProbabilities.awayWin - dixonColesProbabilities.awayWin > 18;
  const homeInflatedByGoals = hybridProbabilities.homeWin - dixonColesProbabilities.homeWin > 18;
  const marketStrongHome = Boolean(market && market.homeWin - market.awayWin > 25 && input.fixture.market.awayWinOdds >= 4.5);
  const marketStrongAway = Boolean(market && market.awayWin - market.homeWin > 25 && input.fixture.market.homeWinOdds >= 4.5);
  const lowAgreement = input.modelAgreement < 55;

  if (awayInflatedByGoals && marketStrongHome && lowAgreement) {
    flags.push("hybrid_away_market_contradiction");
  }

  if (homeInflatedByGoals && marketStrongAway && lowAgreement) {
    flags.push("hybrid_home_market_contradiction");
  }

  if (
    !flags.length &&
    lowAgreement &&
    Math.max(
      Math.abs(hybridProbabilities.homeWin - dixonColesProbabilities.homeWin),
      Math.abs(hybridProbabilities.draw - dixonColesProbabilities.draw),
      Math.abs(hybridProbabilities.awayWin - dixonColesProbabilities.awayWin)
    ) > 24
  ) {
    flags.push("hybrid_goal_model_contradiction");
  }

  return {
    probabilities: flags.length ? blend(hybridProbabilities, dixonColesProbabilities, market) : hybridProbabilities,
    dixonColesProbabilities,
    marketPrior: market,
    flags,
  };
}
