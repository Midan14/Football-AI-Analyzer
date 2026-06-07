import { describe, expect, it } from "vitest";
import {
  apiFootballSeasonForDate,
  isCalendarYearCountry,
  pickSeasonYearFromLeagueDetail,
  resolveMaxFixturesPerDay,
} from "@/backend/lib/providers/api-football-season";

describe("apiFootballSeasonForDate", () => {
  it("uses calendar year for Mexico", () => {
    expect(apiFootballSeasonForDate(new Date("2026-01-15T12:00:00"), "mexico")).toBe(2026);
    expect(apiFootballSeasonForDate(new Date("2026-05-23T12:00:00"), "Mexico")).toBe(2026);
  });

  it("uses split year for Spain", () => {
    expect(apiFootballSeasonForDate(new Date("2026-01-15T12:00:00"), "spain")).toBe(2025);
    expect(apiFootballSeasonForDate(new Date("2026-08-01T12:00:00"), "spain")).toBe(2026);
  });
});

describe("pickSeasonYearFromLeagueDetail", () => {
  it("prefers season range covering the date", () => {
    const year = pickSeasonYearFromLeagueDetail(
      {
        seasons: [
          { year: 2024, start: "2024-08-01", end: "2025-05-31" },
          { year: 2025, start: "2025-08-01", end: "2026-05-31", current: true },
        ],
      },
      new Date("2026-05-23T12:00:00"),
      "spain"
    );
    expect(year).toBe(2025);
  });

  it("falls back to current season", () => {
    const year = pickSeasonYearFromLeagueDetail(
      {
        seasons: [{ year: 2025, start: "2025-07-01", end: "2025-12-15", current: true }],
      },
      new Date("2026-05-23T12:00:00"),
      "mexico"
    );
    expect(year).toBe(2025);
  });
});

describe("isCalendarYearCountry", () => {
  it("recognizes Mexico and Colombia", () => {
    expect(isCalendarYearCountry("mexico")).toBe(true);
    expect(isCalendarYearCountry("colombia")).toBe(true);
    expect(isCalendarYearCountry("spain")).toBe(false);
  });
});

describe("resolveMaxFixturesPerDay", () => {
  it("returns null when unset (no artificial cap)", () => {
    const prev = process.env.API_FOOTBALL_MAX_FIXTURES_PER_DAY;
    delete process.env.API_FOOTBALL_MAX_FIXTURES_PER_DAY;
    expect(resolveMaxFixturesPerDay()).toBeNull();
    if (prev === undefined) delete process.env.API_FOOTBALL_MAX_FIXTURES_PER_DAY;
    else process.env.API_FOOTBALL_MAX_FIXTURES_PER_DAY = prev;
  });
});
