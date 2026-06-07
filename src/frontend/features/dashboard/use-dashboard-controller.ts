"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import { fixtureStatusLabelEs } from "@/shared/fixture-status";
import { useCountries } from "@/frontend/hooks/use-countries";
import { useLeagues } from "@/frontend/hooks/use-leagues";
import { useFixtures } from "@/frontend/hooks/use-fixtures";
import { useOddsByDate } from "@/frontend/hooks/use-odds-by-date";
import { mergeOddsIntoFixtures } from "@/frontend/lib/merge-fixture-odds";
import { mergeLiveIntoFixtures } from "@/frontend/lib/merge-live-fixtures";
import { useAnalysisWithFixture, fetchAnalysis } from "@/frontend/hooks/use-analysis";
import { useFixtureById } from "@/frontend/hooks/use-fixture-by-id";
import { useLiveFixtures } from "@/frontend/hooks/use-live";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { useDebounce } from "@/frontend/hooks/use-debounce";
import { useWatchlist } from "@/frontend/hooks/use-watchlist";
import { useToast } from "@/frontend/hooks/use-toast";
import type { DensityMode, ModelMode, ScenarioId } from "./dashboard-config";
import {
  fixturesForCalendarDate,
  shiftIsoDateColombia,
  todayIsoDateColombia,
} from "@/frontend/lib/date-utils";
import { parseCalendarUrlState, syncDashboardUrl } from "@/frontend/lib/calendar-export";
import { confidenceFromAnalysis, riskFromConfidence } from "@/frontend/lib/confidence-display";
import { normalizeAnalysisPreferences } from "@/shared/analysis-preferences";
import { openFixtureInContext, type OpenFixtureContext } from "@/frontend/lib/open-fixture";
import { useUserPreferences } from "@/frontend/hooks/use-user-preferences";

function todayIsoDate() {
  return todayIsoDateColombia();
}

