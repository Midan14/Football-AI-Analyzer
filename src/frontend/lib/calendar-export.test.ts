import { describe, expect, it } from "vitest";
import { getHeatmapTier, buildCalendarDayCsv, parseCalendarUrlState } from "@/frontend/lib/calendar-export";
import type { Fixture } from "@/shared/domain";

describe("calendar-export", () => {
  it("maps heatmap tiers relative to month max", () => {
    expect(getHeatmapTier(0, 20)).toBe(0);
    expect(getHeatmapTier(20, 20)).toBe(4);
    expect(getHeatmapTier(10, 20)).toBe(3);
    expect(getHeatmapTier(1, 1)).toBe(4);
  });

  it("builds CSV with header and rows", () => {
    const fixtures = [
      {
        id: "f1",
        leagueName: "La Liga",
        kickoff: "2026-05-20T22:00:00Z",
        status: "pre-match",
        home: { name: "Real Madrid" },
        away: { name: "Barcelona" },
        market: { homeWinOdds: 2.1, drawOdds: 3.4, awayWinOdds: 3.2 },
      },
    ] as Fixture[];
    const csv = buildCalendarDayCsv("2026-05-20", fixtures);
    expect(csv.split("\n")[0]).toContain("fecha,hora,liga");
    expect(csv).toContain("Real Madrid");
  });

  it("parses calendar share URL params", () => {
    const state = parseCalendarUrlState("?view=Calendario&date=2026-05-20&countryId=spain");
    expect(state.view).toBe("Calendario");
    expect(state.date).toBe("2026-05-20");
    expect(state.countryId).toBe("spain");
  });
});
