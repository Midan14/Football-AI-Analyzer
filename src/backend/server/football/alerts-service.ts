import { prisma } from "@/lib/db";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { captureException } from "@/lib/sentry";
import type { Alert, AlertType } from "@prisma/client";

const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const ODD_MOVEMENT_ENABLED = process.env.FEATURE_ODD_MOVEMENT_ALERTS === "true";

type AlertCondition = {
  fixtureId?: string;
  threshold?: number;
  market?: string;
  userId?: string;
};

type AlertOutput = {
  id: string;
  type: AlertType;
  fixtureId: string;
  fixtureName: string;
  message: string;
  severity: "low" | "medium" | "high";
  triggerValue: number;
  threshold: number;
  createdAt: Date;
  status: "ACTIVE" | "TRIGGERED";
};

export async function getActiveAlerts(userId: string, fixtureId?: string): Promise<AlertOutput[]> {
  const where = fixtureId
    ? { userId, status: "ACTIVE" as const, fixtureId }
    : { userId, status: "ACTIVE" as const };

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const outputs: AlertOutput[] = [];

  for (const alert of alerts) {
    try {
      if (isInCooldown(alert)) continue;
      const evaluated = await evaluateAlert(alert);
      if (evaluated) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastTriggered: new Date() },
        });
        outputs.push(evaluated);
      }
    } catch (err) {
      captureException(err, { alertId: alert.id, type: alert.type });
    }
  }

  return outputs;
}

function isInCooldown(alert: Alert): boolean {
  if (!alert.lastTriggered) return false;
  return Date.now() - alert.lastTriggered.getTime() < ALERT_COOLDOWN_MS;
}

export async function createAlert(
  userId: string,
  type: AlertType,
  fixtureId: string,
  threshold: number,
  condition: Record<string, unknown> = {}
): Promise<Alert> {
  const alert = await prisma.alert.create({
    data: {
      userId,
      type,
      fixtureId,
      threshold,
      condition: condition as unknown as Record<string, any>,
      status: "ACTIVE",
    },
  });

  return alert;
}

async function evaluateAlert(alert: Alert): Promise<AlertOutput | null> {
  const fixtureId = alert.fixtureId ?? (alert.condition as AlertCondition).fixtureId;
  if (!fixtureId) return null;

  const provider = getDataProvider();
  let fixture;
  try {
    fixture = await provider.getMatch(fixtureId);
  } catch {
    return null;
  }

  const analysis = analyzeFixture(fixture);
  const threshold = alert.threshold ?? 5;

  switch (alert.type) {
    case "VALUE_DETECTED": {
      const bestValue = analysis.valueTable.sort((a, b) => b.edge - a.edge)[0];
      if (bestValue && bestValue.edge > threshold) {
        return {
          id: alert.id,
          type: alert.type,
          fixtureId,
          fixtureName: `${fixture.home.name} vs ${fixture.away.name}`,
          message: `Valor detectado en ${bestValue.market}: Edge ${bestValue.edge}% (Modelo ${bestValue.modelProbability}% vs Mercado ${bestValue.marketProbability}%)`,
          severity: bestValue.edge > 12 ? "high" : "medium",
          triggerValue: bestValue.edge,
          threshold,
          createdAt: alert.createdAt,
          status: "TRIGGERED",
        };
      }
      break;
    }

    case "ODD_MOVEMENT": {
      if (!ODD_MOVEMENT_ENABLED) {
        // Disabled until a real odds-history feed is wired in.
        // See docs/engine-roadmap.md (Phase 1).
        return null;
      }
      // Real implementation requires provider.getOddsHistory(fixtureId).
      // No provider exposes that yet — fail closed rather than synthesize.
      return null;
    }

    case "LINEUP_CHANGE": {
      if (!fixture.coverage.hasLineups) {
        return {
          id: alert.id,
          type: alert.type,
          fixtureId,
          fixtureName: `${fixture.home.name} vs ${fixture.away.name}`,
          message: `Alineaciones no confirmadas para ${fixture.home.name} vs ${fixture.away.name}. Alto riesgo de rotación.`,
          severity: "high",
          triggerValue: 100,
          threshold,
          createdAt: alert.createdAt,
          status: "TRIGGERED",
        };
      }
      break;
    }

    case "WEATHER_RISK": {
      if (fixture.context.weatherRisk === "high") {
        return {
          id: alert.id,
          type: alert.type,
          fixtureId,
          fixtureName: `${fixture.home.name} vs ${fixture.away.name}`,
          message: `Riesgo climático alto para ${fixture.home.name} vs ${fixture.away.name}. Condiciones adversas reportadas — impacto en juego aéreo y ritmo.`,
          severity: "high",
          triggerValue: 85,
          threshold,
          createdAt: alert.createdAt,
          status: "TRIGGERED",
        };
      } else if (fixture.context.weatherRisk === "medium" && threshold <= 50) {
        return {
          id: alert.id,
          type: alert.type,
          fixtureId,
          fixtureName: `${fixture.home.name} vs ${fixture.away.name}`,
          message: `Riesgo climático moderado para ${fixture.home.name} vs ${fixture.away.name}. Monitorear condiciones.`,
          severity: "medium",
          triggerValue: 50,
          threshold,
          createdAt: alert.createdAt,
          status: "TRIGGERED",
        };
      }
      break;
    }

    case "MARKET_DIVERGENCE": {
      const maxDivergence = Math.max(
        ...analysis.valueTable.map(
          (row) => Math.abs(row.modelProbability - row.marketProbability)
        )
      );
      if (maxDivergence > threshold) {
        const worst = analysis.valueTable.sort(
          (a, b) =>
            Math.abs(b.modelProbability - b.marketProbability) -
            Math.abs(a.modelProbability - a.marketProbability)
        )[0];
        return {
          id: alert.id,
          type: alert.type,
          fixtureId,
          fixtureName: `${fixture.home.name} vs ${fixture.away.name}`,
          message: `Divergencia modelo-mercado >${threshold}% en ${worst.market}. Modelo: ${worst.modelProbability}% | Mercado: ${worst.marketProbability}% (Diferencia: ${Math.abs(worst.modelProbability - worst.marketProbability)}%)`,
          severity: maxDivergence > 20 ? "high" : "medium",
          triggerValue: maxDivergence,
          threshold,
          createdAt: alert.createdAt,
          status: "TRIGGERED",
        };
      }
      break;
    }

    case "CUSTOM": {
      const customThreshold = (alert.condition as AlertCondition).threshold ?? threshold;
      const customMarket = (alert.condition as AlertCondition).market ?? "homeWin";
      const marketMap: Record<string, number> = {
        homeWin: analysis.probabilities.homeWin,
        draw: analysis.probabilities.draw,
        awayWin: analysis.probabilities.awayWin,
        over25: analysis.probabilities.over25,
        under35: analysis.probabilities.under35,
        btts: analysis.probabilities.btts,
      };
      const marketValue = marketMap[customMarket] ?? 0;
      if (marketValue > customThreshold) {
        return {
          id: alert.id,
          type: alert.type,
          fixtureId,
          fixtureName: `${fixture.home.name} vs ${fixture.away.name}`,
          message: `Alerta personalizada: ${customMarket} superó umbral ${customThreshold}% (Valor: ${marketValue}%)`,
          severity: marketValue > customThreshold + 10 ? "high" : "medium",
          triggerValue: marketValue,
          threshold: customThreshold,
          createdAt: alert.createdAt,
          status: "TRIGGERED",
        };
      }
      break;
    }

    default:
      return null;
  }

  return null;
}
