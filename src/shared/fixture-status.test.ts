import { describe, expect, it } from "vitest";
import {
  fixtureStatusLabelEs,
  isFixturePostponedOrCancelled,
  mapApiFootballStatusShort,
} from "@/shared/fixture-status";

describe("fixture-status", () => {
  it("maps API-Football PST to postponed", () => {
    const mapped = mapApiFootballStatusShort("PST", "Match Postponed");
    expect(mapped.status).toBe("postponed");
    expect(mapped.statusLong).toBe("Match Postponed");
  });

  it("maps API-Football CANC to cancelled", () => {
    const mapped = mapApiFootballStatusShort("CANC", "Match Cancelled");
    expect(mapped.status).toBe("cancelled");
  });

  it("maps NS to pre-match", () => {
    expect(mapApiFootballStatusShort("NS").status).toBe("pre-match");
  });

  it("labels postponed/cancelled in Spanish", () => {
    expect(fixtureStatusLabelEs("postponed", "Pospuesto por lluvia")).toBe("Pospuesto por lluvia");
    expect(fixtureStatusLabelEs("cancelled")).toBe("Cancelado");
    expect(isFixturePostponedOrCancelled("postponed")).toBe(true);
    expect(isFixturePostponedOrCancelled("live")).toBe(false);
  });
});
