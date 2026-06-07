type LeagueSeasonRow = {
  year: number;
  start?: string;
  end?: string;
  current?: boolean;
};

type LeagueSeasonSource = {
  seasons?: LeagueSeasonRow[];
};

/** Liga MX, MLS, South America split-year, etc. use calendar-year season labels in API-Football. */
export function isCalendarYearCountry(countryName?: string): boolean {
  const country = (countryName ?? "").toLowerCase().replace(/-/g, " ");
  return [
    "argentina",
    "brazil",
    "brasil",
    "colombia",
    "chile",
    "ecuador",
    "paraguay",
    "uruguay",
    "peru",
    "venezuela",
    "bolivia",
    "mexico",
    "costa-rica",
    "costa rica",
    "honduras",
    "guatemala",
    "el-salvador",
    "el salvador",
    "panama",
    "nicaragua",
    "jamaica",
    "united states",
    "usa",
    "canada",
    "japan",
    "korea",
    "china",
    "sweden",
    "norway",
    "finland",
    "iceland",
  ].some((name) => country.includes(name));
}

export function apiFootballSeasonForDate(date = new Date(), countryName?: string): number {
  const year = date.getFullYear();
  if (isCalendarYearCountry(countryName)) return year;
  return date.getMonth() < 6 ? year - 1 : year;
}

function isoDateFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Pick the API-Football season year that covers the given calendar date. */
export function pickSeasonYearFromLeagueDetail(
  item: LeagueSeasonSource,
  date: Date,
  countryName?: string
): number {
  const iso = isoDateFromDate(date);
  const seasons = item.seasons ?? [];
  const inRange = seasons.find(
    (row) => row.start && row.end && iso >= row.start && iso <= row.end
  );
  if (inRange) return inRange.year;

  const current = seasons.find((row) => row.current);
  if (current) return current.year;

  const latest = seasons[seasons.length - 1];
  if (latest) return latest.year;

  return apiFootballSeasonForDate(date, countryName);
}

export function resolveMaxFixturesPerDay(): number | null {
  const raw = process.env.API_FOOTBALL_MAX_FIXTURES_PER_DAY?.trim();
  if (!raw || raw === "0" || raw.toLowerCase() === "unlimited") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(50, parsed);
}
