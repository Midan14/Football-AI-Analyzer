/**
 * Skellam Distribution — Models the DIFFERENCE of goals (home - away).
 * 
 * Better than Poisson for Asian Handicap markets because it directly
 * models the goal difference rather than individual team goals.
 * 
 * P(X = k) = e^-(λ1+λ2) * (λ1/λ2)^(k/2) * I_|k|(2*sqrt(λ1*λ2))
 * where I_k is the modified Bessel function of the first kind.
 *
 * Use cases:
 * - Asian Handicap pricing (AH -0.5, -1, -1.5, -2)
 * - Draw No Bet
 * - Exact goal difference markets
 */

export type SkellamResult = {
  // Probability of each goal difference (-4 to +4)
  goalDiffProbs: Record<string, number>;
  // Asian Handicap probabilities
  ah0: { home: number; away: number }; // Draw No Bet
  ahMinus05: { home: number; away: number }; // AH -0.5 (home wins)
  ahMinus1: { home: number; away: number }; // AH -1
  ahMinus15: { home: number; away: number }; // AH -1.5
  ahMinus2: { home: number; away: number }; // AH -2
  ahPlus05: { home: number; away: number }; // AH +0.5 (away wins or draw)
  ahPlus1: { home: number; away: number }; // AH +1
  ahPlus15: { home: number; away: number }; // AH +1.5
  // Most likely goal difference
  mostLikelyDiff: number;
  expectedDiff: number;
};

/**
 * Modified Bessel function of the first kind I_v(x)
 * Using series expansion for numerical stability.
 */
function besselI(v: number, x: number): number {
  const absV = Math.abs(v);
  let sum = 0;
  const halfX = x / 2;

  for (let m = 0; m <= 50; m++) {
    const numerator = Math.pow(halfX, 2 * m + absV);
    const denom = factorial(m) * gamma(m + absV + 1);
    if (denom === 0 || !Number.isFinite(numerator / denom)) break;
    sum += numerator / denom;
  }

  return sum;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function gamma(z: number): number {
  // Lanczos approximation
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Skellam PMF: P(K = k | λ1, λ2)
 */
function skellamPMF(k: number, lambda1: number, lambda2: number): number {
  const expTerm = Math.exp(-(lambda1 + lambda2));
  const ratio = Math.pow(lambda1 / lambda2, k / 2);
  const bessel = besselI(Math.abs(k), 2 * Math.sqrt(lambda1 * lambda2));

  const prob = expTerm * ratio * bessel;
  return Number.isFinite(prob) ? Math.max(0, prob) : 0;
}

export function skellamModel(xgHome: number, xgAway: number): SkellamResult {
  // Calculate probabilities for goal differences -5 to +5
  const goalDiffProbs: Record<string, number> = {};
  let totalProb = 0;

  for (let diff = -5; diff <= 5; diff++) {
    const prob = skellamPMF(diff, xgHome, xgAway);
    goalDiffProbs[String(diff)] = prob;
    totalProb += prob;
  }

  // Normalize
  for (const key of Object.keys(goalDiffProbs)) {
    goalDiffProbs[key] = Math.round((goalDiffProbs[key] / totalProb) * 1000) / 10;
  }

  // Asian Handicap calculations
  const probHomeWinByExactly = (n: number) => goalDiffProbs[String(n)] || 0;
  const probHomeLead = (minDiff: number) => {
    let sum = 0;
    for (let d = minDiff; d <= 5; d++) sum += (goalDiffProbs[String(d)] || 0);
    return sum;
  };
  const probAwayLead = (minDiff: number) => {
    let sum = 0;
    for (let d = -5; d <= -minDiff; d++) sum += (goalDiffProbs[String(d)] || 0);
    return sum;
  };

  const drawProb = goalDiffProbs["0"] || 0;

  // AH -0.5: home wins if diff >= 1
  const ahMinus05Home = probHomeLead(1);
  // AH -1: home wins if diff >= 2, push if diff = 1
  const ahMinus1Home = probHomeLead(2);
  // AH -1.5: home wins if diff >= 2
  const ahMinus15Home = probHomeLead(2);
  // AH -2: home wins if diff >= 3, push if diff = 2
  const ahMinus2Home = probHomeLead(3);

  // Find most likely difference
  let mostLikelyDiff = 0;
  let maxProb = 0;
  for (let d = -5; d <= 5; d++) {
    const p = goalDiffProbs[String(d)] || 0;
    if (p > maxProb) { maxProb = p; mostLikelyDiff = d; }
  }

  // Expected difference
  let expectedDiff = 0;
  for (let d = -5; d <= 5; d++) {
    expectedDiff += d * ((goalDiffProbs[String(d)] || 0) / 100);
  }

  return {
    goalDiffProbs,
    ah0: { home: Math.round((100 - drawProb) * probHomeLead(1) / (probHomeLead(1) + probAwayLead(1)) * 10) / 10, away: Math.round((100 - drawProb) * probAwayLead(1) / (probHomeLead(1) + probAwayLead(1)) * 10) / 10 },
    ahMinus05: { home: Math.round(ahMinus05Home * 10) / 10, away: Math.round((100 - ahMinus05Home) * 10) / 10 },
    ahMinus1: { home: Math.round(ahMinus1Home * 10) / 10, away: Math.round((100 - ahMinus1Home) * 10) / 10 },
    ahMinus15: { home: Math.round(ahMinus15Home * 10) / 10, away: Math.round((100 - ahMinus15Home) * 10) / 10 },
    ahMinus2: { home: Math.round(ahMinus2Home * 10) / 10, away: Math.round((100 - ahMinus2Home) * 10) / 10 },
    ahPlus05: { home: Math.round((100 - probAwayLead(1) - drawProb) * 10) / 10, away: Math.round((probAwayLead(1) + drawProb) * 10) / 10 },
    ahPlus1: { home: Math.round((probHomeLead(1) + drawProb) * 10) / 10, away: Math.round(probAwayLead(2) * 10) / 10 },
    ahPlus15: { home: Math.round((probHomeLead(1) + drawProb) * 10) / 10, away: Math.round(probAwayLead(2) * 10) / 10 },
    mostLikelyDiff,
    expectedDiff: Math.round(expectedDiff * 100) / 100,
  };
}
