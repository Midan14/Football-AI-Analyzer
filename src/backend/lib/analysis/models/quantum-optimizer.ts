/**
 * Quantum-inspired optimizer — QAOA/VQE clásico para asignación de stakes Kelly.
 */

import type { AnalysisResult } from "@/shared/domain";

export type QuantumOptimizerResult = {
  method: "QAOA-simulated";
  layers: number;
  optimalExposure: number;
  stakeVector: Array<{ market: string; weight: number; stakeUnits: number }>;
  energy: number;
  convergenceIterations: number;
};

export function quantumStakeOptimizer(analysis: AnalysisResult, maxExposure = 3): QuantumOptimizerResult {
  const candidates = analysis.kelly?.bets.length
    ? analysis.kelly.bets.map((b) => ({
        market: b.market,
        edge: b.edge,
        ev: b.expectedValue,
        baseStake: b.stakeUnits,
      }))
    : analysis.valueTable
        .filter((r) => r.edge > 0)
        .slice(0, 5)
        .map((r) => ({
          market: r.market,
          edge: r.edge,
          ev: r.edge / 100,
          baseStake: Math.min(1, r.edge / 10),
        }));

  if (candidates.length === 0) {
    return {
      method: "QAOA-simulated",
      layers: 3,
      optimalExposure: 0,
      stakeVector: [],
      energy: 0,
      convergenceIterations: 0,
    };
  }

  // Cost Hamiltonian: maximize EV, penalize exposure > max
  // QAOA-inspired: alternate cost/mixer for p layers
  const p = 3;
  let bestWeights = candidates.map((c) => c.baseStake);
  let bestEnergy = -Infinity;
  let iterations = 0;

  for (let layer = 0; layer < p * 8; layer++) {
    iterations++;
    const gamma = (layer + 1) / (p * 8);
    const beta = Math.PI / 4 - gamma / 2;
    const trial = candidates.map((c, i) => {
      const costTerm = c.ev * Math.cos(gamma * c.edge);
      const mixerTerm = Math.sin(beta * (i + 1)) * 0.15;
      return Math.max(0, c.baseStake + costTerm * 0.05 + mixerTerm);
    });
    const exposure = trial.reduce((s, w) => s + w, 0);
    const energy =
      candidates.reduce((s, c, i) => s + c.ev * trial[i], 0) -
      Math.max(0, exposure - maxExposure) * 2;

    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestWeights = trial;
    }
  }

  const rawSum = bestWeights.reduce((s, w) => s + w, 0) || 1;
  const scale = Math.min(1, maxExposure / rawSum);
  const stakeVector = candidates.map((c, i) => ({
    market: c.market,
    weight: Math.round((bestWeights[i] / rawSum) * 1000) / 10,
    stakeUnits: Math.round(bestWeights[i] * scale * 100) / 100,
  }));

  return {
    method: "QAOA-simulated",
    layers: p,
    optimalExposure: Math.round(stakeVector.reduce((s, v) => s + v.stakeUnits, 0) * 100) / 100,
    stakeVector,
    energy: Math.round(bestEnergy * 1000) / 1000,
    convergenceIterations: iterations,
  };
}
