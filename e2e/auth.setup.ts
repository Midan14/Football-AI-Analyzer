import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join("e2e", ".auth", "user.json");

setup("authenticate test user", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL ?? "user@football-ai.com";
  const password = process.env.E2E_USER_PASSWORD ?? "user123456";

  await page.goto("/auth/signin");
  await page.getByPlaceholder("admin@football-ai.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: /navegación principal/i })).toBeVisible();

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
