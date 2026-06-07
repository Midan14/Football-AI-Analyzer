import { test, expect } from "@playwright/test";
import { DEMO_FIXTURE_ID, expectMatchCenterVisible, matchCenterUrl } from "./helpers";

test.describe("Flujo login → partido → análisis", () => {
  test("usuario autenticado abre Match Center y recibe análisis del API", async ({ page, request }) => {
    await page.goto(matchCenterUrl());

    await expect(page.getByRole("navigation", { name: /navegación principal/i })).toBeVisible({
      timeout: 60_000,
    });

    await expectMatchCenterVisible(page);

    const analyzeResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/analyze/${DEMO_FIXTURE_ID}`) &&
        res.request().method() === "GET" &&
        res.status() === 200,
      { timeout: 90_000 }
    );

    await expect(
      page.getByText(/ejecutando modelos|analizando partido|cargando partido/i).first()
    ).toBeVisible({ timeout: 15_000 }).catch(() => {});

    const response = await analyzeResponse;
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.analysis?.confidence?.score).toBeGreaterThan(0);
    expect(body.data?.analysis?.recommendation?.market).toBeTruthy();

    await expect(
      page.getByText(/confianza|recomendación|mercado|stake/i).first()
    ).toBeVisible({ timeout: 60_000 });
  });

  test("modo conservador + rotación ajusta confianza en el API", async ({ request }) => {
    const baseRes = await request.get(`/api/analyze/${DEMO_FIXTURE_ID}?modelMode=Balanceado&scenario=base`);
    expect(baseRes.ok()).toBeTruthy();
    const baseJson = await baseRes.json();
    const baseScore = baseJson.data?.analysis?.confidence?.score as number;

    const adjustedRes = await request.get(
      `/api/analyze/${DEMO_FIXTURE_ID}?modelMode=Conservador&scenario=rotation`
    );
    expect(adjustedRes.ok()).toBeTruthy();
    const adjustedJson = await adjustedRes.json();
    const adjusted = adjustedJson.data?.analysis?.confidence;

    expect(adjusted?.baseScore).toBeDefined();
    expect(adjusted?.adjustments?.modelMode).toBe("Conservador");
    expect(adjusted?.adjustments?.scenario).toBe("rotation");
    expect(adjusted?.score).toBeLessThan(baseScore);
  });
});
