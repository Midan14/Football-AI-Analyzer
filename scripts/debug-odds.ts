import { ApiFootballProvider } from "../src/backend/lib/providers/api-football-provider";

async function main() {
  const provider = new ApiFootballProvider(process.env.API_FOOTBALL_KEY!);

  console.log("=== getMatch(1519361) ===");
  const fixture = await provider.getMatch("1519361");
  console.log("market.homeWinOdds:", fixture.market.homeWinOdds);
  console.log("market.drawOdds:", fixture.market.drawOdds);
  console.log("market.awayWinOdds:", fixture.market.awayWinOdds);
  console.log("market.over25Odds:", fixture.market.over25Odds);
  console.log("market.bttsYesOdds:", fixture.market.bttsYesOdds);
  console.log("coverage.hasOdds:", fixture.coverage.hasOdds);
}

main().catch(console.error);
