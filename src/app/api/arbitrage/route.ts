import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { analyzeMatch } from "@/backend/server/football/football-service";

/**
 * GET /api/arbitrage
 * Detects arbitrage opportunities across bookmakers for a fixture
 * Query params: fixtureId (required)
 * 
 * An arbitrage exists when the sum of implied probabilities across
 * different bookmakers is < 100% (guaranteed profit).
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId");

  if (!fixtureId) {
    return errorResponse({ code: "MISSING_FIXTURE", message: "fixtureId requerido" }, 400);
  }

  try {
    const data = await analyzeMatch(fixtureId);
    if (!data?.fixture?.market || !data?.analysis) {
      return errorResponse(Errors.NOT_FOUND);
    }

    const market = data.fixture.market;
    // Build arbitrage scenarios
    // We simulate different bookmaker lines by adjusting vig
    const scenarios = [
      {
        name: "Bookmaker A (vig 6%)",
        homeOdds: round2(market.homeWinOdds * 0.97),
        drawOdds: round2(market.drawOdds * 0.97),
        awayOdds: round2(market.awayWinOdds * 0.97),
      },
      {
        name: "Bookmaker B (vig 5%)",
        homeOdds: round2(market.homeWinOdds * 0.98),
        drawOdds: round2(market.drawOdds * 0.98),
        awayOdds: round2(market.awayWinOdds * 0.98),
      },
      {
        name: "Exchange (vig 2%)",
        homeOdds: round2(market.homeWinOdds * 1.02),
        drawOdds: round2(market.drawOdds * 1.02),
        awayOdds: round2(market.awayWinOdds * 1.02),
      },
    ];

    const arbitrageResults = [];

    // Check for 2-way arbitrage (home/draw vs away at different books)
    for (let i = 0; i < scenarios.length; i++) {
      for (let j = i + 1; j < scenarios.length; j++) {
        const book1 = scenarios[i];
        const book2 = scenarios[j];

        // Home at book1, Draw+Away at book2 (covering all outcomes)
        const homeProb1 = 100 / book1.homeOdds;
        const drawProb2 = 100 / book2.drawOdds;
        const awayProb2 = 100 / book2.awayOdds;
        const totalH1 = homeProb1 + drawProb2 + awayProb2;

        if (totalH1 < 100) {
          arbitrageResults.push({
            type: "3-way",
            books: [book1.name, book2.name],
            bets: [
              { market: "Local", book: book1.name, odds: book1.homeOdds, stake: round2((homeProb1 / totalH1) * 100) },
              { market: "Empate", book: book2.name, odds: book2.drawOdds, stake: round2((drawProb2 / totalH1) * 100) },
              { market: "Visitante", book: book2.name, odds: book2.awayOdds, stake: round2((awayProb2 / totalH1) * 100) },
            ],
            totalImpliedProb: round2(totalH1),
            profitPct: round2((100 - totalH1)),
            isArbitrage: true,
          });
        }
      }
    }

    // Check for over/under arbitrage
    const overOdds = market.over25Odds;
    const underOdds = market.under25Odds || market.under35Odds;
    if (overOdds && underOdds) {
      const overProb = 100 / overOdds;
      const underProb = 100 / underOdds;
      const total = overProb + underProb;
      if (total < 100) {
        arbitrageResults.push({
          type: "2-way (Over/Under)",
          books: ["Simulado"],
          bets: [
            { market: "Over 2.5", odds: overOdds, stake: round2((overProb / total) * 100) },
            { market: "Under", odds: underOdds, stake: round2((underProb / total) * 100) },
          ],
          totalImpliedProb: round2(total),
          profitPct: round2(100 - total),
          isArbitrage: true,
        });
      }
    }

    return successResponse({
      fixtureId,
      fixture: {
        homeTeam: data.fixture.home.name,
        awayTeam: data.fixture.away.name,
        league: data.fixture.leagueName,
        date: data.fixture.kickoff,
      },
      arbitrageCount: arbitrageResults.filter(a => a.isArbitrage).length,
      opportunities: arbitrageResults,
      isArbitrageAvailable: arbitrageResults.some(a => a.isArbitrage),
      disclaimer: "Las cuotas mostradas son simuladas. Para arbitraje real, integrar APIs de bookmakers.",
    });
  } catch {
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
