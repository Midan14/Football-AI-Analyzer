"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Copy,
  Filter,
  Link2,
  Radio,
  RefreshCw,
  Search,
  Star,
  Target,
  TrendingUp,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import type { Country, Fixture, League } from "@/shared/domain";
import { useLiveDetail, useLiveFixtures } from "@/frontend/hooks/use-live";
import { useFixtureEdgeHints } from "@/frontend/hooks/use-fixture-edge-hints";
import { useFixtures } from "@/frontend/hooks/use-fixtures";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { playEventSound } from "@/frontend/lib/sounds";
import { todayIsoDateColombia } from "@/frontend/lib/date-utils";
import { parseCalendarUrlState } from "@/frontend/lib/calendar-export";
import {
  buildLiveShareUrl,
  filterLiveFixtures,
  formatLiveStatus,
  groupLiveByLeague,
  pickStartingSoon,
  sortLiveFixtures,
  syncLiveUrl,
  type LiveFilterState,
  type LiveSortKey,
} from "@/frontend/lib/live-matches-utils";
import { LiveStatBar } from "./live-stat-bar";
import { DataStatusBanner } from "./data-status-banner";

type LiveMatchesViewProps = {
  countries: Country[];
  leagues: League[];
  allLeagues: League[];
  isActive: boolean;
  selectedDate: string;
  fixturesDataSource?: string;
  initialFixtureId?: string;
  onOpenMatchCenter?: (fixture: Fixture) => void;
  onOpenCalendar?: () => void;
  onOpenOpportunities?: () => void;
  onOpenDashboard?: () => void;
};

type MobileStep = "list" | "detail";

