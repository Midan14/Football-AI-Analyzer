import type { TeamRecentMatch } from "@/shared/domain";

const DEMO_OPPONENTS = [
  "Atlético FC",
  "Sporting United",
  "Deportivo Central",
  "Racing Club",
  "Unión City",
];

export function buildDemoRecentMatches(teamName: string, form: string[]): TeamRecentMatch[] {
  return form.map((result, index) => {
    const isHome = index % 2 === 0;
    const opponent = DEMO_OPPONENTS[index % DEMO_OPPONENTS.length];
    const normalized = result === "W" || result === "D" || result === "L" ? result : "D";

    let homeGoals = 1;
    let awayGoals = 1;
    if (normalized === "W") {
      if (isHome) {
        homeGoals = 2;
        awayGoals = 0;
      } else {
        homeGoals = 0;
        awayGoals = 2;
      }
    } else if (normalized === "L") {
      if (isHome) {
        homeGoals = 0;
        awayGoals = 2;
      } else {
        homeGoals = 2;
        awayGoals = 0;
      }
    }

    return {
      date: new Date(Date.now() - (index + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
      homeTeam: isHome ? teamName : opponent,
      awayTeam: isHome ? opponent : teamName,
      homeGoals,
      awayGoals,
      result: normalized,
    };
  });
}
