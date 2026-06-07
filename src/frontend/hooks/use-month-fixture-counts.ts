"use client";

import { useMemo } from "react";
import { useFixturesRange } from "@/frontend/hooks/use-fixtures-range";
import { getMonthDayStrings } from "@/frontend/lib/date-utils";

export function useMonthFixtureCounts(
  year: number,
  monthIndex: number,
  options?: { leagueId?: string; countryId?: string; enabled?: boolean }
) {
  const monthDays = useMemo(() => getMonthDayStrings(year, monthIndex), [year, monthIndex]);
  const from = monthDays[0] ?? "";
  const to = monthDays[monthDays.length - 1] ?? "";
  const enabled = options?.enabled !== false;

  const { data, isLoading } = useFixturesRange(from, to, {
    leagueId: options?.leagueId,
    countryId: options?.countryId,
    includeFixtures: false,
    enabled: enabled && monthDays.length > 0,
  });

  return {
    counts: data?.counts ?? {},
    isLoading,
  };
}
