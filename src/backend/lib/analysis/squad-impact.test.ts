import { describe, expect, it } from "vitest";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import { expectedGoals } from "./shared-math";
import { buildHeuristicContextAdjustment, squadAttackMultiplier } from "./squad-impact";

describe("squad-impact", () => {
  it("reduces home xG when local squad has high-impact injuries", () => {
    const base = demoFixtures[0];
    const injured = {
      ...base,
      squad: {
        home: {
          injuries: [
            { player: "Striker", position: "Forward", status: "injured", impact: 9 },
            { player: "Mid", position: "Midfielder", status: "out", impact: 8 },
          ],
          suspensions: [{ player: "CB", position: "Defender" }],
          lastLineup: [],
          tacticalChangeRisk: 40,
        },
        away: {
          injuries: [],
          suspensions: [],
          lastLineup: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
          tacticalChangeRisk: 10,
        },
      },
      coverage: { ...base.coverage, hasLineups: false, hasInjuries: true },
      home: { ...base.home, keyPlayerStatus: "injured" as const },
    };

    const baseline = expectedGoals(base);
    const adjusted = expectedGoals(injured, buildHeuristicContextAdjustment(injured));
    expect(adjusted.home).toBeLessThan(baseline.home);
  });

  it("squadAttackMultiplier respects lineup confirmation", () => {
    const squad = {
      injuries: [{ player: "X", position: "MF", status: "doubt", impact: 4 }],
      suspensions: [],
      lastLineup: [],
      tacticalChangeRisk: 20,
    };
    const unconfirmed = squadAttackMultiplier(squad, "available", false, 35);
    const confirmed = squadAttackMultiplier(squad, "available", true, 35);
    expect(unconfirmed).toBeLessThan(confirmed);
  });
});
