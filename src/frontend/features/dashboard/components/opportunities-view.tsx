"use client";

import { useMemo, useState } from "react";
import {
  Zap,
  TrendingUp,
  Filter,
  Wallet,
  Target,
  ChevronRight,
  Star,
  RefreshCw,
  Shield,
  Percent,
  BarChart3,
} from "lucide-react";
import type { Fixture } from "@/shared/domain";
import { useOpportunities, type OpportunitiesScope } from "@/frontend/hooks/use-opportunities";
import { DataStatusBanner } from "./data-status-banner";
import { BankrollPanel } from "./bankroll-panel";

type OpportunityRecord = {
  fixtureId: string;
  fixture: Fixture;
  confidence: number;
  valueBets: Array<{
    market: string;
    modelProbability: number;
    marketProbability?: number;
    edge: number;
    verdict?: string;
    fairOdds: number;
  }>;
  bestBet?: {
    market: string;
    stakeUnits?: number;
    fairOdds?: number;
    edge?: number;
  } | null;
  stakeSuggestion?: number;
};

const EDGE_FILTERS = [
  { id: 3, label: "Edge ≥ 3%" },
  { id: 5, label: "Edge ≥ 5%" },
  { id: 8, label: "Edge ≥ 8%" },
  { id: 10, label: "Edge ≥ 10%" },
] as const;

const CONFIDENCE_FILTERS = [
  { id: 50, label: "Conf. ≥ 50%" },
  { id: 55, label: "Conf. ≥ 55%" },
  { id: 65, label: "Conf. ≥ 65%" },
  { id: 72, label: "Conf. ≥ 72%" },
] as const;

function edgeTier(edge: number): "high" | "medium" | "low" {
  if (edge >= 10) return "high";
  if (edge >= 5) return "medium";
  return "low";
}

function formatKickoff(kickoff: string) {
  const date = new Date(kickoff);
  return {
    time: date.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    }),
    day: date.toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "America/Bogota",
    }),
  };
}

function statusLabel(status: Fixture["status"]) {
  if (status === "live") return "EN VIVO";
  if (status === "final") return "FINAL";
  return "PRE-MATCH";
}

