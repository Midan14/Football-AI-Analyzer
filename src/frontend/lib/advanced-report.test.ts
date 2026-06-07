import { describe, expect, it } from "vitest";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { buildAdvancedReport } from "./advanced-report";

describe("buildAdvancedReport", () => {
  const fixture = demoFixtures[0];
  const analysis = analyzeFixture(fixture);
  const report = buildAdvancedReport(fixture, analysis);

  it("produces exactly 27 sections, indexed 1..27", () => {
    expect(report.sections).toHaveLength(27);
    report.sections.forEach((s, i) => {
      expect(s.index).toBe(i + 1);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.paragraphs.length).toBeGreaterThan(0);
    });
  });

  it("grounds the value section in the real value table", () => {
    const valueSection = report.sections.find((s) => s.index === 9);
    expect(valueSection?.figure?.kind).toBe("groupedBars");
    expect(valueSection?.table?.rows.length).toBe(analysis.valueTable.length);
  });

  it("includes a radar figure with the expected axes", () => {
    const radar = report.sections.find((s) => s.index === 23);
    expect(radar?.figure?.kind).toBe("radar");
    if (radar?.figure?.kind === "radar") {
      expect(radar.figure.axes.map((a) => a.axis)).toContain("Forma");
    }
  });

  it("marks the quantum module as experimental (non-influential)", () => {
    const quantum = report.sections.find((s) => s.index === 15);
    expect(quantum?.caveats?.join(" ")).toMatch(/EXPERIMENTAL|experimental/);
  });

  it("returns coverage caveats as an array", () => {
    expect(Array.isArray(report.coverageCaveats)).toBe(true);
  });
});
