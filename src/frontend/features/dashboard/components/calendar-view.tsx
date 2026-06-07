"use client";

import { CalendarDays, Filter, Radio, ChevronLeft, ChevronRight, Star, Loader2, Download, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Country, Fixture, League } from "@/shared/domain";
import { usePagination } from "@/frontend/hooks/use-pagination";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { FAVORITE_TEAM_IDS_KEY } from "@/frontend/lib/favorite-team-storage";
import { useMonthFixtureCounts } from "@/frontend/hooks/use-month-fixture-counts";
import { useCalendarUpcoming } from "@/frontend/hooks/use-calendar-upcoming";
import { useFixtureEdgeHints } from "@/frontend/hooks/use-fixture-edge-hints";
import {
  formatDateChipLabel,
  getMonthCalendarDays,
  shiftIsoDateColombia,
  todayIsoDateColombia,
} from "@/frontend/lib/date-utils";
import {
  copyCalendarShareLink,
  downloadCalendarDayCsv,
  getHeatmapTier,
} from "@/frontend/lib/calendar-export";
import { CalendarFixtureRow } from "./calendar-fixture-row";
import { DataStatusBanner } from "./data-status-banner";

type CalendarViewProps = {
  fixtures: Fixture[];
  leagues: League[];
  countries?: Country[];
  selectedCountry?: string;
  selectedLeague?: string;
  selectedDate: string;
  selectedFixtureId: string;
  loading: boolean;
  oddsLoading?: boolean;
  fixturesDataSource?: string;
  onSelectDate: (date: string) => void;
  onRefresh: () => void;
  onOpenFixture: (fixture: Fixture) => void;
  onStatusMessage?: (message: string) => void;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_ORDER: Record<Fixture["status"], number> = {
  live: 0,
  "pre-match": 1,
  postponed: 2,
  cancelled: 3,
  final: 4,
};

function sortFixtures(list: Fixture[]): Fixture[] {
  return [...list].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });
}

function groupByLeague(list: Fixture[]) {
  const groups = new Map<string, { id: string; league: string; logo?: string; flag?: string; fixtures: Fixture[] }>();
  for (const f of list) {
    if (!groups.has(f.leagueId)) {
      groups.set(f.leagueId, {
        id: f.leagueId,
        league: f.leagueName,
        logo: f.leagueLogo,
        flag: f.leagueFlag,
        fixtures: [],
      });
    }
    groups.get(f.leagueId)!.fixtures.push(f);
  }
  return Array.from(groups.values()).sort((a, b) => a.league.localeCompare(b.league, "es"));
}

function applyFilters(
  list: Fixture[],
  opts: {
    statusFilter: "all" | Fixture["status"];
    leagueFilter: string;
    query: string;
    showFavoritesOnly: boolean;
    favoriteTeams: string[];
  }
) {
  const q = opts.query.toLowerCase();
  return list.filter((fixture) => {
    const statusMatch = opts.statusFilter === "all" || fixture.status === opts.statusFilter;
    const leagueMatch = opts.leagueFilter === "all" || fixture.leagueId === opts.leagueFilter;
    const queryMatch = `${fixture.home.name} ${fixture.away.name} ${fixture.leagueName}`.toLowerCase().includes(q);
    const favMatch =
      !opts.showFavoritesOnly ||
      opts.favoriteTeams.includes(fixture.home.id) ||
      opts.favoriteTeams.includes(fixture.away.id);
    return statusMatch && leagueMatch && queryMatch && favMatch;
  });
}

