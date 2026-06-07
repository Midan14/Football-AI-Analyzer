const BOGOTA_TZ = "America/Bogota";

export function todayIsoDateColombia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

export function shiftIsoDateColombia(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  return new Date(utc).toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

export function kickoffDateColombia(kickoff: string): string {
  const parsed = new Date(kickoff);
  if (Number.isNaN(parsed.getTime())) return kickoff.slice(0, 10);
  return parsed.toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}