export function LiveMatchesView({
  countries,
  leagues: _leagues,
  allLeagues,
  isActive,
  selectedDate,
  fixturesDataSource,
  initialFixtureId,
  onOpenMatchCenter,
  onOpenCalendar,
  onOpenOpportunities,
  onOpenDashboard,
}: LiveMatchesViewProps) {
  const {
    data: livePayload,
    isLoading,
    isFetching,
    isError,
    error,
    dataUpdatedAt,
    refetch,
  } = useLiveFixtures({
    enabled: isActive && fixturesDataSource !== "api-football-quota",
    aggressive: isActive,
  });

  const liveFixtures = livePayload?.fixtures ?? [];
  const dataProvider = livePayload?.provider ?? "unknown";

  const [selectedLiveId, setSelectedLiveId] = useState<string | undefined>(initialFixtureId);
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});
  const [shareCopied, setShareCopied] = useState(false);
  const [favoriteTeams, setFavoriteTeams] = useLocalStorage<string[]>("live-sound-favorite-teams", []);
  const [filters, setFilters] = useState<LiveFilterState>({
    countryId: "",
    leagueId: "",
    query: "",
    favoritesOnly: false,
    sortKey: "minute",
  });

  const today = todayIsoDateColombia();
  const { data: todayFixtures = [] } = useFixtures(undefined, today, {
    enabled: isActive && liveFixtures.length === 0,
  });

  const { data: edgeHintsPayload } = useFixtureEdgeHints(today, {
    enabled: isActive && !isLoading && liveFixtures.length > 0,
    countryId: filters.countryId || undefined,
    leagueId: filters.leagueId || undefined,
  });
  const edgeHints = edgeHintsPayload?.hints ?? {};

  const {
    data: liveDetail,
    isLoading: detailLoading,
    isFetching: detailFetching,
    isError: detailError,
    error: detailErrorObj,
    refetch: refetchDetail,
  } = useLiveDetail(
    selectedLiveId,
    { enabled: isActive && Boolean(selectedLiveId) }
  );

  const prevEventsRef = useRef<Map<string, number>>(new Map());
  const prevDetailEventsRef = useRef<number>(0);

  const countryLeagues = useMemo(() => {
    if (!filters.countryId) return allLeagues;
    return allLeagues.filter((league) => league.countryId === filters.countryId);
  }, [allLeagues, filters.countryId]);

  const filteredFixtures = useMemo(() => {
    const filtered = filterLiveFixtures(liveFixtures, filters, favoriteTeams);
    return sortLiveFixtures(filtered, filters.sortKey, favoriteTeams);
  }, [liveFixtures, filters, favoriteTeams]);

  const grouped = useMemo(() => groupLiveByLeague(filteredFixtures), [filteredFixtures]);
  const startingSoon = useMemo(() => pickStartingSoon(todayFixtures, 180), [todayFixtures]);

  const toggleFavoriteTeam = (teamId: string) => {
    setFavoriteTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const isMatchFavorite = useCallback(
    (fixture: Fixture) =>
      favoriteTeams.includes(fixture.home.id) || favoriteTeams.includes(fixture.away.id),
    [favoriteTeams]
  );

  useEffect(() => {
    if (!isActive) return;
    const state = parseCalendarUrlState(window.location.search);
    setFilters((prev) => ({
      ...prev,
      countryId: state.countryId ?? prev.countryId,
      leagueId: state.leagueId ?? prev.leagueId,
    }));
  }, [isActive]);

  useEffect(() => {
    if (!initialFixtureId) return;
    setSelectedLiveId(initialFixtureId);
    setMobileStep("detail");
  }, [initialFixtureId]);

  useEffect(() => {
    if (!isActive || selectedLiveId || filteredFixtures.length === 0) return;
    setSelectedLiveId(filteredFixtures[0].id);
  }, [isActive, selectedLiveId, filteredFixtures]);

  useEffect(() => {
    if (!isActive) return;
    syncLiveUrl({
      date: selectedDate,
      fixtureId: selectedLiveId,
      countryId: filters.countryId || undefined,
      leagueId: filters.leagueId || undefined,
    });
  }, [isActive, selectedDate, selectedLiveId, filters.countryId, filters.leagueId]);

  useEffect(() => {
    if (!soundEnabled || favoriteTeams.length === 0) return;
    for (const fixture of liveFixtures) {
      if (!isMatchFavorite(fixture)) continue;
      const currentGoals = (fixture.result?.homeGoals ?? 0) + (fixture.result?.awayGoals ?? 0);
      const prevGoals = prevEventsRef.current.get(fixture.id) ?? 0;
      if (currentGoals > prevGoals && prevGoals > 0) {
        playEventSound("Goal", "");
      }
      prevEventsRef.current.set(fixture.id, currentGoals);
    }
  }, [liveFixtures, soundEnabled, favoriteTeams, isMatchFavorite]);

  useEffect(() => {
    if (!liveDetail || !soundEnabled || !selectedLiveId) return;
    if (!isMatchFavorite(liveDetail.fixture)) return;
    const currentCount = liveDetail.events.length;
    if (currentCount > prevDetailEventsRef.current && prevDetailEventsRef.current > 0) {
      const newEvents = liveDetail.events.slice(prevDetailEventsRef.current);
      for (const event of newEvents) {
        playEventSound(event.type, event.detail);
      }
    }
    prevDetailEventsRef.current = currentCount;
  }, [liveDetail, soundEnabled, selectedLiveId, isMatchFavorite]);

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Bogota",
      })
    : "—";

  const copyShareLink = async () => {
    const url = buildLiveShareUrl({
      date: selectedDate,
      fixtureId: selectedLiveId,
      countryId: filters.countryId || undefined,
      leagueId: filters.leagueId || undefined,
    });
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1800);
  };

  const selectMatch = (fixtureId: string) => {
    setSelectedLiveId(fixtureId);
    setMobileStep("detail");
  };

  const updateSort = (sortKey: LiveSortKey) => {
    setFilters((prev) => ({ ...prev, sortKey }));
  };

  return (
    <section className="view-workspace live-view">
      {fixturesDataSource === "api-football-quota" && (
        <DataStatusBanner fixturesDataSource={fixturesDataSource} />
      )}

      {isError && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <span>
            No se pudieron cargar los partidos en vivo
            {error instanceof Error ? `: ${error.message}` : "."}
          </span>
          <button type="button" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      <article className="live-hero">
        <div>
          <span className="live-hero-kicker">En vivo</span>
          <h2>Partidos en Tiempo Real</h2>
          <p>
            Polling cada 10s · Proveedor <span className="live-provider-tag">{dataProvider}</span>
          </p>
        </div>
        <div className="live-hero-actions">
          <button type="button" className={`live-sound-btn ${soundEnabled ? "on" : ""}`} onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {soundEnabled ? "Sonido ON" : "Sonido OFF"}
          </button>
          <button type="button" className="live-refresh-btn" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? "spin" : ""} />
            Actualizar
          </button>
          <div className="live-hero-metrics">
            <strong>{liveFixtures.length}</strong>
            <span>en vivo</span>
            <small>Actualizado {updatedLabel}</small>
          </div>
        </div>
      </article>

      <div className={`live-layout live-step-${mobileStep}`}>
        <div className={`live-list-panel ${mobileStep === "list" ? "live-mobile-active" : ""}`}>
          <div className="live-list-header">
            <div className="live-indicator">
              <span className="live-dot-big" />
              <strong>{filteredFixtures.length} visibles</strong>
            </div>

            <div className="live-search">
              <Search size={14} />
              <input
                value={filters.query}
                onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                placeholder="Buscar equipo o liga..."
              />
            </div>

            <div className="live-filter-row">
              <Filter size={12} />
              <select
                value={filters.countryId}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, countryId: event.target.value, leagueId: "" }))
                }
              >
                <option value="">Todos los países</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
              <select
                value={filters.leagueId}
                onChange={(event) => setFilters((prev) => ({ ...prev, leagueId: event.target.value }))}
              >
                <option value="">Todas las ligas</option>
                {countryLeagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="live-pills">
              <button
                type="button"
                className={filters.favoritesOnly ? "active" : ""}
                onClick={() => setFilters((prev) => ({ ...prev, favoritesOnly: !prev.favoritesOnly }))}
              >
                <Star size={12} /> Favoritos
              </button>
              {([
                ["minute", "Minuto"],
                ["league", "Liga"],
                ["favorites", "Alertas"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={filters.sortKey === key ? "active" : ""}
                  onClick={() => updateSort(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="live-list-body">
            {isLoading && <div className="live-loading">Cargando partidos en vivo...</div>}

            {!isLoading && grouped.length === 0 && (
              <div className="live-empty-block">
                <p>No hay partidos en vivo con estos filtros.</p>
                {startingSoon.length > 0 && (
                  <div className="live-soon-block">
                    <h4>Empiezan pronto hoy</h4>
                    {startingSoon.slice(0, 5).map((fixture) => (
                      <button
                        key={fixture.id}
                        type="button"
                        className="live-soon-row"
                        onClick={() => onOpenMatchCenter?.(fixture)}
                      >
                        <span>{new Date(fixture.kickoff).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" })}</span>
                        <strong>{fixture.home.name} vs {fixture.away.name}</strong>
                        <small>{fixture.leagueName}</small>
                      </button>
                    ))}
                  </div>
                )}
                {onOpenCalendar && (
                  <button type="button" className="live-empty-cta" onClick={onOpenCalendar}>
                    <Calendar size={14} /> Ver calendario completo
                  </button>
                )}
              </div>
            )}

            {grouped.map(([leagueId, group]) => {
              const collapsed = collapsedLeagues[leagueId] ?? false;
              return (
                <div key={leagueId} className="live-league-group">
                  <button
                    type="button"
                    className="live-league-header"
                    onClick={() =>
                      setCollapsedLeagues((prev) => ({ ...prev, [leagueId]: !collapsed }))
                    }
                  >
                    {group.leagueLogo ? (
                      <img src={group.leagueLogo} alt="" className="live-league-logo" />
                    ) : null}
                    <span>{group.leagueName}</span>
                    <small>{group.fixtures.length}</small>
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {!collapsed &&
                    group.fixtures.map((fixture) => (
                      <div
                        key={fixture.id}
                        role="button"
                        tabIndex={0}
                        className={`live-match-row ${selectedLiveId === fixture.id ? "active" : ""} ${isMatchFavorite(fixture) ? "favorite" : ""}`}
                        onClick={() => selectMatch(fixture.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectMatch(fixture.id);
                          }
                        }}
                      >
                        <div className="live-match-badge">
                          <span className="live-pulse-dot" />
                          <span className="live-match-min">{formatLiveStatus(fixture)}</span>
                        </div>
                        <div className="live-match-info">
                          <div className="live-match-team">
                            {fixture.home.logo && <img src={fixture.home.logo} alt="" className="live-team-img" />}
                            <span>{fixture.home.name}</span>
                            <b>{fixture.result?.homeGoals ?? 0}</b>
                            <button
                              type="button"
                              className={`live-fav-btn ${favoriteTeams.includes(fixture.home.id) ? "active" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavoriteTeam(fixture.home.id);
                              }}
                            >
                              <Star size={12} />
                            </button>
                          </div>
                          <div className="live-match-team">
                            {fixture.away.logo && <img src={fixture.away.logo} alt="" className="live-team-img" />}
                            <span>{fixture.away.name}</span>
                            <b>{fixture.result?.awayGoals ?? 0}</b>
                            <button
                              type="button"
                              className={`live-fav-btn ${favoriteTeams.includes(fixture.away.id) ? "active" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavoriteTeam(fixture.away.id);
                              }}
                            >
                              <Star size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="live-match-badges">
                          {edgeHints[fixture.id]?.hasValue && (
                            <span
                              className="lcv-badge value"
                              title={`Edge ${edgeHints[fixture.id]?.edge}% · ${edgeHints[fixture.id]?.market}`}
                            >
                              VALUE
                            </span>
                          )}
                          {edgeHints[fixture.id]?.hasMlSignal && (
                            <span className="lcv-badge ml" title="Señal ML activa">
                              AI
                            </span>
                          )}
                        </div>
                        {fixture.result?.firstHalfHome !== undefined && (
                          <span className="live-match-ht">
                            HT {fixture.result.firstHalfHome}-{fixture.result.firstHalfAway}
                          </span>
                        )}
                        {fixture.market.homeWinOdds > 0 && (
                          <div className="live-match-odds">
                            <span>{fixture.market.homeWinOdds.toFixed(2)}</span>
                            <span>{fixture.market.drawOdds.toFixed(2)}</span>
                            <span>{fixture.market.awayWinOdds.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className={`live-detail-panel ${mobileStep === "detail" ? "live-mobile-active" : ""}`}>
          <button type="button" className="live-mobile-back" onClick={() => setMobileStep("list")}>
            ← Volver al listado
          </button>

          {!selectedLiveId ? (
            <div className="live-detail-empty">
              <Radio size={40} />
              <p>Selecciona un partido en vivo para ver estadísticas y eventos.</p>
            </div>
          ) : detailLoading && !liveDetail ? (
            <div className="live-detail-empty">
              <Activity size={32} className="spin" />
              <p>Cargando datos en vivo...</p>
            </div>
          ) : detailError && !liveDetail ? (
            <div className="live-detail-empty">
              <div className="error-banner" role="alert">
                <AlertTriangle size={18} />
                <span>
                  No se pudo cargar el detalle en vivo
                  {detailErrorObj instanceof Error ? `: ${detailErrorObj.message}` : "."}
                </span>
                <button type="button" onClick={() => refetchDetail()}>
                  Reintentar
                </button>
              </div>
            </div>
          ) : liveDetail ? (
            <>
              <div className="live-detail-header">
                <div className="live-detail-team">
                  {liveDetail.fixture.home.logo && (
                    <img src={liveDetail.fixture.home.logo} alt="" className="live-detail-logo" />
                  )}
                  <strong>{liveDetail.fixture.home.name}</strong>
                </div>
                <div className="live-detail-score">
                  <div className="live-score-big">
                    <span>{liveDetail.fixture.result?.homeGoals ?? 0}</span>
                    <span className="live-score-sep">-</span>
                    <span>{liveDetail.fixture.result?.awayGoals ?? 0}</span>
                  </div>
                  <div className="live-elapsed">
                    <span className="live-pulse-dot" />
                    <strong>{formatLiveStatus(liveDetail.fixture)}</strong>
                    {detailFetching && <RefreshCw size={12} className="spin" />}
                  </div>
                  <small>{liveDetail.fixture.leagueName}</small>
                  {edgeHints[liveDetail.fixture.id] && (
                    <div className="live-detail-badges">
                      {edgeHints[liveDetail.fixture.id]?.hasValue && (
                        <span className="lcv-badge value">
                          VALUE +{edgeHints[liveDetail.fixture.id]?.edge}%
                        </span>
                      )}
                      {edgeHints[liveDetail.fixture.id]?.hasMlSignal && (
                        <span className="lcv-badge ml">AI</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="live-detail-team away">
                  {liveDetail.fixture.away.logo && (
                    <img src={liveDetail.fixture.away.logo} alt="" className="live-detail-logo" />
                  )}
                  <strong>{liveDetail.fixture.away.name}</strong>
                </div>
              </div>

              <div className="live-detail-nav">
                <button type="button" onClick={copyShareLink}>
                  {shareCopied ? <Copy size={14} /> : <Link2 size={14} />}
                  {shareCopied ? "Copiado" : "Compartir"}
                </button>
                {onOpenDashboard && (
                  <button type="button" onClick={onOpenDashboard}>
                    <Target size={14} /> Dashboard
                  </button>
                )}
                {onOpenOpportunities && (
                  <button type="button" onClick={onOpenOpportunities}>
                    <TrendingUp size={14} /> Oportunidades
                  </button>
                )}
                {onOpenCalendar && (
                  <button type="button" onClick={onOpenCalendar}>
                    <Calendar size={14} /> Calendario
                  </button>
                )}
              </div>

              {liveDetail.statistics.length > 0 && (
                <div className="live-stats-section">
                  <h3><Activity size={16} /> Estadísticas en vivo</h3>
                  <div className="live-stat-bars">
                    {liveDetail.statistics.map((stat) => (
                      <LiveStatBar key={stat.type} stat={stat} />
                    ))}
                  </div>
                </div>
              )}

              {liveDetail.events.length > 0 && (
                <div className="live-events-section">
                  <h3><Zap size={16} /> Eventos del partido</h3>
                  <div className="live-events-list">
                    {[...liveDetail.events].reverse().map((event, index) => (
                      <div
                        key={`${event.time}-${event.player}-${index}`}
                        className={`live-event-row ${event.type.toLowerCase()}`}
                      >
                        <span className="live-event-time">{event.time}&apos;</span>
                        <span className="live-event-icon">
                          {event.type === "Goal" ? "⚽" : event.type === "Card" ? "🟨" : "📋"}
                        </span>
                        <div className="live-event-info">
                          <strong>{event.player || event.detail}</strong>
                          <small>{event.team} · {event.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {liveDetail.statistics.length === 0 && liveDetail.events.length === 0 && (
                <div className="live-detail-empty small">
                  <p>Estadísticas no disponibles para esta liga. Los datos se refrescan cada 10 segundos.</p>
                </div>
              )}

              {onOpenMatchCenter && (
                <div className="live-detail-actions">
                  <button type="button" className="live-analyze-btn" onClick={() => onOpenMatchCenter(liveDetail.fixture)}>
                    <Zap size={16} /> Analizar en Match Center
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
