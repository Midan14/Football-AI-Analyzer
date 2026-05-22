import type { Page } from "@playwright/test";

export const DEMO_FIXTURE_ID =
  process.env.E2E_FIXTURE_ID ?? "fixture-arsenal-brighton";

export function mainNav(page: Page) {
  return page.getByRole("navigation", { name: /navegación principal/i });
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
