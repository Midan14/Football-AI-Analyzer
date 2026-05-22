import type { Fixture, MatchLineup } from "@/shared/domain";

/** Align coverage flags with data actually loaded for Match Center. */
export function syncFixtureCoverageFromMatchData(
  fixture: Fixture,
  data: {
    lineups?: MatchLineup[];
    hasInjuriesOverride?: boolean;
    refereeName?: string | null;
  }
): Fixture {
  const lineups = data.lineups ?? [];
  const hasConfirmedLineups =
    lineups.length >= 2 &&
    lineups.some((l) => (l.startXI?.length ?? 0) > 0);

  const hasInjuries =
    data.hasInjuriesOverride ??
    Boolean(
      fixture.squad &&
        (fixture.squad.home.injuries.length > 0 || fixture.squad.away.injuries.length > 0)
    );

  const refereeName = data.refereeName ?? fixture.referee?.name;
  const hasReferee = Boolean(refereeName && refereeName.trim().length > 0);

  const referee = hasReferee
    ? {
        name: refereeName!,
        avgCards: fixture.referee?.avgCards ?? 4,
        avgPenalties: fixture.referee?.avgPenalties ?? 0.3,
        strictness: fixture.referee?.strictness ?? ("medium" as const),
        homeBias: fixture.referee?.homeBias ?? 0,
        controversyHistory: fixture.referee?.controversyHistory ?? [],
        lastMatches: fixture.referee?.lastMatches ?? 20,
      }
    : fixture.referee;

  return {
    ...fixture,
    referee,
    coverage: {
      ...fixture.coverage,
      hasLineups: hasConfirmedLineups || fixture.coverage.hasLineups,
      hasInjuries: hasInjuries,
      hasReferee: hasReferee,
    },
  };
}
