const BOGOTA_TZ = "America/Bogota";

/** YYYY-MM-DD for today in Colombia */
export function todayIsoDateColombia(): string {
  return formatIsoDateColombia(new Date());
}

/** Shift a YYYY-MM-DD calendar date by N days (Colombia calendar, no UTC drift) */
export function shiftIsoDateColombia(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Anchor at noon UTC to avoid DST edge cases when adding days
  const utc = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  return formatIsoDateColombia(new Date(utc));
}

/** Match fixture kickoff to selected calendar day in Colombia */
export function kickoffDateColombia(kickoff: string): string {
  const parsed = new Date(kickoff);
  if (Number.isNaN(parsed.getTime())) return kickoff.slice(0, 10);
  return formatIsoDateColombia(parsed);
}

export function formatIsoDateColombia(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

export function formatDateChipLabel(date: string, _selectedDate?: string): string {
  const today = todayIsoDateColombia();
  const yesterday = shiftIsoDateColombia(today, -1);
  const tomorrow = shiftIsoDateColombia(today, 1);

  if (date === today) return "Hoy";
  if (date === yesterday) return "Ayer";
  if (date === tomorrow) return "Mañana";

  const parsed = new Date(`${date}T12:00:00Z`);
  return parsed.toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: BOGOTA_TZ,
  });
}

export type CalendarDayCell = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
};

/** Build a 6-row month grid (Sun–Sat) using Colombia calendar dates (no UTC drift). */
export function getMonthCalendarDays(year: number, monthIndex: number): CalendarDayCell[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStr = pad(monthIndex + 1);
  const firstOfMonth = `${year}-${monthStr}-01`;
  const lastDayNum = new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, monthIndex, 1, 12)).getUTCDay();
  const lastOfMonth = `${year}-${monthStr}-${pad(lastDayNum)}`;

  const days: CalendarDayCell[] = [];

  for (let i = 0; i < firstDow; i++) {
    const date = shiftIsoDateColombia(firstOfMonth, -(firstDow - i));
    days.push({ date, day: Number(date.slice(8, 10)), isCurrentMonth: false });
  }

  for (let d = 1; d <= lastDayNum; d++) {
    days.push({ date: `${year}-${monthStr}-${pad(d)}`, day: d, isCurrentMonth: true });
  }

  let offset = 1;
  while (days.length < 42) {
    const date = shiftIsoDateColombia(lastOfMonth, offset);
    days.push({ date, day: Number(date.slice(8, 10)), isCurrentMonth: false });
    offset++;
  }

  return days;
}

/** All YYYY-MM-DD strings belonging to the visible month (excludes padding cells). */
export function getMonthDayStrings(year: number, monthIndex: number): string[] {
  return getMonthCalendarDays(year, monthIndex)
    .filter((cell) => cell.isCurrentMonth)
    .map((cell) => cell.date);
}

export function fixturesForCalendarDate<T extends { kickoff: string }>(
  fixtures: T[],
  selectedDate: string
): T[] {
  return fixtures.filter((fixture) => kickoffDateColombia(fixture.kickoff) === selectedDate);
}
