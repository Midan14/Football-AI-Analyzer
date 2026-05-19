"use client";

import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, TrendingUp, Shield, Bell, Zap, Target, Activity, Filter } from "lucide-react";
import type { Fixture, AnalysisResult } from "@/shared/domain";

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

export function AlertsView({
  fixture,
  analysis,
  fixtures,
  onOpenFixture,
}: {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  fixtures?: Fixture[];
  onOpenFixture: (fixture: Fixture) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | Alert["type"]>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | Alert["severity"]>("all");
  const [backendAlerts, setBackendAlerts] = useState<BackendAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  useEffect(() => {
    if (!fixture?.id) { setBackendAlerts([]); return; }
    setAlertsLoading(true);
    fetch(`/api/alerts?fixtureId=${encodeURIComponent(fixture.id)}`)
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

  // Map backend alerts to UI format
  const backendMapped: Alert[] = useMemo(() => {
    if (!fixture) return [];
    return backendAlerts.map((ba) => ({
      id: `backend-${ba.id}`,
      type: ba.type === "VALUE_DETECTED" ? "value" : ba.type === "LINEUP_CHANGE" ? "lineup" : ba.type === "ODD_MOVEMENT" ? "value" : ba.type === "WEATHER_RISK" ? "risk" : ba.type === "MARKET_DIVERGENCE" ? "value" : "custom",
      severity: ba.severity,
      title: ba.fixtureName,
      description: ba.message,
      fixture,
      edge: ba.triggerValue > ba.threshold ? ba.triggerValue - ba.threshold : undefined,
    }));
  }, [backendAlerts, fixture]);

  // Generate alerts from ALL fixtures of the day
  const allAlerts = useMemo(() => {
    const alerts: Alert[] = [];
    const fixtureList = fixtures ?? (fixture ? [fixture] : []);

    for (const f of fixtureList) {
      // Risk alerts from coverage
      if (!f.coverage.hasOdds) {
        alerts.push({
          id: `${f.id}-no-odds`,
          type: "risk",
          severity: "high",
          title: "Sin cuotas disponibles",
          description: `${f.home.name} vs ${f.away.name} no tiene odds del bookmaker. Análisis limitado.`,
          fixture: f,
        });
      }

      if (!f.coverage.hasLineups && f.status === "pre-match") {
        alerts.push({
          id: `${f.id}-no-lineups`,
          type: "lineup",
          severity: "medium",
          title: "Alineaciones no confirmadas",
          description: `${f.home.name} vs ${f.away.name} — verificar alineaciones antes de apostar.`,
          fixture: f,
        });
      }

      if (f.coverage.tier === "low") {
        alerts.push({
          id: `${f.id}-low-tier`,
          type: "risk",
          severity: "medium",
          title: "Liga de baja cobertura",
          description: `${f.leagueName} — datos limitados, mayor varianza. Reducir stake.`,
          fixture: f,
        });
      }

      // Value alerts from odds
      if (f.market.homeWinOdds > 0) {
        // Check for potential value (simplified — real check needs analysis)
        const impliedHome = 100 / f.market.homeWinOdds;
        const impliedDraw = 100 / f.market.drawOdds;
        const impliedAway = 100 / f.market.awayWinOdds;
        const overround = impliedHome + impliedDraw + impliedAway;

        if (overround < 103) {
          alerts.push({
            id: `${f.id}-low-margin`,
            type: "value",
            severity: "low",
            title: "Margen bajo del bookmaker",
            description: `${f.home.name} vs ${f.away.name} — overround ${overround.toFixed(1)}%. Cuotas más justas de lo normal.`,
            fixture: f,
            edge: 103 - overround,
          });
        }

        // High odds movement potential (draw > 4.0 = potential value)
        if (f.market.drawOdds > 4.0) {
          alerts.push({
            id: `${f.id}-high-draw`,
            type: "value",
            severity: "low",
            title: "Empate con cuota alta",
            description: `${f.home.name} vs ${f.away.name} — Empate @ ${f.market.drawOdds.toFixed(2)}. Verificar si el modelo da >28%.`,
            fixture: f,
            market: "Empate",
          });
        }
      }

      // Live alerts
      if (f.status === "live") {
        alerts.push({
          id: `${f.id}-live`,
          type: "live",
          severity: "high",
          title: "Partido en curso",
          description: `${f.home.name} ${f.result?.homeGoals ?? 0}-${f.result?.awayGoals ?? 0} ${f.away.name} · ${(f as any).elapsed ?? "?"}' — Datos actualizándose.`,
          fixture: f,
        });
      }
    }

    // Add alerts from current analysis (if available)
    if (fixture && analysis) {
      for (const flag of analysis.riskFlags) {
        // Avoid duplicates
        if (alerts.some(a => a.id === `${fixture.id}-${flag.id}`)) continue;
        alerts.push({
          id: `${fixture.id}-${flag.id}`,
          type: "risk",
          severity: flag.severity,
          title: flag.label,
          description: `${fixture.home.name} vs ${fixture.away.name} · Confianza ${analysis.confidence.score}/100`,
          fixture,
          confidence: analysis.confidence.score,
        });
      }

      // Value market alerts
      const valueMarkets = analysis.valueTable.filter(r => r.edge > 5);
      for (const vm of valueMarkets.slice(0, 3)) {
        alerts.push({
          id: `${fixture.id}-value-${vm.market}`,
          type: "value",
          severity: vm.edge > 10 ? "high" : "medium",
          title: `Valor detectado: ${vm.market}`,
          description: `Edge +${vm.edge}% · Modelo ${vm.modelProbability}% vs Mercado ${vm.marketProbability}%`,
          fixture,
          market: vm.market,
          edge: vm.edge,
        });
      }
    }

    const merged = [...backendMapped, ...alerts];
    return merged.sort((a, b) => {
      const sev = { high: 3, medium: 2, low: 1 };
      return sev[b.severity] - sev[a.severity];
    });
  }, [fixtures, fixture, analysis, backendMapped]);

  // Filter
  const filteredAlerts = useMemo(() => {
    return allAlerts.filter(a => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      return true;
    });
  }, [allAlerts, typeFilter, severityFilter]);

  const highCount = allAlerts.filter(a => a.severity === "high").length;
  const mediumCount = allAlerts.filter(a => a.severity === "medium").length;
  const valueCount = allAlerts.filter(a => a.type === "value").length;
  const liveCount = allAlerts.filter(a => a.type === "live").length;

  const typeIcon = (type: Alert["type"]) => {
    switch (type) {
      case "risk": return <AlertTriangle size={16} />;
      case "value": return <TrendingUp size={16} />;
      case "live": return <Activity size={16} />;
      case "lineup": return <Shield size={16} />;
    }
  };

  return (
    <section className="view-workspace alerts-view">
      {/* Header */}
      <article className="alerts-header">
        <div>
          <h2><Bell size={22} /> Centro de Alertas</h2>
          <p>Monitoreo de riesgos, valor detectado y eventos en vivo para todos los partidos del día.</p>
        </div>
        <div className="alerts-stats">
          {alertsLoading && <span className="alerts-loading">Cargando alertas...</span>}
          {highCount > 0 && <span className="alert-stat high">🔴 {highCount} altas</span>}
          {mediumCount > 0 && <span className="alert-stat medium">🟡 {mediumCount} medias</span>}
          {valueCount > 0 && <span className="alert-stat value">💰 {valueCount} valor</span>}
          {liveCount > 0 && <span className="alert-stat live">⚡ {liveCount} en vivo</span>}
        </div>
      </article>

      {/* Filters */}
      <div className="alerts-filters">
        <div className="alerts-filter-group">
          <span><Filter size={12} /> Tipo:</span>
          {(["all", "risk", "value", "live", "lineup"] as const).map(t => (
            <button key={t} className={typeFilter === t ? "active" : ""} onClick={() => setTypeFilter(t)}>
              {t === "all" ? "Todas" : t === "risk" ? "⚠️ Riesgo" : t === "value" ? "💰 Valor" : t === "live" ? "⚡ En Vivo" : "📋 Lineups"}
            </button>
          ))}
        </div>
        <div className="alerts-filter-group">
          <span>Severidad:</span>
          {(["all", "high", "medium", "low"] as const).map(s => (
            <button key={s} className={severityFilter === s ? "active" : ""} onClick={() => setSeverityFilter(s)}>
              {s === "all" ? "Todas" : s === "high" ? "🔴 Alta" : s === "medium" ? "🟡 Media" : "🟢 Baja"}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts list */}
      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="alerts-empty">
            <Bell size={40} />
            <strong>Sin alertas</strong>
            <p>No hay alertas activas con los filtros seleccionados.</p>
          </div>
        ) : (
          filteredAlerts.map(alert => (
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
                {alert.edge && <span className="alert-edge">+{alert.edge.toFixed(1)}%</span>}
              </div>
              <Zap size={14} className="alert-card-action" />
            </button>
          ))
        )}
      </div>

      {/* Rules section */}
      <div className="alerts-rules">
        <h4><Shield size={14} /> Reglas de Gestión de Riesgo</h4>
        <div className="alerts-rules-grid">
          <div className="alert-rule">
            <span className="alert-rule-badge high">ALTO</span>
            <div>
              <strong>Sin odds o cobertura baja</strong>
              <p>Máximo 0.5u. No apostar sin verificación manual.</p>
            </div>
          </div>
          <div className="alert-rule">
            <span className="alert-rule-badge medium">MEDIO</span>
            <div>
              <strong>Lineups no confirmadas</strong>
              <p>Esperar confirmación oficial. Reducir stake 25%.</p>
            </div>
          </div>
          <div className="alert-rule">
            <span className="alert-rule-badge low">BAJO</span>
            <div>
              <strong>Divergencia modelo-mercado &gt;10%</strong>
              <p>Investigar causa. Puede ser valor real o error de datos.</p>
            </div>
          </div>
          <div className="alert-rule">
            <span className="alert-rule-badge value">VALOR</span>
            <div>
              <strong>Edge &gt;5% detectado</strong>
              <p>Oportunidad de apuesta. Verificar alineaciones y aplicar Kelly.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
