import type { LeagueStandingRow } from "@/shared/domain";

export const demoLeagueStandings: Record<string, LeagueStandingRow[]> = {
  "premier-league": [
    { rank: 1, teamId: "arsenal", teamName: "Arsenal", played: 36, points: 83, goalDiff: 45 },
    { rank: 2, teamId: "liverpool", teamName: "Liverpool", played: 36, points: 80, goalDiff: 38 },
    { rank: 3, teamId: "man-city", teamName: "Manchester City", played: 36, points: 74, goalDiff: 30 },
    { rank: 4, teamId: "chelsea", teamName: "Chelsea", played: 36, points: 66, goalDiff: 18 },
    { rank: 5, teamId: "newcastle", teamName: "Newcastle", played: 36, points: 64, goalDiff: 14 },
  ],
  laliga: [
    { rank: 1, teamId: "real-madrid", teamName: "Real Madrid", played: 35, points: 84, goalDiff: 40 },
    { rank: 2, teamId: "barcelona", teamName: "Barcelona", played: 35, points: 79, goalDiff: 35 },
    { rank: 3, teamId: "atletico", teamName: "Atlético Madrid", played: 35, points: 68, goalDiff: 22 },
    { rank: 4, teamId: "athletic", teamName: "Athletic Club", played: 35, points: 65, goalDiff: 16 },
    { rank: 5, teamId: "real-sociedad", teamName: "Real Sociedad", played: 35, points: 58, goalDiff: 8 },
  ],
  "primera-arg": [
    { rank: 1, teamId: "river", teamName: "River Plate", played: 14, points: 31, goalDiff: 12 },
    { rank: 2, teamId: "boca", teamName: "Boca Juniors", played: 14, points: 28, goalDiff: 9 },
    { rank: 3, teamId: "racing", teamName: "Racing Club", played: 14, points: 26, goalDiff: 7 },
    { rank: 4, teamId: "talleres", teamName: "Talleres", played: 14, points: 24, goalDiff: 5 },
    { rank: 5, teamId: "independiente", teamName: "Independiente", played: 14, points: 22, goalDiff: 3 },
  ],
};
