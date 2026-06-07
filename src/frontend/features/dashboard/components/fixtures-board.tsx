"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, Search, Star } from "lucide-react";
import type { Country, Fixture } from "@/shared/domain";
import type { FixtureInsight } from "@/frontend/hooks/use-dashboard-summary";
import { formatKickoffTimeColombia, todayIsoDateColombia } from "@/frontend/lib/date-utils";
import { CONFIDENCE_THRESHOLDS } from "@/shared/confidence-thresholds";

type FixturesBoardProps = {
  fixtures: Fixture[];
  selectedDate: string;
  countries: Country[];
  starred: Set<string>;
  loading: boolean;
  oddsLoading?: boolean;
  insightMap?: Map<string, FixtureInsight>;
  insightsLoading?: boolean;
  insightsError?: boolean;
  onOpenFixture: (fixture: Fixture) => void;
  onToggleStar: (fixture: Fixture) => void;
};

type StatusFilter = "all" | "live" | "final" | "pre-match";
type ListFilter = "all" | "watchlist" | "with-odds" | "value" | "high-confidence";

const POPULAR_LEAGUES = [
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
  "Eredivisie", "Liga MX", "MLS", "Champions League", "Europa League",
];
const VALUE_EDGE_THRESHOLD = 5;

function leaguePriority(leagueName: string): number {
  const idx = POPULAR_LEAGUES.findIndex((name) =>
    leagueName.toLowerCase().includes(name.toLowerCase())
  );
  return idx === -1 ? 99 : idx;
}

function fixtureSortScore(fixture: Fixture): number {
  let score = 0;
  if (fixture.market.homeWinOdds > 0) score += 1000;
  if (fixture.status === "live") score += 500;
  if (fixture.status === "pre-match") score += 200;
  score -= leaguePriority(fixture.leagueName);
  return score;
}

