"use client";

import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Copy,
  Globe2,
  Layers3,
  Link2,
  Loader2,
  Pin,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Country, Fixture, League } from "@/shared/domain";
import { useFixtureEdgeHints } from "@/frontend/hooks/use-fixture-edge-hints";
import { useFavoriteLeagues } from "@/frontend/hooks/use-favorite-leagues";
import { useFixturesRange } from "@/frontend/hooks/use-fixtures-range";
import { useLeagueCoverage } from "@/frontend/hooks/use-league-coverage";
import { useLeagueSeasonStats, useLeagueStandings } from "@/frontend/hooks/use-league-standings";
import {
  buildLeagueCompareRows,
  buildLeagueCountryShareUrl,
  countEdgeFixtures,
  findNextLeagueFixture,
  flattenRangeFixtures,
  groupCountriesByRegion,
  sortLeagues,
  type LeagueSortKey,
  type LeagueWindowMode,
} from "@/frontend/lib/league-country-utils";
import { shiftIsoDateColombia, todayIsoDateColombia } from "@/frontend/lib/date-utils";
import {
  LeagueFavoriteStar,
  LeagueFixturePreviewRow,
} from "./league-fixture-preview-row";
import { DataStatusBanner } from "./data-status-banner";

type LeagueCountryViewProps = {
  countries: Country[];
  leagues: League[];
  allLeagues: League[];
  fixtures: Fixture[];
  selectedCountry: string;
  selectedLeague: string;
  selectedDate: string;
  dataProvider: string;
  fixturesDataSource?: string;
  loading: boolean;
  onSelectCountry: (countryId: string) => void;
  onSelectLeague: (leagueId: string) => void;
  onSelectDate: (date: string) => void;
  onOpenCalendar: () => void;
  onOpenDashboard: () => void;
  onOpenOpportunities: () => void;
  onOpenFixture?: (fixture: Fixture) => void;
};

type MobileStep = "countries" | "leagues" | "detail";

