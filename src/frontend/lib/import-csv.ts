import { updatePredictionResult } from "@/frontend/lib/prediction-history";

/**
 * CSV format expected:
 *   fixtureId, golesLocal, golesVisitante, mercado, cuota
 *
 * The `cuota` column is optional but used to compute real ROI.
 * If omitted, a default of 1.9 is assumed (common -110 line).
 */
export function parseResultsCSV(csvText: string): {
  success: number;
  errors: number;
  messages: string[];
} {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    return { success: 0, errors: 1, messages: ["El CSV está vacío o no tiene datos"] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const fixtureIdIndex = headers.indexOf("fixtureid");
  const homeGoalsIndex = headers.indexOf("goleslocal");
  const awayGoalsIndex = headers.indexOf("golesvisitante");
  const marketIndex = headers.indexOf("mercado");
  const oddsIndex = headers.indexOf("cuota");
  const stakeIndex = headers.indexOf("stake");

  if (fixtureIdIndex === -1 || homeGoalsIndex === -1 || awayGoalsIndex === -1) {
    return {
      success: 0,
      errors: 1,
      messages: ["CSV debe tener columnas: fixtureId, golesLocal, golesVisitante (mercado, cuota, stake opcionales)"],
    };
  }

  let success = 0;
  let errors = 0;
  const messages: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",");
    const requiredCols = Math.max(fixtureIdIndex, homeGoalsIndex, awayGoalsIndex) + 1;
    if (cols.length < requiredCols) {
      errors++;
      messages.push(`Línea ${i + 1}: columnas insuficientes`);
      continue;
    }

    const fixtureId = cols[fixtureIdIndex]?.trim();
    const homeGoals = parseInt(cols[homeGoalsIndex]?.trim(), 10);
    const awayGoals = parseInt(cols[awayGoalsIndex]?.trim(), 10);
    const market = marketIndex >= 0 ? cols[marketIndex]?.trim() ?? "" : "";
    const odds = oddsIndex >= 0 ? parseFloat(cols[oddsIndex]?.trim()) : NaN;
    const stake = stakeIndex >= 0 ? parseFloat(cols[stakeIndex]?.trim()) : 1;

    if (!fixtureId || isNaN(homeGoals) || isNaN(awayGoals)) {
      errors++;
      messages.push(`Línea ${i + 1}: datos inválidos (fixtureId="${fixtureId}", goles="${homeGoals}-${awayGoals}")`);
      continue;
    }

    const effectiveOdds = Number.isFinite(odds) && odds > 1 ? odds : 1.9;
    const effectiveStake = Number.isFinite(stake) && stake > 0 ? stake : 1;

    // Determine if prediction won based on market keyword
    let predictionWon = false;
    const mkt = market.toLowerCase();

    if (mkt.includes("local") || mkt.includes("home") || mkt.includes("1")) {
      predictionWon = homeGoals > awayGoals;
    } else if (mkt.includes("visitante") || mkt.includes("away") || mkt.includes("2")) {
      predictionWon = awayGoals > homeGoals;
    } else if (mkt.includes("empate") || mkt.includes("draw") || mkt.includes("x")) {
      predictionWon = homeGoals === awayGoals;
    } else if (mkt.includes("over") || mkt.includes("más de")) {
      // Extract line: "Over 2.5" → 2.5
      const lineMatch = mkt.match(/[\d.]+/);
      const line = lineMatch ? parseFloat(lineMatch[0]) : 2.5;
      predictionWon = homeGoals + awayGoals > line;
    } else if (mkt.includes("under") || mkt.includes("menos de")) {
      const lineMatch = mkt.match(/[\d.]+/);
      const line = lineMatch ? parseFloat(lineMatch[0]) : 2.5;
      predictionWon = homeGoals + awayGoals < line;
    } else if (mkt.includes("btts") || mkt.includes("ambos anotan") || mkt.includes("gg")) {
      predictionWon = homeGoals > 0 && awayGoals > 0;
    } else if (mkt.includes("no btts") || mkt.includes("ng")) {
      predictionWon = !(homeGoals > 0 && awayGoals > 0);
    } else if (mkt.includes("1x")) {
      predictionWon = homeGoals >= awayGoals;
    } else if (mkt.includes("x2")) {
      predictionWon = awayGoals >= homeGoals;
    } else if (mkt.includes("12")) {
      predictionWon = homeGoals !== awayGoals;
    }

    // Real profit calculation using actual odds
    const profit = predictionWon
      ? parseFloat((effectiveStake * (effectiveOdds - 1)).toFixed(2))
      : -effectiveStake;

    updatePredictionResult(fixtureId, {
      actualResult: `${homeGoals}-${awayGoals}`,
      actualGoalsHome: homeGoals,
      actualGoalsAway: awayGoals,
      predictionWon,
      profit,
    });

    success++;
  }

  messages.unshift(`${success} resultados importados, ${errors} errores`);
  return { success, errors, messages };
}
