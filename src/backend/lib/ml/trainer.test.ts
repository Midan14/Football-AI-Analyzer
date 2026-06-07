import { describe, expect, it } from "vitest";
import { buildExtractionArgs } from "./trainer";

describe("buildExtractionArgs", () => {
  it("builds historical extraction args without relying on user predictions", () => {
    expect(buildExtractionArgs({ leagueId: "39", season: "2024-2025", limit: 500, daysBack: 180 })).toEqual([
      "tsx",
      "ml-extractor.ts",
      "--limit=500",
      "--league=39",
      "--season=2024-2025",
      "--days-back=180",
    ]);
  });
});
