import { test, expect } from "@playwright/test";
import { DEMO_FIXTURE_ID, expectMatchCenterVisible, mainNav, matchCenterUrl, analyzeRequestMatches } from "./helpers";

test.describe("Modo y escenario desde Configuración", () => {
  test("cambiar Conservador + Rotación refetch del análisis en Match Center", async ({ page }) => {
    await page.goto(matchCenterUrl());

    const nav = mainNav(page);
    await expect(nav).toBeVisible({
      timeout: 60_000,
    });

    const baselineResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/analyze/${DEMO_FIXTURE_ID}`) &&
        res.request().method() === "GET" &&
        res.status() === 200,
      { timeout: 90_000 }
    );
    const baseline = await baselineResponse;
    const baselineJson = await baseline.json();
    const baselineScore = baselineJson.data?.analysis?.confidence?.score as number;
    expect(baselineScore).toBeGreaterThan(0);

    await nav.getByRole("button", { name: "Configuración", exact: true }).click();
    await expect(page.getByRole("heading", { name: /configuración/i })).toBeVisible();

    await page
      .locator(".cfg-card")
      .filter({ has: page.getByRole("heading", { name: /modo del modelo/i }) })
      .getByRole("button", { name: "Conservador" })
      .click();

    await page
      .locator(".cfg-card")
      .filter({ has: page.getByRole("heading", { name: /escenario base/i }) })
      .getByRole("button", { name: "Rotación probable" })
      .click();

    await expect(page.getByText(/activo:\s*Conservador/i)).toBeVisible();
    await expect(page.getByText(/activo:\s*rotation/i)).toBeVisible();

    await nav.getByRole("button", { name: "Match Center", exact: true }).click();

    const adjusted = await page.waitForResponse(
      (res) =>
        analyzeRequestMatches(res.url(), DEMO_FIXTURE_ID, "Conservador", "rotation") &&
        res.request().method() === "GET" &&
        res.status() === 200,
      { timeout: 90_000 }
    );

    await expectMatchCenterVisible(page);
    const adjustedJson = await adjusted.json();
    const confidence = adjustedJson.data?.analysis?.confidence;

    expect(confidence?.adjustments?.modelMode).toBe("Conservador");
    expect(confidence?.adjustments?.scenario).toBe("rotation");
    expect(confidence?.score).toBeLessThan(baselineScore);

    await expect(page.getByText(/confianza|recomendación|mercado|stake/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });
});
