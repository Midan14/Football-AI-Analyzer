"use client";

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronRight,
  Play,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Country, Fixture } from "@/shared/domain";
import { useDashboardSummary, type FixtureInsight } from "@/frontend/hooks/use-dashboard-summary";
import {
  formatDateChipLabel,
  shiftIsoDateColombia,
  todayIsoDateColombia,
} from "@/frontend/lib/date-utils";
import { FixturesBoard } from "./fixtures-board";
import { DataStatusBanner } from "./data-status-banner";

type GlobalDashboardViewProps = {
  fixtures: Fixture[];
  countries: Country[];
  starred: Set<string>;
  loading: boolean;
  oddsLoading?: boolean;
  fixturesDataSource?: string;
  selectedDate: string;
  selectedLeague?: string;
  onSelectDate: (date: string) => void;
  onOpenFixture: (fixture: Fixture) => void;
  onToggleStar: (fixture: Fixture) => void;
  onNavigate: (view: string) => void;
};

export function GlobalDashboardView({
  fixtures,
  countries,
  starred,
  loading,
  oddsLoading = false,
  fixturesDataSource,
  selectedDate,
  selectedLeague,
  onSelectDate,
  onOpenFixture,
  onToggleStar,
  onNavigate,
}: GlobalDashboardViewProps) {
  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    isError: summaryError,
    refetch: refetchSummary,
  } = useDashboardSummary(selectedDate, selectedLeague || undefined);

  const insightMap = useMemo(() => {
    const map = new Map<string, FixtureInsight>();
    for (const row of summary?.insights ?? []) {
      map.set(row.fixtureId, row);
    }
    return map;
  }, [summary?.insights]);

  const stats = useMemo(() => {
    const live = fixtures.filter((f) => f.status === "live").length;
    const final = fixtures.filter((f) => f.status === "final").length;
    const scheduled = fixtures.filter((f) => f.status === "pre-match").length;
    const withOdds = fixtures.filter((f) => f.market.homeWinOdds > 0).length;
    const watchlistToday = fixtures.filter((f) => starred.has(f.id)).length;
    const valueSignals = fixtures.filter((f) => (insightMap.get(f.id)?.topEdge ?? 0) >= 3).length;
    const highConfidence = fixtures.filter((f) => (insightMap.get(f.id)?.confidence ?? 0) >= 72).length;

    return {
      total: fixtures.length,
      live,
      final,
      scheduled,
      withOdds,
      watchlistToday,
      valueSignals,
      highConfidence,
    };
  }, [fixtures, starred, insightMap]);

  const topPickFixtures = useMemo(() => {
    const byId = new Map(fixtures.map((f) => [f.id, f]));
    return (summary?.topPicks ?? [])
      .map((pick) => ({ pick, fixture: byId.get(pick.fixtureId) }))
      .filter((row): row is { pick: FixtureInsight; fixture: Fixture } => Boolean(row.fixture));
  }, [fixtures, summary?.topPicks]);

  const dateChips = useMemo(() => {
    const today = todayIsoDateColombia();
    return [-1, 0, 1].map((offset) => {
      const date = shiftIsoDateColombia(today, offset);
      return { date, label: formatDateChipLabel(date, selectedDate), active: date === selectedDate };
    });
  }, [selectedDate]);

  return (
    <section className="view-workspace dg-view">
      <article className="dg-hero">
        <div className="dg-hero-main">
          <span className="dg-kicker">Centro de mando</span>
          <h2>
            <TrendingUp size={24} /> Dashboard Global
          </h2>
          <p>
            Resumen operativo del día con señales AI, partidos en vivo y accesos rápidos a las vistas
            de análisis.
          </p>
          <div className="dg-date-chips">
            {dateChips.map((chip) => (
              <button
                key={chip.date}
                type="button"
                className={chip.active ? "active" : ""}
                onClick={() => onSelectDate(chip.date)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dg-kpi-grid">
          <div className="dg-kpi">
            <strong>{stats.total}</strong>
            <span>Partidos</span>
          </div>
          <div className="dg-kpi live">
            <strong>{stats.live}</strong>
            <span>En vivo</span>
          </div>
          <div className="dg-kpi">
            <strong>{oddsLoading ? "…" : stats.withOdds}</strong>
            <span>{oddsLoading ? "Cargando odds" : "Con odds"}</span>
          </div>
          <div className="dg-kpi">
            <strong>{stats.watchlistToday}</strong>
            <span>Watchlist</span>
          </div>
          <div className="dg-kpi accent">
            <strong>{stats.valueSignals}</strong>
            <span>Con value</span>
          </div>
          <div className="dg-kpi gold">
            <strong>{stats.highConfidence}</strong>
            <span>Alta conf.</span>
          </div>
        </div>
      </article>

      {fixturesDataSource === "api-football-quota" ? (
        <DataStatusBanner fixturesDataSource={fixturesDataSource} />
      ) : null}

      <div className="dg-shortcuts">
        <button type="button" className="dg-shortcut" onClick={() => onNavigate("Oportunidades")}>
          <Zap size={16} /> Oportunidades
        </button>
        <button type="button" className="dg-shortcut" onClick={() => onNavigate("Alertas")}>
          <Bell size={16} /> Alertas
        </button>
        <button type="button" className="dg-shortcut" onClick={() => onNavigate("Partidos en Vivo")}>
          <Play size={16} /> En vivo
          {stats.live > 0 && <span className="dg-shortcut-badge">{stats.live}</span>}
        </button>
        <button type="button" className="dg-shortcut" onClick={() => onNavigate("Watchlist")}>
          <Star size={16} /> Watchlist
        </button>
        <button type="button" className="dg-shortcut" onClick={() => onNavigate("Match Center")}>
          <Target size={16} /> Match Center
        </button>
        {(summaryLoading || summaryFetching) && (
          <span className="dg-scan-status">
            <Activity size={14} className="spin" /> Escaneando señales AI...
          </span>
        )}
      </div>

      {summaryError && !summaryLoading && (
        <div className="data-status-banner data-status-banner--demo" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Top picks no disponibles</strong>
            <p>No se pudo calcular el resumen AI. El listado de partidos sigue activo.</p>
          </div>
          <button type="button" className="data-status-banner__btn" onClick={() => void refetchSummary()}>
            Reintentar
          </button>
        </div>
      )}

      {topPickFixtures.length > 0 && (
        <article className="dg-top-picks">
          <div className="dg-top-picks-head">
            <h3>Top picks del día</h3>
            <span>Priorizados por confianza del modelo y edge detectado</span>
          </div>
          <div className="dg-top-picks-grid">
            {topPickFixtures.map(({ pick, fixture }) => (
              <button
                key={fixture.id}
                type="button"
                className="dg-pick-card"
                onClick={() => onOpenFixture(fixture)}
              >
                <div className="dg-pick-meta">
                  <span className={`dg-risk dg-risk-${pick.riskLevel.toLowerCase()}`}>{pick.riskLevel}</span>
                  <span className="dg-pick-conf">{Math.round(pick.confidence)} conf.</span>
                </div>
                <strong>
                  {fixture.home.name} vs {fixture.away.name}
                </strong>
                <span className="dg-pick-league">{fixture.leagueName}</span>
                <div className="dg-pick-footer">
                  <span>{pick.market}</span>
                  {pick.topEdge > 0 && <span className="dg-pick-edge">+{pick.topEdge.toFixed(1)}% edge</span>}
                  <ChevronRight size={14} />
                </div>
              </button>
            ))}
          </div>
        </article>
      )}

      <FixturesBoard
        key={selectedDate}
        fixtures={fixtures}
        selectedDate={selectedDate}
        countries={countries}
        starred={starred}
        loading={loading}
        oddsLoading={oddsLoading}
        insightMap={insightMap}
        insightsLoading={summaryLoading || summaryFetching}
        insightsError={summaryError}
        onOpenFixture={onOpenFixture}
        onToggleStar={onToggleStar}
      />
    </section>
  );
}
