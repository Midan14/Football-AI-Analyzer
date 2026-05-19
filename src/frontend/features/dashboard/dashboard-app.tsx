"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ChevronDown,
  Moon,
  RefreshCw,
  Search,
  Sun,
  User,
} from "lucide-react";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import { useCountries } from "@/frontend/hooks/use-countries";
import { useLeagues } from "@/frontend/hooks/use-leagues";
import { useFixtures } from "@/frontend/hooks/use-fixtures";
import { useAnalysis, useAnalysisWithFixture } from "@/frontend/hooks/use-analysis";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { useDebounce } from "@/frontend/hooks/use-debounce";
import { useWatchlist } from "@/frontend/hooks/use-watchlist";
import { useToast } from "@/frontend/hooks/use-toast";

import { ToastContainer } from "@/frontend/components/toast-container";
import { FixturesBoard } from "./components/fixtures-board";
import { QuickAnalysisCard } from "./components/quick-analysis-card";
import { CalendarView } from "./components/calendar-view";
import { DashboardSkeleton } from "./components/dashboard-skeleton";
import { LeagueCountryView } from "./components/league-country-view";
import { ModelAiView } from "./components/model-ai-view";
import { AlertsView } from "./components/alerts-view";
import { WatchlistView } from "./components/watchlist-view";
import { ReportsView } from "./components/reports-view";
import { SettingsView } from "./components/settings-view";
import { DeepAnalysisView } from "./components/deep-analysis-view";
import { LiveMatchesView } from "./components/live-matches-view";
import { PredictionHistoryView } from "./components/prediction-history-view";
import { HelpView } from "./components/help-view";
import { AnalysisHistoryView } from "./components/analysis-history-view";
import { OpportunitiesPanel } from "./components/opportunities-panel";
import { BankrollPanel } from "./components/bankroll-panel";
import { navItems, type ModelMode, type ScenarioId, type DensityMode } from "./dashboard-config";
import { type ModelRun } from "./model-runs-builder";
import { TopSelect, OperationalStrip } from "./dashboard-components";

