"use client";

import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, Shield, Bell, Zap, Activity, Filter, RefreshCw } from "lucide-react";
import type { Fixture, AnalysisResult } from "@/shared/domain";
import { useJourneyAlerts, type JourneyAlert } from "@/frontend/hooks/use-journey-alerts";

type Alert = {
  id: string;
  type: "risk" | "value" | "live" | "lineup" | "custom";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  fixture: Fixture;
  market?: string;
  edge?: number;
  confidence?: number;
  source?: string;
};

type BackendAlert = {
  id: string;
  type: string;
  fixtureId: string;
  fixtureName: string;
  message: string;
  severity: "low" | "medium" | "high";
  triggerValue: number;
  threshold: number;
  status: "ACTIVE" | "TRIGGERED";
};

function journeyAlertToUi(alert: JourneyAlert, fixtureById: Map<string, Fixture>): Alert | null {
  const fixture = fixtureById.get(alert.fixtureId);
  if (!fixture) return null;
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    fixture,
    market: alert.market,
    edge: alert.edge,
    confidence: alert.confidence,
    source: alert.source,
  };
}

export function AlertsView({
  fixture,
  analysis,
  fixtures,
  selectedDate,
  selectedLeague,
  onOpenFixture,
}: {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  fixtures?: Fixture[];
  selectedDate: string;
  selectedLeague?: string;
  onOpenFixture: (fixture: Fixture) => void;
}) {
  const {
    data: journey,
    isLoading: journeyLoading,
    isError: journeyError,
    refetch: refetchJourney,
    isFetching: journeyFetching,
  } = useJourneyAlerts(selectedDate, selectedLeague);

  const [typeFilter, setTypeFilter] = useState<"all" | Alert["type"]>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | Alert["severity"]>("all");
  const [backendAlerts, setBackendAlerts] = useState<BackendAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  useEffect(() => {
    setAlertsLoading(true);
    const query = fixture?.id ? `?fixtureId=${encodeURIComponent(fixture.id)}` : "";
    fetch(`/api/alerts${query}`)
      .then((res) => {
        if (res.status === 401) return { data: { alerts: [] } };
        if (!res.ok) throw new Error("Error cargando alertas");
        return res.json();
      })
      .then((data) => {
        setBackendAlerts((data.data?.alerts ?? []) as BackendAlert[]);
      })
      .catch(() => setBackendAlerts([]))
      .finally(() => setAlertsLoading(false));
  }, [fixture?.id]);

  const fixtureById = useMemo(() => {
    const map = new Map<string, Fixture>();
    for (const f of fixtures ?? []) map.set(f.id, f);
    if (fixture) map.set(fixture.id, fixture);
    return map;
  }, [fixtures, fixture]);

  const backendMapped: Alert[] = useMemo(() => {
    const mappedRows: Array<Alert | null> = backendAlerts.map((ba) => {
      const mappedFixture = fixtureById.get(ba.fixtureId) ?? (fixture?.id === ba.fixtureId ? fixture : undefined);
      if (!mappedFixture) return null;
      const mappedType: Alert["type"] =
        ba.type === "VALUE_DETECTED" || ba.type === "ODD_MOVEMENT" || ba.type === "MARKET_DIVERGENCE"
          ? "value"
          : ba.type === "LINEUP_CHANGE"
            ? "lineup"
            : ba.type === "WEATHER_RISK"
              ? "risk"
              : "custom";
      const mappedEdge =
        ba.triggerValue > ba.threshold ? ba.triggerValue - ba.threshold : undefined;
      const mapped: Alert = {
        id: `backend-${ba.id}`,
        type: mappedType,
        severity: ba.severity,
        title: ba.fixtureName,
        description: ba.message,
        fixture: mappedFixture,
        source: "backend-alert",
        ...(mappedEdge != null ? { edge: mappedEdge } : {}),
      };
      return mapped;
    });
    const cleaned = mappedRows.filter((row): row is Alert => row !== null);
    return cleaned;
  }, [backendAlerts, fixtureById, fixture]);

  const allAlerts = useMemo(() => {
    const alerts: Alert[] = [];

    for (const journeyAlert of journey?.alerts ?? []) {
      const mapped = journeyAlertToUi(journeyAlert, fixtureById);
      if (mapped) alerts.push(mapped);
    }

    if (fixture && analysis) {
      for (const flag of analysis.riskFlags) {
        alerts.push({
          id: `${fixture.id}-${flag.id}`,
          type: "risk",
          severity: flag.severity,
          title: flag.label,
          description: `${fixture.home.name} vs ${fixture.away.name} · Confianza ${analysis.confidence.score}/100 · análisis del partido seleccionado`,
          fixture,
          confidence: analysis.confidence.score,
          source: "analysis",
        });
      }

      for (const vm of analysis.valueTable.filter((row) => row.edge > 5).slice(0, 3)) {
        if (alerts.some((a) => a.id === `${fixture.id}-analysis-value-${vm.market}`)) continue;
        alerts.push({
          id: `${fixture.id}-analysis-value-${vm.market}`,
          type: "value",
          severity: vm.edge > 10 ? "high" : "medium",
          title: `Valor detectado: ${vm.market}`,
          description: `Edge +${vm.edge}% · Modelo ${vm.modelProbability}% vs Mercado ${vm.marketProbability}%`,
          fixture,
          market: vm.market,
          edge: vm.edge,
          source: "analysis",
        });
      }
    }

    const merged = [...backendMapped, ...alerts];
    return merged.sort((a, b) => {
      const sev = { high: 3, medium: 2, low: 1 };
      return sev[b.severity] - sev[a.severity];
    });
  }, [journey?.alerts, fixtureById, fixture, analysis, backendMapped]);

  const filteredAlerts = useMemo(() => {
    return allAlerts.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      return true;
    });
  }, [allAlerts, typeFilter, severityFilter]);
  const hasActiveFilters = typeFilter !== "all" || severityFilter !== "all";

  const stats = journey?.stats ?? {
    high: allAlerts.filter((a) => a.severity === "high").length,
    medium: allAlerts.filter((a) => a.severity === "medium").length,
    low: allAlerts.filter((a) => a.severity === "low").length,
    value: allAlerts.filter((a) => a.type === "value").length,
    live: allAlerts.filter((a) => a.type === "live").length,
  };

  const typeIcon = (type: Alert["type"]) => {
    switch (type) {
      case "risk":
        return <AlertTriangle size={16} />;
      case "value":
        return <TrendingUp size={16} />;
      case "live":
        return <Activity size={16} />;
      case "lineup":
        return <Shield size={16} />;
      default:
        return <Bell size={16} />;
    }
  };

  const coverageLine = journey
    ? `${journey.fixturesTotal} partidos · ${journey.oddsWithQuotes} con cuotas API · ${journey.liveCount} en vivo · actualizado ${new Date(journey.updatedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
    : "Sincronizando feed API-Football…";

  if (journeyError) {
    return (
      <section className="view-workspace">
        <div className="error-banner" role="alert">
          <span>No se pudieron cargar las alertas en tiempo real.</span>
          <button type="button" onClick={() => void refetchJourney()}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="view-workspace alerts-view">
      <article className="alerts-header">
        <div>
          <h2>
            <Bell size={22} /> Centro de Alertas
          </h2>
          <p>
            Señales en tiempo real desde API-Football (marcador en vivo, cuotas confirmadas y escaneo
            del modelo). Las alertas personalizadas del backend aplican al partido seleccionado.
          </p>
          <small className="alerts-coverage-meta">{coverageLine}</small>
        </div>
        <div className="alerts-stats">
          {(journeyLoading || journeyFetching || alertsLoading) && (
            <span className="alerts-loading">Actualizando…</span>
          )}
          {stats.high > 0 && <span className="alert-stat high">🔴 {stats.high} altas</span>}
          {stats.medium > 0 && <span className="alert-stat medium">🟡 {stats.medium} medias</span>}
          {stats.value > 0 && <span className="alert-stat value">💰 {stats.value} valor</span>}
          {stats.live > 0 && <span className="alert-stat live">⚡ {stats.live} en vivo</span>}
          <button
            type="button"
            className="qa-btn-deep"
            onClick={() => void refetchJourney()}
            style={{ marginLeft: 8 }}
            title="Actualizar alertas"
            aria-label="Actualizar alertas"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </article>

      <div className="alerts-filters">
        <div className="alerts-filter-group">
          <span>
            <Filter size={12} /> Tipo:
          </span>
          {(["all", "risk", "value", "live", "lineup", "custom"] as const).map((t) => (
            <button key={t} className={typeFilter === t ? "active" : ""} onClick={() => setTypeFilter(t)}>
              {t === "all"
                ? "Todas"
                : t === "risk"
                  ? "⚠️ Riesgo"
                  : t === "value"
                    ? "💰 Valor"
                    : t === "live"
                      ? "⚡ En Vivo"
                      : t === "lineup"
                        ? "📋 Lineups"
                        : "🔔 Custom"}
            </button>
          ))}
        </div>
        <div className="alerts-filter-group">
          <span>Severidad:</span>
          {(["all", "high", "medium", "low"] as const).map((s) => (
            <button key={s} className={severityFilter === s ? "active" : ""} onClick={() => setSeverityFilter(s)}>
              {s === "all" ? "Todas" : s === "high" ? "🔴 Alta" : s === "medium" ? "🟡 Media" : "🟢 Baja"}
            </button>
          ))}
        </div>
      </div>

      <div className="alerts-list">
        {journeyLoading && filteredAlerts.length === 0 ? (
          <div className="alerts-empty">
            <Bell size={40} />
            <strong>Cargando alertas…</strong>
            <p>Consultando partidos en vivo y cuotas desde la API.</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="alerts-empty">
            <Bell size={40} />
            <strong>Sin alertas</strong>
            <p>No hay alertas activas con los filtros seleccionados.</p>
            {hasActiveFilters && (
              <button
                type="button"
                className="qa-btn-deep"
                onClick={() => {
                  setTypeFilter("all");
                  setSeverityFilter("all");
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <button
              key={alert.id}
              className={`alert-card ${alert.severity} ${alert.type}`}
              onClick={() => onOpenFixture(alert.fixture)}
            >
              <div className="alert-card-icon">{typeIcon(alert.type)}</div>
              <div className="alert-card-content">
                <strong>{alert.title}</strong>
                <p>{alert.description}</p>
              </div>
              <div className="alert-card-meta">
                <span className={`alert-severity-badge ${alert.severity}`}>
                  {alert.severity === "high" ? "ALTA" : alert.severity === "medium" ? "MEDIA" : "BAJA"}
                </span>
                {alert.edge != null && <span className="alert-edge">+{alert.edge.toFixed(1)}%</span>}
              </div>
              <Zap size={14} className="alert-card-action" />
            </button>
          ))
        )}
      </div>

      <div className="alerts-rules">
        <h4>
          <Shield size={14} /> Fuentes de datos
        </h4>
        <div className="alerts-rules-grid">
          <div className="alert-rule">
            <span className="alert-rule-badge live">EN VIVO</span>
            <div>
              <strong>Feed /fixtures?live=all</strong>
              <p>Marcador, minuto y estado real de cada partido en curso.</p>
            </div>
          </div>
          <div className="alert-rule">
            <span className="alert-rule-badge value">VALOR</span>
            <div>
              <strong>Escaneo del modelo</strong>
              <p>Edge ≥5% sobre cuotas reales de la API en hasta 12 partidos prioritarios del día.</p>
            </div>
          </div>
          <div className="alert-rule">
            <span className="alert-rule-badge high">CUOTAS</span>
            <div>
              <strong>/odds?date=…</strong>
              <p>Solo alerta “sin cuotas” en partidos de tus favoritos cuando la API no devolvió 1X2.</p>
            </div>
          </div>
          <div className="alert-rule">
            <span className="alert-rule-badge medium">PERSONAL</span>
            <div>
              <strong>Alertas del backend</strong>
              <p>Reglas guardadas (valor, movimiento de cuota, clima, etc.) para el partido seleccionado.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
