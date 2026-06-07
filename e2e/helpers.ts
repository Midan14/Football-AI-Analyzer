import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const DEMO_FIXTURE_ID =
  process.env.E2E_FIXTURE_ID ?? "fixture-arsenal-brighton";

export function mainNav(page: Page) {
  return page.getByRole("navigation", { name: /navegación principal/i });
}

/** Visible Match Center content (avoids hidden `<option>` nodes in fixture selectors). */
export async function expectMatchCenterVisible(page: Page) {
  await expect(page.locator(".qa-card").getByText(/arsenal/i).first()).toBeVisible({
    timeout: 60_000,
  });
}

export function matchCenterUrl(fixtureId = DEMO_FIXTURE_ID): string {
  return `/dashboard?view=${encodeURIComponent("Match Center")}&fixtureId=${encodeURIComponent(fixtureId)}`;
}

export function analyzeRequestMatches(
  url: string,
  fixtureId: string,
  modelMode: string,
  scenario: string
): boolean {
  if (!url.includes(`/api/analyze/${fixtureId}`)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get("modelMode") === modelMode &&
      parsed.searchParams.get("scenario") === scenario
    );
  } catch {
    return false;
  }
}
