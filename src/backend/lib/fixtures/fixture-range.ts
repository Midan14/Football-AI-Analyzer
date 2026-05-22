import type { Fixture } from "@/shared/domain";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function shiftIsoDate(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  return new Date(utc).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export function isValidIsoDate(date: string): boolean {
  return ISO_DATE.test(date);
}

/** Inclusive date range (Colombia calendar strings), max 31 days. */
export function enumerateIsoDates(from: string, to: string, maxDays = 31): string[] {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
    throw new Error("from y to deben ser YYYY-MM-DD");
  }
  if (from > to) throw new Error("from no puede ser posterior a to");

  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    if (dates.length > maxDays) {
      throw new Error(`El rango no puede superar ${maxDays} días`);
    }
    current = shiftIsoDate(current, 1);
  }
  return dates;
}

export function filterFixturesByCountry(fixtures: Fixture[], countryId?: string): Fixture[] {
  if (!countryId) return fixtures;
  return fixtures.filter((fixture) => fixture.countryId === countryId);
}