export function LeagueCountryView({
  countries,
  leagues,
  allLeagues,
  fixtures,
  selectedCountry,
  selectedLeague,
  selectedDate,
  dataProvider,
  fixturesDataSource,
  loading,
  onSelectCountry,
  onSelectLeague,
  onSelectDate,
  onOpenCalendar,
  onOpenDashboard,
  onOpenOpportunities,
  onOpenFixture,
}: LeagueCountryViewProps) {
  const [countryQuery, setCountryQuery] = useState("");
  const [leagueQuery, setLeagueQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<"all" | League["tier"]>("all");
  const [sortKey, setSortKey] = useState<LeagueSortKey>("coverageScore");
  const [windowMode, setWindowMode] = useState<LeagueWindowMode>("day");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [mobileStep, setMobileStep] = useState<MobileStep>("countries");
  const [shareCopied, setShareCopied] = useState(false);

  const { favorites, recent, isPinned, togglePin, touchRecent } = useFavoriteLeagues();

  const regions = useMemo(() => groupCountriesByRegion(countries), [countries]);

  const leagueCountByCountry = useMemo(() => {
    const map = new Map<string, number>();
    for (const league of allLeagues) {
      map.set(league.countryId, (map.get(league.countryId) ?? 0) + 1);
    }
    return map;
  }, [allLeagues]);

  const filteredCountries = useMemo(() => {
    return countries.filter((country) => {
      const matchesQuery = `${country.name} ${country.code} ${country.region}`
        .toLowerCase()
        .includes(countryQuery.toLowerCase());
      const matchesRegion = regionFilter === "all" || country.region === regionFilter;
      return matchesQuery && matchesRegion;
    });
  }, [countries, countryQuery, regionFilter]);

  const fixtureCountByLeague = useMemo(() => {
    const map = new Map<string, number>();
    for (const fixture of fixtures) {
      map.set(fixture.leagueId, (map.get(fixture.leagueId) ?? 0) + 1);
    }
    return map;
  }, [fixtures]);

  const filteredLeagues = useMemo(() => {
    const tierFiltered = leagues.filter(
      (league) =>
        (tierFilter === "all" || league.tier === tierFilter) &&
        `${league.name} ${league.season}`.toLowerCase().includes(leagueQuery.toLowerCase())
    );
    return sortLeagues(tierFiltered, sortKey, fixtureCountByLeague);
  }, [leagues, tierFilter, leagueQuery, sortKey, fixtureCountByLeague]);

  const selectedCountryObj = countries.find((country) => country.id === selectedCountry);
  const selectedLeagueObj = leagues.find((league) => league.id === selectedLeague);

  const rangeFrom = windowMode === "day" ? selectedDate : shiftIsoDateColombia(selectedDate, -2);
  const rangeTo = windowMode === "day" ? selectedDate : shiftIsoDateColombia(selectedDate, 3);

  const { data: rangeData, isLoading: rangeLoading } = useFixturesRange(rangeFrom, rangeTo, {
    leagueId: selectedLeague || undefined,
    countryId: selectedCountry || undefined,
    includeFixtures: true,
    enabled: Boolean(selectedLeague),
  });

  const windowFixtures = useMemo(
    () => flattenRangeFixtures(rangeData?.fixturesByDate).filter((fixture) => fixture.leagueId === selectedLeague),
    [rangeData, selectedLeague]
  );

  const dayFixtures = useMemo(
    () => windowFixtures.filter((fixture) => fixture.kickoff.slice(0, 10) === selectedDate),
    [windowFixtures, selectedDate]
  );

  const nextFixture = useMemo(
    () => findNextLeagueFixture(windowFixtures, selectedLeague, selectedDate),
    [windowFixtures, selectedLeague, selectedDate]
  );

  const leagueDetailReady = Boolean(selectedLeague) && Boolean(rangeData) && !rangeLoading;

  useEffect(() => {
    if (selectedLeague && selectedCountry && mobileStep === "countries") {
      setMobileStep("detail");
    }
  }, [selectedLeague, selectedCountry, mobileStep]);

  const { data: coverage, isLoading: coverageLoading } = useLeagueCoverage(selectedLeague, {
    countryId: selectedCountry || undefined,
    enabled: leagueDetailReady,
  });

  const { data: standingsData, isLoading: standingsLoading } = useLeagueStandings(selectedLeague, {
    countryId: selectedCountry || undefined,
    enabled: leagueDetailReady,
  });

  const { data: seasonStats } = useLeagueSeasonStats(selectedLeague, selectedDate, {
    windowDays: 14,
    enabled: leagueDetailReady,
  });

  const { data: edgeHintsData } = useFixtureEdgeHints(selectedDate, {
    leagueId: selectedLeague || undefined,
    countryId: selectedCountry || undefined,
    enabled: leagueDetailReady,
  });

  const edgeCount = useMemo(
    () => countEdgeFixtures(dayFixtures, edgeHintsData?.hints ?? {}),
    [dayFixtures, edgeHintsData]
  );

  const compareRows = useMemo(() => {
    if (compareIds.length < 2) return [];
    const picked = leagues.filter((league) => compareIds.includes(league.id));
    const statsMap = new Map(
      picked.map((league) => [
        league.id,
        {
          fixturesToday: fixtureCountByLeague.get(league.id) ?? 0,
          withOddsPct: seasonStats?.withOddsPct ?? 0,
        },
      ])
    );
    return buildLeagueCompareRows(picked, statsMap);
  }, [compareIds, leagues, fixtureCountByLeague, seasonStats]);

  useEffect(() => {
    if (!selectedLeague || !selectedCountry || !selectedLeagueObj) return;
    touchRecent({
      leagueId: selectedLeague,
      countryId: selectedCountry,
      name: selectedLeagueObj.name,
    });
  }, [selectedLeague, selectedCountry, selectedLeagueObj, touchRecent]);

  const handleSelectCountry = (countryId: string) => {
    onSelectCountry(countryId);
    setMobileStep("leagues");
  };

  const handleSelectLeague = (leagueId: string) => {
    onSelectLeague(leagueId);
    setMobileStep("detail");
  };

  const toggleCompare = (leagueId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(leagueId)) return prev.filter((id) => id !== leagueId);
      if (prev.length >= 2) return [prev[1], leagueId];
      return [...prev, leagueId];
    });
  };

  const copyShareLink = async () => {
    const url = buildLeagueCountryShareUrl({
      countryId: selectedCountry || undefined,
      leagueId: selectedLeague || undefined,
      date: selectedDate,
    });
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1800);
  };

  const coverageScore = coverage?.coverageScore ?? selectedLeagueObj?.coverageScore ?? 0;

  return (
    <section className="view-workspace lcv">
      <article className="lcv-header">
        <div>
          <h2>Ligas y Países</h2>
          <p>
            {countries.length} países · {allLeagues.length || leagues.length} ligas · Proveedor{" "}
            <span className="lcv-provider-tag">{dataProvider}</span>
          </p>
        </div>
        <div className="lcv-header-actions">
          <button type="button" className="lcv-link-btn" onClick={copyShareLink}>
            {shareCopied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {shareCopied ? "Enlace copiado" : "Compartir"}
          </button>
          <button type="button" className="lcv-cal-btn" onClick={onOpenCalendar}>
            <Calendar size={16} /> Calendario
          </button>
        </div>
      </article>

      {(fixturesDataSource === "api-football-quota" || fixturesDataSource === "demo-fallback") && (
        <DataStatusBanner fixturesDataSource={fixturesDataSource} />
      )}

      {(favorites.length > 0 || recent.length > 0) && (
        <article className="lcv-quick-strip">
          {favorites.length > 0 && (
            <div className="lcv-quick-group">
              <span><Pin size={12} /> Favoritas</span>
              <div className="lcv-quick-chips">
                {favorites.map((entry) => (
                  <button
                    key={entry.leagueId}
                    type="button"
                    className={entry.leagueId === selectedLeague ? "active" : ""}
                    onClick={() => {
                      handleSelectCountry(entry.countryId);
                      handleSelectLeague(entry.leagueId);
                    }}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="lcv-quick-group">
              <span><Sparkles size={12} /> Recientes</span>
              <div className="lcv-quick-chips">
                {recent.slice(0, 5).map((entry) => (
                  <button
                    key={`recent-${entry.leagueId}`}
                    type="button"
                    onClick={() => {
                      handleSelectCountry(entry.countryId);
                      handleSelectLeague(entry.leagueId);
                    }}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>
      )}

      <div className={`lcv-grid lcv-step-${mobileStep}`}>
        <article className={`lcv-panel lcv-countries ${mobileStep === "countries" ? "lcv-mobile-active" : ""}`}>
          <div className="lcv-panel-head">
            <h3>Países</h3>
            <span>{filteredCountries.length}</span>
          </div>
          <label className="lcv-search">
            <Search size={14} />
            <input
              value={countryQuery}
              onChange={(event) => setCountryQuery(event.target.value)}
              placeholder="Buscar país..."
            />
          </label>
          <div className="lcv-region-filter">
            <button
              type="button"
              className={regionFilter === "all" ? "active" : ""}
              onClick={() => setRegionFilter("all")}
            >
              Todas
            </button>
            {regions.map((region) => (
              <button
                key={region}
                type="button"
                className={regionFilter === region ? "active" : ""}
                onClick={() => setRegionFilter(region)}
              >
                {region}
              </button>
            ))}
          </div>
          <div className="lcv-country-list">
            {filteredCountries.map((country) => (
              <button
                key={country.id}
                type="button"
                className={`lcv-country-row ${country.id === selectedCountry ? "active" : ""}`}
                onClick={() => handleSelectCountry(country.id)}
              >
                {country.flag ? (
                  <img src={country.flag} alt="" className="lcv-country-flag" />
                ) : (
                  <Globe2 size={16} />
                )}
                <strong>{country.name}</strong>
                <span className="lcv-country-meta">
                  {leagueCountByCountry.get(country.id) ?? "—"} ligas
                </span>
              </button>
            ))}
          </div>
        </article>

        <article className={`lcv-panel lcv-leagues ${mobileStep === "leagues" ? "lcv-mobile-active" : ""}`}>
          <div className="lcv-panel-head">
            <button type="button" className="lcv-mobile-back" onClick={() => setMobileStep("countries")}>
              <ArrowLeft size={14} /> Países
            </button>
            <h3>
              {selectedCountryObj?.flag && (
                <img src={selectedCountryObj.flag} alt="" className="lcv-head-flag" />
              )}
              Ligas de {selectedCountryObj?.name ?? "País"}
            </h3>
            <span>{loading ? "Cargando..." : `${filteredLeagues.length} ligas`}</span>
          </div>

          <label className="lcv-search">
            <Search size={14} />
            <input
              value={leagueQuery}
              onChange={(event) => setLeagueQuery(event.target.value)}
              placeholder="Buscar liga..."
            />
          </label>

          <div className="lcv-tier-filter">
            {(["all", "elite", "standard", "low"] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                className={tierFilter === tier ? "active" : ""}
                onClick={() => setTierFilter(tier)}
              >
                {tier === "all" ? "Todas" : tier}
              </button>
            ))}
          </div>

          <div className="lcv-sort-row">
            <span>Ordenar</span>
            {([
              ["coverageScore", "Cobertura"],
              ["fixturesToday", "Partidos"],
              ["name", "Nombre"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={sortKey === key ? "active" : ""}
                onClick={() => setSortKey(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="lcv-league-list">
            {filteredLeagues.map((league) => {
              const fxCount = fixtureCountByLeague.get(league.id) ?? 0;
              const pinned = isPinned(league.id);
              const comparing = compareIds.includes(league.id);
              return (
                <div key={league.id} className={`lcv-league-row-wrap ${league.id === selectedLeague ? "active" : ""}`}>
                  <button
                    type="button"
                    className="lcv-league-row"
                    onClick={() => handleSelectLeague(league.id)}
                  >
                    {league.logo ? (
                      <img src={league.logo} alt="" className="lcv-league-logo" />
                    ) : (
                      <Layers3 size={18} />
                    )}
                    <div className="lcv-league-info">
                      <strong>{league.name}</strong>
                      <span>
                        {league.season} · {league.tier} · {league.coverageScore}/100
                      </span>
                    </div>
                    {fxCount > 0 && <span className="lcv-league-badge">{fxCount}</span>}
                    {league.id === selectedLeague && <CheckCircle2 size={16} className="lcv-check" />}
                  </button>
                  <div className="lcv-league-actions">
                    <LeagueFavoriteStar
                      pinned={pinned}
                      onToggle={() =>
                        togglePin({
                          leagueId: league.id,
                          countryId: league.countryId,
                          name: league.name,
                        })
                      }
                    />
                    <button
                      type="button"
                      className={`lcv-compare-btn ${comparing ? "active" : ""}`}
                      title="Comparar liga"
                      onClick={() => toggleCompare(league.id)}
                    >
                      <BarChart3 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredLeagues.length && <div className="lcv-empty">No hay ligas con ese filtro.</div>}
          </div>

          {compareRows.length === 2 && (
            <div className="lcv-compare-panel">
              <h4>Comparador</h4>
              <div className="lcv-compare-grid">
                {compareRows.map((row) => (
                  <div key={row.id} className="lcv-compare-card">
                    <strong>{row.name}</strong>
                    <span>Tier: {row.tier}</span>
                    <span>Cobertura: {row.coverageScore}</span>
                    <span>Hoy: {row.fixturesToday} partidos</span>
                    <span>Cuotas: {row.withOddsPct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <article className={`lcv-panel lcv-detail ${mobileStep === "detail" ? "lcv-mobile-active" : ""}`}>
          <div className="lcv-panel-head">
            <button type="button" className="lcv-mobile-back" onClick={() => setMobileStep("leagues")}>
              <ArrowLeft size={14} /> Ligas
            </button>
            <h3>{selectedLeagueObj?.name ?? "Liga"}</h3>
            <span className={`lcv-tier-badge ${selectedLeagueObj?.tier ?? ""}`}>
              {selectedLeagueObj?.tier ?? "—"}
            </span>
          </div>

          {selectedLeagueObj && (
            <>
              <div className="lcv-window-controls">
                <label>
                  Fecha
                  <input
                    type="date"
                    value={selectedDate}
                    max={shiftIsoDateColombia(todayIsoDateColombia(), 14)}
                    onChange={(event) => onSelectDate(event.target.value)}
                  />
                </label>
                <div className="lcv-window-toggle">
                  <button
                    type="button"
                    className={windowMode === "day" ? "active" : ""}
                    onClick={() => setWindowMode("day")}
                  >
                    Día
                  </button>
                  <button
                    type="button"
                    className={windowMode === "week" ? "active" : ""}
                    onClick={() => setWindowMode("week")}
                  >
                    7 días
                  </button>
                </div>
              </div>

              <div className="lcv-coverage-score">
                <div className="lcv-score-head">
                  <span>Cobertura AI</span>
                  <b>{coverageScore}/100</b>
                </div>
                <div className="lcv-score-bar">
                  <i style={{ width: `${coverageScore}%` }} />
                </div>
                <p title={coverage?.confidenceImpact}>
                  {coverage?.confidenceImpact ?? "Selecciona una liga para evaluar confianza del modelo."}
                </p>
              </div>

              <div className="lcv-stats">
                <div className="lcv-stat-item">
                  <span>{windowMode === "day" ? "Hoy" : "Ventana"}</span>
                  <b>{windowMode === "day" ? dayFixtures.length : windowFixtures.length}</b>
                </div>
                <div className="lcv-stat-item">
                  <span>Edge/AI</span>
                  <b>{edgeCount}</b>
                </div>
                <div className="lcv-stat-item">
                  <span>Goles prom.</span>
                  <b>{seasonStats?.avgGoals ?? "—"}</b>
                </div>
                <div className="lcv-stat-item">
                  <span>Cuotas</span>
                  <b>{seasonStats ? `${seasonStats.withOddsPct}%` : "—"}</b>
                </div>
                <div className="lcv-stat-item">
                  <span>Muestra 14d</span>
                  <b>{seasonStats?.finishedMatches ?? "—"}</b>
                </div>
              </div>

              <div className="lcv-nav-actions">
                <button type="button" onClick={onOpenCalendar}>
                  <Calendar size={14} /> Calendario
                </button>
                <button type="button" onClick={onOpenDashboard}>
                  <Target size={14} /> Dashboard
                </button>
                <button type="button" onClick={onOpenOpportunities}>
                  <TrendingUp size={14} /> Oportunidades
                </button>
                <button type="button" onClick={copyShareLink}>
                  <Link2 size={14} /> Enlace
                </button>
              </div>

              <div className="lcv-coverage">
                <h4>
                  Capacidades del proveedor
                  {coverageLoading && <Loader2 size={12} className="spin" />}
                </h4>
                <div className="lcv-coverage-grid">
                  <CoverageMetric label="Fixtures" active={coverage?.capabilities.fixtures ?? true} />
                  <CoverageMetric label="Standings" active={coverage?.capabilities.standings ?? false} />
                  <CoverageMetric label="Odds" active={coverage?.capabilities.odds ?? false} />
                  <CoverageMetric label="Lineups" active={coverage?.capabilities.lineups ?? false} />
                  <CoverageMetric label="xG" active={coverage?.capabilities.xg ?? false} />
                  <CoverageMetric label="Lesiones" active={coverage?.capabilities.injuries ?? false} />
                  <CoverageMetric label="Árbitro" active={coverage?.capabilities.referee ?? false} />
                  <CoverageMetric label="H2H" active={coverage?.capabilities.h2h ?? false} />
                </div>
              </div>

              <div className="lcv-standings">
                <h4>
                  Clasificación top 5
                  {standingsLoading && <Loader2 size={12} className="spin" />}
                </h4>
                {standingsData?.rows.length ? (
                  <table className="lcv-standings-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Equipo</th>
                        <th>PJ</th>
                        <th>Pts</th>
                        <th>DG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standingsData.rows.map((row) => (
                        <tr key={row.teamId}>
                          <td>{row.rank}</td>
                          <td>
                            <span className="lcv-team-cell">
                              {row.teamLogo && <img src={row.teamLogo} alt="" />}
                              {row.teamName}
                            </span>
                          </td>
                          <td>{row.played}</td>
                          <td>{row.points}</td>
                          <td>{row.goalDiff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="lcv-muted">Tabla no disponible para esta liga en el proveedor actual.</p>
                )}
              </div>

              {dayFixtures.length > 0 ? (
                <div className="lcv-fixtures-preview">
                  <h4>
                    <TrendingUp size={14} />
                    Partidos {windowMode === "day" ? "del día" : "en ventana"}
                    {edgeCount > 0 && <span className="lcv-edge-pill">{edgeCount} con edge</span>}
                  </h4>
                  <div className="lcv-fx-list">
                    {(windowMode === "day" ? dayFixtures : windowFixtures).slice(0, 8).map((fixture) => (
                      <LeagueFixturePreviewRow
                        key={fixture.id}
                        fixture={fixture}
                        edgeHint={edgeHintsData?.hints[fixture.id]}
                        onClick={() => onOpenFixture?.(fixture)}
                      />
                    ))}
                  </div>
                  {windowFixtures.length > 8 && (
                    <button type="button" className="lcv-see-all" onClick={onOpenCalendar}>
                      Ver todos ({windowFixtures.length}) <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="lcv-no-fixtures">
                  {rangeLoading ? (
                    <p>Cargando calendario de la liga...</p>
                  ) : nextFixture ? (
                    <>
                      <p>No hay partidos en la fecha seleccionada.</p>
                      <div className="lcv-next-fixture">
                        <span>Próximo partido</span>
                        <strong>
                          {nextFixture.home.name} vs {nextFixture.away.name}
                        </strong>
                        <small>{new Date(nextFixture.kickoff).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</small>
                        <button type="button" onClick={() => onOpenFixture?.(nextFixture)}>
                          Abrir en Match Center
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>No hay partidos programados en los próximos 7 días.</p>
                      <button type="button" onClick={onOpenCalendar}>Explorar calendario</button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {!selectedLeagueObj && (
            <div className="lcv-no-fixtures">
              <p>Selecciona un país y una liga para ver cobertura, tabla y partidos.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function CoverageMetric({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className={`lcv-cov-item ${active ? "active" : ""}`}>
      {active ? <Wifi size={11} /> : <WifiOff size={11} />}
      <span>{label}</span>
    </div>
  );
}
