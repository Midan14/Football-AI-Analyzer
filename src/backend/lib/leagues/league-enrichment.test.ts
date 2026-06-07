import { describe, expect, it } from "vitest";
import {
  inferLeagueCategory,
  leagueCatalogSeasonCandidates,
  mapApiFootballLeagueRow,
} from "@/backend/lib/leagues/league-enrichment";

describe("inferLeagueCategory", () => {
  it("detects women's leagues", () => {
    expect(inferLeagueCategory("Liga MX Femenil", "League")).toBe("women");
    expect(inferLeagueCategory("FA WSL", "League")).toBe("women");
  });

  it("detects youth leagues", () => {
    expect(inferLeagueCategory("U20 League", "League")).toBe("youth");
    expect(inferLeagueCategory("Liga MX U21", "League")).toBe("youth");
  });

  it("detects cups", () => {
    expect(inferLeagueCategory("Copa MX", "Cup")).toBe("cup");
  });
});

describe("leagueCatalogSeasonCandidates", () => {
  it("anchors on the current calendar year, with prior seasons as fallback", () => {
    const seasons = leagueCatalogSeasonCandidates(new Date("2026-06-06T12:00:00"));
    expect(seasons).toEqual([2026, 2025, 2024]);
  });
});

describe("mapApiFootballLeagueRow", () => {
  it("maps women's league with season from metadata", () => {
    const league = mapApiFootballLeagueRow(
      {
        league: { id: 673, name: "Liga MX Femenil", type: "League" },
        country: { name: "Mexico" },
        seasons: [{ year: 2025, current: true }],
      },
      "mexico",
      () => "standard"
    );
    expect(league.category).toBe("women");
    expect(league.season).toBe("2025");
    expect(league.countryId).toBe("mexico");
  });
});