export function DashboardApp() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState("Dashboard Global");
  const [theme, setTheme] = useLocalStorage<"dark" | "light">("football-ai-theme", "dark");
  const [mounted, setMounted] = useState(false);
  const [starred, toggleStar] = useWatchlist();
  const [statusMessage, setStatusMessage] = useState("Sistema listo");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("");

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const [selectedDate, setSelectedDate] = useState(`${yyyy}-${mm}-${dd}`);
  const lastLiveAutoSearchDateRef = useRef<string>("");

  const [selectedFixtureId, setSelectedFixtureId] = useState<string>("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamSearchOpen, setTeamSearchOpen] = useState(false);
  const debouncedTeamSearch = useDebounce(teamSearch, 250);

  const [modelMode, setModelMode] = useLocalStorage<ModelMode>("football-ai-model-mode", "Balanceado");
  const [scenario, setScenario] = useState<ScenarioId>("base");
  const [density, setDensity] = useLocalStorage<DensityMode>("football-ai-density", "comfortable");
  const [bankroll, setBankroll] = useLocalStorage<number>("football-ai-bankroll", 1000);
  const [_analyzing, _setAnalyzing] = useState(false);
  const [_modelRuns, _setModelRuns] = useState<ModelRun[]>([]);
  const [_activityLog, setActivityLog] = useState<
    Array<{ id: string; title: string; meta: string; tone: "good" | "warn" | "danger" | "neutral" }>
  >([{ id: "init", title: "Sistema listo", meta: "Selecciona un partido o ejecuta una acción del panel.", tone: "neutral" }]);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: countries = [], isLoading: countriesLoading, error: countriesError } = useCountries();
  const { data: leagues = [], isLoading: leaguesLoading, error: leaguesError } = useLeagues(selectedCountry);
  const { data: fixtures = [], isLoading: fixturesLoading, error: fixturesError, refetch: refetchFixtures } = useFixtures(undefined, selectedDate);
  const {
    data: _liveLeagues = [],
    error: liveLeaguesError,
  } = useLeagues(undefined, { enabled: activeView === "Partidos en Vivo" });
  const {
    data: liveFixtures = [],
    error: liveFixturesError,
  } = useFixtures(undefined, selectedDate, { enabled: activeView === "Partidos en Vivo" });

  useEffect(() => {
    if (activeView !== "Partidos en Vivo") return;
    if (liveFixtures.length > 0) return;
    if (lastLiveAutoSearchDateRef.current === selectedDate) return;
    lastLiveAutoSearchDateRef.current = selectedDate;

    let cancelled = false;

    const findNearestDateWithFixtures = async () => {
      const offsets = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7];
      for (const offset of offsets) {
        const candidateDate = shiftIsoDate(selectedDate, offset);
        try {
          const response = await fetch(`/api/fixtures?date=${encodeURIComponent(candidateDate)}`);
          if (!response.ok) continue;
          const payload = (await response.json()) as { data?: { fixtures?: Fixture[] } };
          const candidateFixtures = payload.data?.fixtures ?? [];
          if (candidateFixtures.length > 0) {
            if (cancelled) return;
            setSelectedDate(candidateDate);
            setStatusMessage(`Sin partidos en ${selectedDate}. Mostrando ${candidateDate}.`);
            return;
          }
        } catch {
          // Continue probing nearby dates when one request fails.
        }
      }
      if (!cancelled) {
        setStatusMessage(`Sin partidos entre ${shiftIsoDate(selectedDate, -7)} y ${shiftIsoDate(selectedDate, 7)}.`);
      }
    };

    void findNearestDateWithFixtures();

    return () => {
      cancelled = true;
    };
  }, [activeView, liveFixtures, selectedDate]);

  const pushActivity = (title: string, meta: string, tone: "good" | "warn" | "danger" | "neutral" = "neutral") => {
    setActivityLog((items) => [{ id: `${Date.now()}-${items.length}`, title, meta, tone }, ...items].slice(0, 6));
    setStatusMessage(title);
  };

  useEffect(() => {
    if (countries.length && !selectedCountry) {
      setSelectedCountry(countries[0].id);
    }
  }, [countries, selectedCountry]);

  useEffect(() => {
    if (leagues.length && !leagues.some((league) => league.id === selectedLeague)) {
      setSelectedLeague(leagues[0].id);
    }
  }, [leagues, selectedLeague]);

  useEffect(() => {
    if (fixtures.length && !selectedFixtureId) {
      setSelectedFixtureId(fixtures[0].id);
    }
  }, [fixtures, selectedFixtureId]);

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === selectedFixtureId),
    [fixtures, selectedFixtureId]
  );

  // Cross-league team search: filter all loaded fixtures by team name
  const teamSearchResults = useMemo(() => {
    if (!debouncedTeamSearch.trim()) return [];
    const q = debouncedTeamSearch.toLowerCase();
    return fixtures
      .filter(
        (f) =>
          f.home.name.toLowerCase().includes(q) ||
          f.away.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [fixtures, debouncedTeamSearch]);
  const { data: analysisData, isLoading: analysisLoading } = useAnalysis(selectedFixture?.id ?? "");
  const analysis: AnalysisResult | null = analysisData ?? null;

  // Match Center uses useAnalysisWithFixture for real-time fixture + analysis updates
  const {
    data: matchCenterData,
    isLoading: matchCenterLoading,
    isFetching: matchCenterFetching,
    dataUpdatedAt: matchCenterUpdatedAt,
  } = useAnalysisWithFixture(
    activeView === "Match Center" ? selectedFixtureId : ""
  );
  const loading = countriesLoading || leaguesLoading || fixturesLoading || analysisLoading;

  const scenarioDelta = scenario === "lineups" ? 4 : scenario === "rotation" ? -9 : scenario === "weather" ? -5 : 0;
  const modeDelta = modelMode === "Conservador" ? -3 : modelMode === "Agresivo" ? 2 : 0;
  const displayedConfidence = Math.max(0, Math.min(100, (analysis?.confidence.score ?? 0) + scenarioDelta + modeDelta));

  const positiveEdges = analysis?.valueTable.filter((row) => row.edge > 0).length ?? 0;
  const actionableMarkets = analysis?.valueTable.filter((row) => row.edge >= 4).length ?? 0;
  const riskLevel = displayedConfidence >= 68 ? "BAJO" : displayedConfidence >= 52 ? "MODERADO" : "ALTO";
  const qualityScore = Math.max(0, Math.min(100, displayedConfidence + positiveEdges * 3 - (analysis?.riskFlags.length ?? 0) * 4));
  const fixtureStatus = selectedFixture?.status === "live" ? "En vivo" : selectedFixture?.status === "final" ? "Finalizado" : "Pre-match";

  const isDashboardView = activeView === "Dashboard Global";

  const hasError = countriesError || leaguesError || fixturesError || liveLeaguesError || liveFixturesError;
  const errorMessage =
    countriesError?.message ??
    leaguesError?.message ??
    fixturesError?.message ??
    liveLeaguesError?.message ??
    liveFixturesError?.message;
  const safeThemeClass = mounted && theme === "light" ? "light-mode" : "";
  const safeDensity = mounted ? density : "comfortable";

  if (loading && !countries.length) {
    return (
      <main className={`viewport density-${safeDensity} ${safeThemeClass}`}>
        <DashboardSkeleton />
      </main>
    );
  }

  return (
    <main className={`viewport density-${safeDensity} ${safeThemeClass}`}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <div className="dashboard-frame">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-shield">⚽</div>
            <strong>Football AI Analyzer</strong>
          </div>

          <nav className="nav">
            {navItems.map(([label, Icon]) => (
              <button
                aria-label={label}
                title={label}
                className={activeView === label ? "active" : ""}
                onClick={() => setActiveView(label)}
                key={label}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="side-bottom">
            <div className="theme">
              <span>Tema</span>
              <div className="theme-toggle">
                <button className={theme === "light" ? "active" : ""} aria-label="tema claro" onClick={() => setTheme("light")}><Sun size={18} /></button>
                <button className={theme === "dark" ? "active" : ""} aria-label="tema oscuro" onClick={() => setTheme("dark")}><Moon size={18} /></button>
              </div>
            </div>
            <button className="analyst" onClick={() => setStatusMessage("Perfil de analista activo: Plan Pro")}>
              <User size={22} />
              <div><strong>Analista</strong><span>Plan Pro</span></div>
              <ChevronDown size={18} />
            </button>
          </div>
        </aside>

        <section className="main-area" id="main-content">
          {hasError && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>Error: {errorMessage}</span>
              <button onClick={() => window.location.reload()}>Reintentar</button>
            </div>
          )}

          <header className="topbar">
            <div className="selectors-chain">
              <div className="top-select-with-flag">
                {(() => {
                  const country = countries.find((c) => c.id === selectedCountry);
                  return country?.flag ? <Image src={country.flag} alt="" width={24} height={16} className="country-flag" /> : null;
                })()}
                <TopSelect
                  label="País"
                  value={selectedCountry}
                  onChange={setSelectedCountry}
                  options={countries.map((country) => ({ value: country.id, label: country.name }))}
                />
              </div>
              <span className="chain-arrow">→</span>
              <TopSelect
                label="Liga"
                value={selectedLeague}
                onChange={setSelectedLeague}
                options={leagues.map((league) => ({ value: league.id, label: league.name }))}
              />
              <span className="chain-arrow">→</span>
              <label className="top-select">
                <span>Fecha</span>
                <input value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} type="date" />
              </label>
              {fixtures.length > 0 && (
                <>
                  <span className="chain-arrow">→</span>
                  <TopSelect
                    label="Partido"
                    value={selectedFixtureId}
                    onChange={setSelectedFixtureId}
                    options={fixtures.map((fixture) => ({
                      value: fixture.id,
                      label: `${fixture.home.name} vs ${fixture.away.name}`,
                    }))}
                  />
                </>
              )}
              {/* Team search — cross-fixture quick finder */}
              <span className="chain-arrow">|</span>
              <div style={{ position: "relative" }}>
                <label className="top-select" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Search size={14} style={{ color: "#71717a", flexShrink: 0 }} />
                  <input
                    value={teamSearch}
                    onChange={(e) => { setTeamSearch(e.target.value); setTeamSearchOpen(true); }}
                    onFocus={() => setTeamSearchOpen(true)}
                    onBlur={() => setTimeout(() => setTeamSearchOpen(false), 180)}
                    placeholder="Buscar equipo..."
                    style={{ background: "transparent", border: "none", outline: "none", color: "#f4f4f5", fontSize: 13, width: 140 }}
                    aria-label="Buscar equipo en partidos cargados"
                  />
                </label>
                {teamSearchOpen && teamSearchResults.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    zIndex: 50,
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 8,
                    minWidth: 260,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    overflow: "hidden",
                  }}>
                    {teamSearchResults.map((f) => (
                      <button
                        key={f.id}
                        onMouseDown={() => {
                          setSelectedFixtureId(f.id);
                          setTeamSearch("");
                          setTeamSearchOpen(false);
                          setActiveView("Match Center");
                          setStatusMessage(`Partido cargado: ${f.home.name} vs ${f.away.name}`);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 14px",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid #2a2a2a",
                          color: "#f4f4f5",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <strong>{f.home.name}</strong>
                        <span style={{ color: "#71717a", margin: "0 6px" }}>vs</span>
                        <strong>{f.away.name}</strong>
                        <span style={{ color: "#52525b", fontSize: 11, marginLeft: 8 }}>{f.leagueName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="top-status">
              <strong>
                {fixtures.length} partidos
                {selectedFixture ? ` · ${selectedFixture.home.name} vs ${selectedFixture.away.name}` : ""}
              </strong>
              <span>{loading ? "Actualizando datos..." : statusMessage}</span>
            </div>
            <button
              className="refresh"
              aria-label="refrescar"
              onClick={() => {
                setStatusMessage("Datos actualizados desde backend/API");
                refetchFixtures();
              }}
            >
              <RefreshCw size={28} />
            </button>
          </header>

          {!isDashboardView && (
            <OperationalStrip
              fixture={selectedFixture}
              loading={loading}
              confidence={displayedConfidence}
              riskLevel={riskLevel}
              qualityScore={qualityScore}
              actionableMarkets={actionableMarkets}
              fixtureStatus={fixtureStatus}
            />
          )}

          {isDashboardView && (
            <FixturesBoard
              fixtures={fixtures}
              starred={starred}
              loading={fixturesLoading}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setStatusMessage(`Fecha actualizada: ${date}`);
              }}
              onOpenFixture={(fixture) => {
                setSelectedFixtureId(fixture.id);
                setActiveView("Match Center");
                setStatusMessage(`Partido abierto: ${fixture.home.name} vs ${fixture.away.name}`);
              }}
              onToggleStar={(fixture) => toggleStar(fixture)}
            />
          )}

          {activeView === "Ligas y Países" ? (
            <LeagueCountryView
              countries={countries}
              leagues={leagues}
              fixtures={fixtures}
              selectedCountry={selectedCountry}
              selectedLeague={selectedLeague}
              loading={loading}
              onSelectCountry={(countryId) => {
                setSelectedCountry(countryId);
                setStatusMessage("País actualizado; cargando ligas disponibles");
              }}
              onSelectLeague={(leagueId) => {
                setSelectedLeague(leagueId);
                setStatusMessage("Liga actualizada; cargando calendario");
              }}
              onOpenCalendar={() => setActiveView("Calendario")}
              onOpenFixture={(fixture) => {
                setSelectedFixtureId(fixture.id);
                const fixtureDate = fixture.kickoff.slice(0, 10);
                if (fixtureDate !== selectedDate) setSelectedDate(fixtureDate);
                setActiveView("Match Center");
                setStatusMessage(`Match Center: ${fixture.home.name} vs ${fixture.away.name}`);
              }}
            />
          ) : activeView === "Calendario" ? (
            <CalendarView
              fixtures={fixtures}
              leagues={leagues}
              selectedDate={selectedDate}
              selectedFixtureId={selectedFixtureId}
              loading={loading}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setStatusMessage(`Calendario actualizado: ${date}`);
              }}
              onRefresh={() => {
                refetchFixtures();
                setStatusMessage("Calendario refrescado desde backend/API");
              }}
              onOpenFixture={(fixture) => {
                setSelectedFixtureId(fixture.id);
                // Update date to match the fixture's date so useFixtures loads the right day
                const fixtureDate = fixture.kickoff.slice(0, 10);
                if (fixtureDate !== selectedDate) {
                  setSelectedDate(fixtureDate);
                }
                setActiveView("Match Center");
                setStatusMessage(`Match Center abierto: ${fixture.home.name} vs ${fixture.away.name}`);
              }}
            />
          ) : activeView === "Modelos AI" ? (
            <ModelAiView
              fixture={selectedFixture}
              analysis={analysis}
              modelMode={modelMode}
              scenario={scenario}
              displayedConfidence={displayedConfidence}
              onModeChange={setModelMode}
              onScenarioChange={setScenario}
              onOpenMatch={() => setActiveView("Match Center")}
            />
          ) : activeView === "Partidos en Vivo" ? (
            <LiveMatchesView
              fixture={selectedFixture}
              onOpenMatchCenter={(f) => {
                setSelectedFixtureId(f.id);
                setActiveView("Match Center");
                setStatusMessage(`Match Center: ${f.home.name} vs ${f.away.name}`);
              }}
            />
          ) : activeView === "Match Center" ? (
            (selectedFixtureId) ? (() => {
              const displayFixture = matchCenterData?.fixture ?? selectedFixture;
              if (!displayFixture && matchCenterLoading) {
                return (
                  <div className="qa-card qa-loading">
                    <strong>Cargando partido...</strong>
                    <small>Obteniendo datos del fixture {selectedFixtureId}</small>
                  </div>
                );
              }
              if (!displayFixture) {
                return (
                  <div className="qa-card qa-loading">
                    <strong>Analizando partido...</strong>
                    <small>Ejecutando modelos de predicción</small>
                  </div>
                );
              }
              return (
                <QuickAnalysisCard
                  fixture={displayFixture}
                  analysis={matchCenterData?.analysis ?? analysis}
                  lineups={matchCenterData?.lineups}
                  events={matchCenterData?.events}
                  statistics={matchCenterData?.statistics}
                  loading={matchCenterLoading || analysisLoading}
                  isFetching={matchCenterFetching}
                  lastUpdatedAt={matchCenterUpdatedAt}
                  onAnalyze={async () => {
                    if (selectedFixtureId) {
                      // Clear server-side Redis cache for this fixture
                      try {
                        await fetch(`/api/analyze/${selectedFixtureId}?bust=1`, { method: "DELETE" });
                      } catch {}
                      // Invalidate client-side React Query cache
                      await queryClient.invalidateQueries({ queryKey: ["analysis-full", selectedFixtureId] });
                      await queryClient.invalidateQueries({ queryKey: ["analysis", selectedFixtureId] });
                      refetchFixtures();
                      pushActivity("Re-análisis ejecutado", `16 modelos recalculados para ${selectedFixtureId}`, "good");
                    }
                  }}
                  onOpenDeep={() => setActiveView("Análisis Profundo")}
                  addToast={addToast}
                  mlPrediction={matchCenterData?.mlPrediction}
                />
              );
            })() : (
              <div className="empty-state large">Selecciona un partido para analizar.</div>
            )
          ) : activeView === "Análisis Profundo" ? (
            <DeepAnalysisView fixture={matchCenterData?.fixture ?? selectedFixture} />
          ) : activeView === "Oportunidades" ? (
            <div className="space-y-6 p-4">
              <h2 className="text-xl font-bold">Oportunidades de Value</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Bankroll</h3>
                  <BankrollPanel />
                </div>
                <div>
                  <h3 className="font-semibold mb-3">Oportunidades Detectadas</h3>
                  <OpportunitiesPanel />
                </div>
              </div>
            </div>
          ) : activeView === "Historial de Análisis" ? (
            <AnalysisHistoryView
              onOpenFixture={(record) => {
                setSelectedFixtureId(record.fixtureId);
                setSelectedDate(record.matchDate.slice(0, 10));
                setActiveView("Match Center");
                setStatusMessage(`Partido cargado desde historial: ${record.homeTeam} vs ${record.awayTeam}`);
              }}
            />
          ) : activeView === "Mis Predicciones" ? (
            <PredictionHistoryView addToast={addToast} />
          ) : activeView === "Alertas" ? (
            <AlertsView
              fixture={selectedFixture}
              analysis={analysis}
              fixtures={fixtures}
              onOpenFixture={(fixture) => {
                setSelectedFixtureId(fixture.id);
                setActiveView("Match Center");
                setStatusMessage(`Alerta abierta: ${fixture.home.name} vs ${fixture.away.name}`);
              }}
            />
          ) : activeView === "Watchlist" ? (
            <WatchlistView
              fixtures={fixtures}
              starred={starred}
              onToggleStar={(fixture) => toggleStar(fixture)}
              onOpenFixture={(fixture) => {
                setSelectedFixtureId(fixture.id);
                setActiveView("Match Center");
                setStatusMessage(`Watchlist abierto: ${fixture.home.name} vs ${fixture.away.name}`);
              }}
            />
          ) : activeView === "Informes" ? (
            <ReportsView fixture={selectedFixture} analysis={analysis} modelMode={modelMode} scenario={scenario} riskLevel={riskLevel} onOpenMatch={() => setActiveView("Match Center")} />
          ) : activeView === "Configuración" ? (
            <SettingsView
              provider="API-Football"
              onProviderClick={() => pushActivity("Proveedor: API-Football Pro", "7500 req/día activo")}
              modelMode={modelMode}
              scenario={scenario}
              density={density}
              bankroll={bankroll}
              onModeChange={setModelMode}
              onScenarioChange={setScenario}
              onDensityChange={setDensity}
              onBankrollChange={setBankroll}
            />
          ) : activeView === "Ayuda" ? (
            <HelpView />
          ) : null}

          <footer className="footer">
            <span>Aviso: El análisis es informativo y no garantiza resultados. Apuesta responsable. 18+</span>
            <span>Modelo interno: <b>v2.4.1</b> &nbsp; | &nbsp; Panel actualizado: {new Date().toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })} COT</span>
          </footer>
        </section>
      </div>
    </main>
  );
}

function shiftIsoDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + days);
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
