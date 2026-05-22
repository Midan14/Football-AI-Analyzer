import type { Fixture } from "@/shared/domain";

function csvEscape(value: string | number): string {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatKickoffCsv(kickoff: string): string {
  const d = new Date(kickoff);
  return d.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function buildCalendarDayCsv(date: string, fixtures: Fixture[]): string {
  const header = [
    "fecha",
    "hora",
    "liga",
    "local",
    "visitante",
    "estado",
    "marcador",
    "cuota_local",
    "cuota_empate",
    "cuota_visitante",
  ].join(",");

  const rows = fixtures.map((fixture) => {
    const score = fixture.result
      ? `${fixture.result.homeGoals}-${fixture.result.awayGoals}`
      : "";
    return [
      date,
      formatKickoffCsv(fixture.kickoff),
      fixture.leagueName,
      fixture.home.name,
      fixture.away.name,
      fixture.status,
      score,
      fixture.market.homeWinOdds || "",
      fixture.market.drawOdds || "",
      fixture.market.awayWinOdds || "",
    ]
      .map(csvEscape)
      .join(",");
  });

  return [header, ...rows].join("\n");
}

export function downloadCalendarDayCsv(date: string, fixtures: Fixture[]): void {
  const csv = buildCalendarDayCsv(date, fixtures);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `partidos-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export type CalendarShareParams = {
  date: string;
  countryId?: string;
  leagueId?: string;
};

export function buildCalendarShareUrl(params: CalendarShareParams): string {
  const search = new URLSearchParams({
    view: "Calendario",
    date: params.date,
  });
  if (params.countryId) search.set("countryId", params.countryId);
  if (params.leagueId) search.set("leagueId", params.leagueId);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
  return `${origin}${path}?${search.toString()}`;
}

export async function copyCalendarShareLink(params: CalendarShareParams): Promise<string> {
  const url = buildCalendarShareUrl(params);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
  }
  return url;
}

export type CalendarUrlState = {
  view?: string;
  date?: string;
  countryId?: string;
  leagueId?: string;
  fixtureId?: string;
};

export function parseCalendarUrlState(search: string): CalendarUrlState {
  const params = new URLSearchParams(search);
  return {
    view: params.get("view") ?? undefined,
    date: params.get("date") ?? undefined,
    countryId: params.get("countryId") ?? undefined,
    leagueId: params.get("leagueId") ?? undefined,
    fixtureId: params.get("fixtureId") ?? undefined,
  };
}

export function buildDashboardUrl(state: CalendarUrlState): string {
  const params = new URLSearchParams();
  if (state.view) params.set("view", state.view);
  if (state.date) params.set("date", state.date);
  if (state.countryId) params.set("countryId", state.countryId);
  if (state.leagueId) params.set("leagueId", state.leagueId);
  if (state.fixtureId) params.set("fixtureId", state.fixtureId);
  const qs = params.toString();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
  return qs ? `${origin}${path}?${qs}` : `${origin}${path}`;
}

/** Keep the address bar in sync with dashboard navigation (shareable deep links). */
export function syncDashboardUrl(state: CalendarUrlState): void {
  if (typeof window === "undefined") return;
  const next = buildDashboardUrl(state);
  const current = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  window.history.replaceState(null, "", next);
}

/** Merge partial state onto the current query string (for view-specific URL updates). */
export function mergeDashboardUrl(patch: CalendarUrlState): void {
  if (typeof window === "undefined") return;
  const current = parseCalendarUrlState(window.location.search);
  syncDashboardUrl({ ...current, ...patch });
}

export function getHeatmapTier(count: number, maxInMonth: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (maxInMonth <= 1) return 4;
  const ratio = count / maxInMonth;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}