export function useDashboardController() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState("Dashboard Global");
  const [theme, setTheme] = useLocalStorage<"dark" | "light">("football-ai-theme", "dark");
  const [mounted, setMounted] = useState(false);
  const [starred, toggleStar] = useWatchlist();
  const [statusMessage, setStatusMessage] = useState("Sistema listo");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamSearchOpen, setTeamSearchOpen] = useState(false);
  const [modelMode, setModelMode] = useLocalStorage<ModelMode>("football-ai-model-mode", "Balanceado");
  const [scenario, setScenario] = useState<ScenarioId>("base");
  const [density, setDensity] = useLocalStorage<DensityMode>("football-ai-density", "comfortable");
  const [bankroll, setBankroll] = useLocalStorage<number>("football-ai-bankroll", 1000);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);
  const debouncedTeamSearch = useDebounce(teamSearch, 250);
  const { toasts, addToast, removeToast } = useToast();
  const { persistModelMode, persistBankroll } = useUserPreferences({
    modelMode,
    bankroll,
    setModelMode,
    setBankroll,
  });

  useEffect(() => {
    setMounted(true);
    void queryClient.invalidateQueries({ queryKey: ["fixtures"] });
  }, [queryClient]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const state = parseCalendarUrlState(window.location.search);
    const view = state.view ?? "Dashboard Global";
    if (state.view) setActiveView(state.view);
    if (state.date) setSelectedDate(state.date);
    // Country/league URL params are for scoped views (Calendar, Match Center), not the global overview.
    if (view !== "Dashboard Global") {
      if (state.countryId) setSelectedCountry(state.countryId);
      if (state.leagueId) setSelectedLeague(state.leagueId);
    }
    if (state.fixtureId) setSelectedFixtureId(state.fixtureId);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (activeView === "Partidos en Vivo") return;
    syncDashboardUrl({
      view: activeView,
      date: selectedDate,
      countryId: selectedCountry || undefined,
      leagueId: selectedLeague || undefined,
      fixtureId: selectedFixtureId || undefined,
    });
  }, [
    mounted,
    activeView,
    selectedDate,
    selectedCountry,
    selectedLeague,
    selectedFixtureId,
  ]);

  const { data: countriesPayload, isLoading: countriesLoading, error: countriesError } = useCountries();
  const countries = countriesPayload?.countries ?? [];
  const dataProvider = countriesPayload?.provider ?? "unknown";
  const { data: leagues = [], isLoading: leaguesLoading, error: leaguesError } = useLeagues(selectedCountry);
  const { data: allLeagues = [] } = useLeagues(undefined, {
    enabled: activeView === "Ligas y Países" || activeView === "Partidos en Vivo",
  });
  const isDashboardView = activeView === "Dashboard Global";
  const isCalendarView = activeView === "Calendario";
  const isBroadFixturesView = isDashboardView || isCalendarView;
  const scopedLeagueId = selectedLeague || undefined;
  const fixtureLeagueScope = isBroadFixturesView ? undefined : scopedLeagueId;
  const isTodaySelected = selectedDate === todayIsoDateColombia();
  const { data: fixturesRaw = [], dataSource: fixturesDataSource, isLoading: fixturesLoading, error: fixturesError, refetch: refetchFixtures } = useFixtures(
    fixtureLeagueScope,
    selectedDate
  );

  useEffect(() => {
    if (!countriesLoading && !fixturesLoading) {
      setBootstrapTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setBootstrapTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [countriesLoading, fixturesLoading]);

  useEffect(() => {
    if (fixturesLoading) return;
    if (fixturesDataSource === "api-football-quota") {
      setStatusMessage(
        "Cuota diaria de API-Football agotada — no se muestran partidos de demostración. Reintenta mañana o amplía el plan."
      );
      return;
    }
    if (fixturesDataSource === "api-football-rate-limit") {
      setStatusMessage(
        "Saturación temporal de API-Football — reintentando automáticamente. Los datos vuelven en unos segundos."
      );
      return;
    }
    const usingDemo =
      fixturesDataSource === "demo-fallback" || dataProvider === "demo-fallback";
    if (usingDemo) {
      setStatusMessage(
        "Modo demostración — sin datos reales para país/liga/fecha (o la petición falló)"
      );
      return;
    }
    if (dataProvider === "api-football" && fixturesDataSource === "api-football") {
      setStatusMessage((prev) =>
        prev.includes("demo") || prev.includes("Cuota") || prev.includes("demostración")
          ? "Sistema listo"
          : prev
      );
    }
  }, [fixturesDataSource, dataProvider, fixturesLoading]);
  const apiQuotaExhausted = fixturesDataSource === "api-football-quota";

  const needsLiveMergeInFixtures = useMemo(() => {
    if (activeView === "Partidos en Vivo") return false;
    return new Set([
      "Dashboard Global",
      "Match Center",
      "Calendario",
      "Watchlist",
      "Alertas",
      "Oportunidades",
      "Modelos AI",
      "Ligas y Países",
      "Informes",
    ]).has(activeView);
  }, [activeView]);

  const { data: livePayload } = useLiveFixtures({
    enabled: isTodaySelected && !apiQuotaExhausted && needsLiveMergeInFixtures,
  });
  const liveSnapshot = livePayload?.fixtures ?? [];

  const { data: oddsByDate = {}, isLoading: oddsLoading } = useOddsByDate(selectedDate, scopedLeagueId, {
    enabled: Boolean(selectedDate),
  });
  const fixtures = useMemo(() => {
    const merged = mergeOddsIntoFixtures(fixturesRaw, oddsByDate);
    const withLive = mergeLiveIntoFixtures(merged, liveSnapshot);
    const onDate = fixturesForCalendarDate(withLive, selectedDate);
    if (isBroadFixturesView) {
      return onDate;
    }
    if (selectedCountry && !selectedLeague) {
      return onDate.filter((fixture) => fixture.countryId === selectedCountry);
    }
    return onDate;
  }, [
    fixturesRaw,
    oddsByDate,
    liveSnapshot,
    selectedDate,
    selectedCountry,
    selectedLeague,
    isBroadFixturesView,
  ]);

  useEffect(() => {
    if (!mounted || !isDashboardView || fixturesLoading) return;
    const today = todayIsoDateColombia();
    if (fixturesRaw.length === 0 && selectedDate !== today) {
      setSelectedDate(today);
      setStatusMessage("Mostrando partidos de hoy — no había datos para la fecha anterior");
    }
  }, [mounted, isDashboardView, fixturesLoading, fixturesRaw.length, selectedDate]);
  const { error: liveLeaguesError } = useLeagues(undefined, { enabled: activeView === "Partidos en Vivo" });

  // Do NOT auto-select a country — let the user choose
  // useEffect(() => {
  //   if (countries.length && !selectedCountry) {
  //     setSelectedCountry(countries[0].id);
  //   }
  // }, [countries, selectedCountry]);

  // Do NOT auto-select league or fixture — user must choose
  // Only update if the current selection is invalid (league changed)
  useEffect(() => {
    if (selectedLeague && leagues.length && !leagues.some((league) => league.id === selectedLeague)) {
      setSelectedLeague("");
    }
  }, [leagues, selectedLeague]);

  const fixturePinnedViews = useMemo(
    () =>
      new Set([
        "Match Center",
        "Modelos AI",
        "Análisis Profundo",
        "Informes",
        "Alertas",
      ]),
    []
  );

  useEffect(() => {
    if (!selectedFixtureId || !fixtures.length) return;
    if (fixtures.some((fixture) => fixture.id === selectedFixtureId)) return;
    if (fixturePinnedViews.has(activeView)) return;
    setSelectedFixtureId("");
  }, [fixtures, selectedFixtureId, activeView, fixturePinnedViews]);

  const needsRemoteFixture = Boolean(
    selectedFixtureId && !fixtures.some((fixture) => fixture.id === selectedFixtureId)
  );
  const { data: remoteFixture, isLoading: remoteFixtureLoading, error: remoteFixtureError } =
    useFixtureById(selectedFixtureId, needsRemoteFixture);

  const selectedFixture = useMemo(() => {
    if (!selectedFixtureId) return undefined;
    return (
      fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? remoteFixture
    );
  }, [fixtures, selectedFixtureId, remoteFixture]);

  const teamSearchResults = useMemo(() => {
    if (!debouncedTeamSearch.trim()) return [];
    const q = debouncedTeamSearch.toLowerCase();
    return fixtures
      .filter(
        (fixture) =>
          fixture.home.name.toLowerCase().includes(q) ||
          fixture.away.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [fixtures, debouncedTeamSearch]);

  const analysisPreferences = normalizeAnalysisPreferences({ modelMode, scenario });

  const {
    data: analysisPayload,
    isLoading: analysisLoading,
    isFetching: analysisFetching,
    isError: analysisError,
    error: analysisErrorDetail,
    refetch: refetchAnalysis,
    dataUpdatedAt: analysisUpdatedAt,
  } = useAnalysisWithFixture(selectedFixtureId, analysisPreferences);

  const analysis: AnalysisResult | null = analysisPayload?.analysis ?? null;
  const matchCenterData = analysisPayload;
  const matchCenterLoading = analysisLoading || (needsRemoteFixture && remoteFixtureLoading);
  const matchCenterFetching = analysisFetching;
  const matchCenterUpdatedAt = analysisUpdatedAt;
  const analysisPipeline = analysisPayload?.analysisPipeline;
  const analysisErrorMessage = analysisErrorDetail?.message ?? null;

  const loading = countriesLoading || leaguesLoading || fixturesLoading;
  const bootstrapLoading =
    !bootstrapTimedOut &&
    (countriesLoading || fixturesLoading) &&
    countries.length === 0 &&
    fixturesRaw.length === 0;
  const confidenceDisplay = confidenceFromAnalysis(analysis, modelMode, scenario);
  const displayedConfidence = confidenceDisplay.displayedScore;
  const confidenceHint = confidenceDisplay.hint;
  const positiveEdges = analysis?.valueTable.filter((row) => row.edge > 0).length ?? 0;
  const actionableMarkets = analysis?.valueTable.filter((row) => row.edge >= 4).length ?? 0;
  const riskLevel = riskFromConfidence(displayedConfidence);
  const qualityScore = Math.max(0, Math.min(100, displayedConfidence + positiveEdges * 3 - (analysis?.riskFlags.length ?? 0) * 4));
  const fixtureStatus = selectedFixture
    ? fixtureStatusLabelEs(selectedFixture.status, selectedFixture.statusLong)
    : "Pre-match";
  const hasError = Boolean(countriesError && countries.length === 0) ||
    Boolean(leaguesError && leagues.length === 0 && selectedCountry) ||
    Boolean(fixturesError && fixturesRaw.length === 0) ||
    liveLeaguesError;
  const errorMessage =
    countriesError?.message ??
    leaguesError?.message ??
    fixturesError?.message ??
    liveLeaguesError?.message;
  const safeThemeClass = mounted && theme === "light" ? "light-mode" : "";
  const safeDensity = mounted ? density : "comfortable";

  const pushActivity = (title: string, _meta: string, _tone: "good" | "warn" | "danger" | "neutral" = "neutral") => {
    setStatusMessage(title);
  };

  const fixtureContext: OpenFixtureContext = {
    selectedCountry,
    selectedLeague,
    selectedDate,
    setSelectedCountry,
    setSelectedLeague,
    setSelectedDate,
    setSelectedFixtureId,
    setActiveView,
    setStatusMessage,
  };

  const openFixture = (fixture: Fixture, status?: string) => {
    openFixtureInContext(fixtureContext, fixture, { statusMessage: status });
  };

  const openFixtureWithDate = (fixture: Fixture, status?: string) => {
    openFixtureInContext(fixtureContext, fixture, { statusMessage: status, syncDate: true });
  };

  const goHome = () => {
    setActiveView("Dashboard Global");
    setSelectedFixtureId("");
    setSelectedCountry("");
    setSelectedLeague("");
    setSelectedDate(todayIsoDateColombia());
    setStatusMessage("Dashboard Global");
    void refetchFixtures();
  };

  const setModelModePersisted = (mode: ModelMode) => {
    void persistModelMode(mode);
  };

  const setBankrollPersisted = (amount: number) => {
    void persistBankroll(amount);
  };

  const reanalyzeSelectedFixture = async () => {
    if (!selectedFixtureId || isReanalyzing) return;

    setIsReanalyzing(true);
    setStatusMessage("Re-ejecutando modelos...");

    try {
      const clearResponse = await fetch(`/api/analyze/${encodeURIComponent(selectedFixtureId)}`, {
        method: "DELETE",
      });
      if (!clearResponse.ok) {
        throw new Error("No se pudo limpiar la caché del análisis");
      }

      const freshAnalysis = await fetchAnalysis(selectedFixtureId, {
        refresh: true,
        preferences: analysisPreferences,
      });

      queryClient.setQueryData(
        ["analysis-full", selectedFixtureId, analysisPreferences.modelMode, analysisPreferences.scenario],
        freshAnalysis
      );
      queryClient.setQueryData(
        ["analysis", selectedFixtureId, analysisPreferences.modelMode, analysisPreferences.scenario],
        freshAnalysis
      );

      addToast("Modelos re-ejecutados correctamente", "success");
      pushActivity(
        "Re-análisis completado",
        `Modelos actualizados para ${freshAnalysis.fixture.home.name} vs ${freshAnalysis.fixture.away.name}`,
        "good"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al re-ejecutar modelos";
      addToast(message, "error");
      setStatusMessage(message);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const retryBootstrap = () => {
    setBootstrapTimedOut(false);
    void queryClient.invalidateQueries({ queryKey: ["countries"] });
    void queryClient.invalidateQueries({ queryKey: ["fixtures"] });
    void refetchFixtures();
    setStatusMessage("Reintentando carga inicial…");
  };

  return {
    activeView,
    setActiveView,
    theme,
    setTheme,
    starred,
    toggleStar,
    statusMessage,
    setStatusMessage,
    selectedCountry,
    setSelectedCountry,
    selectedLeague,
    setSelectedLeague,
    selectedDate,
    setSelectedDate,
    selectedFixtureId,
    setSelectedFixtureId,
    teamSearch,
    setTeamSearch,
    teamSearchOpen,
    setTeamSearchOpen,
    modelMode,
    setModelMode,
    scenario,
    setScenario,
    density,
    setDensity,
    bankroll,
    setBankroll,
    toasts,
    addToast,
    removeToast,
    countries,
    leagues,
    allLeagues,
    dataProvider,
    fixtures,
    fixturesLoading,
    fixturesDataSource,
    oddsLoading,
    refetchFixtures,
    selectedFixture,
    remoteFixtureError,
    teamSearchResults,
    analysis,
    analysisLoading,
    analysisError,
    analysisErrorMessage,
    refetchAnalysis,
    analysisPipeline,
    matchCenterData,
    matchCenterLoading,
    matchCenterFetching,
    matchCenterUpdatedAt,
    isReanalyzing,
    loading,
    bootstrapLoading,
    bootstrapTimedOut,
    retryBootstrap,
    displayedConfidence,
    confidenceHint,
    actionableMarkets,
    riskLevel,
    qualityScore,
    fixtureStatus,
    isDashboardView,
    hasError,
    errorMessage,
    safeThemeClass,
    safeDensity,
    pushActivity,
    openFixture,
    openFixtureWithDate,
    goHome,
    setModelModePersisted,
    setBankrollPersisted,
    reanalyzeSelectedFixture,
  };
}