export function OpportunitiesView({
  selectedDate,
  selectedLeague,
  fixturesDataSource,
  onOpenFixture,
  onGoWatchlist,
}: {
  selectedDate: string;
  selectedLeague?: string;
  fixturesDataSource?: string;
  onOpenFixture: (fixture: Fixture) => void;
  onGoWatchlist?: () => void;
}) {
  const [minEdge, setMinEdge] = useState(3);
  const [minConfidence, setMinConfidence] = useState(55);
  const [scope, setScope] = useState<OpportunitiesScope>("day");

  const { data, isLoading, isFetching, refetch } = useOpportunities({
    date: selectedDate,
    leagueId: selectedLeague,
    scope,
    minEdge,
    minConfidence,
  });

  const opportunities = (data?.data?.opportunities ?? []) as OpportunityRecord[];
  const scanMessage = (data?.data?.message as string | undefined) ?? "";
  const scanned = (data?.data?.scanned as number | undefined) ?? 0;

  const stats = useMemo(() => {
    if (opportunities.length === 0) {
      return { avgEdge: 0, maxEdge: 0, highCount: 0, totalMarkets: 0 };
    }
    const edges = opportunities.flatMap((o) => o.valueBets.map((v) => v.edge));
    const maxEdge = Math.max(...edges, 0);
    const avgEdge = edges.reduce((sum, e) => sum + e, 0) / edges.length;
    const highCount = opportunities.filter((o) =>
      o.valueBets.some((v) => v.edge >= 10)
    ).length;
    const totalMarkets = edges.length;
    return { avgEdge, maxEdge, highCount, totalMarkets };
  }, [opportunities]);

  return (
    <section className="view-workspace opp-view">
      <article className="opp-hero">
        <div className="opp-hero-copy">
          <span className="opp-hero-kicker">Value Scanner</span>
          <h2>
            <Zap size={26} /> Oportunidades de Value
          </h2>
          <p>
            Escaneo del día (prioriza watchlist y ligas con cuotas) o solo tus partidos ⭐. Compara
            modelo vs mercado y prioriza apuestas con Kelly sugerido.
          </p>
        </div>
        <div className="opp-hero-stats">
          <div className="opp-hero-stat">
            <strong>{opportunities.length}</strong>
            <span>Partidos</span>
          </div>
          <div className="opp-hero-stat accent">
            <strong>+{stats.avgEdge.toFixed(1)}%</strong>
            <span>Edge medio</span>
          </div>
          <div className="opp-hero-stat gold">
            <strong>+{stats.maxEdge.toFixed(1)}%</strong>
            <span>Mejor edge</span>
          </div>
          {stats.highCount > 0 && (
            <div className="opp-hero-stat hot">
              <strong>{stats.highCount}</strong>
              <span>Alta convicción</span>
            </div>
          )}
        </div>
      </article>

      {fixturesDataSource === "api-football-quota" && (
        <DataStatusBanner fixturesDataSource={fixturesDataSource} />
      )}

      <div className="opp-toolbar">
        <div className="opp-filters">
          <div className="opp-filter-group">
            <span>
              <Filter size={12} /> Alcance
            </span>
            <button
              type="button"
              className={scope === "day" ? "active" : ""}
              onClick={() => setScope("day")}
            >
              Día completo
            </button>
            <button
              type="button"
              className={scope === "watchlist" ? "active" : ""}
              onClick={() => setScope("watchlist")}
            >
              Solo watchlist ⭐
            </button>
          </div>
          <div className="opp-filter-group">
            <span>
              <Filter size={12} /> Edge mínimo
            </span>
            {EDGE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={minEdge === f.id ? "active" : ""}
                onClick={() => setMinEdge(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="opp-filter-group">
            <span>
              <Target size={12} /> Confianza modelo
            </span>
            {CONFIDENCE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={minConfidence === f.id ? "active" : ""}
                onClick={() => setMinConfidence(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="opp-refresh-btn"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? "spin" : undefined} />
          {isFetching ? "Escaneando..." : "Re-escanear"}
        </button>
      </div>

      <div className="opp-layout">
        <aside className="opp-sidebar">
          <div className="opp-sidebar-block">
            <h3>
              <Wallet size={16} /> Bankroll
            </h3>
            <BankrollPanel compact />
          </div>

          <div className="opp-sidebar-block opp-sidebar-tips">
            <h3>
              <Shield size={16} /> Criterios de value
            </h3>
            <ul>
              <li>
                <strong>Edge ≥ 5%</strong>
                <span>Divergencia modelo vs cuota implícita del mercado.</span>
              </li>
              <li>
                <strong>Confianza ≥ 72</strong>
                <span>Stake completo según Kelly fraccional.</span>
              </li>
              <li>
                <strong>Watchlist activa</strong>
                <span>Solo analiza partidos que seguís.</span>
              </li>
            </ul>
            {onGoWatchlist && (
              <button type="button" className="opp-watchlist-link" onClick={onGoWatchlist}>
                <Star size={14} /> Ir a Watchlist
              </button>
            )}
          </div>

          <div className="opp-sidebar-block opp-scan-summary">
            <h3>
              <BarChart3 size={16} /> Resumen del escaneo
            </h3>
            <div className="opp-scan-metrics">
              <div>
                <span>Mercados detectados</span>
                <strong>{stats.totalMarkets}</strong>
              </div>
              <div>
                <span>Filtro edge</span>
                <strong>≥ {minEdge}%</strong>
              </div>
              <div>
                <span>Filtro confianza</span>
                <strong>≥ {minConfidence}%</strong>
              </div>
            </div>
          </div>
        </aside>

        <div className="opp-main">
          {isLoading ? (
            <div className="opp-state-card loading">
              <div className="opp-state-icon">
                <Zap size={22} className="spin" />
              </div>
              <strong>Escaneando partidos...</strong>
              <span>
                {scope === "watchlist"
                  ? "Analizando partidos ⭐ de la fecha"
                  : `Analizando hasta ${scanned || 12} candidatos del día`}
              </span>
            </div>
          ) : opportunities.length === 0 ? (
            <div className="opp-state-card empty">
              <div className="opp-state-icon">
                <TrendingUp size={22} />
              </div>
              <strong>Sin oportunidades con estos filtros</strong>
              <span>
                {scanMessage ||
                  (scope === "watchlist"
                    ? "Marcá partidos con ⭐ en el tablero o probá «Día completo»."
                    : "Bajá el umbral de edge o cambiá la fecha en el calendario.")}
              </span>
              {onGoWatchlist && (
                <button type="button" className="opp-primary-btn" onClick={onGoWatchlist}>
                  <Star size={16} /> Abrir Watchlist
                </button>
              )}
            </div>
          ) : (
            <div className="opp-grid">
              {opportunities.map((opp) => {
                const fixture = opp.fixture;
                if (!fixture?.home || !fixture?.away) return null;

                const topBet = opp.valueBets[0];
                const tier = edgeTier(topBet?.edge ?? 0);
                const kickoff = formatKickoff(fixture.kickoff);

                return (
                  <article key={opp.fixtureId} className={`opp-card opp-card-${tier}`}>
                    <div className="opp-card-top">
                      <div className="opp-card-status">
                        <span className={`opp-status-badge ${fixture.status}`}>
                          {statusLabel(fixture.status)}
                        </span>
                        <span className="opp-league-chip">{fixture.leagueName}</span>
                      </div>
                      <div className="opp-confidence">
                        <span>Confianza</span>
                        <strong>{Math.round(opp.confidence)}</strong>
                      </div>
                    </div>

                    <div className="opp-matchup">
                      <div className="opp-team opp-team-home">
                        <span className="opp-team-name">{fixture.home.name}</span>
                        {fixture.home.logo && (
                          <img src={fixture.home.logo} alt="" className="opp-team-logo" />
                        )}
                      </div>
                      <div className="opp-match-center">
                        <span className="opp-vs">VS</span>
                        <span className="opp-kickoff">{kickoff.time}</span>
                        <span className="opp-kickoff-day">{kickoff.day}</span>
                      </div>
                      <div className="opp-team opp-team-away">
                        {fixture.away.logo && (
                          <img src={fixture.away.logo} alt="" className="opp-team-logo" />
                        )}
                        <span className="opp-team-name">{fixture.away.name}</span>
                      </div>
                    </div>

                    <div className="opp-markets">
                      {opp.valueBets.slice(0, 3).map((bet) => (
                        <div
                          key={bet.market}
                          className={`opp-market-row opp-market-${edgeTier(bet.edge)}`}
                        >
                          <div className="opp-market-left">
                            <Target size={13} />
                            <span>{bet.market}</span>
                          </div>
                          <div className="opp-market-right">
                            <span className="opp-market-prob">Mod. {bet.modelProbability}%</span>
                            <span className="opp-market-edge">
                              <Percent size={12} /> +{bet.edge.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                      {opp.valueBets.length > 3 && (
                        <div className="opp-market-more">+{opp.valueBets.length - 3} mercados más</div>
                      )}
                    </div>

                    {opp.bestBet && (
                      <div className="opp-pick">
                        <span className="opp-pick-label">Apuesta recomendada</span>
                        <div className="opp-pick-row">
                          <strong>{opp.bestBet.market}</strong>
                          <span>Cuota justa {topBet?.fairOdds?.toFixed(2) ?? "—"}</span>
                        </div>
                        <div className="opp-pick-stake">
                          Stake sugerido: <strong>{opp.stakeSuggestion ?? opp.bestBet.stakeUnits ?? 1}u</strong>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className="opp-open-btn"
                      onClick={() => onOpenFixture(fixture)}
                    >
                      Ver análisis completo
                      <ChevronRight size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
