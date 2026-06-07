import { describe, expect, it } from "vitest";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("buildTacticalRadar integration", () => {
  it("genera valores distintos por equipo y radares HT/FT diferentes", () => {
    const result = analyzeFixture(demoFixtures[0]);
    const forma = result.radar.find((r) => r.axis === "Forma");

    expect(forma).toBeDefined();
    expect(forma!.home).not.toEqual(forma!.away);

    const ftAttack = result.radar.find((r) => r.axis === "Ataque");
    const htAttack = result.radarHalfTime?.find((r) => r.axis === "Ataque");
    expect(htAttack).toBeDefined();
    expect(htAttack!.home).not.toEqual(ftAttack!.home);
  });

  it("expone value como promedio home/away para compatibilidad", () => {
    const result = analyzeFixture(demoFixtures[0]);
    for (const row of result.radar) {
      expect(row.value).toBeCloseTo((row.home + row.away) / 2, 0);
    }
  });
});
