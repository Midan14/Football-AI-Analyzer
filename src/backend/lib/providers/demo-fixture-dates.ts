import type { Fixture } from "@/shared/domain";
import { kickoffDateColombia, shiftIsoDateColombia, todayIsoDateColombia } from "@/backend/lib/fixtures/colombia-date";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import { demoLiveFixtures } from "@/backend/lib/providers/demo-live-data";

/** Calendar day offset from today (Colombia) for each demo fixture */
const DAY_OFFSET_BY_ID: Record<string, number> = {
  "fixture-arsenal-brighton": 0,
  "fixture-river-lanus": 0,
  "fixture-oldham-york": 0,
  "fixture-juarez-monterrey-f": 1,
  "fixture-finished-demo": -1,
  "demo-live-arsenal-brighton": 0,
  "demo-live-real-barca": 0,
};

function shiftKickoffToDate(kickoff: string, targetDate: string): string {
  const timePart = kickoff.length >= 11 ? kickoff.slice(10) : "T15:00:00-05:00";
  return `${targetDate}${timePart}`;
}

function withRelativeKickoffs(fixtures: Fixture[]): Fixture[] {
  const today = todayIsoDateColombia();
  return fixtures.map((fixture) => {
    const offset = DAY_OFFSET_BY_ID[fixture.id] ?? 0;
    const targetDate = shiftIsoDateColombia(today, offset);
    return { ...fixture, kickoff: shiftKickoffToDate(fixture.kickoff, targetDate) };
  });
}

export function getDatedDemoFixtures(): Fixture[] {
  return withRelativeKickoffs(demoFixtures);
}

export function getDatedDemoLiveFixtures(): Fixture[] {
  return withRelativeKickoffs(demoLiveFixtures);
}

export function filterDemoFixturesByDate(fixtures: Fixture[], date?: string): Fixture[] {
  if (!date) return fixtures;
  return fixtures.filter((fixture) => kickoffDateColombia(fixture.kickoff) === date);
}
