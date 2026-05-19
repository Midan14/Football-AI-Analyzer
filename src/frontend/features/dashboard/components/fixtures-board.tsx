"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Search, Star } from "lucide-react";
import type { Fixture } from "@/shared/domain";

type FixturesBoardProps = {
  fixtures: Fixture[];
  starred: Set<string>;
  loading: boolean;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenFixture: (fixture: Fixture) => void;
  onToggleStar: (fixture: Fixture) => void;
};

type StatusFilter = "all" | "live" | "final" | "pre-match";

// Popular leagues for quick filter
const POPULAR_LEAGUES = [
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
  "Eredivisie", "Liga MX", "MLS", "Champions League", "Europa League",
];

export function FixturesBoard({
  fixtures,
  starred,
  loading,
  selectedDate,
  onSelectDate,
  onOpenFixture,
  onToggleStar,
}: FixturesBoardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);

  // Date navigation
  const dateButtons = useMemo(() => {
    const dates: string[] = [];
    for (let i = -2; i <= 2; i++) {
      const d = new Date(`${selectedDate}T12:00:00`);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [selectedDate]);

  // Filter fixtures
  const filtered = useMemo(() => {
    return fixtures.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (leagueFilter && !f.leagueName.toLowerCase().includes(leagueFilter.toLowerCase())) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !f.home.name.toLowerCase().includes(q) &&
          !f.away.name.toLowerCase().includes(q) &&
          !f.leagueName.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [fixtures, statusFilter, searchQuery, leagueFilter]);

  // Group by league — sort: live first, then pre-match, then final
  const grouped = useMemo(() => {
    const map = new Map<string, { leagueName: string; countryId: string; fixtures: Fixture[] }>();
    for (const f of filtered) {
      const key = f.leagueId;
      if (!map.has(key)) {
        map.set(key, { leagueName: f.leagueName, countryId: f.countryId, fixtures: [] });
      }
      map.get(key)!.fixtures.push(f);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aLive = a[1].fixtures.some((f) => f.status === "live") ? 0 : 1;
      const bLive = b[1].fixtures.some((f) => f.status === "live") ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const aPre = a[1].fixtures.some((f) => f.status === "pre-match") ? 0 : 1;
      const bPre = b[1].fixtures.some((f) => f.status === "pre-match") ? 0 : 1;
      if (aPre !== bPre) return aPre - bPre;
      return a[1].leagueName.localeCompare(b[1].leagueName);
    });
  }, [filtered]);

  // Available popular leagues in today's fixtures
  const availablePopular = useMemo(() => {
    const leagueNames = new Set(fixtures.map((f) => f.leagueName));
    return POPULAR_LEAGUES.filter((name) =>
      [...leagueNames].some((ln) => ln.toLowerCase().includes(name.toLowerCase()))
    );
  }, [fixtures]);

  const liveCount = fixtures.filter((f) => f.status === "live").length;
  const finishedCount = fixtures.filter((f) => f.status === "final").length;
  const scheduledCount = fixtures.filter((f) => f.status === "pre-match").length;

  function formatMatchTime(kickoff: string) {
    try {
      const d = new Date(kickoff);
      return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
    } catch {
      return "--:--";
    }
  }

  function formatDateLabel(dateStr: string) {
    const d = new Date(`${dateStr}T12:00:00`);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateStr === todayStr) return "Hoy";
    if (dateStr === yesterday.toISOString().slice(0, 10)) return "Ayer";
    if (dateStr === tomorrow.toISOString().slice(0, 10)) return "Mañana";
    return d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
  }

  function openFixtureFromKeyboard(event: KeyboardEvent<HTMLDivElement>, fixture: Fixture) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenFixture(fixture);
  }

  return (
    <section className="fixtures-board-container">
      {/* Status filter tabs + date nav */}
      <div className="fb-tabs">
        <button className={statusFilter === "all" ? "fb-tab active" : "fb-tab"} onClick={() => setStatusFilter("all")}>
          Todos <span className="fb-tab-count">{fixtures.length}</span>
        </button>
        <button className={statusFilter === "live" ? "fb-tab active live" : "fb-tab"} onClick={() => setStatusFilter("live")}>
          <span className="fb-live-dot" /> En vivo <span className="fb-tab-count">{liveCount}</span>
        </button>
        <button className={statusFilter === "final" ? "fb-tab active" : "fb-tab"} onClick={() => setStatusFilter("final")}>
          Terminado <span className="fb-tab-count">{finishedCount}</span>
        </button>
        <button className={statusFilter === "pre-match" ? "fb-tab active" : "fb-tab"} onClick={() => setStatusFilter("pre-match")}>
          Programados <span className="fb-tab-count">{scheduledCount}</span>
        </button>

        <div className="fb-date-nav">
          <button onClick={() => { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() - 1); onSelectDate(d.toISOString().slice(0, 10)); }}>
            <ChevronLeft size={16} />
          </button>
          {dateButtons.map((date) => (
            <button key={date} className={date === selectedDate ? "fb-date active" : "fb-date"} onClick={() => onSelectDate(date)}>
              {formatDateLabel(date)}
            </button>
          ))}
          <button onClick={() => { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() + 1); onSelectDate(d.toISOString().slice(0, 10)); }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Search + Popular league filter */}
      <div className="fb-toolbar">
        <div className="fb-search">
          <Search size={14} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar equipo o liga..."
          />
        </div>
        {availablePopular.length > 0 && (
          <div className="fb-popular">
            <button className={!leagueFilter ? "fb-pop-btn active" : "fb-pop-btn"} onClick={() => setLeagueFilter(null)}>
              Todas
            </button>
            {availablePopular.map((name) => (
              <button
                key={name}
                className={leagueFilter === name ? "fb-pop-btn active" : "fb-pop-btn"}
                onClick={() => setLeagueFilter(leagueFilter === name ? null : name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fixtures list grouped by league */}
      <div className="fb-list">
        {loading && <div className="fb-loading">Cargando partidos...</div>}

        {!loading && grouped.length === 0 && (
          <div className="fb-empty">
            No hay partidos {statusFilter !== "all" ? `(${statusFilter})` : ""} para esta fecha.
          </div>
        )}

        {grouped.map(([leagueId, group]) => (
          <div className="fb-league-group" key={leagueId}>
            {/* League header */}
            <div className="fb-league-header">
              {group.fixtures[0]?.leagueFlag && <img src={group.fixtures[0].leagueFlag} alt="" className="fb-league-flag" />}
              {group.fixtures[0]?.leagueLogo && <img src={group.fixtures[0].leagueLogo} alt="" className="fb-league-logo" />}
              <span className="fb-league-country">{group.countryId}</span>
              <strong>{group.leagueName}</strong>
              {group.fixtures[0]?.round && <span className="fb-league-round">– {group.fixtures[0].round}</span>}
              <span className="fb-league-count">{group.fixtures.length}</span>
            </div>

            {/* Fixtures */}
            {group.fixtures.map((fixture) => (
              <div
                key={fixture.id}
                className={`fb-match ${fixture.status}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpenFixture(fixture)}
                onKeyDown={(event) => openFixtureFromKeyboard(event, fixture)}
              >
                {/* Time / Status */}
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
                  ) : (
                    <span className="fb-scheduled-time">{formatMatchTime(fixture.kickoff)}</span>
                  )}
                </div>

                {/* Home team */}
                <div className="fb-match-home">
                  <span className="fb-team-name">{fixture.home.name}</span>
                  {fixture.home.logo && <img src={fixture.home.logo} alt="" className="fb-team-logo" />}
                </div>

                {/* Score */}
                <div className="fb-match-score">
                  {fixture.result ? (
                    <span className={fixture.status === "live" ? "fb-score-live" : "fb-score-final"}>
                      {fixture.result.homeGoals} - {fixture.result.awayGoals}
                    </span>
                  ) : (
                    <span className="fb-score-vs">vs</span>
                  )}
                </div>

                {/* Away team */}
                <div className="fb-match-away">
                  {fixture.away.logo && <img src={fixture.away.logo} alt="" className="fb-team-logo" />}
                  <span className="fb-team-name">{fixture.away.name}</span>
                </div>

                {/* HT Score */}
                <div className="fb-match-ht">
                  {fixture.result?.firstHalfHome !== undefined && fixture.result.firstHalfHome !== null ? (
                    <span>HT {fixture.result.firstHalfHome}-{fixture.result.firstHalfAway}</span>
                  ) : fixture.status === "live" ? (
                    <span className="fb-live-indicator">●</span>
                  ) : null}
                </div>

                {/* Odds */}
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

                {/* Star */}
                <button
                  className="fb-star"
                  onClick={(e) => { e.stopPropagation(); onToggleStar(fixture); }}
                >
                  <Star size={14} className={starred.has(fixture.id) ? "gold" : ""} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