export function FixturesBoard({
  fixtures,
  selectedDate,
  countries,
  starred,
  loading,
  oddsLoading = false,
  insightMap,
  insightsLoading = false,
  insightsError = false,
  onOpenFixture,
  onToggleStar,
}: FixturesBoardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);

  const isToday = selectedDate === todayIsoDateColombia();

  useEffect(() => {
    setStatusFilter("all");
    setListFilter("all");
    setSearchQuery("");
    setLeagueFilter(null);
  }, [selectedDate]);

  const countryNames = useMemo(() => {
    return new Map(countries.map((c) => [c.id, c.name]));
  }, [countries]);

  const filtered = useMemo(() => {
    return fixtures.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (listFilter === "watchlist" && !starred.has(f.id)) return false;
      if (listFilter === "with-odds" && f.market.homeWinOdds <= 0) return false;
      const insight = insightMap?.get(f.id);
      if (listFilter === "value" && (!insight || insight.topEdge < VALUE_EDGE_THRESHOLD)) return false;
      if (listFilter === "high-confidence" && (!insight || insight.confidence < CONFIDENCE_THRESHOLDS.bet))
        return false;
      if (leagueFilter && !f.leagueName.toLowerCase().includes(leagueFilter.toLowerCase())) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !f.home.name.toLowerCase().includes(q) &&
          !f.away.name.toLowerCase().includes(q) &&
          !f.leagueName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [fixtures, statusFilter, listFilter, searchQuery, leagueFilter, starred, insightMap]);

  const grouped = useMemo(() => {
    const map = new Map<string, { leagueName: string; countryId: string; fixtures: Fixture[] }>();
    for (const f of filtered) {
      const key = f.leagueId;
      if (!map.has(key)) {
        map.set(key, { leagueName: f.leagueName, countryId: f.countryId, fixtures: [] });
      }
      map.get(key)!.fixtures.push(f);
    }
    for (const group of map.values()) {
      group.fixtures.sort((a, b) => fixtureSortScore(b) - fixtureSortScore(a));
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aScore = Math.max(...a[1].fixtures.map(fixtureSortScore));
      const bScore = Math.max(...b[1].fixtures.map(fixtureSortScore));
      if (aScore !== bScore) return bScore - aScore;
      const aLive = a[1].fixtures.some((f) => f.status === "live") ? 0 : 1;
      const bLive = b[1].fixtures.some((f) => f.status === "live") ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return a[1].leagueName.localeCompare(b[1].leagueName);
    });
  }, [filtered]);

  const availablePopular = useMemo(() => {
    const leagueNames = new Set(fixtures.map((f) => f.leagueName));
    return POPULAR_LEAGUES.filter((name) =>
      [...leagueNames].some((ln) => ln.toLowerCase().includes(name.toLowerCase()))
    );
  }, [fixtures]);

  const liveCount = fixtures.filter((f) => f.status === "live").length;
  const finishedCount = fixtures.filter((f) => f.status === "final").length;
  const scheduledCount = fixtures.filter((f) => f.status === "pre-match").length;
  const watchlistCount = fixtures.filter((f) => starred.has(f.id)).length;
  const valueCount = fixtures.filter(
    (f) => (insightMap?.get(f.id)?.topEdge ?? 0) >= VALUE_EDGE_THRESHOLD
  ).length;
  const oddsCount = fixtures.filter((f) => f.market.homeWinOdds > 0).length;

  function formatMatchTime(kickoff: string) {
    return formatKickoffTimeColombia(kickoff);
  }

  function openFixtureFromKeyboard(event: KeyboardEvent<HTMLDivElement>, fixture: Fixture) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenFixture(fixture);
  }

  return (
    <section className="fixtures-board-container">
      <div className="fb-tabs">
        {!isToday && (
          <div className="fb-date-banner">
            Partidos del <strong>{selectedDate}</strong>
            {statusFilter === "live" && " · sin partidos en vivo en este día"}
          </div>
        )}
        {isToday && statusFilter === "live" && liveCount === 0 && (
          <div className="fb-date-banner">
            Ahora mismo la API no reporta partidos en vivo en esta fecha. Si hay juegos en curso,
            revisa la vista <strong>Partidos en Vivo</strong> (lista dedicada en tiempo real).
          </div>
        )}
        <button
          type="button"
          className={statusFilter === "all" ? "fb-tab active" : "fb-tab"}
          onClick={() => setStatusFilter("all")}
        >
          Todos <span className="fb-tab-count">{fixtures.length}</span>
        </button>
        <button
          type="button"
          className={statusFilter === "live" ? "fb-tab active live" : "fb-tab"}
          onClick={() => setStatusFilter("live")}
        >
          <span className="fb-live-dot" /> En vivo <span className="fb-tab-count">{liveCount}</span>
        </button>
        <button
          type="button"
          className={statusFilter === "final" ? "fb-tab active" : "fb-tab"}
          onClick={() => setStatusFilter("final")}
        >
          Terminado <span className="fb-tab-count">{finishedCount}</span>
        </button>
        <button
          type="button"
          className={statusFilter === "pre-match" ? "fb-tab active" : "fb-tab"}
          onClick={() => setStatusFilter("pre-match")}
        >
          Programados <span className="fb-tab-count">{scheduledCount}</span>
        </button>
      </div>

      <div className="fb-toolbar fb-toolbar-extended">
        <div className="fb-search">
          <Search size={14} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar equipo o liga..."
          />
        </div>

        <div className="fb-list-filters">
          <button
            type="button"
            className={listFilter === "all" ? "fb-list-filter active" : "fb-list-filter"}
            onClick={() => setListFilter("all")}
          >
            Todos
          </button>
          <button
            type="button"
            className={listFilter === "watchlist" ? "fb-list-filter active" : "fb-list-filter"}
            onClick={() => setListFilter("watchlist")}
          >
            <Star size={12} /> Favoritos <span>{watchlistCount}</span>
          </button>
          <button
            type="button"
            className={listFilter === "with-odds" ? "fb-list-filter active" : "fb-list-filter"}
            onClick={() => setListFilter("with-odds")}
          >
            Con odds{" "}
            <span className="fb-tab-count">
              {oddsLoading ? "…" : oddsCount}
            </span>
          </button>
          <button
            type="button"
            className={listFilter === "value" ? "fb-list-filter active" : "fb-list-filter"}
            onClick={() => {
              setStatusFilter("all");
              setListFilter("value");
            }}
            title={`Muestra partidos con edge ≥ ${VALUE_EDGE_THRESHOLD}% (en todas las pestañas de estado)`}
          >
            Value <span>{valueCount}</span>
          </button>
          <button
            type="button"
            className={listFilter === "high-confidence" ? "fb-list-filter active" : "fb-list-filter"}
            onClick={() => {
              setStatusFilter("all");
              setListFilter("high-confidence");
            }}
            title={`Muestra partidos con confianza ≥ ${CONFIDENCE_THRESHOLDS.bet}% (en todas las pestañas de estado)`}
          >
            Conf. ≥ {CONFIDENCE_THRESHOLDS.bet}{" "}
            <span>
              {
                fixtures.filter(
                  (f) => (insightMap?.get(f.id)?.confidence ?? 0) >= CONFIDENCE_THRESHOLDS.bet
                ).length
              }
            </span>
          </button>
        </div>

        {availablePopular.length > 0 && (
          <div className="fb-popular">
            <button
              type="button"
              className={!leagueFilter ? "fb-pop-btn active" : "fb-pop-btn"}
              onClick={() => setLeagueFilter(null)}
            >
              Todas
            </button>
            {availablePopular.map((name) => (
              <button
                key={name}
                type="button"
                className={leagueFilter === name ? "fb-pop-btn active" : "fb-pop-btn"}
                onClick={() => {
                  setListFilter("all");
                  setLeagueFilter(leagueFilter === name ? null : name);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="fb-list">
        {loading && <div className="fb-loading">Cargando partidos...</div>}

        {!loading && oddsLoading && (
          <div className="fb-odds-loading">Actualizando cuotas del mercado…</div>
        )}

        {!loading && grouped.length === 0 && (
          <div className="fb-empty">
            No hay partidos con los filtros actuales.
            {listFilter === "value" && valueCount === 0 && (
              <span>
                {" "}
                {insightsError
                  ? " El escaneo AI falló — reintenta desde el banner superior."
                  : insightsLoading
                    ? " El motor está escaneando partidos (máx. 8 por carga)."
                    : ` El motor aún no detectó edge ≥ ${VALUE_EDGE_THRESHOLD}% en esta fecha.`}
              </span>
            )}
            {listFilter === "value" && valueCount > 0 && statusFilter !== "all" && (
              <span> Prueba la pestaña <strong>Todos</strong> — los picks con value pueden no ser solo programados.</span>
            )}
            {listFilter !== "all" && listFilter !== "value" && " Prueba ampliar los criterios de búsqueda."}
            {(statusFilter !== "all" || listFilter !== "all" || searchQuery.trim() || leagueFilter) && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="qa-btn-deep"
                  onClick={() => {
                    setStatusFilter("all");
                    setListFilter("all");
                    setSearchQuery("");
                    setLeagueFilter(null);
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        )}

        {grouped.map(([leagueId, group]) => (
          <div className="fb-league-group" key={leagueId}>
            <div className="fb-league-header">
              {group.fixtures[0]?.leagueFlag && (
                <img src={group.fixtures[0].leagueFlag} alt="" className="fb-league-flag" />
              )}
              {group.fixtures[0]?.leagueLogo && (
                <img src={group.fixtures[0].leagueLogo} alt="" className="fb-league-logo" />
              )}
              <span className="fb-league-country">
                {countryNames.get(group.countryId) ?? group.countryId}
              </span>
              <strong>{group.leagueName}</strong>
              {group.fixtures[0]?.round && (
                <span className="fb-league-round">– {group.fixtures[0].round}</span>
              )}
              <span className="fb-league-count">{group.fixtures.length}</span>
            </div>

            {group.fixtures.map((fixture) => {
              const insight = insightMap?.get(fixture.id);
              return (
                <div
                  key={fixture.id}
                  className={`fb-match ${fixture.status} ${starred.has(fixture.id) ? "watchlisted" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenFixture(fixture)}
                  onKeyDown={(event) => openFixtureFromKeyboard(event, fixture)}
                >
                  <div className="fb-match-time">
                    {fixture.status === "live" ? (
                      <div className="fb-live-time">
                        <span className="fb-time-start">{formatMatchTime(fixture.kickoff)}</span>
                        <span className="fb-elapsed-blink">{fixture.elapsed ?? "?"}&apos;</span>
                      </div>
                    ) : fixture.status === "final" ? (
                      <div className="fb-live-time">
                        <span className="fb-time-start">{formatMatchTime(fixture.kickoff)}</span>
                        <span className="fb-final-badge">FIN</span>
                      </div>
                    ) : fixture.status === "postponed" ? (
                      <div className="fb-live-time">
                        <span className="fb-time-start">{formatMatchTime(fixture.kickoff)}</span>
                        <span className="fb-postponed-badge" title={fixture.statusLong}>
                          POSP
                        </span>
                      </div>
                    ) : fixture.status === "cancelled" ? (
                      <div className="fb-live-time">
                        <span className="fb-time-start">{formatMatchTime(fixture.kickoff)}</span>
                        <span className="fb-cancelled-badge" title={fixture.statusLong}>
                          CANC
                        </span>
                      </div>
                    ) : (
                      <span className="fb-scheduled-time">{formatMatchTime(fixture.kickoff)}</span>
                    )}
                  </div>

                  <div className="fb-match-home">
                    <span className="fb-team-name">{fixture.home.name}</span>
                    {fixture.home.logo && (
                      <img src={fixture.home.logo} alt="" className="fb-team-logo" />
                    )}
                  </div>

                  <div className="fb-match-score">
                    {fixture.result ? (
                      <span className={fixture.status === "live" ? "fb-score-live" : "fb-score-final"}>
                        {fixture.result.homeGoals} - {fixture.result.awayGoals}
                      </span>
                    ) : (
                      <span className="fb-score-vs">vs</span>
                    )}
                  </div>

                  <div className="fb-match-away">
                    {fixture.away.logo && (
                      <img src={fixture.away.logo} alt="" className="fb-team-logo" />
                    )}
                    <span className="fb-team-name">{fixture.away.name}</span>
                  </div>

                  <div className="fb-match-badges">
                    {starred.has(fixture.id) && (
                      <span className="fb-badge fb-badge-star" title="En favoritos">
                        <Star size={10} /> FAV
                      </span>
                    )}
                    {fixture.market.homeWinOdds <= 0 && (
                      <span className="fb-badge fb-badge-warn" title="Sin cuotas">
                        <AlertTriangle size={10} /> Sin cuotas
                      </span>
                    )}
                    {fixture.coverage.tier === "low" && (
                      <span className="fb-badge fb-badge-muted">Baja cob.</span>
                    )}
                    {insight && insight.confidence >= CONFIDENCE_THRESHOLDS.bet && (
                      <span className="fb-badge fb-badge-conf">{Math.round(insight.confidence)}</span>
                    )}
                    {insight && insight.topEdge >= VALUE_EDGE_THRESHOLD && (
                      <span className="fb-badge fb-badge-edge">+{insight.topEdge.toFixed(1)}%</span>
                    )}
                  </div>

                  <div className="fb-match-ht">
                    {fixture.result?.firstHalfHome !== undefined &&
                    fixture.result.firstHalfHome !== null ? (
                      <span>
                        HT {fixture.result.firstHalfHome}-{fixture.result.firstHalfAway}
                      </span>
                    ) : fixture.status === "live" ? (
                      <span className="fb-live-indicator">●</span>
                    ) : insight ? (
                      <span className="fb-ai-hint">{insight.market}</span>
                    ) : null}
                  </div>

                  <div className="fb-match-odds">
                    {fixture.market.homeWinOdds > 0 ? (
                      <>
                        <span className="fb-odd">{fixture.market.homeWinOdds.toFixed(2)}</span>
                        <span className="fb-odd">{fixture.market.drawOdds.toFixed(2)}</span>
                        <span className="fb-odd">{fixture.market.awayWinOdds.toFixed(2)}</span>
                      </>
                    ) : (
                      <>
                        <span className="fb-odd no-data">-</span>
                        <span className="fb-odd no-data">-</span>
                        <span className="fb-odd no-data">-</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    className="fb-star"
                    title={starred.has(fixture.id) ? "Quitar de favoritos" : "Añadir a favoritos"}
                    aria-label={starred.has(fixture.id) ? "Quitar de favoritos" : "Añadir a favoritos"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(fixture);
                    }}
                  >
                    <Star size={14} className={starred.has(fixture.id) ? "gold" : ""} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
