export type FixtureStatus = "pre-match" | "live" | "final" | "postponed" | "cancelled";

export function isFixturePostponedOrCancelled(status: FixtureStatus): boolean {
  return status === "postponed" || status === "cancelled";
}

export function fixtureStatusLabelEs(status: FixtureStatus, statusLong?: string): string {
  switch (status) {
    case "live":
      return "En vivo";
    case "final":
      return "Finalizado";
    case "postponed":
      return statusLong?.trim() || "Pospuesto";
    case "cancelled":
      return statusLong?.trim() || "Cancelado";
    default:
      return "Programado";
  }
}

/** API-Football short status codes → domain status */
export function mapApiFootballStatusShort(
  statusShort: string,
  statusLong?: string | null
): { status: FixtureStatus; statusShort: string; statusLong?: string } {
  const s = (statusShort ?? "NS").toUpperCase();
  const long = statusLong?.trim() || undefined;

  if (["PST", "POSTPONED"].includes(s)) {
    return { status: "postponed", statusShort: s, statusLong: long ?? "Pospuesto" };
  }
  if (["CANC", "ABD", "AWD", "WO"].includes(s)) {
    return { status: "cancelled", statusShort: s, statusLong: long ?? "Cancelado" };
  }
  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(s)) {
    return { status: "live", statusShort: s, statusLong: long };
  }
  if (["FT", "AET", "PEN"].includes(s)) {
    return { status: "final", statusShort: s, statusLong: long };
  }
  return { status: "pre-match", statusShort: s, statusLong: long };
}
