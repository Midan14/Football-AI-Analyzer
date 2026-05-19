/**
 * Expected Threat (xT) — Approximation without tracking data.
 *
 * True xT requires ball tracking data (StatsBomb/Opta), but we can
 * approximate it from available statistics:
 * - Shots on target → quality of final-third entries
 * - Corners → set piece threat
 * - Possession → territorial dominance
 * - Goals/shots ratio → finishing quality
 *
 * xT grid divides the pitch into zones. Each zone has a probability
 * of leading to a goal. We estimate zone control from match stats.
 *
 * This gives us:
 * - Which team creates more dangerous situations
 * - Expected goals from open play vs set pieces
 * - Attacking efficiency (xT generated per possession)
 */

import type { Fixture, MatchStatistic } from "@/shared/domain";

export type ExpectedThreatResult = {
  // Overall xT per team (0-100 scale)
  homeThreat: number;
  awayThreat: number;

  // Breakdown by zone
  homeZones: {
    defensiveThird: number;  // Build-up quality
    middleThird: number;     // Progression quality
    finalThird: number;      // Chance creation
    box: number;             // Finishing quality
  };
  awayZones: {
    defensiveThird: number;
    middleThird: number;
    finalThird: number;
    box: number;
  };

  // Set piece threat
  homeSetPieceThreat: number;
  awaySetPieceThreat: number;

  // Efficiency metrics
  homeEfficiency: number; // Goals per xT unit
  awayEfficiency: number;

  // Dominance score (who controls dangerous areas)
  territorialDominance: "home" | "balanced" | "away";
  dominanceScore: number; // -100 to +100 (positive = home dominant)
};

/**
 * Estimate xT from season statistics (pre-match).
 */
function estimateFromSeasonStats(team: Fixture["home"], isHome: boolean): {
  threat: number;
  zones: { defensiveThird: number; middleThird: number; finalThird: number; box: number };
  setPiece: number;
  efficiency: number;
} {
  const matches = team.matchesPlayed || 18;
  const goalsPerGame = team.goalsFor / matches;
  const xgPerGame = team.xgFor > 0 ? team.xgFor / matches : goalsPerGame * 0.9;

  // Estimate zone contributions
  // Final third and box are most important for xT
  const boxThreat = Math.min(100, xgPerGame * 40); // xG directly correlates with box entries
  const finalThird = Math.min(100, xgPerGame * 30 + goalsPerGame * 10);
  const middleThird = Math.min(100, 40 + (team.pointsTotal / matches) * 10); // Better teams progress better
  const defensiveThird = Math.min(100, 30 + (1 - team.goalsAgainst / matches / 2) * 40);

  // Set piece threat (estimated from goals - open play xG)
  const setPiece = Math.min(100, Math.max(20, (goalsPerGame - xgPerGame * 0.7) * 50 + 30));

  // Overall threat
  const homeBoost = isHome ? 1.12 : 1.0;
  const threat = Math.min(100, (boxThreat * 0.4 + finalThird * 0.3 + middleThird * 0.2 + defensiveThird * 0.1) * homeBoost);

  // Efficiency: goals per xT unit
  const efficiency = xgPerGame > 0 ? Math.min(100, (goalsPerGame / xgPerGame) * 60) : 50;

  return {
    threat: Math.round(threat * 10) / 10,
    zones: {
      defensiveThird: Math.round(defensiveThird * 10) / 10,
      middleThird: Math.round(middleThird * 10) / 10,
      finalThird: Math.round(finalThird * 10) / 10,
      box: Math.round(boxThreat * 10) / 10,
    },
    setPiece: Math.round(setPiece * 10) / 10,
    efficiency: Math.round(efficiency * 10) / 10,
  };
}

/**
 * Enhance xT with live match statistics if available.
 */
function enhanceWithLiveStats(
  base: ReturnType<typeof estimateFromSeasonStats>,
  stats: MatchStatistic[],
  isHome: boolean
): ReturnType<typeof estimateFromSeasonStats> {
  if (stats.length === 0) return base;

  const getStat = (type: string): number => {
    const stat = stats.find(s => s.type.toLowerCase().includes(type.toLowerCase()));
    if (!stat) return 0;
    const val = isHome ? stat.home : stat.away;
    return parseFloat(val) || 0;
  };

  const shotsOnTarget = getStat("shots on goal");
  const totalShots = getStat("total shots");
  const possession = getStat("possession");
  const corners = getStat("corner");
  const passAccuracy = getStat("passes");

  // Adjust zones based on live data
  const enhanced = { ...base };

  if (totalShots > 0) {
    enhanced.zones.box = Math.min(100, base.zones.box * 0.5 + shotsOnTarget * 8);
    enhanced.zones.finalThird = Math.min(100, base.zones.finalThird * 0.5 + totalShots * 4);
  }

  if (possession > 0) {
    enhanced.zones.middleThird = Math.min(100, base.zones.middleThird * 0.4 + possession * 0.8);
  }

  if (corners > 0) {
    enhanced.setPiece = Math.min(100, base.setPiece * 0.6 + corners * 8);
  }

  // Recalculate overall threat
  enhanced.threat = Math.round(
    (enhanced.zones.box * 0.4 + enhanced.zones.finalThird * 0.3 +
     enhanced.zones.middleThird * 0.2 + enhanced.zones.defensiveThird * 0.1) * 10
  ) / 10;

  return enhanced;
}

export function expectedThreatModel(
  fixture: Fixture,
  liveStats?: MatchStatistic[]
): ExpectedThreatResult {
  // Base estimates from season data
  let homeData = estimateFromSeasonStats(fixture.home, true);
  let awayData = estimateFromSeasonStats(fixture.away, false);

  // Enhance with live stats if available
  if (liveStats && liveStats.length > 0) {
    homeData = enhanceWithLiveStats(homeData, liveStats, true);
    awayData = enhanceWithLiveStats(awayData, liveStats, false);
  }

  // Territorial dominance
  const dominanceScore = Math.round(homeData.threat - awayData.threat);
  const territorialDominance: "home" | "balanced" | "away" =
    dominanceScore > 10 ? "home" :
    dominanceScore < -10 ? "away" : "balanced";

  return {
    homeThreat: homeData.threat,
    awayThreat: awayData.threat,
    homeZones: homeData.zones,
    awayZones: awayData.zones,
    homeSetPieceThreat: homeData.setPiece,
    awaySetPieceThreat: awayData.setPiece,
    homeEfficiency: homeData.efficiency,
    awayEfficiency: awayData.efficiency,
    territorialDominance,
    dominanceScore,
  };
}
