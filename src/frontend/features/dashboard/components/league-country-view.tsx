"use client";

import { CheckCircle2, Globe2, Layers3, Search, Wifi, WifiOff, Zap, TrendingUp, Calendar, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Country, Fixture, League, FixtureCoverage } from "@/shared/domain";

type LeagueCountryViewProps = {
  countries: Country[];
  leagues: League[];
  fixtures: Fixture[];
  selectedCountry: string;
  selectedLeague: string;
  loading: boolean;
  onSelectCountry: (countryId: string) => void;
  onSelectLeague: (leagueId: string) => void;
  onOpenCalendar: () => void;
  onOpenFixture?: (fixture: Fixture) => void;
};

export function LeagueCountryView({
  countries,
  leagues,
  fixtures,
  selectedCountry,
  selectedLeague,
  loading,
  onSelectCountry,
  onSelectLeague,
  onOpenCalendar,
  onOpenFixture,
}: LeagueCountryViewProps) {
  const [countryQuery, setCountryQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | League["tier"]>("all");

  const filteredCountries = useMemo(
    () => countries.filter((country) => `${country.name} ${country.code}`.toLowerCase().includes(countryQuery.toLowerCase())),
    [countries, countryQuery],
  );
  const filteredLeagues = useMemo(
    () => leagues.filter((league) => tierFilter === "all" || league.tier === tierFilter),
    [leagues, tierFilter],
  );
  const selectedCountryObj = countries.find((country) => country.id === selectedCountry);
  const selectedCountryName = selectedCountryObj?.name ?? "País";

  // Fixtures for the selected league
  const leagueFixtures = useMemo(
    () => fixtures.filter((f) => f.leagueId === selectedLeague),
    [fixtures, selectedLeague]
  );

  // Count fixtures per league
  const fixtureCountByLeague = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of fixtures) {
      map.set(f.leagueId, (map.get(f.leagueId) ?? 0) + 1);
    }
    return map;
  }, [fixtures]);

  // League stats
  const leagueStats = useMemo(() => {
    if (leagueFixtures.length === 0) return null;
    const totalGoals = leagueFixtures.reduce((sum, f) => sum + (f.result?.totalGoals ?? 0), 0);
    const finishedMatches = leagueFixtures.filter(f => f.status === "final").length;
    const liveMatches = leagueFixtures.filter(f => f.status === "live").length;
    const avgGoals = finishedMatches > 0 ? (totalGoals / finishedMatches).toFixed(1) : "—";
    const withOdds = leagueFixtures.filter(f => f.market.homeWinOdds > 0).length;
    return { total: leagueFixtures.length, finished: finishedMatches, live: liveMatches, avgGoals, withOdds };
  }, [leagueFixtures]);

  // Coverage from fixtures — or fetch real coverage by analyzing a sample fixture
  const [realCoverage, setRealCoverage] = useState<FixtureCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageCheckedLeague, setCoverageCheckedLeague] = useState("");

  // When league changes and has fixtures, check real coverage by analyzing one
  useEffect(() => {
    if (!selectedLeague || selectedLeague === coverageCheckedLeague) return;
    if (leagueFixtures.length === 0) {
      setRealCoverage(null);
      return;
    }

    const sampleFixture = leagueFixtures[0];
    let cancelled = false;
    setCoverageLoading(true);

    const checkCoverage = async () => {
      try {
        const res = await fetch(`/api/analyze/${sampleFixture.id}`);
        if (!res.ok) throw new Error("fail");
        const payload = await res.json();
        const fixture = payload.data?.fixture;
        if (fixture && !cancelled) {
          setRealCoverage(fixture.coverage);
          setCoverageCheckedLeague(selectedLeague);
        }
      } catch {
        // Fallback to basic coverage from fixture list
        if (!cancelled) {
          setRealCoverage(sampleFixture.coverage);
          setCoverageCheckedLeague(selectedLeague);
        }
      } finally {
        if (!cancelled) setCoverageLoading(false);
      }
    };

    checkCoverage();
    return () => { cancelled = true; };
  }, [selectedLeague, leagueFixtures, coverageCheckedLeague]);

  const leagueCoverage = realCoverage;

  const selectedLeagueObj = leagues.find((l) => l.id === selectedLeague);

  return (
    <section className="view-workspace lcv">
      {/* Header */}
      <article className="lcv-header">
        <div>
          <h2>Ligas y Países</h2>
          <p>Explora {countries.length} países · {leagues.length} ligas disponibles · Selecciona para ver partidos y cobertura</p>
        </div>
        <button className="lcv-cal-btn" onClick={onOpenCalendar}>
          <Calendar size={16} /> Abrir Calendario
        </button>
      </article>

      <div className="lcv-grid">
        {/* Countries panel */}
        <article className="lcv-panel lcv-countries">
          <div className="lcv-panel-head">
            <h3>Países</h3>
            <span>{countries.length}</span>
          </div>
          <label className="lcv-search">
            <Search size={14} />
            <input value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} placeholder="Buscar país..." />
          </label>
          <div className="lcv-country-list">
            {filteredCountries.map((country) => (
              <button
                key={country.id}
                className={`lcv-country-row ${country.id === selectedCountry ? "active" : ""}`}
                onClick={() => onSelectCountry(country.id)}
              >
                {country.flag ? (
                  <img src={country.flag} alt="" className="lcv-country-flag" />
                ) : (
                  <Globe2 size={16} />
                )}
                <strong>{country.name}</strong>
                <span className="lcv-country-code">{country.code}</span>
              </button>
            ))}
          </div>
        </article>

        {/* Leagues panel */}
        <article className="lcv-panel lcv-leagues">
          <div className="lcv-panel-head">
            <h3>
              {selectedCountryObj?.flag && <img src={selectedCountryObj.flag} alt="" className="lcv-head-flag" />}
              Ligas de {selectedCountryName}
            </h3>
            <span>{loading ? "Cargando..." : `${filteredLeagues.length} ligas`}</span>
          </div>
          <div className="lcv-tier-filter">
            {(["all", "elite", "standard", "low"] as const).map((tier) => (
              <button key={tier} className={tierFilter === tier ? "active" : ""} onClick={() => setTierFilter(tier)}>
                {tier === "all" ? "Todas" : tier === "elite" ? "⭐ Elite" : tier === "standard" ? "📊 Standard" : "📋 Otras"}
              </button>
            ))}
          </div>
          <div className="lcv-league-list">
            {filteredLeagues.map((league) => {
              const fxCount = fixtureCountByLeague.get(league.id) ?? 0;
              return (
                <button
                  key={league.id}
                  className={`lcv-league-row ${league.id === selectedLeague ? "active" : ""}`}
                  onClick={() => onSelectLeague(league.id)}
                >
                  <Layers3 size={18} />
                  <div className="lcv-league-info">
                    <strong>{league.name}</strong>
                    <span>Temporada {league.season} · {league.tier}</span>
                  </div>
                  {fxCount > 0 && <span className="lcv-league-badge">{fxCount}</span>}
                  {league.id === selectedLeague && <CheckCircle2 size={16} className="lcv-check" />}
                </button>
              );
            })}
            {!filteredLeagues.length && <div className="lcv-empty">No hay ligas con ese filtro.</div>}
          </div>
        </article>

        {/* Detail panel — Coverage + Fixtures preview */}
        <article className="lcv-panel lcv-detail">
          {/* Coverage */}
          <div className="lcv-panel-head">
            <h3>{selectedLeagueObj?.name ?? "Liga"}</h3>
            <span className={`lcv-tier-badge ${selectedLeagueObj?.tier ?? ""}`}>{selectedLeagueObj?.tier ?? "—"}</span>
          </div>

          {/* League stats */}
          {leagueStats && (
            <div className="lcv-stats">
              <div className="lcv-stat-item">
                <span>Partidos hoy</span>
                <b>{leagueStats.total}</b>
              </div>
              <div className="lcv-stat-item">
                <span>En vivo</span>
                <b className="live">{leagueStats.live}</b>
              </div>
              <div className="lcv-stat-item">
                <span>Finalizados</span>
                <b>{leagueStats.finished}</b>
              </div>
              <div className="lcv-stat-item">
                <span>Goles prom.</span>
                <b>{leagueStats.avgGoals}</b>
              </div>
              <div className="lcv-stat-item">
                <span>Con cuotas</span>
                <b>{leagueStats.withOdds}</b>
              </div>
            </div>
          )}

          {/* Coverage matrix */}
          <div className="lcv-coverage">
            <h4>Cobertura del proveedor {coverageLoading && <Loader2 size={12} className="spin" />}</h4>
            {coverageLoading ? (
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "8px 0" }}>Verificando cobertura real con la API...</p>
            ) : (
              <div className="lcv-coverage-grid">
                <CoverageMetric label="Fixtures" active={true} />
                <CoverageMetric label="Standings" active={Boolean(selectedLeagueObj)} />
                <CoverageMetric label="Odds" active={leagueCoverage?.hasOdds ?? false} />
                <CoverageMetric label="Lineups" active={leagueCoverage?.hasLineups ?? false} />
                <CoverageMetric label="xG" active={leagueCoverage?.hasXg ?? false} />
                <CoverageMetric label="Lesiones" active={leagueCoverage?.hasInjuries ?? false} />
                <CoverageMetric label="Árbitro" active={leagueCoverage?.hasReferee ?? false} />
                <CoverageMetric label="H2H" active={leagueCoverage?.hasH2H ?? false} />
              </div>
            )}
          </div>

          {/* Fixtures preview */}
          {leagueFixtures.length > 0 && (
            <div className="lcv-fixtures-preview">
              <h4><TrendingUp size={14} /> Partidos de esta liga hoy</h4>
              <div className="lcv-fx-list">
                {leagueFixtures.slice(0, 6).map((fixture) => (
                  <button
                    key={fixture.id}
                    className={`lcv-fx-row ${fixture.status}`}
                    onClick={() => onOpenFixture?.(fixture)}
                  >
                    <div className="lcv-fx-time">
                      {fixture.status === "live" ? (
                        <span className="lcv-fx-live">{fixture.elapsed}′</span>
                      ) : fixture.status === "final" ? (
                        <span className="lcv-fx-final">FT</span>
                      ) : (
                        <span>{new Date(fixture.kickoff).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" })}</span>
                      )}
                    </div>
                    <div className="lcv-fx-teams">
                      <span>{fixture.home.name}</span>
                      {fixture.result ? (
                        <b className={fixture.status === "live" ? "live" : ""}>{fixture.result.homeGoals} - {fixture.result.awayGoals}</b>
                      ) : (
                        <b className="vs">vs</b>
                      )}
                      <span>{fixture.away.name}</span>
                    </div>
                    <Zap size={12} className="lcv-fx-action" />
                  </button>
                ))}
              </div>
              {leagueFixtures.length > 6 && (
                <button className="lcv-see-all" onClick={onOpenCalendar}>
                  Ver todos ({leagueFixtures.length} partidos) →
                </button>
              )}
            </div>
          )}

          {leagueFixtures.length === 0 && selectedLeagueObj && (
            <div className="lcv-no-fixtures">
              <p>No hay partidos de esta liga para la fecha seleccionada.</p>
              <button onClick={onOpenCalendar}>Buscar en el Calendario</button>
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
