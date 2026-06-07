"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  BellRing,
  Radio,
  Volume2,
  VolumeX,
  Download,
} from "lucide-react";
import type { Fixture } from "@/shared/domain";
import { useOpportunities, type OpportunitiesScope } from "@/frontend/hooks/use-opportunities";
import { formatKickoffColombia } from "@/frontend/lib/date-utils";
import { fixtureStatusLabelEs } from "@/shared/fixture-status";
import { DataStatusBanner } from "./data-status-banner";
import { BankrollPanel } from "./bankroll-panel";
import { showBrowserMatchNotification } from "@/frontend/lib/browser-notifications";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { CONFIDENCE_THRESHOLDS } from "@/shared/confidence-thresholds";

type OpportunityRecord = {
  fixtureId: string;
  fixture: Fixture;
  confidence: number;
  radarScore?: number;
  liquidityScore?: number;
  freshnessScore?: number;
  inflatedSignal?: boolean;
  movementSignal?: number;
  valueBets: Array<{
    market: string;
    modelProbability: number;
    marketProbability?: number;
    bookmakerOdds?: number;
    medianOdds?: number;
    spreadPercent?: number;
    edge: number;
    evPercent?: number;
    radarScore?: number;
    isInflated?: boolean;
    movementPercent?: number;
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

type NewSignalRecord = {
  fixtureId: string;
  market: string;
  edge: number;
  evPercent: number;
  radarScore: number;
  modelProbability: number;
  confidence: number;
};

type SignalHistoryRecord = NewSignalRecord & {
  fixtureName: string;
  leagueName: string;
  date: string;
  createdAt: string;
};

type SignalMetricsRecord = {
  totalStored: number;
  last24h: { count: number; avgEv: number; avgRadar: number; avgConfidence: number };
  last7d: { count: number; avgEv: number; avgRadar: number; avgConfidence: number };
  topLeagues: Array<{ leagueName: string; count: number }>;
};

type RadarTrackingRecord = {
  open: number;
  resolved: number;
  won: number;
  lost: number;
  void: number;
  hitRate: number;
  roiUnits: number;
  roiPercent: number;
};

type RadarClosedSignalRecord = {
  id: string;
  fixtureId: string;
  fixtureName: string;
  leagueName: string;
  market: string;
  prediction: string;
  status: string;
  roi: number;
  odds: number | null;
  closingOdds: number | null;
  clvPercent: number | null;
  resultDate: string | null;
};

const EDGE_FILTERS = [
  { id: 5, label: "Edge ≥ 5%" },
  { id: 8, label: "Edge ≥ 8%" },
  { id: 10, label: "Edge ≥ 10%" },
  { id: 12, label: "Edge ≥ 12%" },
] as const;

const CONFIDENCE_FILTERS = [
  { id: 50, label: "Conf. ≥ 50%" },
  { id: CONFIDENCE_THRESHOLDS.caution, label: `Conf. ≥ ${CONFIDENCE_THRESHOLDS.caution}%` },
  { id: 65, label: "Conf. ≥ 65%" },
  { id: CONFIDENCE_THRESHOLDS.bet, label: `Conf. ≥ ${CONFIDENCE_THRESHOLDS.bet}%` },
] as const;

const EV_FILTERS = [
  { id: 0, label: "EV ≥ 0%" },
  { id: 2, label: "EV ≥ 2%" },
  { id: 5, label: "EV ≥ 5%" },
  { id: 8, label: "EV ≥ 8%" },
] as const;

function edgeTier(edge: number): "high" | "medium" | "low" {
  if (edge >= 10) return "high";
  if (edge >= 5) return "medium";
  return "low";
}

function formatKickoff(kickoff: string) {
  const { time, day } = formatKickoffColombia(kickoff);
  return { time, day };
}

function statusLabel(fixture: Fixture) {
  return fixtureStatusLabelEs(fixture.status, fixture.statusLong).toUpperCase();
}

function playRadarPing() {
  if (typeof window === "undefined") return;
  const audioCtx = new window.AudioContext();
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.23);
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
  const [minEdge, setMinEdge] = useState(5);
  const [minConfidence, setMinConfidence] = useState<number>(CONFIDENCE_THRESHOLDS.caution);
  const [minEv, setMinEv] = useState(2);
  const [scope, setScope] = useState<OpportunitiesScope>("day");
  const [radarMode, setRadarMode] = useState(false);
  const [autoTrackEnabled, setAutoTrackEnabled] = useLocalStorage<boolean>(
    "football-ai-opportunities-autotrack",
    false
  );
  const [radarSound, setRadarSound] = useState(true);
  const [newRadarHits, setNewRadarHits] = useState(0);
  const [closedStatusFilter, setClosedStatusFilter] = useState<"ALL" | "WON" | "LOST" | "VOID">("ALL");
  const [closedMarketFilter, setClosedMarketFilter] = useState("");
  const [closedLeagueFilter, setClosedLeagueFilter] = useState("ALL");
  const [closedFromDate, setClosedFromDate] = useState("");
  const [closedToDate, setClosedToDate] = useState("");
  const [closedWindow, setClosedWindow] = useState<"7d" | "30d" | "all">("all");
  const [hoveredEquityIdx, setHoveredEquityIdx] = useState<number | null>(null);
  const [equityScale, setEquityScale] = useState<"linear" | "log">("linear");
  const [equityMode, setEquityMode] = useState<"units" | "percent">("units");
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());
  const seenRadarKeysRef = useRef<Set<string>>(new Set());
  const seenServerSignalRef = useRef<Set<string>>(new Set());
  const equitySvgRef = useRef<SVGSVGElement | null>(null);

  const { data, isLoading, isFetching, refetch } = useOpportunities({
    date: selectedDate,
    leagueId: selectedLeague,
    scope,
    minEdge,
    minConfidence,
    minEv,
    autoTrack: autoTrackEnabled,
    radarMode,
  });

  const opportunities = (data?.data?.opportunities ?? []) as OpportunityRecord[];
  const newSignals = (data?.data?.newSignals ?? []) as NewSignalRecord[];
  const signalHistory = (data?.data?.signalHistory ?? []) as SignalHistoryRecord[];
  const signalMetrics = (data?.data?.signalMetrics ?? null) as SignalMetricsRecord | null;
  const autoAlertsCreated = (data?.data?.autoAlertsCreated as number | undefined) ?? 0;
  const trackedPredictionsCreated =
    (data?.data?.trackedPredictionsCreated as number | undefined) ?? 0;
  const radarTracking = (data?.data?.radarTracking ?? null) as RadarTrackingRecord | null;
  const radarClosedSignals =
    (data?.data?.radarClosedSignals ?? []) as RadarClosedSignalRecord[];
  const emailDigestSent = Boolean(data?.data?.emailDigestSent);
  const scanMessage = (data?.data?.message as string | undefined) ?? "";
  const scanned = (data?.data?.scanned as number | undefined) ?? 0;

  useEffect(() => {
    if (!radarMode || opportunities.length === 0) return;
    const freshKeys: string[] = [];
    for (const opp of opportunities) {
      for (const bet of opp.valueBets) {
        if ((bet.edge ?? 0) < 8) continue;
        if ((bet.evPercent ?? 0) < minEv) continue;
        const key = `${opp.fixtureId}:${bet.market}`;
        if (!seenRadarKeysRef.current.has(key)) {
          seenRadarKeysRef.current.add(key);
          freshKeys.push(key);
        }
      }
    }
    if (freshKeys.length > 0) {
      setNewRadarHits(freshKeys.length);
      if (radarSound) playRadarPing();
    }
  }, [opportunities, radarMode, radarSound, minEv]);

  useEffect(() => {
    if (newSignals.length === 0) return;
    const unseen = newSignals.filter((s) => {
      const key = `${s.fixtureId}:${s.market}:${Math.round(s.evPercent)}`;
      if (seenServerSignalRef.current.has(key)) return false;
      seenServerSignalRef.current.add(key);
      return true;
    });
    if (unseen.length === 0) return;

    setNewRadarHits((prev) => prev + unseen.length);
    const top = unseen[0];
    showBrowserMatchNotification(
      "Nuevo Value Radar detectado",
      `${top.market} | Edge +${top.edge.toFixed(1)}% | EV +${top.evPercent.toFixed(1)}%`,
      `value-radar-${top.fixtureId}`
    );
  }, [newSignals]);

  useEffect(() => {
    setNowTimestamp(Date.now());
  }, [closedWindow, closedFromDate, closedToDate, radarClosedSignals.length]);

  const stats = useMemo(() => {
    if (opportunities.length === 0) {
      return { avgEdge: 0, maxEdge: 0, avgEv: 0, avgRadar: 0, highCount: 0, totalMarkets: 0 };
    }
    const edges = opportunities.flatMap((o) => o.valueBets.map((v) => v.edge));
    const evs = opportunities.flatMap((o) => o.valueBets.map((v) => v.evPercent ?? 0));
    const radarScores = opportunities.flatMap((o) => o.valueBets.map((v) => v.radarScore ?? 0));
    const maxEdge = Math.max(...edges, 0);
    const avgEdge = edges.reduce((sum, e) => sum + e, 0) / edges.length;
    const avgEv = evs.length ? evs.reduce((sum, e) => sum + e, 0) / evs.length : 0;
    const avgRadar = radarScores.length
      ? radarScores.reduce((sum, e) => sum + e, 0) / radarScores.length
      : 0;
    const highCount = opportunities.filter((o) =>
      o.valueBets.some((v) => v.edge >= 10)
    ).length;
    const totalMarkets = edges.length;
    return { avgEdge, maxEdge, avgEv, avgRadar, highCount, totalMarkets };
  }, [opportunities]);

  const closedLeagueOptions = useMemo(
    () =>
      Array.from(new Set(radarClosedSignals.map((s) => s.leagueName)))
        .sort((a, b) => a.localeCompare(b)),
    [radarClosedSignals]
  );

  const filteredClosedSignals = useMemo(() => {
    const windowMs =
      closedWindow === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : closedWindow === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : null;
    return radarClosedSignals.filter((s) => {
      const byStatus = closedStatusFilter === "ALL" ? true : s.status === closedStatusFilter;
      const byMarket = closedMarketFilter.trim().length === 0
        ? true
        : s.market.toLowerCase().includes(closedMarketFilter.trim().toLowerCase());
      const byLeague = closedLeagueFilter === "ALL" ? true : s.leagueName === closedLeagueFilter;
      const signalDate = s.resultDate ? new Date(s.resultDate) : null;
      const fromOk = closedFromDate
        ? signalDate !== null && signalDate >= new Date(`${closedFromDate}T00:00:00`)
        : true;
      const toOk = closedToDate
        ? signalDate !== null && signalDate <= new Date(`${closedToDate}T23:59:59`)
        : true;
      const byWindow =
        windowMs === null
          ? true
          : signalDate !== null && nowTimestamp - signalDate.getTime() <= windowMs;
      return byStatus && byMarket && byLeague && fromOk && toOk && byWindow;
    });
  }, [
    radarClosedSignals,
    closedStatusFilter,
    closedMarketFilter,
    closedLeagueFilter,
    closedFromDate,
    closedToDate,
    closedWindow,
    nowTimestamp,
  ]);

  const equityCurve = useMemo(() => {
    const base = filteredClosedSignals
      .filter((s) => s.status === "WON" || s.status === "LOST")
      .filter((s) => Boolean(s.resultDate))
      .sort((a, b) => (a.resultDate ?? "").localeCompare(b.resultDate ?? ""));
    const reduced = base.reduce(
      (acc, s, idx) => {
        const nextCumulative = acc.cumulative + s.roi;
        const nextPeak = Math.max(acc.peak, nextCumulative);
        const drawdown = nextPeak - nextCumulative;
        const nextMaxDrawdown = Math.max(acc.maxDrawdown, drawdown);
        const nextGrossProfit = s.roi > 0 ? acc.grossProfit + s.roi : acc.grossProfit;
        const nextGrossLoss = s.roi < 0 ? acc.grossLoss + Math.abs(s.roi) : acc.grossLoss;
        const point = {
          x: idx,
          y: nextCumulative,
          yPercent: (nextCumulative / (idx + 1)) * 100,
          drawdown,
          label: s.resultDate ? new Date(s.resultDate).toLocaleDateString("es-CO") : "",
        };
        return {
          cumulative: nextCumulative,
          peak: nextPeak,
          maxDrawdown: nextMaxDrawdown,
          grossProfit: nextGrossProfit,
          grossLoss: nextGrossLoss,
          points: [...acc.points, point],
        };
      },
      {
        cumulative: 0,
        peak: 0,
        maxDrawdown: 0,
        grossProfit: 0,
        grossLoss: 0,
        points: [] as Array<{
          x: number;
          y: number;
          yPercent: number;
          drawdown: number;
          label: string;
        }>,
      }
    );
    const points = reduced.points;
    const valueFor = (p: (typeof points)[number]) =>
      equityMode === "percent" ? p.yPercent : p.y;
    const signedLog = (v: number) => (v === 0 ? 0 : Math.sign(v) * Math.log10(1 + Math.abs(v)));
    const seriesValues = points.map(valueFor);
    const transformedValues =
      equityScale === "log" ? seriesValues.map(signedLog) : seriesValues;
    const minY = transformedValues.length ? Math.min(...transformedValues, 0) : 0;
    const maxY = transformedValues.length ? Math.max(...transformedValues, 0) : 0;
    const profitFactor =
      reduced.grossLoss > 0
        ? Math.round((reduced.grossProfit / reduced.grossLoss) * 100) / 100
        : reduced.grossProfit > 0
          ? 99
          : 0;
    const drawdownPoints = points
      .map((p, idx) => ({ ...p, idx }))
      .filter((p) => p.drawdown > 0.01)
      .sort((a, b) => b.drawdown - a.drawdown)
      .slice(0, 3);
    const range = Math.max(1, maxY - minY);
    const chartPoints = points.map((p, idx, arr) => {
      const rawValue = valueFor(p);
      const transformedValue = equityScale === "log" ? signedLog(rawValue) : rawValue;
      const px = arr.length > 1 ? (idx / (arr.length - 1)) * 258 + 1 : 130;
      const py = 85 - ((transformedValue - minY) / range) * 80;
      return { ...p, idx, px, py, rawValue, transformedValue };
    });
    return {
      points,
      chartPoints,
      drawdownPoints,
      minY,
      maxY,
      total: reduced.cumulative,
      maxDrawdown: Math.round(reduced.maxDrawdown * 100) / 100,
      profitFactor,
      startLabel: points[0]?.label ?? "",
      endLabel: points[points.length - 1]?.label ?? "",
      mode: equityMode,
      scale: equityScale,
    };
  }, [filteredClosedSignals, equityMode, equityScale]);

  const exportClosedSignalsCsv = () => {
    if (filteredClosedSignals.length === 0) return;
    const rows = [
      [
        "fixtureId",
        "fixtureName",
        "leagueName",
        "market",
        "prediction",
        "status",
        "roi_units",
        "odds",
        "closing_odds",
        "clv_percent",
        "result_date",
      ],
      ...filteredClosedSignals.map((s) => [
        s.fixtureId,
        s.fixtureName,
        s.leagueName,
        s.market,
        s.prediction,
        s.status,
        s.roi.toFixed(2),
        s.odds ?? "",
        s.closingOdds ?? "",
        typeof s.clvPercent === "number" ? s.clvPercent.toFixed(1) : "",
        s.resultDate ?? "",
      ]),
    ];
    const csv = rows
      .map((cols) =>
        cols
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `radar-signals-closed-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportEquityPng = async () => {
    const svg = equitySvgRef.current;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1040;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `radar-equity-${selectedDate}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  };

  return (
    <section className="view-workspace opp-view">
      <article className="opp-hero">
        <div className="opp-hero-copy">
          <span className="opp-hero-kicker">Value Scanner</span>
          <h2>
            <Zap size={26} /> Oportunidades de Value
          </h2>
          <p>
            Escaneo del día (prioriza favoritos y ligas con cuotas) o solo tus partidos ⭐. Compara
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
          <div className="opp-hero-stat">
            <strong>+{stats.avgEv.toFixed(1)}%</strong>
            <span>EV medio</span>
          </div>
          <div className="opp-hero-stat">
            <strong>{stats.avgRadar.toFixed(1)}</strong>
            <span>Puntaje radar</span>
          </div>
          <div className="opp-hero-stat gold">
            <strong>+{stats.maxEdge.toFixed(1)}%</strong>
            <span>Mejor edge</span>
          </div>
          {stats.highCount > 0 && (
            <div className="opp-hero-stat hot">
              <strong>{stats.highCount}</strong>
              <span>Edge alto</span>
            </div>
          )}
        </div>
      </article>

      {(fixturesDataSource === "api-football-quota" ||
        fixturesDataSource === "api-football-rate-limit" ||
        fixturesDataSource === "demo-fallback") && (
        <DataStatusBanner fixturesDataSource={fixturesDataSource} />
      )}

      {radarMode && newRadarHits > 0 && (
        <div className="opp-state-card" role="status">
          <div className="opp-state-icon">
            <BellRing size={20} />
          </div>
          <strong>Nueva señal detectada</strong>
          <span>
            Entraron {newRadarHits} oportunidades nuevas con alto edge. Revisa los primeros picks.
          </span>
        </div>
      )}
      {autoTrackEnabled && autoAlertsCreated > 0 && (
        <div className="opp-state-card" role="status">
          <div className="opp-state-icon">
            <BellRing size={20} />
          </div>
          <strong>Alertas automáticas activadas</strong>
          <span>
            Se crearon {autoAlertsCreated} alertas VALUE_DETECTED para seguir señales en tiempo real.
          </span>
        </div>
      )}
      {autoTrackEnabled && trackedPredictionsCreated > 0 && (
        <div className="opp-state-card" role="status">
          <div className="opp-state-icon">
            <Target size={20} />
          </div>
          <strong>Tracking real de ROI activado</strong>
          <span>
            Se crearon {trackedPredictionsCreated} predicciones trazables para resolver W/L/VOID y ROI real.
          </span>
        </div>
      )}
      {autoTrackEnabled && emailDigestSent && (
        <div className="opp-state-card" role="status">
          <div className="opp-state-icon">
            <BellRing size={20} />
          </div>
          <strong>Resumen enviado por email</strong>
          <span>Se envió un digest de señales top de Value Radar a tu correo.</span>
        </div>
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
              Solo favoritos ⭐
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
          <div className="opp-filter-group">
            <span>
              <Percent size={12} /> EV mínimo
            </span>
            {EV_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={minEv === f.id ? "active" : ""}
                onClick={() => setMinEv(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="opp-filter-group">
            <span>
              <Radio size={12} /> Radar
            </span>
            <button
              type="button"
              className={radarMode ? "active" : ""}
              onClick={() => {
                setRadarMode((v) => !v);
                setNewRadarHits(0);
              }}
            >
              {radarMode ? "ON (20s)" : "OFF"}
            </button>
            <button
              type="button"
              className={radarSound ? "active" : ""}
              onClick={() => setRadarSound((v) => !v)}
              title="Sonido de alerta"
            >
              {radarSound ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
          </div>
          <div className="opp-filter-group">
            <span>
              <Target size={12} /> Auto-tracking
            </span>
            <button
              type="button"
              className={autoTrackEnabled ? "active" : ""}
              onClick={() => setAutoTrackEnabled((v) => !v)}
              title="Si está ON, crea alertas y predicciones trazables automáticamente"
            >
              {autoTrackEnabled ? "ON" : "OFF"}
            </button>
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
                <strong>Confianza ≥ {CONFIDENCE_THRESHOLDS.bet}</strong>
                <span>Stake completo según Kelly fraccional.</span>
              </li>
              <li>
                <strong>Filtro de favoritos</strong>
                <span>Solo analiza partidos que sigues.</span>
              </li>
            </ul>
            {onGoWatchlist && (
              <button type="button" className="opp-watchlist-link" onClick={onGoWatchlist}>
                <Star size={14} /> Ir a Favoritos
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
              <div>
                <span>Filtro EV</span>
                <strong>≥ {minEv}%</strong>
              </div>
              <div>
                <span>Auto-tracking</span>
                <strong>{autoTrackEnabled ? "ON" : "OFF"}</strong>
              </div>
            </div>
          </div>

          <div className="opp-sidebar-block">
            <h3>
              <BellRing size={16} /> Historial de señales
            </h3>
            {!autoTrackEnabled ? (
              <p style={{ margin: 0, opacity: 0.8 }}>
                Auto-tracking está OFF. Actívalo para guardar señales y métricas históricas.
              </p>
            ) : signalHistory.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.8 }}>Aún no hay señales guardadas para mostrar.</p>
            ) : (
              <div className="opp-scan-metrics">
                {signalHistory.slice(0, 8).map((s) => (
                  <div key={`${s.fixtureId}:${s.market}:${s.createdAt}`}>
                    <span>{s.fixtureName}</span>
                    <strong>
                      {s.market} · EV +{s.evPercent.toFixed(1)}%
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="opp-sidebar-block">
            <h3>
              <TrendingUp size={16} /> Performance Radar
            </h3>
            {!autoTrackEnabled ? (
              <p style={{ margin: 0, opacity: 0.8 }}>
                Activa Auto-tracking para calcular métricas reales de señales y ROI.
              </p>
            ) : signalMetrics ? (
              <div className="opp-scan-metrics">
                <div>
                  <span>Señales (24h)</span>
                  <strong>{signalMetrics.last24h.count}</strong>
                </div>
                <div>
                  <span>EV medio (24h)</span>
                  <strong>+{signalMetrics.last24h.avgEv.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>Radar medio (24h)</span>
                  <strong>{signalMetrics.last24h.avgRadar.toFixed(1)}</strong>
                </div>
                <div>
                  <span>Señales (7d)</span>
                  <strong>{signalMetrics.last7d.count}</strong>
                </div>
                <div>
                  <span>EV medio (7d)</span>
                  <strong>+{signalMetrics.last7d.avgEv.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>Confianza media (7d)</span>
                  <strong>{signalMetrics.last7d.avgConfidence.toFixed(1)}%</strong>
                </div>
                {signalMetrics.topLeagues.slice(0, 3).map((league) => (
                  <div key={league.leagueName}>
                    <span>Top liga</span>
                    <strong>
                      {league.leagueName} ({league.count})
                    </strong>
                  </div>
                ))}
                {radarTracking && (
                  <>
                    <div>
                      <span>Tracking real</span>
                      <strong>{radarTracking.resolved} resueltas / {radarTracking.open} abiertas</strong>
                    </div>
                    <div>
                      <span>Hit-rate real</span>
                      <strong>{radarTracking.hitRate.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span>ROI real</span>
                      <strong>
                        {radarTracking.roiUnits >= 0 ? "+" : ""}
                        {radarTracking.roiUnits.toFixed(2)}u ({radarTracking.roiPercent.toFixed(1)}%)
                      </strong>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, opacity: 0.8 }}>Sin métricas todavía.</p>
            )}
          </div>

          <div className="opp-sidebar-block">
            <h3>
              <Target size={16} /> Señales cerradas
            </h3>
            {!autoTrackEnabled ? (
              <p style={{ margin: 0, opacity: 0.8 }}>
                Auto-tracking está OFF. No se están guardando señales ni cierres para esta tabla.
              </p>
            ) : null}
            <div className="opp-filter-group" style={{ marginBottom: 8 }}>
              <span>Estado</span>
              {(["ALL", "WON", "LOST", "VOID"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={closedStatusFilter === status ? "active" : ""}
                  onClick={() => setClosedStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="opp-filter-group" style={{ marginBottom: 8 }}>
              <span>Mercado</span>
              <input
                value={closedMarketFilter}
                onChange={(e) => setClosedMarketFilter(e.target.value)}
                placeholder="Filtrar mercado"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(148,163,184,0.4)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  color: "inherit",
                  minWidth: 140,
                }}
              />
              <button type="button" onClick={exportClosedSignalsCsv}>
                <Download size={13} /> CSV
              </button>
            </div>
            <div className="opp-filter-group" style={{ marginBottom: 8 }}>
              <span>Liga</span>
              <select
                value={closedLeagueFilter}
                onChange={(e) => setClosedLeagueFilter(e.target.value)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(148,163,184,0.4)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  color: "inherit",
                  minWidth: 160,
                }}
              >
                <option value="ALL">Todas</option>
                {closedLeagueOptions.map((league) => (
                  <option key={league} value={league}>
                    {league}
                  </option>
                ))}
              </select>
            </div>
            <div className="opp-filter-group" style={{ marginBottom: 8 }}>
              <span>Fecha</span>
              <input
                type="date"
                value={closedFromDate}
                onChange={(e) => setClosedFromDate(e.target.value)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(148,163,184,0.4)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  color: "inherit",
                }}
              />
              <input
                type="date"
                value={closedToDate}
                onChange={(e) => setClosedToDate(e.target.value)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(148,163,184,0.4)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  color: "inherit",
                }}
              />
            </div>
            <div className="opp-filter-group" style={{ marginBottom: 8 }}>
              <span>Ventana</span>
              {(["7d", "30d", "all"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={closedWindow === w ? "active" : ""}
                  onClick={() => setClosedWindow(w)}
                >
                  {w === "all" ? "Todo" : w}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
                Equity Curve ({equityMode === "units" ? "unidades" : "porcentaje"} · {equityScale}):{" "}
                <strong>
                  {equityCurve.total >= 0 ? "+" : ""}
                  {equityMode === "units"
                    ? `${equityCurve.total.toFixed(2)}u`
                    : `${(equityCurve.points.at(-1)?.yPercent ?? 0).toFixed(2)}%`}
                </strong>
              </div>
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}>
                Max DD: <strong>{equityCurve.maxDrawdown.toFixed(2)}u</strong> · Profit Factor:{" "}
                <strong>{equityCurve.profitFactor.toFixed(2)}</strong>
              </div>
              <div className="opp-filter-group" style={{ marginBottom: 6 }}>
                <span>Escala</span>
                {(["linear", "log"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={equityScale === mode ? "active" : ""}
                    onClick={() => setEquityScale(mode)}
                  >
                    {mode}
                  </button>
                ))}
                <span>Modo</span>
                {(["units", "percent"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={equityMode === mode ? "active" : ""}
                    onClick={() => setEquityMode(mode)}
                  >
                    {mode === "units" ? "u" : "%"}
                  </button>
                ))}
                <button type="button" onClick={exportEquityPng}>
                  <Download size={13} /> PNG
                </button>
              </div>
              <svg
                ref={equitySvgRef}
                viewBox="0 0 260 90"
                width="100%"
                height="90"
                role="img"
                aria-label="Curva de equity del radar"
                style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 8 }}
                onMouseLeave={() => setHoveredEquityIdx(null)}
              >
                {[10, 30, 50, 70].map((y) => (
                  <line
                    key={`gy-${y}`}
                    x1="0"
                    y1={y}
                    x2="260"
                    y2={y}
                    stroke="rgba(148,163,184,0.18)"
                    strokeWidth="0.8"
                  />
                ))}
                {[52, 104, 156, 208].map((x) => (
                  <line
                    key={`gx-${x}`}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="90"
                    stroke="rgba(148,163,184,0.12)"
                    strokeWidth="0.8"
                  />
                ))}
                <line x1="0" y1="45" x2="260" y2="45" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                {equityCurve.points.length > 1 && (
                  <>
                    <polyline
                      fill="none"
                      stroke={equityCurve.total >= 0 ? "#22c55e" : "#ef4444"}
                      strokeWidth="2"
                      points={equityCurve.chartPoints
                        .map((p) => `${p.px},${p.py}`)
                        .join(" ")}
                    />
                    {equityCurve.chartPoints.map((p) => (
                      <circle
                        key={`pt-${p.idx}`}
                        cx={p.px}
                        cy={p.py}
                        r={2.2}
                        fill={hoveredEquityIdx === p.idx ? "#60a5fa" : "rgba(96,165,250,0.55)"}
                        onMouseEnter={() => setHoveredEquityIdx(p.idx)}
                      />
                    ))}
                    {equityCurve.drawdownPoints.map((p, drawIdx) => {
                      const hit = equityCurve.chartPoints.find((cp) => cp.idx === p.idx);
                      if (!hit) return null;
                      return (
                        <circle
                          key={`dd-${drawIdx}`}
                          cx={hit.px}
                          cy={hit.py}
                          r={2.8}
                          fill="#f59e0b"
                          stroke="#111827"
                          strokeWidth={0.8}
                        />
                      );
                    })}
                    {hoveredEquityIdx !== null &&
                      equityCurve.chartPoints[hoveredEquityIdx] && (
                        <g>
                          <rect
                            x={Math.max(2, equityCurve.chartPoints[hoveredEquityIdx].px - 52)}
                            y={Math.max(2, equityCurve.chartPoints[hoveredEquityIdx].py - 24)}
                            width="104"
                            height="20"
                            rx="4"
                            fill="rgba(15,23,42,0.9)"
                            stroke="rgba(148,163,184,0.45)"
                          />
                          <text
                            x={Math.max(6, equityCurve.chartPoints[hoveredEquityIdx].px - 48)}
                            y={Math.max(16, equityCurve.chartPoints[hoveredEquityIdx].py - 10)}
                            fontSize="8"
                            fill="#e2e8f0"
                          >
                            {equityCurve.chartPoints[hoveredEquityIdx].label}:{" "}
                            {equityCurve.chartPoints[hoveredEquityIdx].rawValue >= 0 ? "+" : ""}
                            {equityCurve.chartPoints[hoveredEquityIdx].rawValue.toFixed(2)}
                            {equityMode === "units" ? "u" : "%"}
                          </text>
                        </g>
                      )}
                    <text x="2" y="88" fontSize="8" fill="rgba(148,163,184,0.9)">
                      {equityCurve.startLabel || "inicio"}
                    </text>
                    <text x="206" y="88" fontSize="8" fill="rgba(148,163,184,0.9)">
                      {equityCurve.endLabel || "fin"}
                    </text>
                  </>
                )}
              </svg>
            </div>
            {filteredClosedSignals.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.8 }}>Aún no hay señales resueltas.</p>
            ) : (
              <div className="opp-scan-metrics">
                {filteredClosedSignals.slice(0, 10).map((s) => (
                  <div key={s.id}>
                    <span>
                      {s.fixtureName} · {s.market} · {s.leagueName}
                    </span>
                    <strong>
                      {s.status} · {s.roi >= 0 ? "+" : ""}
                      {s.roi.toFixed(2)}u
                      {typeof s.clvPercent === "number"
                        ? ` · CLV ${s.clvPercent >= 0 ? "+" : ""}${s.clvPercent.toFixed(1)}%`
                        : ""}
                    </strong>
                  </div>
                ))}
              </div>
            )}
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
                    ? "Marca partidos con ⭐ en el tablero o prueba «Día completo»."
                    : "Baja el umbral de edge o cambia la fecha en el calendario.")}
              </span>
              {onGoWatchlist && (
                <button type="button" className="opp-primary-btn" onClick={onGoWatchlist}>
                  <Star size={16} /> Abrir Favoritos
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
                          {statusLabel(fixture)}
                        </span>
                        <span className="opp-league-chip">{fixture.leagueName}</span>
                        {opp.inflatedSignal && <span className="opp-league-chip">Cuota inflada</span>}
                      </div>
                      <div className="opp-confidence">
                        <span>Confianza</span>
                        <strong>{Math.round(opp.confidence)}</strong>
                      </div>
                      <div className="opp-confidence">
                        <span>Radar</span>
                        <strong>{(opp.radarScore ?? 0).toFixed(1)}</strong>
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
                            <span className="opp-market-prob">
                              Cuota {bet.bookmakerOdds?.toFixed(2) ?? "—"}
                            </span>
                            <span className="opp-market-prob">
                              EV +{(bet.evPercent ?? 0).toFixed(1)}%
                            </span>
                            <span className="opp-market-prob">
                              Score {((bet.radarScore ?? 0)).toFixed(1)}
                            </span>
                            {(bet.isInflated || Math.abs(bet.movementPercent ?? 0) >= 4) && (
                              <span className="opp-market-prob">
                                {bet.isInflated ? "Inflada" : "Mov."} {((bet.movementPercent ?? 0)).toFixed(1)}%
                              </span>
                            )}
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
