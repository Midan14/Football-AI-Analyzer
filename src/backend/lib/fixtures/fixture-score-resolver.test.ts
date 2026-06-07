import { describe, expect, it } from "vitest";
import {
  isSuspiciousMatchResult,
  reconcileFixtureResult,
  resolveApiFootballGoals,
  resolveGoalsFromEvents,
} from "@/backend/lib/fixtures/fixture-score-resolver";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import type { MatchEvent } from "@/shared/domain";

describe("resolveApiFootballGoals", () => {
  it("usa score.fulltime cuando goals viene 0-0 en partido finalizado", () => {
    const goals = resolveApiFootballGoals({
      goals: { home: 0, away: 0 },
      score: {
        halftime: { home: 4, away: 0 },
        fulltime: { home: 7, away: 0 },
      },
      fixture: { status: { short: "FT" } },
    });

    expect(goals).toEqual({ homeGoals: 7, awayGoals: 0 });
  });

  it("prioriza goals cuando trae marcador válido", () => {
    const goals = resolveApiFootballGoals({
      goals: { home: 2, away: 1 },
      score: { fulltime: { home: 2, away: 1 } },
      fixture: { status: { short: "FT" } },
    });

    expect(goals).toEqual({ homeGoals: 2, awayGoals: 1 });
  });
});

describe("reconcileFixtureResult", () => {
  const baseFixture = {
    ...demoFixtures[0],
    status: "final" as const,
    home: { ...demoFixtures[0].home, name: "Voitsberg" },
    away: { ...demoFixtures[0].away, name: "LASK Juniors" },
    result: {
      homeGoals: 0,
      awayGoals: 0,
      totalGoals: 0,
      bttsActual: false,
      firstHalfHome: 4,
      firstHalfAway: 0,
    },
  };

  it("corrige 0-0 final usando eventos de gol", () => {
    const events: MatchEvent[] = Array.from({ length: 7 }).map((_, index) => ({
      time: 10 + index,
      team: "Voitsberg",
      player: `Jugador ${index + 1}`,
      type: "Goal",
      detail: "Normal Goal",
    }));

    const fixed = reconcileFixtureResult(baseFixture, events);
    expect(fixed.result?.homeGoals).toBe(7);
    expect(fixed.result?.awayGoals).toBe(0);
  });
});

describe("resolveGoalsFromEvents", () => {
  it("ignora penaltis fallados y goles anulados", () => {
    const goals = resolveGoalsFromEvents(
      [
        { type: "Goal", detail: "Normal Goal", team: "Home FC" },
        { type: "Goal", detail: "Missed Penalty", team: "Home FC" },
        { type: "Goal", detail: "Goal cancelled", team: "Away FC" },
      ],
      "Home FC",
      "Away FC"
    );

    expect(goals).toEqual({ homeGoals: 1, awayGoals: 0 });
  });
});

describe("isSuspiciousMatchResult", () => {
  it("detecta marcador inconsistente HT > FT", () => {
    expect(
      isSuspiciousMatchResult({
        status: "final",
        result: {
          homeGoals: 0,
          awayGoals: 0,
          totalGoals: 0,
          bttsActual: false,
          firstHalfHome: 4,
          firstHalfAway: 0,
        },
      })
    ).toBe(true);
  });
});
