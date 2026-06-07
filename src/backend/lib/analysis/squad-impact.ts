import type { SquadDynamic } from "@/shared/domain";

function keyPlayerMultiplier(status: string | undefined): number {
  switch (status) {
    case "injured":
    case "suspended":
      return 0.88;
    case "doubtful":
      return 0.94;
    default:
      return 1.0;
  }
}

/** Max fractional reduction to attacking xG from squad issues. */
const MAX_ATTACK_DRAG = 0.24;
/** Max fractional boost to goals conceded when defense is weakened. */
const MAX_DEFENSE_LEAK = 0.18;

export type GoalModelContextAdjustment = {
  homeAttackMult: number;
  awayAttackMult: number;
  homeDefenseLeak: number;
  awayDefenseLeak: number;
  summary?: string;
  source?: "llm" | "heuristic";
};

function injuryImpactScore(squad?: SquadDynamic): number {
  if (!squad) return 0;
  const injuries = squad.injuries.reduce((sum, row) => sum + Math.min(10, Math.max(1, row.impact)), 0);
  const suspensions = squad.suspensions.length * 6;
  return injuries + suspensions;
}

function positionWeights(squad?: SquadDynamic): { attack: number; defense: number } {
  if (!squad || squad.injuries.length === 0) return { attack: 0, defense: 0 };
  let attack = 0;
  let defense = 0;
  for (const row of squad.injuries) {
    const pos = row.position.toLowerCase();
    const w = Math.min(10, Math.max(1, row.impact)) / 10;
    if (pos.includes("gk") || pos.includes("goal") || pos.includes("def") || pos.includes("back")) {
      defense += w;
    } else if (pos.includes("mid") || pos.includes("att") || pos.includes("forw") || pos.includes("strik")) {
      attack += w;
    } else {
      attack += w * 0.55;
      defense += w * 0.45;
    }
  }
  for (const _ of squad.suspensions) {
    attack += 0.35;
    defense += 0.45;
  }
  return { attack, defense };
}

export function squadAttackMultiplier(
  squad: SquadDynamic | undefined,
  keyPlayerStatus: string | undefined,
  lineupConfirmed: boolean,
  rotationRisk: number
): number {
  const impact = injuryImpactScore(squad);
  const { attack: posAttack } = positionWeights(squad);
  const injuryDrag = Math.min(MAX_ATTACK_DRAG, impact * 0.0045 + posAttack * 0.035);
  let mult = 1 - injuryDrag;
  mult *= keyPlayerMultiplier(keyPlayerStatus);

  if (!lineupConfirmed) {
    mult *= rotationRisk > 30 ? 0.96 : 0.98;
  } else if (squad && squad.tacticalChangeRisk > 35) {
    mult *= 0.97;
  }

  return Math.max(0.7, mult);
}

/** Values > 1 weaken defense (opponent scores more). */
export function squadDefenseLeakMultiplier(squad?: SquadDynamic): number {
  const impact = injuryImpactScore(squad);
  const { defense: posDefense } = positionWeights(squad);
  const leak = Math.min(MAX_DEFENSE_LEAK, impact * 0.0035 + posDefense * 0.04);
  return 1 + leak;
}

export function isLineupConfirmed(
  hasLineups: boolean,
  squad: SquadDynamic | undefined
): boolean {
  return hasLineups && (squad?.lastLineup.length ?? 0) >= 9;
}

export function mergeContextAdjustments(
  base: GoalModelContextAdjustment,
  overlay: GoalModelContextAdjustment | null | undefined
): GoalModelContextAdjustment {
  if (!overlay) return base;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    homeAttackMult: clamp(base.homeAttackMult * overlay.homeAttackMult, 0.7, 1.15),
    awayAttackMult: clamp(base.awayAttackMult * overlay.awayAttackMult, 0.7, 1.15),
    homeDefenseLeak: clamp(base.homeDefenseLeak * overlay.homeDefenseLeak, 1, 1.2),
    awayDefenseLeak: clamp(base.awayDefenseLeak * overlay.awayDefenseLeak, 1, 1.2),
    summary: overlay.summary ?? base.summary,
    source: overlay.source ?? base.source,
  };
}

export function buildHeuristicContextAdjustment(fixture: {
  home: { keyPlayerStatus: string; squadRotationRisk: number };
  away: { keyPlayerStatus: string; squadRotationRisk: number };
  squad?: { home: SquadDynamic; away: SquadDynamic };
  coverage: { hasLineups: boolean };
}): GoalModelContextAdjustment {
  const homeConfirmed = isLineupConfirmed(fixture.coverage.hasLineups, fixture.squad?.home);
  const awayConfirmed = isLineupConfirmed(fixture.coverage.hasLineups, fixture.squad?.away);
  return {
    homeAttackMult: squadAttackMultiplier(
      fixture.squad?.home,
      fixture.home.keyPlayerStatus,
      homeConfirmed,
      fixture.home.squadRotationRisk
    ),
    awayAttackMult: squadAttackMultiplier(
      fixture.squad?.away,
      fixture.away.keyPlayerStatus,
      awayConfirmed,
      fixture.away.squadRotationRisk
    ),
    homeDefenseLeak: squadDefenseLeakMultiplier(fixture.squad?.home),
    awayDefenseLeak: squadDefenseLeakMultiplier(fixture.squad?.away),
    source: "heuristic",
  };
}
