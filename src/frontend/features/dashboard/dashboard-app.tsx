"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Moon,
  Sun,
  User,
} from "lucide-react";

import { ToastContainer } from "@/frontend/components/toast-container";
import { GlobalDashboardView } from "./components/global-dashboard-view";
import { QuickAnalysisCard } from "./components/quick-analysis-card";
import { CalendarView } from "./components/calendar-view";
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
import { OpportunitiesView } from "./components/opportunities-view";
import { OddsIntelligenceView } from "./components/odds-intelligence-view";
import { navSections } from "./dashboard-config";
import { OperationalStrip } from "./dashboard-components";
import { DashboardTopbar } from "./components/dashboard-topbar";
import { DataStatusBanner } from "./components/data-status-banner";
import { FavoriteTeamAlertsBar } from "./components/favorite-team-alerts-bar";
import { AppBootSplash } from "@/frontend/components/app-boot-splash";
import { useDashboardController } from "./use-dashboard-controller";

export function DashboardApp() {
  const {
    activeView, setActiveView, theme, setTheme, starred, toggleStar,
    statusMessage, setStatusMessage, selectedCountry, setSelectedCountry,
    selectedLeague, setSelectedLeague, selectedDate, setSelectedDate,
    selectedFixtureId, setSelectedFixtureId, teamSearch, setTeamSearch,
    teamSearchOpen, setTeamSearchOpen, modelMode, setModelMode, scenario,
    setScenario, density, setDensity, bankroll, setBankroll, toasts, addToast,
    removeToast, countries, leagues, allLeagues, dataProvider, fixtures, fixturesLoading, fixturesDataSource, oddsLoading, refetchFixtures,
    selectedFixture, remoteFixtureError, teamSearchResults, analysis, analysisLoading, analysisError, analysisErrorMessage, refetchAnalysis, analysisPipeline,
    matchCenterData, matchCenterLoading, matchCenterFetching, matchCenterUpdatedAt,
    loading, bootstrapLoading, bootstrapTimedOut, retryBootstrap, displayedConfidence, confidenceHint, actionableMarkets, riskLevel, qualityScore,
    fixtureStatus, isDashboardView, hasError, errorMessage, safeThemeClass,
    safeDensity, pushActivity, openFixtureWithDate, goHome, setModelModePersisted, setBankrollPersisted,
    reanalyzeSelectedFixture, isReanalyzing,
  } = useDashboardController();

  const [brandBusy, setBrandBusy] = useState(false);

  const handleBrandHome = () => {
    setBrandBusy(true);
    goHome();
    window.setTimeout(() => setBrandBusy(false), 700);
  };

  if (bootstrapLoading) {
    return (
      <main className={`viewport density-${safeDensity} ${safeThemeClass}`}>
        <AppBootSplash
          message="Conectando Football AI…"
          submessage="Cargando países, ligas y partidos del día"
        />
      </main>
    );
  }

  return (
    <main className={`viewport density-${safeDensity} ${safeThemeClass}`}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <FavoriteTeamAlertsBar onAlert={addToast} />
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <div className="dashboard-frame">
        <aside className="sidebar">
          <button
            type="button"
            className={`brand brand-home-btn ${brandBusy ? "busy" : ""} ${activeView === "Dashboard Global" ? "active" : ""}`}
            onClick={handleBrandHome}
            aria-label="Ir al Dashboard Global"
            title="Ir al inicio — Dashboard Global"
          >
            <div className="brand-shield" aria-hidden="true">⚽</div>
            <strong>Football AI Analyzer</strong>
          </button>

          <nav className="nav" aria-label="Navegación principal">
            {navSections.map((section) => (
              <div key={section.label} className="nav-section">
                <span className="nav-section-label">{section.label}</span>
                {section.items.map(([label, Icon]) => (
                  <button
                    type="button"
                    aria-label={label}
                    aria-current={activeView === label ? "page" : undefined}
                    title={label}
                    className={activeView === label ? "active" : ""}
                    onClick={() => setActiveView(label)}
                    key={label}
                  >
                    <Icon size={22} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
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
            <button
              type="button"
              className="analyst"
              aria-label="Abrir configuración de perfil"
              onClick={() => {
                setActiveView("Configuración");
                setStatusMessage("Configuración de perfil y preferencias");
              }}
            >
              <User size={22} />
              <div><strong>Analista</strong><span>Perfil y ajustes</span></div>
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

          {bootstrapTimedOut && (
            <div className="data-status-banner data-status-banner--demo" role="alert">
              <AlertTriangle size={18} />
              <div>
                <strong>Carga inicial lenta</strong>
                <p>El proveedor tardó más de 12s. Podés reintentar o seguir con datos parciales.</p>
              </div>
              <button type="button" className="data-status-banner__btn" onClick={retryBootstrap}>
                Reintentar
              </button>
            </div>
          )}

          <DataStatusBanner
            fixturesDataSource={fixturesDataSource}
            onRefresh={() => refetchFixtures()}
          />

          <DashboardTopbar
            countries={countries}
            leagues={leagues}
            fixtures={fixtures}
            selectedCountry={selectedCountry}
            selectedLeague={selectedLeague}
            selectedDate={selectedDate}
            selectedFixtureId={selectedFixtureId}
            selectedFixture={selectedFixture}
            teamSearch={teamSearch}
            teamSearchOpen={teamSearchOpen}
            teamSearchResults={teamSearchResults}
            loading={loading}
            statusMessage={statusMessage}
            onSelectCountry={setSelectedCountry}
            onSelectLeague={setSelectedLeague}
            onSelectDate={setSelectedDate}
            onSelectFixture={setSelectedFixtureId}
            onTeamSearchChange={setTeamSearch}
            onTeamSearchOpenChange={setTeamSearchOpen}
            onOpenSearchFixture={(fixture) => {
              setSelectedFixtureId(fixture.id);
              setTeamSearch("");
              setTeamSearchOpen(false);
              setActiveView("Match Center");
              setStatusMessage(`Partido cargado: ${fixture.home.name} vs ${fixture.away.name}`);
            }}
            onRefresh={() => {
              setStatusMessage("Datos actualizados desde backend/API");
              refetchFixtures();
            }}
          />

          {!isDashboardView && (
            <OperationalStrip
              fixture={selectedFixture}
              loading={loading}
              confidence={displayedConfidence}
              confidenceHint={confidenceHint}
              riskLevel={riskLevel}
              qualityScore={qualityScore}
              actionableMarkets={actionableMarkets}
              fixtureStatus={fixtureStatus}
            />
          )}

          {isDashboardView && (
            <GlobalDashboardView
              fixtures={fixtures}
              countries={countries}
              starred={starred}
              loading={fixturesLoading}
              oddsLoading={oddsLoading}
              fixturesDataSource={fixturesDataSource}
              selectedDate={selectedDate}
              selectedLeague={selectedLeague}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setStatusMessage(`Fecha actualizada: ${date}`);
              }}
              onOpenFixture={(fixture) => openFixtureWithDate(fixture, `Partido abierto: ${fixture.home.name} vs ${fixture.away.name}`)}
              onToggleStar={(fixture) => toggleStar(fixture)}
              onNavigate={setActiveView}
            />
          )}

          {activeView === "Ligas y Países" ? (
            <LeagueCountryView
              countries={countries}
              leagues={leagues}
              allLeagues={allLeagues}
              fixtures={fixtures}
              selectedCountry={selectedCountry}
              selectedLeague={selectedLeague}
              selectedDate={selectedDate}
              dataProvider={dataProvider}
              fixturesDataSource={fixturesDataSource}
              loading={loading}
              onSelectCountry={(countryId) => {
                setSelectedCountry(countryId);
                setStatusMessage(`País seleccionado: explorando ligas disponibles`);
              }}
              onSelectLeague={(leagueId) => {
                setSelectedLeague(leagueId);
                setStatusMessage("Liga seleccionada: revisa cobertura y partidos");
              }}
              onSelectDate={setSelectedDate}
              onOpenCalendar={() => setActiveView("Calendario")}
              onOpenDashboard={() => setActiveView("Dashboard Global")}
              onOpenOpportunities={() => setActiveView("Oportunidades")}
              onOpenFixture={(fixture) => {
                openFixtureWithDate(fixture, `Match Center: ${fixture.home.name} vs ${fixture.away.name}`);
              }}
            />
          ) : activeView === "Calendario" ? (
            <CalendarView
              fixtures={fixtures}
              leagues={leagues}
              countries={countries}
              selectedCountry={selectedCountry}
              selectedLeague={selectedLeague}
              selectedDate={selectedDate}
              selectedFixtureId={selectedFixtureId}
              loading={loading}
              oddsLoading={oddsLoading}
              fixturesDataSource={fixturesDataSource}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setStatusMessage(`Calendario actualizado: ${date}`);
              }}
              onRefresh={() => {
                refetchFixtures();
                setStatusMessage("Calendario refrescado desde backend/API");
              }}
              onOpenFixture={(fixture) => openFixtureWithDate(fixture, `Calendario → Match Center: ${fixture.home.name} vs ${fixture.away.name}`)}
              onStatusMessage={setStatusMessage}
            />
          ) : activeView === "Modelos AI" ? (
            <ModelAiView
              fixture={selectedFixture}
              analysis={analysis}
              analysisPipeline={analysisPipeline}
              mlPrediction={matchCenterData?.mlPrediction}
              analysisLoading={analysisLoading}
              analysisError={analysisError}
              analysisErrorMessage={analysisErrorMessage}
              onRetryAnalysis={() => void refetchAnalysis()}
              modelMode={modelMode}
              scenario={scenario}
              displayedConfidence={displayedConfidence}
              riskLevel={riskLevel}
              qualityScore={qualityScore}
              actionableMarkets={actionableMarkets}
              fixtureStatus={fixtureStatus}
              isReanalyzing={isReanalyzing}
              onModeChange={setModelModePersisted}
              onScenarioChange={setScenario}
              onOpenMatch={() => setActiveView("Match Center")}
              onReanalyze={reanalyzeSelectedFixture}
              onOpenCalendar={() => setActiveView("Calendario")}
              onOpenDeepAnalysis={() => setActiveView("Análisis Profundo")}
              onSelectFixture={(f) => {
                openFixtureWithDate(f, `Modelos AI: ${f.home.name} vs ${f.away.name}`);
              }}
            />
          ) : activeView === "Partidos en Vivo" ? (
            <LiveMatchesView
              countries={countries}
              leagues={leagues}
              allLeagues={allLeagues}
              isActive={activeView === "Partidos en Vivo"}
              selectedDate={selectedDate}
              fixturesDataSource={fixturesDataSource}
              initialFixtureId={selectedFixtureId || undefined}
              onOpenCalendar={() => setActiveView("Calendario")}
              onOpenDashboard={() => setActiveView("Dashboard Global")}
              onOpenOpportunities={() => setActiveView("Oportunidades")}
              onOpenMatchCenter={(f) => openFixtureWithDate(f, `En vivo → Match Center: ${f.home.name} vs ${f.away.name}`)}
            />
          ) : activeView === "Match Center" ? (
            (selectedFixtureId) ? (() => {
              const displayFixture = matchCenterData?.fixture ?? selectedFixture;
              if (remoteFixtureError && !displayFixture) {
                return (
                  <div className="qa-card qa-empty">
                    <div className="error-banner" role="alert">
                      <AlertTriangle size={18} />
                      <span>No se pudo cargar el partido: {remoteFixtureError.message}</span>
                      <button type="button" onClick={() => setSelectedFixtureId("")}>
                        Elegir otro
                      </button>
                    </div>
                  </div>
                );
              }
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
                  <div className="qa-card qa-empty">
                    <strong>Partido no disponible</strong>
                    <small>Selecciona otro partido desde el calendario o el tablero.</small>
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
                  loading={matchCenterLoading || isReanalyzing}
                  isFetching={matchCenterFetching || isReanalyzing}
                  isReanalyzing={isReanalyzing}
                  lastUpdatedAt={matchCenterUpdatedAt}
                  analysisError={analysisError}
                  analysisErrorMessage={analysisErrorMessage}
                  onRetryAnalysis={() => void refetchAnalysis()}
                  onAnalyze={reanalyzeSelectedFixture}
                  onOpenDeep={() => setActiveView("Análisis Profundo")}
                  addToast={addToast}
                  mlPrediction={matchCenterData?.mlPrediction}
                  analysisPipeline={matchCenterData?.analysisPipeline}
                />
              );
            })() : (
              <div className="empty-state large">
                Selecciona un partido para analizar.
                <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
                  <button type="button" className="qa-btn-primary" onClick={() => setActiveView("Calendario")}>
                    Abrir calendario
                  </button>
                  <button type="button" className="qa-btn-deep" onClick={() => setActiveView("Dashboard Global")}>
                    Ir al dashboard
                  </button>
                </div>
              </div>
            )
          ) : activeView === "Análisis Profundo" ? (
            <DeepAnalysisView
              fixture={matchCenterData?.fixture ?? selectedFixture}
              onOpenMatchCenter={() => setActiveView("Match Center")}
              onOpenCalendar={() => setActiveView("Calendario")}
            />
          ) : activeView === "Oportunidades" ? (
            <OpportunitiesView
              selectedDate={selectedDate}
              selectedLeague={selectedLeague || undefined}
              fixturesDataSource={fixturesDataSource}
              onOpenFixture={(fixture) => openFixtureWithDate(fixture, `Oportunidad: ${fixture.home.name} vs ${fixture.away.name}`)}
              onGoWatchlist={() => setActiveView("Watchlist")}
            />
          ) : activeView === "Odds Intelligence" ? (
            <OddsIntelligenceView
              selectedDate={selectedDate}
              selectedFixture={selectedFixture}
              fixturesDataSource={fixturesDataSource}
              onOpenMatchCenter={() => setActiveView("Match Center")}
              onOpenFixture={(fixtureId) => {
                setSelectedFixtureId(fixtureId);
                setActiveView("Match Center");
              }}
            />
          ) : activeView === "Historial de Análisis" ? (
            <AnalysisHistoryView
              addToast={addToast}
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
              selectedDate={selectedDate}
              selectedLeague={selectedLeague || undefined}
              onOpenFixture={(fixture) => openFixtureWithDate(fixture, `Alerta: ${fixture.home.name} vs ${fixture.away.name}`)}
            />
          ) : activeView === "Watchlist" ? (
            <WatchlistView
              fixtures={fixtures}
              starred={starred}
              onToggleStar={(fixture) => toggleStar(fixture)}
              onOpenFixture={(fixture) => openFixtureWithDate(fixture, `Favoritos: ${fixture.home.name} vs ${fixture.away.name}`)}
            />
          ) : activeView === "Informes" ? (
            <ReportsView fixture={selectedFixture} analysis={analysis} modelMode={modelMode} scenario={scenario} riskLevel={riskLevel} onOpenMatch={() => setActiveView("Match Center")} />
          ) : activeView === "Configuración" ? (
            <SettingsView
              provider={
                fixturesDataSource === "api-football-quota"
                  ? "API-Football (cuota agotada)"
                  : fixturesDataSource === "api-football-rate-limit"
                    ? "API-Football (rate-limit temporal)"
                    : fixturesDataSource === "demo-fallback" || dataProvider === "demo-fallback"
                      ? "Modo demostración"
                      : dataProvider === "api-football" || fixturesDataSource === "api-football"
                        ? "API-Football"
                        : dataProvider
              }
              onProviderClick={() =>
                pushActivity(
                  `Proveedor: ${fixturesDataSource === "api-football-quota" ? "cuota agotada" : dataProvider}`,
                  fixturesDataSource === "api-football-quota"
                    ? "Renová la cuota en API-Football"
                    : "Estado del proveedor de datos"
                )
              }
              modelMode={modelMode}
              scenario={scenario}
              density={density}
              bankroll={bankroll}
              onModeChange={setModelModePersisted}
              onScenarioChange={setScenario}
              onDensityChange={setDensity}
              onBankrollChange={setBankrollPersisted}
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
