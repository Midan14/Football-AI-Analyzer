import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { analyzeMatch, listFixtures, listOddsByDate } from "@/backend/server/football/football-service";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";
import { mergeOddsIntoFixtures } from "@/backend/lib/fixtures/merge-fixture-odds";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cache, cacheKeys } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Fixture } from "@/shared/domain";
import { getFixtureBookmakerOdds } from "@/backend/lib/odds/bookmaker-odds-service";
import { compareBookmakerOdds } from "@/backend/lib/odds/odds-intelligence";
import { getLineMovementForFixture } from "@/backend/lib/odds/odds-snapshot-service";
import { marketKeyFromRecommendationLabel } from "@/shared/odds-intelligence";
import { CONFIDENCE_THRESHOLDS } from "@/shared/confidence-thresholds";

const QuerySchema = {
  safeParse(params: {
    date?: string | null;
    leagueId?: string | null;
    minEdge?: string | null;
    minConfidence?: string | null;
    minEv?: string | null;
    autoTrack?: string | null;
    limit?: string | null;
    scope?: string | null;
  }) {
    const date = params.date ?? undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false as const, error: "date (YYYY-MM-DD) es requerido" };
    }
    const scope = params.scope === "watchlist" ? "watchlist" : "day";
    const minEdge = parseFloat(params.minEdge || "3");
    const minConfidence = parseFloat(params.minConfidence || String(CONFIDENCE_THRESHOLDS.caution));
    const minEv = parseFloat(params.minEv || "0");
    const autoTrack =
      params.autoTrack === "1" ||
      params.autoTrack === "true" ||
      params.autoTrack === "yes" ||
      params.autoTrack === "on";
    const limit = Math.min(30, Math.max(1, parseInt(params.limit || "15", 10)));
    const leagueId = params.leagueId ?? undefined;
    return {
      success: true as const,
      data: { date, leagueId, scope, minEdge, minConfidence, minEv, autoTrack, limit },
    };
  },
};

type OpportunityRow = {
  fixtureId: string;
  fixture: Fixture;
  timestamp: string;
  confidence: number;
  radarScore: number;
  liquidityScore: number;
  freshnessScore: number;
  inflatedSignal: boolean;
  movementSignal: number;
  valueBets: Array<{
    market: string;
    modelProbability: number;
    marketProbability: number;
    bookmakerOdds: number;
    medianOdds?: number;
    spreadPercent?: number;
    edge: number;
    evPercent: number;
    radarScore: number;
    isInflated: boolean;
    movementPercent?: number;
    verdict: string;
    fairOdds: number;
  }>;
  bestBet: { market: string; stakeUnits?: number; fairOdds?: number; edge?: number } | null;
  stakeSuggestion: number;
};

type NewSignal = {
  fixtureId: string;
  leagueId: string;
  market: string;
  edge: number;
  evPercent: number;
  radarScore: number;
  modelProbability: number;
  confidence: number;
  bookmakerOdds: number;
  fairOdds: number;
};

type SignalHistoryEntry = NewSignal & {
  fixtureName: string;
  leagueName: string;
  date: string;
  createdAt: string;
};

type SignalMetrics = {
  totalStored: number;
  last24h: {
    count: number;
    avgEv: number;
    avgRadar: number;
    avgConfidence: number;
  };
  last7d: {
    count: number;
    avgEv: number;
    avgRadar: number;
    avgConfidence: number;
  };
  topLeagues: Array<{ leagueName: string; count: number }>;
};

type RadarTrackingMetrics = {
  open: number;
  resolved: number;
  won: number;
  lost: number;
  void: number;
  hitRate: number;
  roiUnits: number;
  roiPercent: number;
};

