"use client";

import { CalendarDays, Filter, Radio, ChevronLeft, ChevronRight, Zap, Star, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fixture, League } from "@/shared/domain";
import { usePagination } from "@/frontend/hooks/use-pagination";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";

type CalendarViewProps = {
  fixtures: Fixture[];
  leagues: League[];
  selectedDate: string;
  selectedFixtureId: string;
  loading: boolean;
  onSelectDate: (date: string) => void;
  onRefresh: () => void;
  onOpenFixture: (fixture: Fixture) => void;
};

function formatKickoffTime(kickoff: string): string {
  const d = new Date(kickoff);
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === todayStr) return "Hoy";
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return "Mañana";
  if (dateStr === yesterday.toISOString().slice(0, 10)) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short" });
}

function getMonthDays(year: number, month: number): Array<{ date: string; day: number; isCurrentMonth: boolean }> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const days: Array<{ date: string; day: number; isCurrentMonth: boolean }> = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    days.push({ date: date.toISOString().slice(0, 10), day: d, isCurrentMonth: true });
  }
  // Next month padding (fill to 42 = 6 rows)
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1);
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: false });
  }
  return days;
}

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function CalendarView({
  fixtures,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  leagues,
  selectedDate,
  selectedFixtureId,
  loading,
  onSelectDate,
  onRefresh,
  onOpenFixture,
}: CalendarViewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | Fixture["status"]>("all");
  const [calendarQuery, setCalendarQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [favoriteTeams] = useLocalStorage<string[]>("live-sound-favorite-teams", []);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Monthly calendar state
  const selectedYear = parseInt(selectedDate.slice(0, 4));
  const selectedMonth = parseInt(selectedDate.slice(5, 7)) - 1;
  const monthDays = useMemo(() => getMonthDays(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  // Future dates with fixtures (cached counts per day)
  const [futureCounts, setFutureCounts] = useState<Record<string, number>>({});
  const [loadingFuture, setLoadingFuture] = useState(false);

  // Multi-day upcoming fixtures
  const [upcomingFixtures, setUpcomingFixtures] = useState<Array<{ date: string; fixtures: Fixture[] }>>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "upcoming">("day");

  // Load fixture counts for the visible month
  useEffect(() => {
    let cancelled = false;
    const loadMonthCounts = async () => {
      setLoadingFuture(true);
      const counts: Record<string, number> = {};
      const datesToCheck = [1, 8, 15, 22, 29].map(d => {
        const date = new Date(selectedYear, selectedMonth, d);
        if (date.getMonth() !== selectedMonth) return null;
        return date.toISOString().slice(0, 10);
      }).filter(Boolean) as string[];

      for (const date of datesToCheck) {
        try {
          const res = await fetch(`/api/fixtures?date=${date}`);
          if (!res.ok) continue;
          const payload = await res.json();
          const fxs = payload.data?.fixtures ?? [];
          counts[date] = fxs.length;
        } catch { /* skip */ }
      }

      if (!cancelled) {
        setFutureCounts(prev => ({ ...prev, ...counts }));
        setLoadingFuture(false);
      }
    };

    loadMonthCounts();
    return () => { cancelled = true; };
  }, [selectedYear, selectedMonth]);

  // Load upcoming fixtures (next 7 days)
  const loadUpcoming = useCallback(async (days: number = 7) => {
    setLoadingUpcoming(true);
    const results: Array<{ date: string; fixtures: Fixture[] }> = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);

      try {
        const res = await fetch(`/api/fixtures?date=${dateStr}`);
        if (!res.ok) continue;
        const payload = await res.json();
        const fxs: Fixture[] = payload.data?.fixtures ?? [];
        if (fxs.length > 0) {
          results.push({ date: dateStr, fixtures: fxs });
        }
      } catch { /* skip */ }
    }

    setUpcomingFixtures(results);
    setLoadingUpcoming(false);
  }, []);

  // Auto-load upcoming when switching to that view
  useEffect(() => {
    if (viewMode === "upcoming" && upcomingFixtures.length === 0) {
      loadUpcoming(7);
    }
  }, [viewMode, upcomingFixtures.length, loadUpcoming]);

  // Current day fixtures count
  const todayCount = fixtures.length;
  const currentDayCounts = useMemo(() => {
    const c = { ...futureCounts };
    c[selectedDate] = todayCount;
    return c;
  }, [futureCounts, selectedDate, todayCount]);

  // Navigate month
  const prevMonth = () => {
    const d = new Date(selectedYear, selectedMonth - 1, 15);
    onSelectDate(d.toISOString().slice(0, 10));
  };
  const nextMonth = () => {
    const d = new Date(selectedYear, selectedMonth + 1, 15);
    onSelectDate(d.toISOString().slice(0, 10));
  };

  // Get unique leagues from fixtures
  const fixtureLeagues = useMemo(() => {
    const map = new Map<string, { id: string; name: string; logo?: string; flag?: string }>();
    for (const f of fixtures) {
      if (!map.has(f.leagueId)) {
        map.set(f.leagueId, { id: f.leagueId, name: f.leagueName, logo: f.leagueLogo, flag: f.leagueFlag });
      }
    }
    return Array.from(map.values());
  }, [fixtures]);

  const filteredFixtures = useMemo(
    () => fixtures.filter((fixture) => {
      const statusMatch = statusFilter === "all" || fixture.status === statusFilter;
      const leagueMatch = leagueFilter === "all" || fixture.leagueId === leagueFilter;
      const queryMatch = `${fixture.home.name} ${fixture.away.name} ${fixture.leagueName}`.toLowerCase().includes(calendarQuery.toLowerCase());
      const favMatch = !showFavoritesOnly || favoriteTeams.includes(fixture.home.id) || favoriteTeams.includes(fixture.away.id);
      return statusMatch && leagueMatch && queryMatch && favMatch;
    }),
    [calendarQuery, fixtures, statusFilter, leagueFilter, showFavoritesOnly, favoriteTeams],
  );

  // Group by league
  const groupedByLeague = useMemo(() => {
    const groups = new Map<string, { id: string; league: string; logo?: string; flag?: string; fixtures: Fixture[] }>();
    for (const f of filteredFixtures) {
      if (!groups.has(f.leagueId)) {
        groups.set(f.leagueId, { id: f.leagueId, league: f.leagueName, logo: f.leagueLogo, flag: f.leagueFlag, fixtures: [] });
      }
      groups.get(f.leagueId)!.fixtures.push(f);
    }
    return Array.from(groups.values());
  }, [filteredFixtures]);

  const { page, totalPages, nextPage: pgNext, prevPage: pgPrev, hasNextPage, hasPrevPage } = usePagination(filteredFixtures, 25);

  // Stats
  const liveCount = fixtures.filter(f => f.status === "live").length;
  const preMatchCount = fixtures.filter(f => f.status === "pre-match").length;
  const finalCount = fixtures.filter(f => f.status === "final").length;
  const favCount = fixtures.filter(f => favoriteTeams.includes(f.home.id) || favoriteTeams.includes(f.away.id)).length;

  return (
    <section className="view-workspace cal-view">
      {/* Header */}
      <article className="cal-header">
        <div className="cal-header-left">
          <CalendarDays size={24} />
          <div>
            <h2>Calendario de Partidos</h2>
            <p>{fixtures.length} partidos · {fixtureLeagues.length} ligas · {formatDayLabel(selectedDate)}</p>
          </div>
        </div>
        <div className="cal-header-stats">
          {liveCount > 0 && <span className="cal-stat live"><Radio size={12} /> {liveCount} en vivo</span>}
          <span className="cal-stat pre">{preMatchCount} programados</span>
          <span className="cal-stat final">{finalCount} finalizados</span>
          {favCount > 0 && <span className="cal-stat fav"><Star size={12} /> {favCount} favoritos</span>}
        </div>
        <button className="cal-refresh" onClick={onRefresh}>{loading ? "Actualizando..." : "Refrescar"}</button>
      </article>

      {/* Monthly Calendar Grid */}
      <div className="cal-monthly">
        <div className="cal-month-nav">
          <button onClick={prevMonth}><ChevronLeft size={18} /></button>
          <strong>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong>
          <button onClick={nextMonth}><ChevronRight size={18} /></button>
        </div>
        <div className="cal-month-grid">
          <div className="cal-weekdays">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="cal-days">
            {monthDays.map((day) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === new Date().toISOString().slice(0, 10);
              const count = currentDayCounts[day.date] ?? 0;
              const hasFx = count > 0;
              return (
                <button
                  key={day.date}
                  className={`cal-day ${!day.isCurrentMonth ? "other-month" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${hasFx ? "has-fixtures" : ""}`}
                  onClick={() => onSelectDate(day.date)}
                  title={hasFx ? `${count} partidos` : undefined}
                >
                  <span>{day.day}</span>
                  {hasFx && <span className="cal-day-dot">{count > 99 ? "99+" : count}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {loadingFuture && <span className="cal-loading-future">Cargando fechas...</span>}
      </div>

      {/* Quick future dates */}
      <div className="cal-future-strip">
        <span className="cal-future-label">Vista:</span>
        <button className={viewMode === "day" ? "active" : ""} onClick={() => setViewMode("day")}>📅 Día actual</button>
        <button className={viewMode === "upcoming" ? "active" : ""} onClick={() => setViewMode("upcoming")}>📋 Próximos 7 días</button>
        <span className="cal-future-sep">|</span>
        <span className="cal-future-label">Ir a:</span>
        {[0, 1, 2, 3, 7, 14, 30].map(offset => {
          const d = new Date(); d.setDate(d.getDate() + offset);
          const dateStr = d.toISOString().slice(0, 10);
          return (
            <button key={offset} className={dateStr === selectedDate ? "active" : ""} onClick={() => { onSelectDate(dateStr); setViewMode("day"); }}>
              {offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : offset === 7 ? "+1 sem" : offset === 14 ? "+2 sem" : offset === 30 ? "+1 mes" : `+${offset}d`}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="cal-filters">
        <div className="cal-filter-group">
          {(["all", "live", "pre-match", "final"] as const).map((status) => (
            <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>
              {status === "all" ? "Todos" : status === "live" ? "🔴 En Vivo" : status === "pre-match" ? "⏰ Programados" : "✅ Finalizados"}
            </button>
          ))}
          <button className={showFavoritesOnly ? "active fav" : "fav"} onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}>
            <Star size={12} /> Favoritos
          </button>
        </div>
        <div className="cal-filter-group">
          <select value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)} className="cal-league-select">
            <option value="all">Todas las ligas ({fixtureLeagues.length})</option>
            {fixtureLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <label className="cal-search">
          <Filter size={14} />
          <input value={calendarQuery} onChange={(e) => setCalendarQuery(e.target.value)} placeholder="Buscar equipo..." />
        </label>
      </div>

      {/* UPCOMING MULTI-DAY VIEW */}
      {viewMode === "upcoming" && (
        <div className="cal-upcoming">
          {loadingUpcoming ? (
            <div className="cal-upcoming-loading">
              <Loader2 size={24} className="spin" />
              <span>Cargando partidos de los próximos 7 días...</span>
            </div>
          ) : upcomingFixtures.length === 0 ? (
            <div className="cal-empty">
              <CalendarDays size={40} />
              <strong>Sin partidos programados</strong>
              <p>No se encontraron partidos en los próximos 7 días.</p>
            </div>
          ) : (
            upcomingFixtures.map(({ date, fixtures: dayFixtures }) => {
              const filtered = dayFixtures.filter(f => {
                const queryMatch = `${f.home.name} ${f.away.name} ${f.leagueName}`.toLowerCase().includes(calendarQuery.toLowerCase());
                const favMatch = !showFavoritesOnly || favoriteTeams.includes(f.home.id) || favoriteTeams.includes(f.away.id);
                return queryMatch && favMatch;
              });
              if (filtered.length === 0) return null;

              // Group by league within each day
              const dayGroups = new Map<string, { id: string; league: string; logo?: string; flag?: string; fixtures: Fixture[] }>();
              for (const f of filtered) {
                if (!dayGroups.has(f.leagueId)) {
                  dayGroups.set(f.leagueId, { id: f.leagueId, league: f.leagueName, logo: f.leagueLogo, flag: f.leagueFlag, fixtures: [] });
                }
                dayGroups.get(f.leagueId)!.fixtures.push(f);
              }

              return (
                <div key={date} className="cal-upcoming-day">
                  <div className="cal-upcoming-day-header">
                    <CalendarDays size={16} />
                    <strong>{formatDayLabel(date)}</strong>
                    <span className="cal-upcoming-date">{date}</span>
                    <span className="cal-upcoming-count">{filtered.length} partidos</span>
                  </div>
                  {Array.from(dayGroups.values()).map(group => (
                    <div key={group.id} className="cal-upcoming-league">
                      <div className="cal-upcoming-league-header">
                        {group.flag && <img src={group.flag} alt="" className="cal-league-flag" />}
                        {group.logo && <img src={group.logo} alt="" className="cal-league-logo" />}
                        <span>{group.league}</span>
                      </div>
                      {group.fixtures.map(fixture => {
                        const isFav = favoriteTeams.includes(fixture.home.id) || favoriteTeams.includes(fixture.away.id);
                        return (
                          <button
                            key={fixture.id}
                            className={`cal-fixture-row ${fixture.status} ${isFav ? "favorite" : ""}`}
                            onClick={() => { onSelectDate(date); onOpenFixture(fixture); }}
                          >
                            {isFav && <span className="cal-fx-fav"><Star size={10} /></span>}
                            <div className="cal-fx-time">
                              {fixture.status === "live" ? (
                                <span className="cal-fx-live"><span className="cal-live-dot" />{fixture.elapsed}′</span>
                              ) : fixture.status === "final" ? (
                                <span className="cal-fx-final">FT</span>
                              ) : (
                                <span className="cal-fx-kickoff">{formatKickoffTime(fixture.kickoff)}</span>
                              )}
                            </div>
                            <div className="cal-fx-team home">
                              <strong>{fixture.home.name}</strong>
                              {fixture.home.logo && <img src={fixture.home.logo} alt="" className="cal-fx-logo" />}
                            </div>
                            <div className="cal-fx-score">
                              {fixture.result ? (
                                <span className={`cal-score ${fixture.status === "live" ? "live" : ""}`}>{fixture.result.homeGoals} - {fixture.result.awayGoals}</span>
                              ) : (
                                <span className="cal-vs">vs</span>
                              )}
                            </div>
                            <div className="cal-fx-team away">
                              {fixture.away.logo && <img src={fixture.away.logo} alt="" className="cal-fx-logo" />}
                              <strong>{fixture.away.name}</strong>
                            </div>
                            <div className="cal-fx-odds">
                              {fixture.market.homeWinOdds > 0 ? (
                                <>
                                  <span className="cal-odd">{fixture.market.homeWinOdds.toFixed(2)}</span>
                                  <span className="cal-odd draw">{fixture.market.drawOdds.toFixed(2)}</span>
                                  <span className="cal-odd">{fixture.market.awayWinOdds.toFixed(2)}</span>
                                </>
                              ) : (
                                <span className="cal-no-odds">—</span>
                              )}
                            </div>
                            <div className="cal-fx-action"><Zap size={14} /></div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })
          )}
          <div className="cal-upcoming-actions">
            <button className="cal-load-more" onClick={() => loadUpcoming(14)}>
              Cargar próximos 14 días
            </button>
            <button className="cal-load-more" onClick={() => loadUpcoming(30)}>
              Cargar próximo mes
            </button>
          </div>
        </div>
      )}

      {/* Fixtures grouped by league — DAY VIEW */}
      {viewMode === "day" && (
      <div className="cal-fixtures">
        {groupedByLeague.map((group) => (
          <div key={group.id} className="cal-league-group">
            <div className="cal-league-header">
              {group.flag && <img src={group.flag} alt="" className="cal-league-flag" />}
              {group.logo && <img src={group.logo} alt="" className="cal-league-logo" />}
              <strong>{group.league}</strong>
              <span className="cal-league-count">{group.fixtures.length}</span>
            </div>
            <div className="cal-league-fixtures">
              {group.fixtures.map((fixture) => {
                const isFav = favoriteTeams.includes(fixture.home.id) || favoriteTeams.includes(fixture.away.id);
                return (
                  <button
                    key={fixture.id}
                    className={`cal-fixture-row ${fixture.status} ${fixture.id === selectedFixtureId ? "selected" : ""} ${isFav ? "favorite" : ""}`}
                    onClick={() => onOpenFixture(fixture)}
                  >
                    {/* Favorite indicator */}
                    {isFav && <span className="cal-fx-fav"><Star size={10} /></span>}

                    {/* Time / Status */}
                    <div className="cal-fx-time">
                      {fixture.status === "live" ? (
                        <span className="cal-fx-live"><span className="cal-live-dot" />{fixture.elapsed}′</span>
                      ) : fixture.status === "final" ? (
                        <span className="cal-fx-final">FT</span>
                      ) : (
                        <span className="cal-fx-kickoff">{formatKickoffTime(fixture.kickoff)}</span>
                      )}
                    </div>

                    {/* Home team */}
                    <div className="cal-fx-team home">
                      <strong>{fixture.home.name}</strong>
                      {fixture.home.logo && <img src={fixture.home.logo} alt="" className="cal-fx-logo" />}
                    </div>

                    {/* Score / VS */}
                    <div className="cal-fx-score">
                      {fixture.result ? (
                        <span className={`cal-score ${fixture.status === "live" ? "live" : ""}`}>
                          {fixture.result.homeGoals} - {fixture.result.awayGoals}
                        </span>
                      ) : (
                        <span className="cal-vs">vs</span>
                      )}
                    </div>

                    {/* Away team */}
                    <div className="cal-fx-team away">
                      {fixture.away.logo && <img src={fixture.away.logo} alt="" className="cal-fx-logo" />}
                      <strong>{fixture.away.name}</strong>
                    </div>

                    {/* Odds */}
                    <div className="cal-fx-odds">
                      {fixture.market.homeWinOdds > 0 ? (
                        <>
                          <span className="cal-odd">{fixture.market.homeWinOdds.toFixed(2)}</span>
                          <span className="cal-odd draw">{fixture.market.drawOdds.toFixed(2)}</span>
                          <span className="cal-odd">{fixture.market.awayWinOdds.toFixed(2)}</span>
                        </>
                      ) : (
                        <span className="cal-no-odds">—</span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="cal-fx-action"><Zap size={14} /></div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {groupedByLeague.length === 0 && (
          <div className="cal-empty">
            <CalendarDays size={40} />
            <strong>Sin partidos</strong>
            <p>No hay partidos para esta fecha con los filtros seleccionados.</p>
          </div>
        )}
      </div>
      )}

      {/* Pagination */}
      {viewMode === "day" && totalPages > 1 && (
        <div className="cal-pagination">
          <button onClick={pgPrev} disabled={!hasPrevPage}><ChevronLeft size={16} /> Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button onClick={pgNext} disabled={!hasNextPage}>Siguiente <ChevronRight size={16} /></button>
        </div>
      )}
    </section>
  );
}
