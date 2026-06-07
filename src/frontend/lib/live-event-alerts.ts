import type { Fixture } from "@/shared/domain";
import type { LiveEvent } from "@/frontend/hooks/use-live";

export type LiveEventAlertKind =
  | "goal"
  | "card-yellow"
  | "card-red"
  | "penalty"
  | "substitution"
  | "var"
  | "other";

export type LiveEventAlert = {
  fixtureId: string;
  fixtureLabel: string;
  favoriteTeamName: string;
  event: LiveEvent;
  kind: LiveEventAlertKind;
};

export type LiveEventTracker = {
  initialized: boolean;
  seenKeys: Set<string>;
  goalTotal: number;
};

export function buildLiveEventKey(fixtureId: string, event: LiveEvent): string {
  return [
    fixtureId,
    event.time,
    event.type,
    event.detail,
    event.player,
    event.team,
  ].join("|");
}

export function classifyLiveEvent(type: string, detail: string): LiveEventAlertKind {
  const t = type.toLowerCase();
  const d = detail.toLowerCase();

  if (t === "var" || d.includes("var")) return "var";
  if (t === "goal" || d.includes("goal")) return "goal";
  if (t === "card" && d.includes("red")) return "card-red";
  if (t === "card" || d.includes("yellow")) return "card-yellow";
  if (d.includes("penalty") && !d.includes("missed")) return "penalty";
  if (t === "var" || d.includes("var")) return "var";
  if (t === "subst" || d.includes("substitution")) return "substitution";
  return "other";
}

export function shouldPlaySoundForKind(kind: LiveEventAlertKind): boolean {
  return kind !== "other";
}

export function fixtureHasFavoriteTeam(fixture: Fixture, favoriteTeamIds: string[]): boolean {
  if (favoriteTeamIds.length === 0) return false;
  return favoriteTeamIds.includes(fixture.home.id) || favoriteTeamIds.includes(fixture.away.id);
}

export function favoriteTeamNameInFixture(fixture: Fixture, favoriteTeamIds: string[]): string {
  if (favoriteTeamIds.includes(fixture.home.id)) return fixture.home.name;
  if (favoriteTeamIds.includes(fixture.away.id)) return fixture.away.name;
  return fixture.home.name;
}

export function formatLiveEventAlertMessage(alert: LiveEventAlert): string {
  const minute = alert.event.time > 0 ? `${alert.event.time}'` : "En vivo";
  const matchup = alert.fixtureLabel;

  switch (alert.kind) {
    case "goal":
      return `⚽ ¡GOL! ${alert.event.player || alert.favoriteTeamName} (${minute}) · ${matchup}`;
    case "card-yellow":
      return `🟨 Tarjeta amarilla · ${alert.event.player || alert.event.team} (${minute}) · ${matchup}`;
    case "card-red":
      return `🟥 Expulsión · ${alert.event.player || alert.event.team} (${minute}) · ${matchup}`;
    case "penalty":
      return `⚡ Penalti · ${alert.event.team || alert.favoriteTeamName} (${minute}) · ${matchup}`;
    case "substitution":
      return `🔄 Cambio · ${alert.event.player || alert.event.detail} (${minute}) · ${matchup}`;
    case "var":
      return `📺 VAR · ${alert.event.detail} (${minute}) · ${matchup}`;
    default:
      return `${alert.event.detail} (${minute}) · ${matchup}`;
  }
}

export function toastTypeForKind(kind: LiveEventAlertKind): "success" | "warning" | "info" {
  if (kind === "goal") return "success";
  if (kind === "card-red" || kind === "penalty") return "warning";
  return "info";
}

/** Detect events that were not seen before. Seeds baseline on first pass (no alerts). */
export function detectNewLiveEvents(
  fixtureId: string,
  events: LiveEvent[],
  tracker: LiveEventTracker
): { alerts: LiveEvent[]; next: LiveEventTracker } {
  const nextSeen = new Set(tracker.seenKeys);
  const alerts: LiveEvent[] = [];

  for (const event of events) {
    const key = buildLiveEventKey(fixtureId, event);
    if (nextSeen.has(key)) continue;
    nextSeen.add(key);
    if (tracker.initialized) {
      alerts.push(event);
    }
  }

  return {
    alerts,
    next: {
      initialized: true,
      seenKeys: nextSeen,
      goalTotal: tracker.goalTotal,
    },
  };
}

/** Fallback when events feed is empty but score changed (e.g. thin live coverage). */
export function detectGoalFromScoreChange(
  fixture: Fixture,
  tracker: LiveEventTracker
): { alert: LiveEvent | null; next: LiveEventTracker } {
  const home = fixture.result?.homeGoals ?? 0;
  const away = fixture.result?.awayGoals ?? 0;
  const total = home + away;
  const next: LiveEventTracker = {
    ...tracker,
    initialized: true,
    goalTotal: total,
  };

  if (!tracker.initialized) {
    return { alert: null, next };
  }

  if (total > tracker.goalTotal) {
    return {
      alert: {
        time: fixture.elapsed ?? 0,
        team: fixture.home.name,
        teamLogo: fixture.home.logo ?? "",
        player: "",
        type: "Goal",
        detail: "Normal Goal",
      },
      next,
    };
  }

  return { alert: null, next };
}

export function markGoalCountAlerted(
  fixtureId: string,
  fixture: Fixture,
  tracker: LiveEventTracker
): LiveEventTracker {
  const total = (fixture.result?.homeGoals ?? 0) + (fixture.result?.awayGoals ?? 0);
  const nextSeen = new Set(tracker.seenKeys);
  nextSeen.add(`${fixtureId}:goal-count:${total}`);
  return { ...tracker, seenKeys: nextSeen, goalTotal: total };
}

export function wasGoalCountAlreadyAlerted(
  fixtureId: string,
  fixture: Fixture,
  tracker: LiveEventTracker
): boolean {
  const total = (fixture.result?.homeGoals ?? 0) + (fixture.result?.awayGoals ?? 0);
  return tracker.seenKeys.has(`${fixtureId}:goal-count:${total}`);
}

export function createLiveEventTracker(): LiveEventTracker {
  return { initialized: false, seenKeys: new Set(), goalTotal: 0 };
}