export function CalendarView({
  fixtures,
  leagues,
  countries = [],
  selectedCountry = "",
  selectedLeague = "",
  selectedDate,
  selectedFixtureId,
  loading,
  oddsLoading = false,
  fixturesDataSource,
  onSelectDate,
  onRefresh,
  onOpenFixture,
  onStatusMessage,
}: CalendarViewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | Fixture["status"]>("all");
  const [calendarQuery, setCalendarQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [favoriteTeams] = useLocalStorage<string[]>(FAVORITE_TEAM_IDS_KEY, []);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "upcoming">("day");
  const [upcomingDayCount, setUpcomingDayCount] = useState(7);
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    setLeagueFilter(selectedLeague || "all");
  }, [selectedLeague]);

  const scopeLeagueId = selectedLeague || undefined;
  const scopeCountryId = selectedCountry && !selectedLeague ? selectedCountry : undefined;

  const today = todayIsoDateColombia();
  const selectedYear = parseInt(selectedDate.slice(0, 4), 10);
  const selectedMonth = parseInt(selectedDate.slice(5, 7), 10) - 1;
  const monthDays = useMemo(() => getMonthCalendarDays(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  const { counts: monthCounts, isLoading: loadingMonthCounts } = useMonthFixtureCounts(selectedYear, selectedMonth, {
    leagueId: scopeLeagueId,
    countryId: scopeCountryId,
    enabled: viewMode === "day",
  });
  const { upcomingDays: upcomingData, isLoading: loadingUpcoming } = useCalendarUpcoming(
    upcomingDayCount,
    viewMode === "upcoming",
    { leagueId: scopeLeagueId, countryId: scopeCountryId }
  );
  const { data: edgeHintsData } = useFixtureEdgeHints(selectedDate, {
    leagueId: scopeLeagueId,
    countryId: scopeCountryId,
    enabled: viewMode === "day" && !loading && fixtures.length > 0,
  });
  const edgeHints = edgeHintsData?.hints ?? {};

  const currentDayCounts = useMemo(() => {
    const c = { ...monthCounts };
    c[selectedDate] = fixtures.length;
    return c;
  }, [monthCounts, selectedDate, fixtures.length]);

  const maxMonthCount = useMemo(
    () => Math.max(0, ...Object.values(currentDayCounts)),
    [currentDayCounts]
  );

  const globalFilterLabel = useMemo(() => {
    const countryName = countries.find((c) => c.id === selectedCountry)?.name;
    const leagueName = leagues.find((l) => l.id === selectedLeague)?.name;
    if (leagueName) return `${countryName ? `${countryName} · ` : ""}${leagueName}`;
    if (countryName) return countryName;
    return null;
  }, [countries, leagues, selectedCountry, selectedLeague]);

  const filterOpts = { statusFilter, leagueFilter, query: calendarQuery, showFavoritesOnly, favoriteTeams };

  const filteredFixtures = useMemo(
    () => sortFixtures(applyFilters(fixtures, filterOpts)),
    [fixtures, statusFilter, leagueFilter, calendarQuery, showFavoritesOnly, favoriteTeams]
  );

  const { page, totalPages, paginatedItems, nextPage: pgNext, prevPage: pgPrev, hasNextPage, hasPrevPage } =
    usePagination(filteredFixtures, 25);

  const groupedByLeague = useMemo(() => groupByLeague(paginatedItems), [paginatedItems]);

  const leagueOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const league of leagues) {
      map.set(league.id, { id: league.id, name: league.name });
    }
    for (const f of fixtures) {
      if (!map.has(f.leagueId)) {
        map.set(f.leagueId, { id: f.leagueId, name: f.leagueName });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [leagues, fixtures]);

  const liveCount = fixtures.filter((f) => f.status === "live").length;
  const preMatchCount = fixtures.filter((f) => f.status === "pre-match").length;
  const finalCount = fixtures.filter((f) => f.status === "final").length;
  const favCount = fixtures.filter(
    (f) => favoriteTeams.includes(f.home.id) || favoriteTeams.includes(f.away.id)
  ).length;

  const prevMonth = () => {
    const anchor = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-15`;
    onSelectDate(shiftIsoDateColombia(anchor, -31));
  };

  const nextMonth = () => {
    const anchor = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-15`;
    onSelectDate(shiftIsoDateColombia(anchor, 31));
  };

  const toggleLeague = (leagueId: string) => {
    setCollapsedLeagues((prev) => ({ ...prev, [leagueId]: !prev[leagueId] }));
  };

  const handleExportCsv = () => {
    downloadCalendarDayCsv(selectedDate, filteredFixtures);
    onStatusMessage?.(`CSV exportado: ${filteredFixtures.length} partidos (${selectedDate})`);
  };

  const handleShareLink = async () => {
    setShareBusy(true);
    try {
      const url = await copyCalendarShareLink({
        date: selectedDate,
        countryId: selectedCountry || undefined,
        leagueId: selectedLeague || undefined,
      });
      onStatusMessage?.(`Enlace copiado: ${url}`);
    } catch {
      onStatusMessage?.("No se pudo copiar el enlace");
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <section className="view-workspace cal-view">
      {(fixturesDataSource === "api-football-quota" ||
        fixturesDataSource === "api-football-rate-limit" ||
        fixturesDataSource === "demo-fallback") && (
        <DataStatusBanner fixturesDataSource={fixturesDataSource} onRefresh={onRefresh} />
      )}

      <article className="cal-header">
        <div className="cal-header-left">
          <CalendarDays size={24} />
          <div>
            <h2>Calendario de Partidos</h2>
            <p>
              {fixtures.length} partidos · {leagueOptions.length} ligas · {formatDateChipLabel(selectedDate)}
              {globalFilterLabel ? ` · Contexto barra: ${globalFilterLabel}` : ""}
              {selectedCountry && !selectedLeague
                ? " · Mostrando todos los partidos del día (filtra abajo por liga)"
                : ""}
              {oddsLoading ? " · Cargando cuotas…" : ""}
            </p>
          </div>
        </div>
        <div className="cal-header-stats">
          {liveCount > 0 && (
            <span className="cal-stat live">
              <Radio size={12} /> {liveCount} en vivo · refresh ~15s
            </span>
          )}
          <span className="cal-stat pre">{preMatchCount} programados</span>
          <span className="cal-stat final">{finalCount} finalizados</span>
          {favCount > 0 && (
            <span className="cal-stat fav">
              <Star size={12} /> {favCount} favoritos
            </span>
          )}
        </div>
        <button type="button" className="cal-export" onClick={handleExportCsv} title="Exportar CSV">
          <Download size={14} /> CSV
        </button>
        <button type="button" className="cal-export" onClick={handleShareLink} disabled={shareBusy} title="Copiar enlace">
          <Link2 size={14} /> {shareBusy ? "Copiando..." : "Compartir"}
        </button>
        <label className="cal-date-picker" title="Ir a fecha">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                onSelectDate(e.target.value);
                setViewMode("day");
              }
            }}
          />
        </label>
        <button type="button" className="cal-refresh" onClick={onRefresh}>
          {loading ? "Actualizando..." : "Refrescar"}
        </button>
      </article>

      <div className="cal-monthly">
        <div className="cal-month-nav">
          <button type="button" onClick={prevMonth} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <strong>
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </strong>
          <button type="button" onClick={nextMonth} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="cal-month-grid">
          <div className="cal-weekdays">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-days">
            {monthDays.map((day) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === today;
              const count = currentDayCounts[day.date] ?? 0;
              const hasFx = count > 0;
              const heat = getHeatmapTier(count, maxMonthCount);
              return (
                <button
                  key={day.date}
                  type="button"
                  className={`cal-day ${!day.isCurrentMonth ? "other-month" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${hasFx ? "has-fixtures" : ""} ${heat > 0 ? `heat-${heat}` : ""}`}
                  onClick={() => {
                    onSelectDate(day.date);
                    setViewMode("day");
                  }}
                  title={hasFx ? `${count} partidos` : undefined}
                >
                  <span>{day.day}</span>
                  {hasFx && (
                    <span className="cal-day-dot">{count > 99 ? "99+" : count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {loadingMonthCounts && <span className="cal-loading-future">Cargando partidos del mes...</span>}
      </div>

      <div className="cal-future-strip">
        <span className="cal-future-label">Vista:</span>
        <button type="button" className={viewMode === "day" ? "active" : ""} onClick={() => setViewMode("day")}>
          Día actual
        </button>
        <button
          type="button"
          className={viewMode === "upcoming" ? "active" : ""}
          onClick={() => setViewMode("upcoming")}
        >
          Próximos {upcomingDayCount} días
        </button>
        <span className="cal-future-sep">|</span>
        <span className="cal-future-label">Ir a:</span>
        {[0, 1, 2, 3, 7, 14, 30].map((offset) => {
          const dateStr = shiftIsoDateColombia(today, offset);
          return (
            <button
              key={offset}
              type="button"
              className={dateStr === selectedDate && viewMode === "day" ? "active" : ""}
              onClick={() => {
                onSelectDate(dateStr);
                setViewMode("day");
              }}
            >
              {offset === 0
                ? "Hoy"
                : offset === 1
                  ? "Mañana"
                  : offset === 7
                    ? "+1 sem"
                    : offset === 14
                      ? "+2 sem"
                      : offset === 30
                        ? "+1 mes"
                        : `+${offset}d`}
            </button>
          );
        })}
      </div>

      <div className="cal-filters">
        <div className="cal-filter-group">
          {(["all", "live", "pre-match", "final"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? "active" : ""}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all"
                ? "Todos"
                : status === "live"
                  ? "En vivo"
                  : status === "pre-match"
                    ? "Programados"
                    : "Finalizados"}
            </button>
          ))}
          <button
            type="button"
            className={showFavoritesOnly ? "active fav" : "fav"}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <Star size={12} /> Favoritos
          </button>
        </div>
        <div className="cal-filter-group">
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="cal-league-select"
          >
            <option value="all">Todas las ligas ({leagueOptions.length})</option>
            {leagueOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <label className="cal-search">
          <Filter size={14} />
          <input
            value={calendarQuery}
            onChange={(e) => setCalendarQuery(e.target.value)}
            placeholder="Buscar equipo o liga..."
          />
        </label>
      </div>

      {viewMode === "upcoming" && (
        <div className="cal-upcoming">
          {loadingUpcoming ? (
            <div className="cal-upcoming-loading">
              <Loader2 size={24} className="spin" />
              <span>Cargando partidos de los próximos {upcomingDayCount} días...</span>
            </div>
          ) : upcomingData.length === 0 ? (
            <div className="cal-empty">
              <CalendarDays size={40} />
              <strong>Sin partidos programados</strong>
              <p>No se encontraron partidos en los próximos {upcomingDayCount} días.</p>
            </div>
          ) : (
            upcomingData.map(({ date, fixtures: dayFixtures }) => {
              const filtered = sortFixtures(applyFilters(dayFixtures, filterOpts));
              if (filtered.length === 0) return null;
              const dayGroups = groupByLeague(filtered);

              return (
                <div key={date} className="cal-upcoming-day">
                  <div className="cal-upcoming-day-header">
                    <CalendarDays size={16} />
                    <strong>{formatDateChipLabel(date)}</strong>
                    <span className="cal-upcoming-date">{date}</span>
                    <span className="cal-upcoming-count">{filtered.length} partidos</span>
                    <button
                      type="button"
                      className="cal-upcoming-goto"
                      onClick={() => {
                        onSelectDate(date);
                        setViewMode("day");
                      }}
                    >
                      Ver día
                    </button>
                  </div>
                  {dayGroups.map((group) => (
                    <div key={group.id} className="cal-upcoming-league">
                      <div className="cal-upcoming-league-header">
                        {group.flag && <img src={group.flag} alt="" className="cal-league-flag" />}
                        {group.logo && <img src={group.logo} alt="" className="cal-league-logo" />}
                        <span>{group.league}</span>
                      </div>
                      {group.fixtures.map((fixture) => (
                        <CalendarFixtureRow
                          key={fixture.id}
                          fixture={fixture}
                          edgeHint={edgeHints[fixture.id]}
                          isFavorite={
                            favoriteTeams.includes(fixture.home.id) ||
                            favoriteTeams.includes(fixture.away.id)
                          }
                          onClick={() => onOpenFixture(fixture)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              );
            })
          )}
          <div className="cal-upcoming-actions">
            <button type="button" className="cal-load-more" onClick={() => setUpcomingDayCount(14)}>
              Próximos 14 días
            </button>
            <button type="button" className="cal-load-more" onClick={() => setUpcomingDayCount(30)}>
              Próximo mes
            </button>
          </div>
        </div>
      )}

      {viewMode === "day" && (
        <div className="cal-fixtures">
          {groupedByLeague.map((group) => {
            const collapsed = collapsedLeagues[group.id] ?? false;
            return (
              <div key={group.id} className="cal-league-group">
                <button
                  type="button"
                  className="cal-league-header cal-league-header-toggle"
                  onClick={() => toggleLeague(group.id)}
                  aria-expanded={!collapsed}
                >
                  {group.flag && <img src={group.flag} alt="" className="cal-league-flag" />}
                  {group.logo && <img src={group.logo} alt="" className="cal-league-logo" />}
                  <strong>{group.league}</strong>
                  <span className="cal-league-count">{group.fixtures.length}</span>
                  <ChevronRight size={14} className={`cal-league-chevron ${collapsed ? "" : "open"}`} />
                </button>
                {!collapsed && (
                  <div className="cal-league-fixtures">
                    {group.fixtures.map((fixture) => (
                      <CalendarFixtureRow
                        key={fixture.id}
                        fixture={fixture}
                        isSelected={fixture.id === selectedFixtureId}
                        edgeHint={edgeHints[fixture.id]}
                        isFavorite={
                          favoriteTeams.includes(fixture.home.id) ||
                          favoriteTeams.includes(fixture.away.id)
                        }
                        onClick={() => onOpenFixture(fixture)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {groupedByLeague.length === 0 && (
            <div className="cal-empty">
              <CalendarDays size={40} />
              <strong>Sin partidos</strong>
              <p>No hay partidos para esta fecha con los filtros seleccionados.</p>
            </div>
          )}
        </div>
      )}

      {viewMode === "day" && totalPages > 1 && (
        <div className="cal-pagination">
          <button type="button" onClick={pgPrev} disabled={!hasPrevPage}>
            <ChevronLeft size={16} /> Anterior
          </button>
          <span>
            Página {page} de {totalPages} · {filteredFixtures.length} partidos
          </span>
          <button type="button" onClick={pgNext} disabled={!hasNextPage}>
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
