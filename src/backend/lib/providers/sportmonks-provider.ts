import type { Country, Fixture, FixtureCoverage, FixtureMarket, H2HRecord, League, RefereeProfile, SquadDynamic, TeamSnapshot } from "@/shared/domain";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";
import {
  mapFixtureStatus,
  mapMatchResult,
  type SportmonksEvent,
  type SportmonksScore,
  type SportmonksStatistic,
} from "@/backend/lib/providers/sportmonks-result-mapper";

const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football";
const SPORTMONKS_CORE_BASE_URL = "https://api.sportmonks.com/v3/core";

// ─── Raw Sportmonks shapes ────────────────────────────────────────────────────

type SportmonksEntity = {
  id: number;
  name: string;
  image_path?: string;
  country_id?: number;
  continent_id?: number;
  iso3?: string;
};

type SportmonksContinent = {
  id: number;
  name: string;
  code?: string;
};

type SportmonksParticipant = SportmonksEntity & {
  meta?: {
    location?: "home" | "away";
    position?: number;
  };
};

type SportmonksOdds = {
  id: number;
  name: string;
  values?: Array<{
    value: { name: string; odds: string };
  }>;
};

type SportmonksStatTeam = {
  type?: { developer_name?: string; name?: string };
  data?: { value?: number | string };
  participant_id?: number | string;
  location?: "home" | "away";
};

type SportmonksInjury = {
  player?: { display_name?: string; name?: string };
  type?: { name?: string };
  starting_at?: string;
};

type SportmonksReferee = {
  display_name?: string;
  name?: string;
};

type SportmonksH2H = {
  id: number;
  name: string;
  starting_at: string;
  scores?: SportmonksScore[];
  participants?: SportmonksParticipant[];
  league?: SportmonksEntity;
};

type SportmonksFixture = {
  id: number;
  league_id: number;
  name: string;
  starting_at: string;
  state?: { developer_name?: string };
  participants?: SportmonksParticipant[];
  league?: SportmonksEntity;
  has_odds?: boolean;
  scores?: SportmonksScore[];
  events?: SportmonksEvent[];
  statistics?: SportmonksStatistic[];
  odds?: SportmonksOdds[];
  injuries?: SportmonksInjury[];
  referees?: SportmonksReferee[];
  h2h?: SportmonksH2H[];
  lineups?: Array<{
    player?: { display_name?: string; name?: string };
    team_id?: number;
    position?: { name?: string };
    formation_position?: number;
  }>;
  standings?: Array<SportmonksStanding>;
};

