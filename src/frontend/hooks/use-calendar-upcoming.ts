"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { useFixturesRange } from "@/frontend/hooks/use-fixtures-range";
import { mergeOddsIntoFixtures, type FixtureOddsMap } from "@/frontend/lib/merge-fixture-odds";
import { fixturesForCalendarDate, shiftIsoDateColombia, todayIsoDateColombia } from "@/frontend/lib/date-utils";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type UpcomingDay = {
  date: string;
  fixtures: Fixture[];
};

async function fetchOddsByDate(date: string, leagueId?: string): Promise<FixtureOddsMap> {
  const params = new URLSearchParams({ date });
  if (leagueId) params.set("leagueId", leagueId);
  const response = await fetch(`/api/odds/by-date?${params.toString()}`);
  if (!response.ok) return {};
  const data = unwrapApiData(await response.json() as { odds: FixtureOddsMap; count: number });
  return data.odds ?? {};
}

export function useCalendarUpcoming(
  dayCount: number,
  enabled: boolean,
  options?: { leagueId?: string; countryId?: string }
) {
  const today = todayIsoDateColombia();
  const from = today;
  const to = shiftIsoDateColombia(today, Math.max(0, dayCount - 1));

  const dates = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => shiftIsoDateColombia(today, i)),
    [dayCount, today]
  );

  const { data, isLoading: rangeLoading } = useFixturesRange(from, to, {
    leagueId: options?.leagueId,
    countryId: options?.countryId,
    includeFixtures: true,
    enabled: enabled && dayCount > 0,
  });

  const oddsDates = useMemo(() => {
    if (!data?.fixturesByDate) return [] as string[];
    return dates
      .filter((date) => (data.fixturesByDate?.[date]?.length ?? 0) > 0)
      .slice(0, 3);
  }, [data?.fixturesByDate, dates]);

  const oddsQueries = useQueries({
    queries: dates.map((date) => ({
      queryKey: ["odds-by-date", date, options?.leagueId ?? "all"],
      queryFn: () => fetchOddsByDate(date, options?.leagueId),
      enabled: enabled && oddsDates.includes(date),
      staleTime: 60_000,
    })),
  });

  const upcomingDays = useMemo(() => {
    if (!data?.fixturesByDate) return [] as UpcomingDay[];

    const days: UpcomingDay[] = [];
    dates.forEach((date, index) => {
      const raw = data.fixturesByDate?.[date];
      if (!raw?.length) return;
      const odds = oddsQueries[index]?.data ?? {};
      const merged = mergeOddsIntoFixtures(raw, odds);
      const onDate = fixturesForCalendarDate(merged, date);
      if (onDate.length > 0) {
        days.push({ date, fixtures: onDate });
      }
    });
    return days;
  }, [data?.fixturesByDate, dates, oddsQueries]);

  const oddsLoading = oddsQueries.some((query) => query.isLoading);

  return {
    upcomingDays,
    isLoading: rangeLoading || oddsLoading,
    dates,
  };
}
