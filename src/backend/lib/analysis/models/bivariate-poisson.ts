/**
 * Bivariate Poisson correlacionado (Karlis & Dimitris).
 * λ_home, λ_away con componente compartido κ que modela covarianza entre goles.
 */

import type { Fixture } from "@/shared/domain";

export type BivariatePoissonResult = {
  lambdaHome: number;
  lambdaAway: number;
  kappa: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  covariance: number;
  prob00: number;
  prob11: number;
};

function poisson(lambda: number, k: number): number {
  if (k < 0) return 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}

/** P(X=x, Y=y) con Poisson bivariado de componente compartido κ. */
function jointProb(x: number, y: number, l1: number, l2: number, kappa: number): number {
  let sum = 0;
  const maxJ = Math.min(x, y);
  for (let j = 0; j <= maxJ; j++) {
    const term =
      (Math.exp(-l1 - l2 - kappa) * kappa ** j * l1 ** (x - j) * l2 ** (y - j)) /
      (fact(x - j) * fact(y - j) * fact(j));
    sum += term;
  }
  return sum;

  function fact(n: number): number {
    if (n <= 1) return 1;
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  }
}

function estimateKappa(fixture: Fixture, xgHome: number, xgAway: number): number {
  const defensive = xgHome + xgAway < 2.2;
  const lowScoringLeague = fixture.context.lowDivision;
  let kappa = defensive ? 0.12 : 0.06;
  if (fixture.context.derby) kappa += 0.04;
  if (lowScoringLeague) kappa += 0.03;
  return Math.min(0.25, Math.max(0.02, kappa));
}

export function bivariatePoissonModel(fixture: Fixture, xgHome: number, xgAway: number): BivariatePoissonResult {
  const kappa = estimateKappa(fixture, xgHome, xgAway);
  const lambdaHome = Math.max(0.2, xgHome - kappa * 0.5);
  const lambdaAway = Math.max(0.2, xgAway - kappa * 0.5);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let prob00 = 0;
  let prob11 = 0;

  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const p = jointProb(h, a, lambdaHome, lambdaAway, kappa);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (h === 0 && a === 0) prob00 = p;
      if (h === 1 && a === 1) prob11 = p;
    }
  }

  const total = homeWin + draw + awayWin;
  const covariance = kappa;

  return {
    lambdaHome: Math.round(lambdaHome * 1000) / 1000,
    lambdaAway: Math.round(lambdaAway * 1000) / 1000,
    kappa: Math.round(kappa * 1000) / 1000,
    homeWin: Math.round((homeWin / total) * 1000) / 10,
    draw: Math.round((draw / total) * 1000) / 10,
    awayWin: Math.round((awayWin / total) * 1000) / 10,
    covariance: Math.round(covariance * 1000) / 1000,
    prob00: Math.round(prob00 * 1000) / 10,
    prob11: Math.round(prob11 * 1000) / 10,
  };
}
