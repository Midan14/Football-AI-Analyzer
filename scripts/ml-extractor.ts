/**
 * ML Historical Data Extractor
 * Fetches finished fixtures from the configured provider and stores
 * features + real outcomes in TrainingData for model training.
 *
 * Usage: npx tsx scripts/ml-extractor.ts --league 39 --season 2023-2024 --limit 100
 */

import { getDataProvider } from "../src/backend/lib/providers/provider-factory";
import { prisma } from "../src/lib/db";

const args = process.argv.slice(2);
const leagueId = args.find((a) => a.startsWith("--league="))?.split("=")[1] ?? "";
const season = args.find((a) => a.startsWith("--season="))?.split("=")[1] ?? "2023-2024";
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "100");
const daysBack = Number(args.find((a) => a.startsWith("--days-back="))?.split("=")[1] ?? "0");
const provider = getDataProvider();

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function extractionDates(days: number): string[] {
  const total = Math.max(0, Math.floor(days));
  return Array.from({ length: total + 1 }, (_, index) => isoDateDaysAgo(index));
}

async function main() {
  const dates = extractionDates(daysBack);
  console.log(`[Extractor] League ${leagueId} · Season ${season} · Limit ${limit} · DaysBack ${daysBack}`);

  let inserted = 0;
  let skipped = 0;

  for (const dateStr of dates) {
    if (inserted >= limit) break;
    const fixtures = await provider.getFixtures({ leagueId, date: dateStr });
    const selected = fixtures.slice(0, Math.max(0, limit - inserted));

    for (const f of selected) {
    try {
      const full = await provider.getMatch(f.id);
      if (!full.result) { skipped++; continue; }

      // Check if already stored
      const existing = await prisma.trainingData.findUnique({
        where: { fixtureId_dataProvider: { fixtureId: f.id, dataProvider: process.env.DATA_PROVIDER ?? "api-football" } },
      });
      if (existing) { skipped++; continue; }

      await prisma.trainingData.create({
        data: {
          fixtureId: f.id,
          leagueId: f.leagueId,
          countryId: f.countryId,
          season,
          matchDate: new Date(f.kickoff),
          homeTeamId: f.home.id,
          homeTablePosition: f.home.tablePosition,
          homePoints: f.home.pointsTotal,
          homeMatchesPlayed: f.home.matchesPlayed,
          homeGoalsFor: f.home.goalsFor,
          homeGoalsAgainst: f.home.goalsAgainst,
          homeXgFor: f.home.xgFor,
          homeXgAgainst: f.home.xgAgainst,
          homeForm: f.home.form.join(","),
          homeRestDays: f.home.restDays,
          homeMotivation: f.home.motivation,
          homeKeyPlayerStatus: f.home.keyPlayerStatus,
          awayTeamId: f.away.id,
          awayTablePosition: f.away.tablePosition,
          awayPoints: f.away.pointsTotal,
          awayMatchesPlayed: f.away.matchesPlayed,
          awayGoalsFor: f.away.goalsFor,
          awayGoalsAgainst: f.away.goalsAgainst,
          awayXgFor: f.away.xgFor,
          awayXgAgainst: f.away.xgAgainst,
          awayForm: f.away.form.join(","),
          awayRestDays: f.away.restDays,
          awayTravelKm: f.away.travelKm,
          awayMotivation: f.away.motivation,
          awayKeyPlayerStatus: f.away.keyPlayerStatus,
          derby: f.context.derby,
          mustWinHome: f.context.mustWinHome,
          mustWinAway: f.context.mustWinAway,
          lowDivision: f.context.lowDivision,
          weatherRisk: f.context.weatherRisk,
          playoff: f.context.playoff,
          relegationRisk: f.context.relegationRisk,
          rivalRivalry: f.context.rivalRivalry,
          copaVsLeague: f.context.copaVsLeague,
          prizeMoney: f.context.prizeMoney,
          psychologicalPressure: f.context.psychologicalPressure ?? 0,
          underdogFreedom: f.context.underdogFreedom ?? 0,
          favoriteParalysis: f.context.favoriteParalysis ?? 0,
          coverageTier: f.coverage.tier,
          hasLineups: f.coverage.hasLineups,
          hasOdds: f.coverage.hasOdds,
          hasXg: f.coverage.hasXg,
          hasInjuries: f.coverage.hasInjuries,
          hasReferee: f.coverage.hasReferee,
          refereeAvgCards: f.referee?.avgCards ?? 3.5,
          refereeHomeBias: f.referee?.homeBias ?? 0,
          refereeAvgPenalties: f.referee?.avgPenalties ?? 0.2,
          refereeStrictness: f.referee?.strictness ?? "medium",
          homeWinOdds: full.market.homeWinOdds || null,
          drawOdds: full.market.drawOdds || null,
          awayWinOdds: full.market.awayWinOdds || null,
          over25Odds: full.market.over25Odds || null,
          bttsYesOdds: full.market.bttsYesOdds || null,
          actualHomeGoals: full.result.homeGoals,
          actualAwayGoals: full.result.awayGoals,
          actualResult:
            full.result.homeGoals > full.result.awayGoals
              ? "HOME_WIN"
              : full.result.homeGoals < full.result.awayGoals
                ? "AWAY_WIN"
                : "DRAW",
          actualBtts: full.result.homeGoals > 0 && full.result.awayGoals > 0,
          actualOver25: full.result.homeGoals + full.result.awayGoals >= 3,
          dataProvider: process.env.DATA_PROVIDER ?? "api-football",
        },
      });
      inserted++;
      process.stdout.write(`\rInserted ${inserted} · Skipped ${skipped}`);
    } catch (err) {
      skipped++;
    }
    }
  }

  console.log(`\n[Done] Inserted ${inserted} · Skipped ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
