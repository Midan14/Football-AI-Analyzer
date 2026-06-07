import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { analyzeMatch } from "@/backend/server/football/football-service";
import { getFixtureBookmakerOdds } from "@/backend/lib/odds/bookmaker-odds-service";

/**
 * GET /api/arbitrage
 * Calculates real-time arbitrage opportunities across bookmakers using the configured data provider.
 * Query params: fixtureId (required)
 * 
 * Falls back gracefully to simulation mode if no bookmaker odds are returned (e.g., demo/test modes).
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
    const bookmakerOdds = await getFixtureBookmakerOdds(fixtureId);
    const realOpportunities = [];

    if (bookmakerOdds && Object.keys(bookmakerOdds).length > 0) {
      const booknames = Object.keys(bookmakerOdds);

      // 1. 3-way (1X2) Arbitrage
      let maxHome = 0;
      let homeBook = "";
      let maxDraw = 0;
      let drawBook = "";
      let maxAway = 0;
      let awayBook = "";

      for (const name of booknames) {
        const m = bookmakerOdds[name];
        if (m.homeWinOdds > maxHome) {
          maxHome = m.homeWinOdds;
          homeBook = name;
        }
        if (m.drawOdds > maxDraw) {
          maxDraw = m.drawOdds;
          drawBook = name;
        }
        if (m.awayWinOdds > maxAway) {
          maxAway = m.awayWinOdds;
          awayBook = name;
        }
      }

      if (maxHome > 1 && maxDraw > 1 && maxAway > 1) {
        const homeProb = 100 / maxHome;
        const drawProb = 100 / maxDraw;
        const awayProb = 100 / maxAway;
        const totalProb = homeProb + drawProb + awayProb;

        if (totalProb < 100) {
          realOpportunities.push({
            type: "1X2 Arbitrage (3-way)",
            books: Array.from(new Set([homeBook, drawBook, awayBook])),
            bets: [
              { market: "Local (1)", book: homeBook, odds: maxHome, stake: round2((homeProb / totalProb) * 100) },
              { market: "Empate (X)", book: drawBook, odds: maxDraw, stake: round2((drawProb / totalProb) * 100) },
              { market: "Visitante (2)", book: awayBook, odds: maxAway, stake: round2((awayProb / totalProb) * 100) },
            ],
            totalImpliedProb: round2(totalProb),
            profitPct: round2(100 - totalProb),
            isArbitrage: true,
          });
        }
      }

      // 2. Over/Under 2.5 Arbitrage (2-way)
      let maxOver25 = 0;
      let over25Book = "";
      let maxUnder25 = 0;
      let under25Book = "";

      for (const name of booknames) {
        const m = bookmakerOdds[name];
        if (m.over25Odds > maxOver25) {
          maxOver25 = m.over25Odds;
          over25Book = name;
        }
        if (m.under25Odds !== undefined && m.under25Odds > maxUnder25) {
          maxUnder25 = m.under25Odds;
          under25Book = name;
        }
      }

      if (maxOver25 > 1 && maxUnder25 > 1) {
        const overProb = 100 / maxOver25;
        const underProb = 100 / maxUnder25;
        const totalProb = overProb + underProb;

        if (totalProb < 100) {
          realOpportunities.push({
            type: "Over/Under 2.5 (2-way)",
            books: Array.from(new Set([over25Book, under25Book])),
            bets: [
              { market: "Over 2.5", book: over25Book, odds: maxOver25, stake: round2((overProb / totalProb) * 100) },
              { market: "Under 2.5", book: under25Book, odds: maxUnder25, stake: round2((underProb / totalProb) * 100) },
            ],
            totalImpliedProb: round2(totalProb),
            profitPct: round2(100 - totalProb),
            isArbitrage: true,
          });
        }
      }

      // 3. BTTS Yes/No Arbitrage (2-way)
      let maxBttsYes = 0;
      let bttsYesBook = "";
      let maxBttsNo = 0;
      let bttsNoBook = "";

      for (const name of booknames) {
        const m = bookmakerOdds[name];
        if (m.bttsYesOdds > maxBttsYes) {
          maxBttsYes = m.bttsYesOdds;
          bttsYesBook = name;
        }
        if (m.bttsNoOdds > maxBttsNo) {
          maxBttsNo = m.bttsNoOdds;
          bttsNoBook = name;
        }
      }

      if (maxBttsYes > 1 && maxBttsNo > 1) {
        const yesProb = 100 / maxBttsYes;
        const noProb = 100 / maxBttsNo;
        const totalProb = yesProb + noProb;

        if (totalProb < 100) {
          realOpportunities.push({
            type: "Both Teams to Score (2-way)",
            books: Array.from(new Set([bttsYesBook, bttsNoBook])),
            bets: [
              { market: "BTTS Yes", book: bttsYesBook, odds: maxBttsYes, stake: round2((yesProb / totalProb) * 100) },
              { market: "BTTS No", book: bttsNoBook, odds: maxBttsNo, stake: round2((noProb / totalProb) * 100) },
            ],
            totalImpliedProb: round2(totalProb),
            profitPct: round2(100 - totalProb),
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
        arbitrageCount: realOpportunities.length,
        opportunities: realOpportunities,
        simulatedOpportunities: [],
        isArbitrageAvailable: realOpportunities.length > 0,
        simulationMode: false,
        disclaimer: "Oportunidades reales de arbitraje calculadas en tiempo real a través de las cuotas del plan premium del proveedor.",
      });
    }

    // FALLBACK: Simulation lab only when no real bookmakers returned (e.g. tests / demo mode)
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
      arbitrageCount: 0,
      opportunities: [],
      simulatedOpportunities: arbitrageResults,
      isArbitrageAvailable: false,
      simulationMode: true,
      disclaimer: "Laboratorio de simulación: las cuotas no vienen de múltiples bookmakers reales. No usar como arbitraje real.",
    });
  } catch {
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
