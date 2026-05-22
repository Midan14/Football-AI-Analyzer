import type { Fixture } from "@/shared/domain";
import { kickoffDateColombia } from "@/frontend/lib/date-utils";

export type OpenFixtureContext = {
  selectedCountry: string;
  selectedLeague: string;
  selectedDate: string;
  setSelectedCountry: (id: string) => void;
  setSelectedLeague: (id: string) => void;
  setSelectedDate: (date: string) => void;
  setSelectedFixtureId: (id: string) => void;
  setActiveView: (view: string) => void;
  setStatusMessage: (msg: string) => void;
};

export type OpenFixtureOptions = {
  /** Defaults to "Match Center". */
  view?: string;
  statusMessage?: string;
  syncDate?: boolean;
};

/**
 * Navigate to a fixture from any dashboard view with consistent state updates.
 */
export function openFixtureInContext(
  ctx: OpenFixtureContext,
  fixture: Fixture,
  options: OpenFixtureOptions = {}
): void {
  const view = options.view ?? "Match Center";
  const syncDate = options.syncDate ?? true;

  if (syncDate) {
    const fixtureDate = kickoffDateColombia(fixture.kickoff);
    if (fixtureDate !== ctx.selectedDate) {
      ctx.setSelectedDate(fixtureDate);
    }
  }

  if (fixture.countryId && fixture.countryId !== ctx.selectedCountry) {
    ctx.setSelectedCountry(fixture.countryId);
  }
  if (fixture.leagueId && fixture.leagueId !== ctx.selectedLeague) {
    ctx.setSelectedLeague(fixture.leagueId);
  }

  ctx.setSelectedFixtureId(fixture.id);
  ctx.setActiveView(view);
  ctx.setStatusMessage(
    options.statusMessage ?? `${view}: ${fixture.home.name} vs ${fixture.away.name}`
  );
}