type SportmonksResponse<T> = {
  data: T;
  meta?: { current_page?: number; last_page?: number };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseForm(formStr: string | undefined): string[] {
  if (!formStr) return [];
  return formStr
    .split(",")
    .map((c) => {
      const ch = c.trim().toUpperCase();
      if (ch === "W" || ch === "D" || ch === "L") return ch;
      return null;
    })
    .filter(Boolean)
    .slice(0, 5) as string[];
}

function statValue(
  stats: SportmonksStatTeam[],
  key: string,
  participantId: number | string | undefined,
  location?: "home" | "away"
): number {
  const row = stats.find((s) => {
    const name = (s.type?.developer_name ?? s.type?.name ?? "").toLowerCase();
    const matchesKey = name.includes(key.toLowerCase());
    if (!matchesKey) return false;
    if (participantId !== undefined) return String(s.participant_id) === String(participantId);
    if (location) return s.location === location;
    return true;
  });
  return safeNum(row?.data?.value, 0);
}

function extractOdds(odds: SportmonksOdds[] | undefined): Partial<FixtureMarket> {
  if (!odds || odds.length === 0) return {};

  const result: Partial<FixtureMarket> = {};

  for (const market of odds) {
    const name = market.name?.toLowerCase() ?? "";
    const values = market.values ?? [];

    // 1X2
    if (name.includes("1x2") || name.includes("match winner") || name.includes("full time result")) {
      for (const v of values) {
        const label = v.value?.name?.toLowerCase() ?? "";
        const odd = safeNum(v.value?.odds, 0);
        if (odd <= 1) continue;
        if (label === "home" || label === "1") result.homeWinOdds = odd;
        else if (label === "draw" || label === "x") result.drawOdds = odd;
        else if (label === "away" || label === "2") result.awayWinOdds = odd;
      }
    }

    // Over/Under 2.5
    if (name.includes("over/under") || name.includes("goals over/under")) {
      for (const v of values) {
        const label = v.value?.name?.toLowerCase() ?? "";
        const odd = safeNum(v.value?.odds, 0);
        if (odd <= 1) continue;
        if (label.includes("over 1.5")) result.over15Odds = odd;
        if (label.includes("over 2.5")) result.over25Odds = odd;
        if (label.includes("under 3.5")) result.under35Odds = odd;
      }
    }

    // BTTS
    if (name.includes("both teams to score") || name.includes("btts")) {
      for (const v of values) {
        const label = v.value?.name?.toLowerCase() ?? "";
        const odd = safeNum(v.value?.odds, 0);
        if (odd <= 1) continue;
        if (label === "yes") result.bttsYesOdds = odd;
        if (label === "no") result.bttsNoOdds = odd;
      }
    }

    // Asian Handicap
    if (name.includes("asian handicap")) {
      for (const v of values) {
        const label = v.value?.name?.toLowerCase() ?? "";
        const odd = safeNum(v.value?.odds, 0);
        if (odd <= 1) continue;
        if (label.includes("home") && label.includes("-1")) result.ahHomeMinus1 = odd;
        if (label.includes("away") && label.includes("+1")) result.ahAwayPlus1 = odd;
      }
    }
  }

  return result;
}

type SportmonksStanding = {
  participant_id?: number | string;
  position?: number;
  points?: number;
  played?: number;
  goals_scored?: number;
  goals_against?: number;
  form?: string;
};

function buildTeamSnapshot(
  participant: SportmonksParticipant | undefined,
  side: "home" | "away",
  stats: SportmonksStatTeam[],
  standing: SportmonksStanding | undefined,
  formStr: string | undefined
): TeamSnapshot {
  const pid = participant?.id;
  const position = safeNum(standing?.position ?? participant?.meta?.position, side === "home" ? 8 : 9);
  const points = safeNum(standing?.points, 0);
  const played = safeNum(standing?.played, 24);
  const goalsFor = safeNum(standing?.goals_scored ?? statValue(stats, "goals", pid, side), Math.max(16, 38 - position * 2));
  const goalsAgainst = safeNum(standing?.goals_against ?? statValue(stats, "goals_conceded", pid, side), 18 + position);

  // xG from stats if available, otherwise estimate from goals
  const xgFor = safeNum(statValue(stats, "xg_for", pid, side) || statValue(stats, "expected_goals", pid, side), goalsFor * 0.92);
  const xgAgainst = safeNum(statValue(stats, "xg_against", pid, side), goalsAgainst * 0.95);

  const form = parseForm(formStr ?? standing?.form);
  const finalForm = form.length >= 3 ? form : (side === "home" ? ["W", "D", "W", "L", "D"] : ["D", "W", "L", "W", "D"]);

  // Motivation: based on position, form, and points
  const formWins = finalForm.filter((f) => f === "W").length;
  const motivation = Math.min(95, Math.max(45, 50 + formWins * 8 + (position <= 5 ? 15 : position >= 15 ? 5 : 10)));

  // Squad rotation risk: higher for top teams with many competitions
  const squadRotationRisk = position <= 4 ? 30 : position <= 8 ? 20 : 15;

  return {
    id: String(pid ?? (side === "home" ? "home" : "away")),
    name: participant?.name ?? (side === "home" ? "Local" : "Visitante"),
    form: finalForm,
    goalsFor,
    goalsAgainst,
    xgFor,
    xgAgainst,
    tablePosition: position,
    restDays: side === "home" ? 5 : 4,
    travelKm: side === "home" ? 0 : 120,
    motivation,
    keyPlayer: "N/D",
    keyPlayerStatus: "available" as const,
    squadRotationRisk,
    pointsTotal: points,
    matchesPlayed: played,
  };
}

function buildSquadFromLineups(
  lineups: SportmonksFixture["lineups"],
  homeId: number | undefined,
  awayId: number | undefined,
  injuries: SportmonksInjury[] | undefined
): { home: SquadDynamic; away: SquadDynamic } | undefined {
  if (!lineups || lineups.length === 0) return undefined;

  const homeLineup = lineups
    .filter((l) => l.team_id !== undefined && String(l.team_id) === String(homeId))
    .map((l) => l.player?.display_name ?? l.player?.name ?? "")
    .filter(Boolean)
    .slice(0, 11);

  const awayLineup = lineups
    .filter((l) => l.team_id !== undefined && String(l.team_id) === String(awayId))
    .map((l) => l.player?.display_name ?? l.player?.name ?? "")
    .filter(Boolean)
    .slice(0, 11);

  const homeInjuries = (injuries ?? [])
    .filter((inj) => inj.player?.display_name || inj.player?.name)
    .slice(0, 5)
    .map((inj) => ({
      player: inj.player?.display_name ?? inj.player?.name ?? "Jugador",
      position: "N/D",
      status: inj.type?.name ?? "Lesionado",
      impact: 5,
    }));

  return {
    home: {
      injuries: homeInjuries,
      suspensions: [],
      lastLineup: homeLineup,
      tacticalChangeRisk: homeLineup.length < 11 ? 30 : 10,
    },
    away: {
      injuries: [],
      suspensions: [],
      lastLineup: awayLineup,
      tacticalChangeRisk: awayLineup.length < 11 ? 30 : 10,
    },
  };
}

function buildRefereeProfile(referees: SportmonksReferee[] | undefined): RefereeProfile | undefined {
  if (!referees || referees.length === 0) return undefined;
  const ref = referees[0];
  return {
    name: ref.display_name ?? ref.name ?? "Árbitro",
    avgCards: 3.5,
    avgPenalties: 0.2,
    strictness: "medium",
    homeBias: 0,
    controversyHistory: [],
    lastMatches: 30,
  };
}

function buildH2H(h2hFixtures: SportmonksH2H[] | undefined): H2HRecord[] | undefined {
  if (!h2hFixtures || h2hFixtures.length === 0) return undefined;

  return h2hFixtures.slice(0, 5).map((f) => {
    const home = f.participants?.find((p) => p.meta?.location === "home") ?? f.participants?.[0];
    const away = f.participants?.find((p) => p.meta?.location === "away") ?? f.participants?.[1];
    const current = f.scores?.filter((s) => s.description === "CURRENT") ?? [];
    const homeGoals = safeNum(current.find((s) => s.score?.participant === "home")?.score?.goals, 0);
    const awayGoals = safeNum(current.find((s) => s.score?.participant === "away")?.score?.goals, 0);
    const ht = f.scores?.filter((s) => s.description === "1ST_HALF") ?? [];
    const htHome = safeNum(ht.find((s) => s.score?.participant === "home")?.score?.goals, 0);
    const htAway = safeNum(ht.find((s) => s.score?.participant === "away")?.score?.goals, 0);

    return {
      date: f.starting_at?.slice(0, 10) ?? "",
      home: home?.name ?? "Local",
      away: away?.name ?? "Visitante",
      homeGoals,
      awayGoals,
      competition: f.league?.name ?? "Liga",
      venue: "",
      firstHalfHome: htHome,
      firstHalfAway: htAway,
      homeXg: 0,
      awayXg: 0,
      cards: 0,
      corners: 0,
      dominantTeam: homeGoals > awayGoals ? (home?.name ?? "Local") : awayGoals > homeGoals ? (away?.name ?? "Visitante") : "Empate",
    };
  });
}

function determineCoverageTier(leagueName: string | undefined): FixtureCoverage["tier"] {
  const name = (leagueName ?? "").toLowerCase();
  const elite = ["premier league", "la liga", "laliga", "bundesliga", "serie a", "ligue 1", "champions league", "europa league"];
  const standard = ["championship", "segunda", "serie b", "2. bundesliga", "eredivisie", "primeira liga", "mls", "liga mx", "brasileirao", "primera"];
  if (elite.some((e) => name.includes(e))) return "elite";
  if (standard.some((s) => name.includes(s))) return "standard";
  return "low";
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SportmonksProvider {
  private readonly token: string;
  private readonly fallback = new DemoProvider();
  private readonly allowDemoFallback: boolean;

  constructor(token = process.env.SPORTMONKS_API_TOKEN ?? "") {
    this.token = token;
    this.allowDemoFallback =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEMO_FALLBACK === "true";
  }

  private async fallbackOrThrow<T>(op: () => Promise<T>, err: unknown): Promise<T> {
    if (this.allowDemoFallback) {
      return op();
    }
    throw err;
  }

  private async request<T>(path: string, baseUrl = SPORTMONKS_BASE_URL): Promise<T> {
    if (!this.token) {
      throw new Error("SPORTMONKS_API_TOKEN is not configured");
    }
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      throw new Error(`Sportmonks request failed: ${response.status}`);
    }
    const payload = (await response.json()) as SportmonksResponse<T>;
    return payload.data;
  }

  async getCountries(): Promise<Country[]> {
    try {
      const [countries, continents] = await Promise.all([
        this.fetchAllCountries(),
        this.fetchAllContinents(),
      ]);
      const continentNameById = new Map<number, string>(
        continents.map((item) => [item.id, item.name])
      );
      return countries.map((country) => ({
        id: String(country.id),
        name: country.name,
        code: (country.iso3 ?? country.name.slice(0, 3)).toUpperCase(),
        region: continentNameById.get(country.continent_id ?? -1) ?? "Global",
      }));
    } catch (err) {
      return this.fallbackOrThrow(() => this.fallback.getCountries(), err);
    }
  }

  async getLeagues(countryId?: string): Promise<League[]> {
    try {
      const data = await this.fetchAllLeagues();
      return data
        .filter((league) => !countryId || String(league.country_id) === countryId)
        .map((league) => {
          const tier = determineCoverageTier(league.name);
          return {
            id: String(league.id),
            countryId: String(league.country_id ?? countryId ?? "global"),
            name: league.name,
            tier,
            season: new Date().getFullYear().toString(),
            coverageScore: tier === "elite" ? 90 : tier === "standard" ? 74 : 55,
          };
        });
    } catch (err) {
      return this.fallbackOrThrow(() => this.fallback.getLeagues(countryId), err);
    }
  }

  private async fetchAllLeagues(): Promise<SportmonksEntity[]> {
    if (!this.token) {
      throw new Error("SPORTMONKS_API_TOKEN is not configured");
    }

    const all: SportmonksEntity[] = [];
    let page = 1;
    let lastPage = 1;

    // Pull paginated leagues to avoid truncating selectors.
    while (page <= lastPage && page <= 200) {
      const response = await fetch(`${SPORTMONKS_BASE_URL}/leagues?page=${page}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
        next: { revalidate: 300 },
      });
      if (!response.ok) {
        throw new Error(`Sportmonks request failed: ${response.status}`);
      }
      const payload = (await response.json()) as SportmonksResponse<SportmonksEntity[]>;
      all.push(...(payload.data ?? []));
      lastPage = Math.max(1, payload.meta?.last_page ?? 1);
      page += 1;
    }

    // Deduplicate by id in case the provider repeats items across pages.
    const seen = new Set<number>();
    return all.filter((league) => {
      if (seen.has(league.id)) return false;
      seen.add(league.id);
      return true;
    });
  }

  private async fetchAllCountries(): Promise<SportmonksEntity[]> {
    if (!this.token) {
      throw new Error("SPORTMONKS_API_TOKEN is not configured");
    }

    const all: SportmonksEntity[] = [];
    let page = 1;
    let lastPage = 1;

    while (page <= lastPage && page <= 200) {
      const response = await fetch(
        `${SPORTMONKS_CORE_BASE_URL}/countries?page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          next: { revalidate: 21600 },
        }
      );
      if (!response.ok) {
        throw new Error(`Sportmonks request failed: ${response.status}`);
      }
      const payload = (await response.json()) as SportmonksResponse<SportmonksEntity[]>;
      all.push(...(payload.data ?? []));
      lastPage = Math.max(1, payload.meta?.last_page ?? 1);
      page += 1;
    }

    const seen = new Set<number>();
    return all.filter((country) => {
      if (seen.has(country.id)) return false;
      seen.add(country.id);
      return true;
    });
  }

  private async fetchAllContinents(): Promise<SportmonksContinent[]> {
    if (!this.token) {
      throw new Error("SPORTMONKS_API_TOKEN is not configured");
    }

    const all: SportmonksContinent[] = [];
    let page = 1;
    let lastPage = 1;

    while (page <= lastPage && page <= 10) {
      const response = await fetch(
        `${SPORTMONKS_CORE_BASE_URL}/continents?page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          next: { revalidate: 21600 },
        }
      );
      if (!response.ok) {
        throw new Error(`Sportmonks request failed: ${response.status}`);
      }
      const payload = (await response.json()) as SportmonksResponse<SportmonksContinent[]>;
      all.push(...(payload.data ?? []));
      lastPage = Math.max(1, payload.meta?.last_page ?? 1);
      page += 1;
    }

    const seen = new Set<number>();
    return all.filter((continent) => {
      if (seen.has(continent.id)) return false;
      seen.add(continent.id);
      return true;
    });
  }

  async getFixtures(filters: { leagueId?: string; date?: string } = {}): Promise<Fixture[]> {
    if (!filters.date) {
      return this.fallbackOrThrow(() => this.fallback.getFixtures(filters), new Error("Sportmonks fixtures require a date filter"));
    }
    try {
      const includes = "participants;league;state;scores;events;statistics;odds;referees;lineups;standings";
      const data = await this.request<SportmonksFixture[]>(
        `/fixtures/date/${filters.date}?include=${includes}`,
      );
      const filtered = data.filter((fixture) => !filters.leagueId || String(fixture.league_id) === filters.leagueId);
      const maxFixturesPerDay = Math.max(50, Number(process.env.SPORTMONKS_MAX_FIXTURES_PER_DAY ?? "500"));
      return filtered.slice(0, maxFixturesPerDay).map((fixture) => this.mapFixture(fixture));
    } catch (err) {
      return this.fallbackOrThrow(() => this.fallback.getFixtures(filters), err);
    }
  }

  async getMatch(fixtureId: string): Promise<Fixture> {
    if (!/^\d+$/.test(fixtureId)) {
      return this.fallbackOrThrow(() => this.fallback.getMatch(fixtureId), new Error("Sportmonks fixture ids must be numeric"));
    }
    try {
      const includes = "participants;league;state;scores;events;statistics;odds;referees;lineups;standings;h2h";
      const fixture = await this.request<SportmonksFixture>(
        `/fixtures/${fixtureId}?include=${includes}`
      );
      return this.mapFixture(fixture);
    } catch (err) {
      return this.fallbackOrThrow(() => this.fallback.getMatch(fixtureId), err);
    }
  }

  async getMatchDetail(fixtureId: string): Promise<{
    lineups: import("@/shared/domain").MatchLineup[];
    events: import("@/shared/domain").MatchEvent[];
    statistics: import("@/shared/domain").MatchStatistic[];
  }> {
    // Sportmonks provider: not implemented yet
    return { lineups: [], events: [], statistics: [] };
  }

  private mapFixture(fixture: SportmonksFixture): Fixture {
    const home = fixture.participants?.find((t) => t.meta?.location === "home") ?? fixture.participants?.[0];
    const away = fixture.participants?.find((t) => t.meta?.location === "away") ?? fixture.participants?.[1];

    const stats = (fixture.statistics ?? []) as SportmonksStatTeam[];

    // Standings per team
    const homeStanding = fixture.standings?.find((s) => String(s.participant_id) === String(home?.id));
    const awayStanding = fixture.standings?.find((s) => String(s.participant_id) === String(away?.id));

    // Form from standings
    const homeFormStr = homeStanding?.form;
    const awayFormStr = awayStanding?.form;

    const homeSnapshot = buildTeamSnapshot(home, "home", stats, homeStanding as never, homeFormStr);
    const awaySnapshot = buildTeamSnapshot(away, "away", stats, awayStanding as never, awayFormStr);

    // Odds
    const extractedOdds = extractOdds(fixture.odds);
    const market: FixtureMarket = {
      homeWinOdds: extractedOdds.homeWinOdds ?? 2.35,
      drawOdds: extractedOdds.drawOdds ?? 3.25,
      awayWinOdds: extractedOdds.awayWinOdds ?? 2.85,
      over15Odds: extractedOdds.over15Odds ?? 1.15,
      over25Odds: extractedOdds.over25Odds ?? 1.92,
      under35Odds: extractedOdds.under35Odds ?? 1.42,
      bttsYesOdds: extractedOdds.bttsYesOdds ?? 1.78,
      bttsNoOdds: extractedOdds.bttsNoOdds ?? 1.98,
      ahHomeMinus1: extractedOdds.ahHomeMinus1 ?? 2.60,
      ahAwayPlus1: extractedOdds.ahAwayPlus1 ?? 1.45,
      exactScore: [],
      firstGoalScorer: [],
    };

    // Coverage
    const tier = determineCoverageTier(fixture.league?.name);
    const hasLineups = Boolean(fixture.lineups && fixture.lineups.length > 0);
    const hasOdds = Boolean(fixture.has_odds || (fixture.odds && fixture.odds.length > 0));
    const hasXg = stats.some((s) => {
      const n = (s.type?.developer_name ?? s.type?.name ?? "").toLowerCase();
      return n.includes("xg") || n.includes("expected_goal");
    });
    const hasReferee = Boolean(fixture.referees && fixture.referees.length > 0);
    const hasH2H = Boolean(fixture.h2h && fixture.h2h.length > 0);

    const coverage: FixtureCoverage = {
      tier,
      hasLineups,
      hasOdds,
      hasXg,
      hasInjuries: Boolean(fixture.injuries && fixture.injuries.length > 0),
      hasReferee,
      hasH2H,
      hasMomentum: Boolean(homeStanding?.form || awayStanding?.form),
    };

    // Squad / lineups
    const squad = buildSquadFromLineups(fixture.lineups, home?.id, away?.id, fixture.injuries);

    // Referee
    const referee = buildRefereeProfile(fixture.referees);

    // H2H
    const h2h = buildH2H(fixture.h2h);

    // Context
    const homePos = homeSnapshot.tablePosition;
    const awayPos = awaySnapshot.tablePosition;
    const posGap = Math.abs(homePos - awayPos);

    return {
      id: String(fixture.id),
      countryId: String(home?.country_id ?? fixture.league?.country_id ?? "global"),
      leagueId: String(fixture.league_id),
      leagueName: fixture.league?.name ?? "Liga",
      kickoff: `${fixture.starting_at.replace(" ", "T")}Z`,
      status: mapFixtureStatus(fixture.state?.developer_name),
      result: mapMatchResult(fixture.state?.developer_name, fixture.scores, {
        events: fixture.events ?? null,
        statistics: fixture.statistics ?? null,
        participants:
          home?.id !== undefined && away?.id !== undefined
            ? { homeId: home.id, awayId: away.id }
            : null,
      }) ?? undefined,
      home: homeSnapshot,
      away: awaySnapshot,
      coverage,
      market,
      context: {
        derby: false,
        mustWinHome: homePos <= 4,
        mustWinAway: awayPos <= 4,
        lowDivision: tier === "low",
        weatherRisk: "low",
        playoff: false,
        relegationRisk: homePos >= 17 ? 40 : homePos >= 15 ? 20 : 0,
        rivalRivalry: false,
        copaVsLeague: false,
        prizeMoney: 0,
        psychologicalPressure: posGap > 8 ? 55 : posGap > 4 ? 35 : 25,
        underdogFreedom: homePos > awayPos ? Math.min(80, posGap * 5) : 30,
        favoriteParalysis: homePos < awayPos ? Math.min(40, posGap * 3) : 15,
      },
      squad: squad ?? undefined,
      referee,
      h2h,
    };
  }
}
