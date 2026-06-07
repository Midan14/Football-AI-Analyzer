import { describe, expect, it } from "vitest";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { buildValueTable } from "@/backend/lib/analysis/shared-math";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import { isBlockedHeavyFavorite } from "@/backend/lib/analysis/shared-math";
import { pickBestMarket } from "@/backend/lib/analysis/market-picker";

describe("pickBestMarket", () => {
  it("no recomienda Under 3.5 con cuota baja aunque el edge Poisson sea alto", () => {
    const fixture = demoFixtures[0];
    const valueTable = buildValueTable(
      {
        homeWin: 55,
        draw: 25,
        awayWin: 20,
        over15: 80,
        over25: 52,
        under35: 78,
        btts: 48,
      },
      fixture
    );

    const under35 = valueTable.find((row) => row.market === "Under 3.5");
    expect(under35).toBeDefined();
    expect((under35?.edge ?? 0) > 3).toBe(true);
    expect(isBlockedHeavyFavorite("Under 3.5", fixture.market.under35Odds, under35?.edge ?? 0)).toBe(true);

    const picked = pickBestMarket(valueTable, analyzeFixture(fixture).probabilities, fixture, 70);
    expect(picked.row.market).not.toBe("Under 3.5");
  });

  it("no elige Under 3.5 cuando la cuota es demasiado baja", () => {
    const fixture = {
      ...demoFixtures[0],
      market: {
        ...demoFixtures[0].market,
        homeWinOdds: 1.2,
        drawOdds: 6,
        awayWinOdds: 12,
        bttsYesOdds: 1.2,
        bttsNoOdds: 1.2,
        over25Odds: 1.2,
        under35Odds: 1.35,
      },
    };
    const probs = analyzeFixture(fixture).probabilities;
    const valueTable = buildValueTable(probs, fixture);
    const picked = pickBestMarket(valueTable, probs, fixture, 65);

    expect(picked.row.market).not.toBe("Under 3.5");
  });

  it("prioriza mercados con Kelly accionable sobre edge bruto de Under 3.5", () => {
    const result = analyzeFixture(demoFixtures[0]);
    expect(result.recommendation.market).not.toBe("Under 3.5");
  });
});
