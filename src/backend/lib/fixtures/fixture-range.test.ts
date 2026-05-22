import { describe, expect, it } from "vitest";
import { enumerateIsoDates, filterFixturesByCountry } from "@/backend/lib/fixtures/fixture-range";
import type { Fixture } from "@/shared/domain";

describe("fixture-range", () => {
  it("enumerates inclusive ISO dates up to 31 days", () => {
    expect(enumerateIsoDates("2026-05-01", "2026-05-03")).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });

  it("rejects ranges over 31 days", () => {
    expect(() => enumerateIsoDates("2026-05-01", "2026-06-05")).toThrow(/31/);
  });

  it("filters fixtures by country when league is not scoped", () => {
    const fixtures = [
      { id: "1", countryId: "spain" },
      { id: "2", countryId: "england" },
    ] as Fixture[];
    expect(filterFixturesByCountry(fixtures, "spain")).toHaveLength(1);
  });
});
