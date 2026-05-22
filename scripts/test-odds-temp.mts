import { config } from "dotenv";
config({ path: ".env.local" });
import { ApiFootballProvider } from "../src/backend/lib/providers/api-football-provider.ts";

const p = new ApiFootballProvider();
const fixtures = await p.getFixtures({ date: "2026-05-20" });
const withOdds = fixtures.filter((f) => f.market.homeWinOdds > 0);
console.log("total", fixtures.length, "withOdds", withOdds.length);
if (withOdds[0]) {
  console.log("sample", withOdds[0].id, withOdds[0].leagueName, withOdds[0].market.homeWinOdds);
}
