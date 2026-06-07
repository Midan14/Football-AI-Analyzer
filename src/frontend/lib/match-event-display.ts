import type { MatchEvent, MatchLineup, MatchStatistic, Fixture } from "@/shared/domain";

export type MatchEventCategory =
  | "goal-normal"
  | "goal-penalty"
  | "goal-own"
  | "penalty-missed"
  | "card-yellow"
  | "card-second-yellow"
  | "card-red"
  | "substitution"
  | "substitution-injury"
  | "var"
  | "whistle"
  | "corner"
  | "other";

export type MatchEventDisplay = {
  category: MatchEventCategory;
  label: string;
  icon: string;
  tone: "goal" | "card" | "danger" | "info" | "neutral";
};

export function classifyMatchEventForDisplay(type: string, detail: string): MatchEventDisplay {
  const t = type.toLowerCase();
  const d = detail.toLowerCase();

  if (t === "var" || d.includes("var")) {
    return { category: "var", label: "VAR", icon: "📺", tone: "info" };
  }
  if (
    d.includes("missed penalty") ||
    d.includes("penalty missed") ||
    d.includes("penalti fallido") ||
    (t.includes("penalty") && d.includes("miss"))
  ) {
    return { category: "penalty-missed", label: "Penalti fallido", icon: "❌", tone: "danger" };
  }
  if (t === "goal" || d.includes("goal")) {
    if (d.includes("own")) {
      return { category: "goal-own", label: "Gol en propia meta", icon: "⚽", tone: "goal" };
    }
    if (d.includes("penalty") || d.includes("penalti")) {
      return { category: "goal-penalty", label: "Gol de penalti", icon: "⚽", tone: "goal" };
    }
    return { category: "goal-normal", label: "Gol", icon: "⚽", tone: "goal" };
  }
  if (t === "card" && (d.includes("second yellow") || d.includes("segunda amarilla"))) {
    return { category: "card-second-yellow", label: "Segunda amarilla", icon: "🟨🟥", tone: "danger" };
  }
  if (t === "card" && d.includes("red")) {
    return { category: "card-red", label: "Tarjeta roja", icon: "🟥", tone: "danger" };
  }
  if (t === "card" || d.includes("yellow")) {
    return { category: "card-yellow", label: "Tarjeta amarilla", icon: "🟨", tone: "card" };
  }
  if (t === "subst" || d.includes("substitution") || d.includes("sustituc")) {
    if (d.includes("injury") || d.includes("lesion")) {
      return {
        category: "substitution-injury",
        label: "Sustitución por lesión",
        icon: "🏥",
        tone: "info",
      };
    }
    return { category: "substitution", label: "Sustitución", icon: "🔄", tone: "neutral" };
  }
  if (d.includes("whistle") || d.includes("silbido") || d.includes("half time") || d.includes("descanso")) {
    return { category: "whistle", label: "Silbido / Descanso", icon: "📣", tone: "neutral" };
  }

  return { category: "other", label: detail || type || "Incidencia", icon: "•", tone: "neutral" };
}

export function formatEventMinute(event: MatchEvent): string {
  if (event.time <= 0) return "—";
  return `${event.time}${event.extraTime ? `+${event.extraTime}` : ""}′`;
}

export function sortEventsChronologically(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => {
    const ta = a.time + (a.extraTime ?? 0) * 0.01;
    const tb = b.time + (b.extraTime ?? 0) * 0.01;
    return ta - tb;
  });
}

export function buildCornerSummary(statistics?: MatchStatistic[]): string | null {
  if (!statistics?.length) return null;
  const row = statistics.find((s) => s.type.toLowerCase().includes("corner"));
  if (!row) return null;
  return `Córners: ${row.home} - ${row.away}`;
}

export type SquadAvailabilitySide = {
  teamName: string;
  starters: string[];
  substitutes: string[];
  injured: Array<{ player: string; status: string }>;
  suspended: Array<{ player: string; position: string }>;
  unavailable: Array<{ player: string; reason: string }>;
  confirmedCount: number;
};

export function buildSquadAvailability(
  fixture: Fixture,
  lineups?: MatchLineup[]
): { home: SquadAvailabilitySide; away: SquadAvailabilitySide } {
  const buildSide = (
    teamId: string,
    teamName: string,
    side: "home" | "away"
  ): SquadAvailabilitySide => {
    const lineup = lineups?.find((l) => l.teamId === teamId);
    const squad = fixture.squad?.[side];
    const injured = squad?.injuries ?? [];
    const suspended = squad?.suspensions ?? [];
    const starters = lineup?.startXI.map((p) => p.name) ?? squad?.lastLineup ?? [];
    const substitutes = lineup?.substitutes.map((p) => p.name) ?? [];

    const unavailableNames = new Set<string>();
    const unavailable: Array<{ player: string; reason: string }> = [];

    for (const inj of injured) {
      unavailableNames.add(inj.player.toLowerCase());
      unavailable.push({ player: inj.player, reason: inj.status });
    }
    for (const sus of suspended) {
      unavailableNames.add(sus.player.toLowerCase());
      unavailable.push({ player: sus.player, reason: "Suspendido" });
    }

    const playing = starters.filter((name) => !unavailableNames.has(name.toLowerCase()));

    return {
      teamName,
      starters: playing.length > 0 ? playing : starters,
      substitutes,
      injured: injured.map((i) => ({ player: i.player, status: i.status })),
      suspended,
      unavailable,
      confirmedCount: playing.length,
    };
  };

  return {
    home: buildSide(fixture.home.id, fixture.home.name, "home"),
    away: buildSide(fixture.away.id, fixture.away.name, "away"),
  };
}

export function motivationLabel(value: number): string {
  if (value >= 80) return "Muy alta";
  if (value >= 65) return "Alta";
  if (value >= 50) return "Media";
  if (value >= 35) return "Baja";
  return "Muy baja";
}
