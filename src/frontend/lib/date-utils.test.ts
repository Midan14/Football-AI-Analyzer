import { describe, expect, it } from "vitest";
import {
  fixturesForCalendarDate,
  formatKickoffColombia,
  formatKickoffTimeColombia,
  getMonthCalendarDays,
  getMonthDayStrings,
  kickoffDateColombia,
  shiftIsoDateColombia,
} from "@/frontend/lib/date-utils";

describe("date-utils (Colombia)", () => {
  it("shifts calendar dates without UTC rollback", () => {
    expect(shiftIsoDateColombia("2026-05-20", 1)).toBe("2026-05-21");
    expect(shiftIsoDateColombia("2026-05-20", -1)).toBe("2026-05-19");
  });

  it("maps kickoff ISO to Colombia calendar date", () => {
    // 2026-05-21 02:30 UTC = 2026-05-20 21:30 Bogota
    expect(kickoffDateColombia("2026-05-21T02:30:00+00:00")).toBe("2026-05-20");
    // 2026-05-21 15:00 UTC = 2026-05-21 10:00 Bogota
    expect(kickoffDateColombia("2026-05-21T15:00:00+00:00")).toBe("2026-05-21");
  });

  it("filters fixtures to selected Colombia date", () => {
    const fixtures = [
      { kickoff: "2026-05-21T15:00:00+00:00" }, // 2026-05-21 Bogota
      { kickoff: "2026-05-23T15:00:00+00:00" }, // 2026-05-23 Bogota
    ];
    expect(fixturesForCalendarDate(fixtures, "2026-05-21")).toHaveLength(1);
  });

  it("builds month grid with stable ISO dates", () => {
    const days = getMonthCalendarDays(2026, 4); // May 2026
    expect(days).toHaveLength(42);
    expect(days.filter((d) => d.isCurrentMonth)).toHaveLength(31);
    expect(getMonthDayStrings(2026, 4)).toHaveLength(31);
    expect(days.find((d) => d.date === "2026-05-01")?.isCurrentMonth).toBe(true);
  });

  it("formats kickoff in Colombia with a. m. / p. m. and COT suffix", () => {
    // 2026-05-21 20:00 UTC = 15:00 Bogota (3 p. m.)
    expect(formatKickoffTimeColombia("2026-05-21T20:00:00+00:00")).toMatch(/03:00 p\. m\. COT/);
    // 2026-05-21 07:00 UTC = 02:00 Bogota (2 a. m.)
    expect(formatKickoffTimeColombia("2026-05-21T07:00:00+00:00")).toMatch(/02:00 a\. m\. COT/);
    const label = formatKickoffColombia("2026-05-21T20:00:00+00:00");
    expect(label.time).toMatch(/03:00 p\. m\. COT/);
    expect(label.label).toContain("03:00 p. m. COT");
  });
});
