/**
 * Expected Value (EV) Calculator — Identifies value bets with precision.
 *
 * EV = (P_model × Odds) - 1
 * If EV > 0, the bet has positive expected value.
 *
 * This module goes beyond simple edge calculation by:
 * 1. Calculating EV for every available market
 * 2. Ranking by EV (not just edge %)
 * 3. Applying confidence-weighted EV (penalizes low-confidence predictions)
 * 4. Calculating ROI potential per unit staked
 * 5. Identifying the single best value bet with reasoning
 */

import type { Fixture, AnalysisResult } from "@/shared/domain";

export type ValueBet = {
  market: string;
  modelProbability: number;
  impliedProbability: number;
  bookmakerOdds: number;
  edge: number;           // P_model - P_implied (%)
  ev: number;             // Expected Value per unit (decimal)
  evPercent: number;      // EV as percentage
  confidenceWeightedEV: number; // EV adjusted by model confidence
  roi: number;            // Return on investment if bet wins
  grade: "A" | "B" | "C" | "D"; // Quality grade
  reasoning: string;
};

export type ValueBetReport = {
  bestBet: ValueBet | null;
  valueBets: ValueBet[];    // All bets with positive EV
  totalEV: number;          // Sum of all positive EVs
  marketEfficiency: number; // How efficient is the bookmaker (0-100)
  overround: number;        // Bookmaker margin %
};

export function calculateValueBets(
  analysis: AnalysisResult,
  fixture: Fixture,
  confidence: number
): ValueBetReport {
  const markets: Array<{ name: string; modelProb: number; odds: number }> = [];

  // Map all available markets
  if (fixture.market.homeWinOdds > 1.01) {
    markets.push({ name: "Local gana", modelProb: analysis.probabilities.homeWin, odds: fixture.market.homeWinOdds });
  }
  if (fixture.market.drawOdds > 1.01) {
    markets.push({ name: "Empate", modelProb: analysis.probabilities.draw, odds: fixture.market.drawOdds });
  }
  if (fixture.market.awayWinOdds > 1.01) {
    markets.push({ name: "Visitante gana", modelProb: analysis.probabilities.awayWin, odds: fixture.market.awayWinOdds });
  }
  if (fixture.market.over25Odds > 1.01) {
    markets.push({ name: "Over 2.5", modelProb: analysis.probabilities.over25, odds: fixture.market.over25Odds });
  }
  if (fixture.market.under35Odds > 1.01) {
    markets.push({ name: "Under 3.5", modelProb: analysis.probabilities.under35, odds: fixture.market.under35Odds });
  }
  if ((fixture.market.under25Odds ?? 0) > 1.01) {
    markets.push({ name: "Under 2.5", modelProb: 100 - analysis.probabilities.over25, odds: fixture.market.under25Odds! });
  }
  if (fixture.market.bttsYesOdds > 1.01) {
    markets.push({ name: "BTTS Sí", modelProb: analysis.probabilities.btts, odds: fixture.market.bttsYesOdds });
  }
  if (fixture.market.bttsNoOdds > 1.01) {
    markets.push({ name: "BTTS No", modelProb: 100 - analysis.probabilities.btts, odds: fixture.market.bttsNoOdds });
  }
  if (fixture.market.over15Odds > 1.01) {
    markets.push({ name: "Over 1.5", modelProb: analysis.probabilities.over15, odds: fixture.market.over15Odds });
  }
  if ((fixture.market.dc1xOdds ?? 0) > 1.01) {
    markets.push({ name: "Doble Chance 1X", modelProb: analysis.probabilities.homeWin + analysis.probabilities.draw, odds: fixture.market.dc1xOdds! });
  }
  if ((fixture.market.dcx2Odds ?? 0) > 1.01) {
    markets.push({ name: "Doble Chance X2", modelProb: analysis.probabilities.draw + analysis.probabilities.awayWin, odds: fixture.market.dcx2Odds! });
  }
  if (fixture.market.ahHomeMinus1 > 1.01) {
    markets.push({ name: "AH Local -1", modelProb: analysis.probabilities.homeWin * 0.75, odds: fixture.market.ahHomeMinus1 });
  }
  if (fixture.market.ahAwayPlus1 > 1.01) {
    markets.push({ name: "AH Visitante +1", modelProb: (analysis.probabilities.draw + analysis.probabilities.awayWin) * 0.85, odds: fixture.market.ahAwayPlus1 });
  }

  // Calculate EV for each market
  const valueBets: ValueBet[] = [];
  const confidenceMultiplier = confidence / 100;

  for (const m of markets) {
    const pModel = m.modelProb / 100;
    const pImplied = 1 / m.odds;
    const edge = m.modelProb - (pImplied * 100);
    const ev = (pModel * m.odds) - 1; // EV per unit staked
    const evPercent = ev * 100;
    const confidenceWeightedEV = ev * confidenceMultiplier;
    const roi = (m.odds - 1) * 100; // ROI if bet wins

    // Grade based on EV and confidence
    let grade: "A" | "B" | "C" | "D";
    if (confidenceWeightedEV > 0.10) grade = "A";
    else if (confidenceWeightedEV > 0.05) grade = "B";
    else if (confidenceWeightedEV > 0.02) grade = "C";
    else grade = "D";

    // Reasoning
    let reasoning: string;
    if (ev > 0.15) {
      reasoning = `Valor excepcional: modelo da ${m.modelProb.toFixed(1)}% pero mercado implica solo ${(pImplied * 100).toFixed(1)}%. Edge de +${edge.toFixed(1)}% con EV de ${(ev * 100).toFixed(1)}% por unidad.`;
    } else if (ev > 0.05) {
      reasoning = `Buen valor: edge +${edge.toFixed(1)}% con cuota ${m.odds.toFixed(2)}. EV positivo de ${(ev * 100).toFixed(1)}% justifica apuesta.`;
    } else if (ev > 0) {
      reasoning = `Valor marginal: edge +${edge.toFixed(1)}% pero EV bajo (${(ev * 100).toFixed(1)}%). Solo apostar con alta confianza.`;
    } else {
      reasoning = `Sin valor: mercado tiene mejor precio (${(pImplied * 100).toFixed(1)}%) que el modelo (${m.modelProb.toFixed(1)}%). No apostar.`;
    }

    if (ev > 0) {
      valueBets.push({
        market: m.name,
        modelProbability: Math.round(m.modelProb * 10) / 10,
        impliedProbability: Math.round(pImplied * 1000) / 10,
        bookmakerOdds: m.odds,
        edge: Math.round(edge * 10) / 10,
        ev: Math.round(ev * 1000) / 1000,
        evPercent: Math.round(evPercent * 10) / 10,
        confidenceWeightedEV: Math.round(confidenceWeightedEV * 1000) / 1000,
        roi: Math.round(roi),
        grade,
        reasoning,
      });
    }
  }

  // Sort by confidence-weighted EV
  valueBets.sort((a, b) => b.confidenceWeightedEV - a.confidenceWeightedEV);

  // Calculate overround (bookmaker margin)
  const impliedTotal = markets.reduce((sum, m) => sum + (1 / m.odds) * 100, 0);
  const overround = Math.max(0, impliedTotal - 100);

  // Market efficiency: lower overround = more efficient
  const marketEfficiency = Math.min(100, Math.max(0, 100 - overround * 5));

  return {
    bestBet: valueBets[0] ?? null,
    valueBets,
    totalEV: valueBets.reduce((sum, b) => sum + b.ev, 0),
    marketEfficiency: Math.round(marketEfficiency),
    overround: Math.round(overround * 10) / 10,
  };
}