type RadarClosedSignal = {
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

type PredictionMapping = {
  predictionMarket: "WIN_1X2" | "OVER_UNDER" | "BTTS" | "DOUBLE_CHANCE";
  prediction: string;
};

function mapRadarMarketToPrediction(marketLabel: string): PredictionMapping | null {
  switch (marketLabel) {
    case "Local gana":
      return { predictionMarket: "WIN_1X2", prediction: "HOME_WIN" };
    case "Empate":
      return { predictionMarket: "WIN_1X2", prediction: "DRAW" };
    case "Visitante gana":
      return { predictionMarket: "WIN_1X2", prediction: "AWAY_WIN" };
    case "Over 2.5":
      return { predictionMarket: "OVER_UNDER", prediction: "OVER_2.5" };
    case "Under 2.5":
      return { predictionMarket: "OVER_UNDER", prediction: "UNDER_2.5" };
    case "Under 3.5":
      return { predictionMarket: "OVER_UNDER", prediction: "UNDER_3.5" };
    case "BTTS Sí":
      return { predictionMarket: "BTTS", prediction: "YES" };
    case "BTTS No":
      return { predictionMarket: "BTTS", prediction: "NO" };
    case "Doble Chance 1X":
      return { predictionMarket: "DOUBLE_CHANCE", prediction: "1X" };
    case "Doble Chance X2":
      return { predictionMarket: "DOUBLE_CHANCE", prediction: "X2" };
    case "Doble Chance 12":
      return { predictionMarket: "DOUBLE_CHANCE", prediction: "12" };
    default:
      return null;
  }
}

function computeRadarTrackingMetrics(
  rows: Array<{ status: string; roi: number | null; stakeUnits: number }>
): RadarTrackingMetrics {
  const open = rows.filter((r) => r.status === "OPEN").length;
  const won = rows.filter((r) => r.status === "WON").length;
  const lost = rows.filter((r) => r.status === "LOST").length;
  const voidCount = rows.filter((r) => r.status === "VOID").length;
  const resolved = won + lost + voidCount;
  const resolvedRows = rows.filter((r) => r.status === "WON" || r.status === "LOST");
  const stakeResolved = resolvedRows.reduce((acc, row) => acc + row.stakeUnits, 0);
  const roiUnits = Math.round(
    resolvedRows.reduce((acc, row) => acc + (row.roi ?? 0), 0) * 100
  ) / 100;
  const roiPercent = stakeResolved > 0 ? Math.round((roiUnits / stakeResolved) * 1000) / 10 : 0;
  const hitRate = won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : 0;
  return {
    open,
    resolved,
    won,
    lost,
    void: voidCount,
    hitRate,
    roiUnits,
    roiPercent,
  };
}

function computeSignalMetrics(history: SignalHistoryEntry[]): SignalMetrics {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;

  const in24h = history.filter((h) => now - new Date(h.createdAt).getTime() <= dayMs);
  const in7d = history.filter((h) => now - new Date(h.createdAt).getTime() <= weekMs);

  const avg = (rows: SignalHistoryEntry[], pick: (r: SignalHistoryEntry) => number) =>
    rows.length > 0
      ? Math.round((rows.reduce((acc, row) => acc + pick(row), 0) / rows.length) * 10) / 10
      : 0;

  const leagueCounter = new Map<string, number>();
  for (const row of in7d) {
    leagueCounter.set(row.leagueName, (leagueCounter.get(row.leagueName) ?? 0) + 1);
  }
  const topLeagues = [...leagueCounter.entries()]
    .map(([leagueName, count]) => ({ leagueName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalStored: history.length,
    last24h: {
      count: in24h.length,
      avgEv: avg(in24h, (r) => r.evPercent),
      avgRadar: avg(in24h, (r) => r.radarScore),
      avgConfidence: avg(in24h, (r) => r.confidence),
    },
    last7d: {
      count: in7d.length,
      avgEv: avg(in7d, (r) => r.evPercent),
      avgRadar: avg(in7d, (r) => r.radarScore),
      avgConfidence: avg(in7d, (r) => r.confidence),
    },
    topLeagues,
  };
}

async function sendSignalDigestEmail(params: {
  to: string;
  date: string;
  signals: SignalHistoryEntry[];
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  const top = params.signals
    .sort((a, b) => b.radarScore - a.radarScore)
    .slice(0, 6);
  if (top.length === 0) return false;

  const html = `
<div style="font-family:Arial,sans-serif;padding:16px;max-width:640px">
  <h2 style="margin:0 0 8px">Value Radar — nuevas señales</h2>
  <p style="margin:0 0 16px;color:#555">Fecha ${params.date}. Se detectaron ${params.signals.length} señales nuevas.</p>
  ${top
    .map(
      (s) => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px">
      <div style="font-weight:700">${s.fixtureName}</div>
      <div style="color:#334155">${s.market}</div>
      <div style="margin-top:4px;color:#0f766e">Edge +${s.edge.toFixed(1)}% · EV +${s.evPercent.toFixed(
        1
      )}% · Radar ${s.radarScore.toFixed(1)}</div>
    </div>`
    )
    .join("")}
  <p style="margin-top:16px;color:#6b7280;font-size:12px">Generado automáticamente por Football AI Analyzer.</p>
</div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Football AI <noreply@example.com>",
        to: params.to,
        subject: `Value Radar: ${top.length} señales nuevas (${params.date})`,
        html,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);
  const userId = session.user.id;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    date: url.searchParams.get("date"),
    leagueId: url.searchParams.get("leagueId"),
    minEdge: url.searchParams.get("minEdge"),
    minConfidence: url.searchParams.get("minConfidence"),
    minEv: url.searchParams.get("minEv"),
    autoTrack: url.searchParams.get("autoTrack"),
    limit: url.searchParams.get("limit"),
    scope: url.searchParams.get("scope"),
  });

  if (!parsed.success) {
    return errorResponse({ code: "VALIDATION_ERROR", message: parsed.error }, 400);
  }

  const { date, leagueId, scope, minEdge, minConfidence, minEv, autoTrack, limit } = parsed.data;
  const userPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, notificationsEnabled: true },
  });

  const rateLimit = await checkRateLimit(userId, "opportunities:scan", 20, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiados escaneos. Espera un momento." }, 429);
  }

  const watchlistRows = await prisma.watchlistItem.findMany({
    where: { userId },
    select: { fixtureId: true },
  });
  const watchlistIds = new Set(watchlistRows.map((r) => r.fixtureId));

  const fixturesPayload = await listFixtures({ leagueId, date });
  if (fixturesPayload.dataSource === "api-football-quota") {
    return successResponse({
      scope,
      date,
      dataSource: "api-football-quota",
      message: "Cuota API agotada — no hay partidos para escanear.",
      opportunities: [],
      scanned: 0,
    });
  }
  if (fixturesPayload.dataSource === "api-football-rate-limit") {
    return successResponse({
      scope,
      date,
      dataSource: "api-football-rate-limit",
      message: "Rate-limit temporal de API-Football. Reintentando escaneo automáticamente.",
      opportunities: [],
      scanned: 0,
    });
  }

  const fixtures = fixturesPayload.fixtures ?? [];
  const { odds } = await listOddsByDate({ date, leagueId });
  const fixturesWithOdds = mergeOddsIntoFixtures(fixtures, odds);
  const fixtureById = new Map(fixturesWithOdds.map((f) => [f.id, f]));

  let candidates: Fixture[] = [];
  if (scope === "watchlist") {
    if (watchlistIds.size === 0) {
      return successResponse({
        scope,
        date,
        message: "No hay partidos en watchlist. Marca ⭐ en el tablero para seguirlos.",
        opportunities: [],
        scanned: 0,
      });
    }
    candidates = Array.from(watchlistIds)
      .map((id) => fixtureById.get(id))
      .filter((f): f is Fixture => Boolean(f))
      .slice(0, limit * 2);
    if (candidates.length === 0) {
      return successResponse({
        scope,
        date,
        message:
          "Ningún partido de tu watchlist está en esta fecha. Cambia la fecha o usa el modo «Día completo».",
        opportunities: [],
        scanned: 0,
        watchlistCount: watchlistIds.size,
      });
    }
  } else {
    candidates = pickFixtureScanCandidates(fixturesWithOdds, watchlistIds);
  }

  const opportunities: OpportunityRow[] = [];

  for (const candidate of candidates) {
    if (candidate.status === "postponed" || candidate.status === "cancelled") continue;
    try {
      const cacheKey = cacheKeys.analysis(candidate.id);
      let data = await cache.get<Awaited<ReturnType<typeof analyzeMatch>>>(cacheKey);
      if (!data) {
        data = await analyzeMatch(candidate.id);
        await cache.set(cacheKey, data, candidate.status === "live" ? 15 : 90);
      }

      const analysis = data.analysis;
      if (!analysis) continue;
      if ((analysis.confidence?.score ?? 0) < minConfidence) continue;

      const valueBets =
        analysis.valueTable
          ?.map((row) => {
            const marketProbability = Math.max(row.marketProbability, 0.01);
            const bookmakerOdds = 100 / marketProbability;
            const evPercent = ((row.modelProbability / marketProbability) - 1) * 100;
            return {
              ...row,
              bookmakerOdds,
              evPercent,
            };
          })
          .filter(
            (row) =>
              row.edge >= minEdge &&
              row.evPercent >= minEv
          )
          .sort((a, b) => b.evPercent - a.evPercent) ?? [];

      if (valueBets.length === 0) continue;

      // Odds intelligence layer (bookmaker spread + movement) for scoring.
      let compareRows: ReturnType<typeof compareBookmakerOdds>["rows"] = [];
      let movements: Awaited<ReturnType<typeof getLineMovementForFixture>> = [];
      let liquidityScore = 0.55;
      let movementSignal = 0;
      try {
        const bookmakers = await getFixtureBookmakerOdds(candidate.id);
        if (Object.keys(bookmakers).length > 1) {
          const compare = compareBookmakerOdds(candidate.id, bookmakers);
          compareRows = compare.rows;
          // Lower spread = higher quality/liquidity proxy.
          liquidityScore = Math.min(1, Math.max(0.2, 1 - compare.avgSpreadPercent / 20));
        } else if (Object.keys(bookmakers).length === 1) {
          liquidityScore = 0.45;
        }
        movements = await getLineMovementForFixture(candidate.id, 3);
        if (movements.length > 0) {
          movementSignal = Math.min(10, Math.max(-10, movements[0].movementPercent));
        }
      } catch {
        // Non-fatal: scanner keeps working without intelligence layer.
      }

      const freshnessScore =
        candidate.status === "live" ? 1 : candidate.status === "pre-match" ? 0.9 : 0.75;
      const confidenceNorm = Math.min(1, Math.max(0, (analysis.confidence?.score ?? 0) / 100));

      opportunities.push({
        fixtureId: candidate.id,
        fixture: data.fixture ?? candidate,
        timestamp: new Date().toISOString(),
        confidence: analysis.confidence?.score ?? 0,
        liquidityScore: Math.round(liquidityScore * 100) / 100,
        freshnessScore,
        movementSignal,
        radarScore: 0,
        inflatedSignal: false,
        valueBets: valueBets.map((v) => {
          const marketKey = marketKeyFromRecommendationLabel(v.market);
          const compareRow = marketKey
            ? compareRows.find((row) => row.marketKey === marketKey)
            : undefined;
          const medianOdds = compareRow?.medianOdds;
          const spreadPercent = compareRow?.spreadPercent;
          const impliedShift = movements.find((m) => m.label === v.market)?.movementPercent ?? 0;
          const isInflated =
            typeof medianOdds === "number" &&
            medianOdds > 1 &&
            v.bookmakerOdds >= medianOdds * 1.03;
          // Score = EV × confidence × liquidity × freshness + movement bonus.
          const baseScore =
            v.evPercent * confidenceNorm * liquidityScore * freshnessScore;
          const radarScore = Math.max(0, baseScore + impliedShift * 0.25 + (isInflated ? 1.5 : 0));

          return {
            market: v.market,
            modelProbability: v.modelProbability,
            marketProbability: v.marketProbability,
            bookmakerOdds: Math.round(v.bookmakerOdds * 100) / 100,
            medianOdds,
            spreadPercent,
            edge: v.edge,
            evPercent: Math.round(v.evPercent * 10) / 10,
            radarScore: Math.round(radarScore * 10) / 10,
            isInflated,
            movementPercent: impliedShift,
            verdict: v.verdict,
            fairOdds: Math.round((100 / Math.max(v.modelProbability, 1)) * 100) / 100,
          };
        }).sort((a, b) => b.radarScore - a.radarScore),
        bestBet: analysis.recommendation ?? null,
        stakeSuggestion: analysis.recommendation?.stakeUnits ?? 0,
      });
    } catch {
      // Skip failed fixtures
    }
  }

  for (const opp of opportunities) {
    opp.radarScore = Math.max(...opp.valueBets.map((v) => v.radarScore), 0);
    opp.inflatedSignal = opp.valueBets.some((v) => v.isInflated);
  }
  opportunities.sort((a, b) => b.radarScore - a.radarScore);

  let newSignals: NewSignal[] = [];
  let nextHistory: SignalHistoryEntry[] = [];
  let signalMetrics: SignalMetrics = {
    totalStored: 0,
    last24h: { count: 0, avgEv: 0, avgRadar: 0, avgConfidence: 0 },
    last7d: { count: 0, avgEv: 0, avgRadar: 0, avgConfidence: 0 },
    topLeagues: [],
  };
  let autoAlertsCreated = 0;
  let trackedPredictionsCreated = 0;
  let radarTracking: RadarTrackingMetrics = {
    open: 0,
    resolved: 0,
    won: 0,
    lost: 0,
    void: 0,
    hitRate: 0,
    roiUnits: 0,
    roiPercent: 0,
  };
  let radarClosedSignals: RadarClosedSignal[] = [];
  let emailDigestSent = false;

  if (autoTrack) {
    // Persist seen high-value radar signals per-user to avoid duplicate notifications.
    const signalCacheKey = `user:${userId}:opportunity-signals:${date}`;
    const seenSignals = new Set((await cache.get<string[]>(signalCacheKey)) ?? []);
    const nextSeenSignals = new Set(seenSignals);

    for (const opp of opportunities.slice(0, limit)) {
      for (const bet of opp.valueBets) {
        if (bet.edge < 8 || bet.evPercent < 5 || bet.radarScore < 4) continue;
        const signature = `${opp.fixtureId}|${bet.market}|${Math.round(bet.edge)}|${Math.round(bet.evPercent)}`;
        if (seenSignals.has(signature)) continue;
        nextSeenSignals.add(signature);
        newSignals.push({
          fixtureId: opp.fixtureId,
          leagueId: opp.fixture.leagueId,
          market: bet.market,
          edge: Math.round(bet.edge * 10) / 10,
          evPercent: Math.round(bet.evPercent * 10) / 10,
          radarScore: Math.round(bet.radarScore * 10) / 10,
          modelProbability: bet.modelProbability,
          confidence: Math.round(opp.confidence),
          bookmakerOdds: Math.round(bet.bookmakerOdds * 100) / 100,
          fairOdds: bet.fairOdds,
        });
      }
    }

    // Keep a compact rolling set per day/user.
    await cache.set(signalCacheKey, Array.from(nextSeenSignals).slice(-500), 60 * 60 * 24 * 3);

    // Persist recent signal history (for UI and lightweight auditing).
    const historyCacheKey = `user:${userId}:opportunity-history`;
    const history = (await cache.get<SignalHistoryEntry[]>(historyCacheKey)) ?? [];
    const nowIso = new Date().toISOString();
    const fixtureNameById = new Map(
      opportunities.map((o) => [o.fixtureId, `${o.fixture.home.name} vs ${o.fixture.away.name}`])
    );
    const newHistoryEntries: SignalHistoryEntry[] = newSignals.map((s) => ({
      ...s,
      fixtureName: fixtureNameById.get(s.fixtureId) ?? s.fixtureId,
      leagueName: opportunities.find((o) => o.fixtureId === s.fixtureId)?.fixture.leagueName ?? "Liga",
      date,
      createdAt: nowIso,
    }));
    nextHistory = [...newHistoryEntries, ...history].slice(0, 200);
    await cache.set(historyCacheKey, nextHistory, 60 * 60 * 24 * 7);
    signalMetrics = computeSignalMetrics(nextHistory);

    // Auto-create VALUE_DETECTED alert configs for new high-signal fixtures (deduped).
    if (newSignals.length > 0) {
      const fixtureIds = [...new Set(newSignals.map((s) => s.fixtureId))];
      const existingAlerts = await prisma.alert.findMany({
        where: {
          userId,
          type: "VALUE_DETECTED",
          status: "ACTIVE",
          fixtureId: { in: fixtureIds },
        },
        select: { fixtureId: true },
      });
      const alreadyCovered = new Set(existingAlerts.map((a) => a.fixtureId).filter(Boolean) as string[]);
      const toCreate = fixtureIds.filter((id) => !alreadyCovered.has(id));
      if (toCreate.length > 0) {
        await prisma.alert.createMany({
          data: toCreate.map((fixtureId) => ({
            userId,
            type: "VALUE_DETECTED",
            fixtureId,
            threshold: Math.max(5, minEdge),
            condition: {
              source: "opportunities-radar",
              minEv,
              minEdge,
              minConfidence,
            },
            status: "ACTIVE",
          })),
        });
        autoAlertsCreated = toCreate.length;
      }
    }

    // Create trackable radar predictions so existing resolver can produce real W/L/VOID + ROI.
    const mappedSignals = newHistoryEntries
      .map((s) => {
        const mapping = mapRadarMarketToPrediction(s.market);
        if (!mapping) return null;
        return {
          ...s,
          ...mapping,
        };
      })
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (mappedSignals.length > 0) {
      const existing = await prisma.prediction.findMany({
        where: {
          userId,
          status: "OPEN",
          fixtureId: { in: mappedSignals.map((s) => s.fixtureId) },
          notes: { contains: "[RADAR_SIGNAL]" },
        },
        select: {
          fixtureId: true,
          market: true,
          prediction: true,
        },
      });
      const existingKeys = new Set(
        existing.map((e) => `${e.fixtureId}|${e.market}|${e.prediction}`)
      );
      const predictionRows = mappedSignals
        .filter((s) => !existingKeys.has(`${s.fixtureId}|${s.predictionMarket}|${s.prediction}`))
        .map((s) => ({
          userId,
          fixtureId: s.fixtureId,
          leagueId: s.leagueId,
          market: s.predictionMarket,
          prediction: s.prediction,
          probability: s.modelProbability,
          odds: s.bookmakerOdds > 1.01 ? s.bookmakerOdds : null,
          fairOdds: s.fairOdds > 1.01 ? s.fairOdds : null,
          stakeUnits: 1,
          status: "OPEN" as const,
          notes: `[RADAR_SIGNAL] ${s.date} | ${s.market} | edge ${s.edge}% | ev ${s.evPercent}%`,
        }));
      if (predictionRows.length > 0) {
        await prisma.prediction.createMany({ data: predictionRows });
        trackedPredictionsCreated = predictionRows.length;
        await cache.delete(cacheKeys.userPredictions(userId));
      }
    }

    const radarPredictionRows = await prisma.prediction.findMany({
      where: {
        userId,
        notes: { contains: "[RADAR_SIGNAL]" },
        status: { in: ["OPEN", "WON", "LOST", "VOID"] },
      },
      select: {
        status: true,
        roi: true,
        stakeUnits: true,
      },
      take: 2000,
    });
    radarTracking = computeRadarTrackingMetrics(radarPredictionRows);
    const closedRadarPredictions = await prisma.prediction.findMany({
      where: {
        userId,
        notes: { contains: "[RADAR_SIGNAL]" },
        status: { in: ["WON", "LOST", "VOID"] },
      },
      orderBy: { resultDate: "desc" },
      select: {
        id: true,
        fixtureId: true,
        market: true,
        prediction: true,
        status: true,
        roi: true,
        odds: true,
        closingOdds: true,
        clvPercent: true,
        resultDate: true,
      },
      take: 100,
    });
    const fixtureNameLookup = new Map<string, string>();
    for (const h of nextHistory) {
      if (!fixtureNameLookup.has(h.fixtureId)) {
        fixtureNameLookup.set(h.fixtureId, h.fixtureName);
      }
    }
    radarClosedSignals = closedRadarPredictions.map((row) => ({
      id: row.id,
      fixtureId: row.fixtureId,
      fixtureName: fixtureNameLookup.get(row.fixtureId) ?? row.fixtureId,
      leagueName:
        nextHistory.find((h) => h.fixtureId === row.fixtureId)?.leagueName ??
        "Liga",
      market: row.market,
      prediction: row.prediction,
      status: row.status,
      roi: row.roi ?? 0,
      odds: row.odds,
      closingOdds: row.closingOdds,
      clvPercent: row.clvPercent,
      resultDate: row.resultDate?.toISOString() ?? null,
    }));
    // Optional email digest (cooldown) for top new radar signals.
    if (
      newHistoryEntries.length > 0 &&
      userPrefs?.notificationsEnabled &&
      userPrefs.email
    ) {
      const emailCooldownKey = `user:${userId}:opportunity-email-cooldown`;
      const cooldown = await cache.get<{ active: boolean }>(emailCooldownKey);
      if (!cooldown?.active) {
        const topSignals = newHistoryEntries.filter((s) => s.radarScore >= 5);
        if (topSignals.length > 0) {
          emailDigestSent = await sendSignalDigestEmail({
            to: userPrefs.email,
            date,
            signals: topSignals,
          });
          if (emailDigestSent) {
            await cache.set(emailCooldownKey, { active: true }, 30 * 60);
          }
        }
      }
    }
  }

  return successResponse({
    count: opportunities.length,
    scope,
    date,
    dataSource: fixturesPayload.dataSource,
    scanned: candidates.length,
    watchlistCount: watchlistIds.size,
    filters: { minEdge, minConfidence, minEv, autoTrack, limit },
    newSignals,
    signalHistory: nextHistory.slice(0, 20),
    signalMetrics,
    autoAlertsCreated,
    trackedPredictionsCreated,
    radarTracking,
    radarClosedSignals,
    emailDigestSent,
    opportunities: opportunities.slice(0, limit),
  });
});
