import type { Country, Fixture, FixtureCoverage, FixtureMarket, League, TeamSnapshot } from "@/shared/domain";

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const PREFETCH_FIXTURE_ODDS = process.env.API_FOOTBALL_PREFETCH_FIXTURE_ODDS === "true";

type ApiFootballCountry = {
  name: string;
  code: string | null;
  flag: string | null;
};

type ApiFootballLeagueItem = {
  league: {
    id: number;
    name: string;
    type?: string;
  };
  country: {
    name: string;
    code: string | null;
  };
};

type ApiFootballFixtureItem = {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      elapsed?: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo?: string;
    flag?: string;
    round?: string;
  };
  teams: {
    home: { id: number; name: string; logo?: string; winner?: boolean | null };
    away: { id: number; name: string; logo?: string; winner?: boolean | null };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score?: {
    halftime?: { home: number | null; away: number | null };
  };
};

type ApiFootballResponse<T> = {
  response: T;
};

type ApiFootballFixtureItemFull = ApiFootballFixtureItem & {
  events?: Array<{
    time?: { elapsed?: number; extra?: number | null };
    team?: { name?: string; logo?: string };
    player?: { name?: string; id?: number };
    assist?: { name?: string | null };
    type?: string;
    detail?: string;
  }>;
  statistics?: Array<{
    team?: { name?: string };
    statistics?: Array<{ type?: string; value?: string | number | null }>;
  }>;
  lineups?: Array<{
    team?: { id?: number; name?: string; logo?: string };
    formation?: string;
    coach?: { name?: string; photo?: string };
    startXI?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string } }>;
    substitutes?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string } }>;
  }>;
  players?: Array<{
    team?: { id?: number; name?: string };
    players?: Array<{
      player?: { id?: number; name?: string; photo?: string };
      statistics?: Array<{
        games?: { rating?: string; captain?: boolean; substitute?: boolean; minutes?: number; number?: number; position?: string };
      }>;
    }>;
  }>;
};

export type ApiLiveEvent = {
  time: number;
  team: string;
  teamLogo: string;
  player: string;
  type: string;
  detail: string;
};

export type ApiLiveStatistic = {
  type: string;
  home: string;
  away: string;
};

type ApiOddsDateItem = {
  fixture?: { id: number };
  bookmakers?: Array<{
    name?: string;
    bets?: Array<{
      name?: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
};

type ApiTeamStats = {
  team: { id: number; name: string; logo?: string };
  form: string;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: { total: { home: number; away: number; total: number }; average: { total: string } };
    against: { total: { home: number; away: number; total: number }; average: { total: string } };
  };
  lineups?: Array<{ formation: string; played: number }>;
};

type ApiOddsResponse = {
  bookmakers?: Array<{
    name: string;
    bets?: Array<{
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
};

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function countryIdFromNameCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(statusShort: string): "pre-match" | "live" | "final" {
  const s = statusShort.toUpperCase();
  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(s)) return "live";
  if (["FT", "AET", "PEN"].includes(s)) return "final";
  return "pre-match";
}

function determineTier(leagueName: string): FixtureCoverage["tier"] {
  const name = leagueName.toLowerCase();
  const elite = [
    "premier league", "la liga", "bundesliga", "serie a", "ligue 1",
    "champions league", "europa league", "conference league",
    "copa libertadores", "copa sudamericana", "world cup",
    "euro ", "copa america", "nations league",
  ];
  const standard = [
    "eredivisie", "primeira liga", "championship", "liga mx", "mls",
    "brasileirao", "serie b", "segunda", "2. bundesliga", "ligue 2",
    "super lig", "süper lig", "liga betplay", "liga profesional",
    "allsvenskan", "eliteserien", "toppserien", "superliga",
    "jupiler", "pro league", "scottish", "premiership",
    "j1 league", "j-league", "k league", "a-league",
    "saudi pro", "russian premier", "liga portugal",
    "copa del rey", "fa cup", "dfb-pokal", "coppa italia",
    "coupe de france", "carabao", "league cup",
    "liga 1", "primera division", "primera b", "ascenso",
    "division 1", "division profesional", "torneo",
    "clausura", "apertura", "serie c", "league one", "league two",
    "national league", "ekstraklasa", "czech", "swiss super",
    "austrian", "danish", "norwegian", "swedish", "finnish",
    "greek super", "cypriot", "israeli", "chinese super",
    "indian super", "thai league", "vietnamese",
    "copa do brasil", "copa argentina", "copa colombia",
    "copa mx", "us open cup", "concacaf", "conmebol",
    "afc", "caf", "african", "world",
  ];
  if (elite.some((item) => name.includes(item))) return "elite";
  if (standard.some((item) => name.includes(item))) return "standard";
  return "low";
}

function isCalendarYearCountry(countryName?: string): boolean {
  const country = (countryName ?? "").toLowerCase().replace(/-/g, " ");
  return [
    "argentina",
    "brazil",
    "brasil",
    "colombia",
    "chile",
    "ecuador",
    "paraguay",
    "uruguay",
    "peru",
    "venezuela",
    "united states",
    "usa",
    "canada",
    "japan",
    "korea",
    "china",
    "sweden",
    "norway",
    "finland",
    "iceland",
  ].some((name) => country.includes(name));
}

function apiFootballSeasonForDate(date = new Date(), countryName?: string): number {
  const year = date.getFullYear();
  if (isCalendarYearCountry(countryName)) return year;
  return date.getMonth() < 6 ? year - 1 : year;
}

function buildTeam(id: number, name: string, logo?: string): TeamSnapshot {
  return {
    id: String(id),
    name,
    logo: logo || undefined,
    form: ["D", "D", "D", "D", "D"],
    goalsFor: 0,
    goalsAgainst: 0,
    xgFor: 1.1,
    xgAgainst: 1.1,
    tablePosition: 10,
    restDays: 4,
    travelKm: 0,
    motivation: 60,
    keyPlayer: "N/D",
    keyPlayerStatus: "available",
    squadRotationRisk: 20,
    pointsTotal: 0,
    matchesPlayed: 0,
  };
}

function extractOddsFromBookmaker(
  bookmaker: NonNullable<ApiOddsResponse["bookmakers"]>[number],
  fallback: FixtureMarket
): FixtureMarket {
  const result = { ...fallback };
  const bets = bookmaker.bets ?? [];

  for (const bet of bets) {
    const name = bet.name.toLowerCase();
    const vals = bet.values;

    if (name.includes("match winner") || name === "1x2") {
      for (const v of vals) {
        const odd = parseFloat(v.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        if (v.value === "Home") result.homeWinOdds = odd;
        else if (v.value === "Draw") result.drawOdds = odd;
        else if (v.value === "Away") result.awayWinOdds = odd;
      }
    }

    if (name.includes("goals over/under") || name.includes("over/under")) {
      for (const v of vals) {
        const odd = parseFloat(v.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        if (v.value === "Over 1.5") result.over15Odds = odd;
        else if (v.value === "Over 2.5") result.over25Odds = odd;
        else if (v.value === "Over 3.5") result.over35Odds = odd;
        else if (v.value === "Under 1.5") result.under15Odds = odd;
        else if (v.value === "Under 2.5") result.under25Odds = odd;
        else if (v.value === "Under 3.5") result.under35Odds = odd;
      }
    }

    if (name.includes("both teams score") || name.includes("btts")) {
      for (const v of vals) {
        const odd = parseFloat(v.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        if (v.value === "Yes") result.bttsYesOdds = odd;
        else if (v.value === "No") result.bttsNoOdds = odd;
      }
    }

    if (name.includes("double chance")) {
      for (const v of vals) {
        const odd = parseFloat(v.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        if (v.value === "Home/Draw" || v.value === "1X") result.dc1xOdds = odd;
        else if (v.value === "Draw/Away" || v.value === "X2") result.dcx2Odds = odd;
        else if (v.value === "Home/Away" || v.value === "12") result.dc12Odds = odd;
      }
    }

    if (name.includes("asian handicap")) {
      for (const v of vals) {
        const odd = parseFloat(v.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        if (v.value.includes("Home") && v.value.includes("-")) result.ahHomeMinus1 = odd;
        else if (v.value.includes("Away") && v.value.includes("+")) result.ahAwayPlus1 = odd;
      }
    }
  }

  return result;
}

function enrichTeamWithStats(team: TeamSnapshot, stats: ApiTeamStats, side: "home" | "away"): TeamSnapshot {
  const played = stats.fixtures?.played?.total ?? 0;
  const goalsFor = side === "home"
    ? (stats.goals?.for?.total?.home ?? stats.goals?.for?.total?.total ?? 0)
    : (stats.goals?.for?.total?.away ?? stats.goals?.for?.total?.total ?? 0);
  const goalsAgainst = side === "home"
    ? (stats.goals?.against?.total?.home ?? stats.goals?.against?.total?.total ?? 0)
    : (stats.goals?.against?.total?.away ?? stats.goals?.against?.total?.total ?? 0);

  // Parse form string "WDLWW..." into array of last 5
  const formStr = stats.form ?? "";
  const form = formStr
    .slice(-5)
    .split("")
    .map((c) => (c === "W" || c === "D" || c === "L" ? c : "D"));
  while (form.length < 5) form.unshift("D");

  // Calculate position estimate from wins/draws/losses
  const wins = stats.fixtures?.wins?.total ?? 0;
  const draws = stats.fixtures?.draws?.total ?? 0;
  const points = wins * 3 + draws;

  // Motivation based on form
  const recentWins = form.filter((f) => f === "W").length;
  const motivation = Math.min(95, Math.max(45, 50 + recentWins * 9));

  // xG estimate: goals * 0.92 (rough proxy when real xG not available)
  const xgFor = Math.round(goalsFor * 0.93 * 10) / 10;
  const xgAgainst = Math.round(goalsAgainst * 0.95 * 10) / 10;

  return {
    ...team,
    form,
    goalsFor,
    goalsAgainst,
    xgFor,
    xgAgainst,
    matchesPlayed: played,
    pointsTotal: points,
    tablePosition: Math.max(1, Math.min(20, Math.round(21 - (points / Math.max(1, played)) * 7))),
    motivation,
    squadRotationRisk: played > 30 ? 30 : 15,
  };
}

export class ApiFootballProvider {
  private readonly token: string;

  constructor(token = process.env.API_FOOTBALL_KEY ?? "") {
    this.token = token;
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.token) {
      throw new Error("API_FOOTBALL_KEY is not configured");
    }
    const response = await fetch(`${API_FOOTBALL_BASE_URL}${path}`, {
      headers: {
        "x-apisports-key": this.token,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`API-Football request failed: ${response.status}`);
    }
    const payload = (await response.json()) as ApiFootballResponse<T>;
    return payload.response;
  }

  /** Request that returns a single object (like team stats) instead of array */
  private async requestSingle<T>(path: string): Promise<T | null> {
    if (!this.token) return null;
    try {
      const response = await fetch(`${API_FOOTBALL_BASE_URL}${path}`, {
        headers: {
          "x-apisports-key": this.token,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as ApiFootballResponse<T>;
      return payload.response;
    } catch {
      return null;
    }
  }

  async getCountries(): Promise<Country[]> {
    try {
      const rows = await this.request<ApiFootballCountry[]>("/countries");
      return rows
        .map((item) => ({
          id: countryIdFromNameCode(item.name),
          name: item.name,
          code: (item.code ?? item.name.slice(0, 3)).toUpperCase(),
          region: "Global",
          flag: item.flag ?? undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (err) {
      throw err;
    }
  }

  async getLeagues(countryId?: string): Promise<League[]> {
    try {
      const params = new URLSearchParams();
      if (countryId) {
        // countryId is a slug like "england" or "antigua-and-barbuda"
        // Convert to proper name: capitalize each word
        const countryName = countryId
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        params.set("country", countryName);
      }
      const season = apiFootballSeasonForDate(new Date(), countryId);
      params.set("season", String(season));
      const rows = await this.request<ApiFootballLeagueItem[]>(`/leagues?${params.toString()}`);
      return rows
        .filter((item) => item.league.type === "League" || item.league.type === "Cup")
        .map((item) => {
          const resolvedCountryId = countryIdFromNameCode(item.country.name);
          const tier = determineTier(item.league.name);
          return {
            id: String(item.league.id),
            countryId: resolvedCountryId,
            name: item.league.name,
            tier,
            season: String(season),
            coverageScore: tier === "elite" ? 90 : tier === "standard" ? 72 : 55,
          };
        })
        .sort((a, b) => b.coverageScore - a.coverageScore);
    } catch (err) {
      throw err;
    }
  }

  async getFixtures(filters: { leagueId?: string; date?: string } = {}): Promise<Fixture[]> {
    if (!filters.date) {
      throw new Error("API-Football fixtures require a date filter");
    }
    try {
      const params = new URLSearchParams();
      params.set("date", filters.date);
      if (filters.leagueId) params.set("league", filters.leagueId);
      const rows = await this.request<ApiFootballFixtureItem[]>(`/fixtures?${params.toString()}`);
      const maxFixturesPerDay = Math.max(50, Number(process.env.API_FOOTBALL_MAX_FIXTURES_PER_DAY ?? "500"));
      const fixtures = rows.slice(0, maxFixturesPerDay).map((item) => this.mapFixture(item));

      if (PREFETCH_FIXTURE_ODDS) {
        try {
          const oddsMap = await this.fetchOddsForDate(
            filters.date,
            new Set(fixtures.map((fixture) => fixture.id)),
            filters.leagueId
          );
          for (const fixture of fixtures) {
            const odds = oddsMap.get(fixture.id);
            if (odds) {
              fixture.market = { ...fixture.market, ...odds };
              fixture.coverage.hasOdds = true;
            }
          }
        } catch {
          // Non-fatal — analysis endpoints fetch exact fixture odds on demand.
        }
      }

      return fixtures;
    } catch (err) {
      throw err;
    }
  }

  private async fetchOddsForDate(
    date: string,
    targetFixtureIds: Set<string>,
    leagueId?: string
  ): Promise<Map<string, Partial<FixtureMarket>>> {
    const map = new Map<string, Partial<FixtureMarket>>();
    try {
      // Paginate through all odds pages for the date
      let page = 1;
      let totalPages = 1;
      const defaultMaxPages = leagueId ? 2 : 1;
      const maxPages = Math.max(1, Number(process.env.API_FOOTBALL_ODDS_MAX_PAGES ?? String(defaultMaxPages)));

      while (page <= totalPages && page <= maxPages) {
        const params = new URLSearchParams({ date, page: String(page) });
        if (leagueId) params.set("league", leagueId);
        const response = await fetch(`${API_FOOTBALL_BASE_URL}/odds?${params.toString()}`, {
          headers: { "x-apisports-key": this.token, Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) break;

        const payload = await response.json() as {
          response: ApiOddsDateItem[];
          paging: { current: number; total: number };
        };

        totalPages = payload.paging?.total ?? 1;

        for (const item of payload.response) {
          const fixtureId = String(item.fixture?.id);
          if (targetFixtureIds.size > 0 && !targetFixtureIds.has(fixtureId)) continue;
          const bookmaker = item.bookmakers?.[0];
          if (!bookmaker) continue;
          const odds: Partial<FixtureMarket> = {};
          for (const bet of bookmaker.bets ?? []) {
            const name = bet.name?.toLowerCase() ?? "";
            if (name.includes("match winner") || name === "1x2" || name.includes("home/away")) {
              for (const v of bet.values) {
                const odd = parseFloat(v.odd);
                if (!Number.isFinite(odd) || odd <= 1) continue;
                if (v.value === "Home") odds.homeWinOdds = odd;
                else if (v.value === "Draw") odds.drawOdds = odd;
                else if (v.value === "Away") odds.awayWinOdds = odd;
              }
            }
            if (name.includes("over/under") || name.includes("goals")) {
              for (const v of bet.values) {
                const odd = parseFloat(v.odd);
                if (!Number.isFinite(odd) || odd <= 1) continue;
                if (v.value === "Over 2.5") odds.over25Odds = odd;
                else if (v.value === "Under 2.5" || v.value === "Under 3.5") odds.under35Odds = odd;
                else if (v.value === "Over 1.5") odds.over15Odds = odd;
              }
            }
            if (name.includes("both teams") || name.includes("btts")) {
              for (const v of bet.values) {
                const odd = parseFloat(v.odd);
                if (!Number.isFinite(odd) || odd <= 1) continue;
                if (v.value === "Yes") odds.bttsYesOdds = odd;
                else if (v.value === "No") odds.bttsNoOdds = odd;
              }
            }
          }
          if (odds.homeWinOdds) map.set(fixtureId, odds);
        }

        if (targetFixtureIds.size > 0 && map.size >= targetFixtureIds.size) break;
        page++;
      }
    } catch {
      // Silent fail
    }
    return map;
  }

  async getLiveFixtures(): Promise<Fixture[]> {
    try {
      const rows = await this.request<ApiFootballFixtureItem[]>("/fixtures?live=all");
      return rows.slice(0, 100).map((item) => this.mapFixture(item));
    } catch {
      return [];
    }
  }

  async getMatchLive(fixtureId: string): Promise<{ fixture: Fixture; events: ApiLiveEvent[]; statistics: ApiLiveStatistic[] }> {
    try {
      const rows = await this.request<ApiFootballFixtureItemFull[]>(`/fixtures?id=${fixtureId}`);
      const item = rows[0];
      if (!item) throw new Error("Not found");
      const mapped = this.mapFixture(item as ApiFootballFixtureItem);

      // Extract live events
      const events: ApiLiveEvent[] = (item.events ?? []).map((e) => ({
        time: e.time?.elapsed ?? 0,
        team: e.team?.name ?? "",
        teamLogo: e.team?.logo ?? "",
        player: e.player?.name ?? "",
        type: e.type ?? "",
        detail: e.detail ?? "",
      }));

      // Extract live statistics
      const statistics: ApiLiveStatistic[] = [];
      if (item.statistics && item.statistics.length >= 2) {
        const homeStats = item.statistics[0]?.statistics ?? [];
        const awayStats = item.statistics[1]?.statistics ?? [];
        for (let i = 0; i < homeStats.length; i++) {
          statistics.push({
            type: homeStats[i]?.type ?? "",
            home: String(homeStats[i]?.value ?? "0"),
            away: String(awayStats[i]?.value ?? "0"),
          });
        }
      }

      // Update result with live score
      if (item.goals?.home !== null && item.goals?.away !== null) {
        mapped.result = {
          homeGoals: item.goals.home ?? 0,
          awayGoals: item.goals.away ?? 0,
          totalGoals: (item.goals.home ?? 0) + (item.goals.away ?? 0),
          bttsActual: (item.goals.home ?? 0) > 0 && (item.goals.away ?? 0) > 0,
        };
      }

      // Add elapsed time
      (mapped as any).elapsed = item.fixture?.status?.elapsed ?? 0;
      (mapped as any).statusShort = item.fixture?.status?.short ?? "";

      return { fixture: mapped, events, statistics };
    } catch {
      return { fixture: await this.getMatch(fixtureId), events: [], statistics: [] };
    }
  }

  async getMatch(fixtureId: string): Promise<Fixture> {
    if (!/^\d+$/.test(fixtureId)) {
      throw new Error("API-Football fixture ids must be numeric");
    }
    try {
      const rows = await this.request<ApiFootballFixtureItem[]>(`/fixtures?id=${fixtureId}`);
      const fixture = rows[0];
      if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);
      const mapped = this.mapFixture(fixture);

      // Enrich with real team statistics
      try {
        const season = apiFootballSeasonForDate(new Date(fixture.fixture.date), fixture.league.country);
        const leagueId = fixture.league.id;
        const [homeStats, awayStats] = await Promise.all([
          this.requestSingle<ApiTeamStats>(`/teams/statistics?team=${fixture.teams.home.id}&season=${season}&league=${leagueId}`),
          this.requestSingle<ApiTeamStats>(`/teams/statistics?team=${fixture.teams.away.id}&season=${season}&league=${leagueId}`),
        ]);
        if (homeStats) mapped.home = enrichTeamWithStats(mapped.home, homeStats, "home");
        if (awayStats) mapped.away = enrichTeamWithStats(mapped.away, awayStats, "away");
        mapped.coverage.hasXg = true;
        mapped.coverage.hasMomentum = true;
      } catch {
        // Non-fatal: analysis will run with basic data
      }

      // Enrich with lineups if available
      try {
        const lineupsData = await this.requestSingle<any[]>(`/fixtures/lineups?fixture=${fixtureId}`);
        if (lineupsData && lineupsData.length >= 2) {
          mapped.coverage.hasLineups = true;
        }
      } catch {
        // Non-fatal
      }

      // Enrich with real odds
      try {
        const oddsData = await this.requestSingle<ApiOddsResponse[]>(`/odds?fixture=${fixtureId}`);
        if (oddsData && oddsData.length > 0) {
          const bookmaker = oddsData[0].bookmakers?.[0];
          if (bookmaker) {
            mapped.market = extractOddsFromBookmaker(bookmaker, mapped.market);
            mapped.coverage.hasOdds = true;
          }
        }
      } catch {
        // Non-fatal
      }

      return mapped;
    } catch (err) {
      throw err;
    }
  }

  /**
   * getMatchDetail — Fetches lineups, events, and statistics for a fixture.
   * Uses the full fixture endpoint which returns all data in one call.
   */
  async getMatchDetail(fixtureId: string): Promise<{
    lineups: import("@/shared/domain").MatchLineup[];
    events: import("@/shared/domain").MatchEvent[];
    statistics: import("@/shared/domain").MatchStatistic[];
  }> {
    const rows = await this.request<ApiFootballFixtureItemFull[]>(`/fixtures?id=${fixtureId}`);
    const item = rows[0];
    if (!item) return { lineups: [], events: [], statistics: [] };

    // Parse lineups
    const lineups: import("@/shared/domain").MatchLineup[] = (item.lineups ?? []).map((l) => ({
      teamId: String(l.team?.id ?? ""),
      teamName: l.team?.name ?? "",
      teamLogo: l.team?.logo,
      formation: l.formation ?? "",
      coach: l.coach ? { name: l.coach.name ?? "", photo: l.coach.photo } : undefined,
      startXI: (l.startXI ?? []).map((p) => ({
        id: p.player?.id ?? 0,
        name: p.player?.name ?? "",
        number: p.player?.number ?? 0,
        position: p.player?.pos ?? "",
      })),
      substitutes: (l.substitutes ?? []).map((p) => ({
        id: p.player?.id ?? 0,
        name: p.player?.name ?? "",
        number: p.player?.number ?? 0,
        position: p.player?.pos ?? "",
        substitute: true,
      })),
    }));

    // Enrich with player ratings if available
    if (item.players && item.players.length >= 2) {
      for (const teamPlayers of item.players) {
        const lineup = lineups.find((l) => l.teamId === String(teamPlayers.team?.id));
        if (!lineup) continue;
        for (const p of teamPlayers.players ?? []) {
          const stats = p.statistics?.[0]?.games;
          const allPlayers = [...lineup.startXI, ...lineup.substitutes];
          const match = allPlayers.find((lp) => lp.id === p.player?.id);
          if (match && stats) {
            match.rating = stats.rating ?? undefined;
            match.captain = stats.captain ?? false;
            match.photo = p.player?.photo;
          }
        }
      }
    }

    // Parse events
    const events: import("@/shared/domain").MatchEvent[] = (item.events ?? []).map((e) => ({
      time: e.time?.elapsed ?? 0,
      extraTime: e.time?.extra ?? undefined,
      team: e.team?.name ?? "",
      teamLogo: e.team?.logo,
      player: e.player?.name ?? "",
      assist: e.assist?.name ?? undefined,
      type: e.type ?? "",
      detail: e.detail ?? "",
    }));

    // Parse statistics
    const statistics: import("@/shared/domain").MatchStatistic[] = [];
    if (item.statistics && item.statistics.length >= 2) {
      const homeStats = item.statistics[0]?.statistics ?? [];
      const awayStats = item.statistics[1]?.statistics ?? [];
      for (let i = 0; i < homeStats.length; i++) {
        statistics.push({
          type: homeStats[i]?.type ?? "",
          home: String(homeStats[i]?.value ?? "0"),
          away: String(awayStats[i]?.value ?? "0"),
        });
      }
    }

    return { lineups, events, statistics };
  }

  private mapFixture(item: ApiFootballFixtureItem): Fixture {
    const status = normalizeStatus(item.fixture.status.short);
    const homeGoals = safeNum(item.goals.home, 0);
    const awayGoals = safeNum(item.goals.away, 0);
    const result =
      status === "final" || status === "live"
        ? {
            homeGoals,
            awayGoals,
            bttsActual: homeGoals > 0 && awayGoals > 0,
            totalGoals: homeGoals + awayGoals,
            firstHalfHome: safeNum(item.score?.halftime?.home, 0),
            firstHalfAway: safeNum(item.score?.halftime?.away, 0),
          }
        : undefined;

    const tier = determineTier(item.league.name);
    const market: FixtureMarket = {
      homeWinOdds: 0,
      drawOdds: 0,
      awayWinOdds: 0,
      over15Odds: 0,
      over25Odds: 0,
      over35Odds: 0,
      under15Odds: 0,
      under25Odds: 0,
      under35Odds: 0,
      bttsYesOdds: 0,
      bttsNoOdds: 0,
      dc1xOdds: 0,
      dcx2Odds: 0,
      dc12Odds: 0,
      ahHomeMinus1: 0,
      ahAwayPlus1: 0,
      exactScore: [],
      firstGoalScorer: [],
    };

    return {
      id: String(item.fixture.id),
      countryId: countryIdFromNameCode(item.league.country),
      leagueId: String(item.league.id),
      leagueName: item.league.name,
      leagueFlag: item.league.flag ?? undefined,
      leagueLogo: item.league.logo ?? undefined,
      round: item.league.round ?? undefined,
      kickoff: item.fixture.date,
      elapsed: item.fixture.status.elapsed ?? null,
      status,
      result,
      home: buildTeam(item.teams.home.id, item.teams.home.name, item.teams.home.logo),
      away: buildTeam(item.teams.away.id, item.teams.away.name, item.teams.away.logo),
      coverage: {
        tier,
        hasLineups: false,
        hasOdds: false,
        hasXg: false,
        hasInjuries: false,
        hasReferee: false,
        hasH2H: false,
        hasMomentum: false,
      },
      market,
      context: {
        derby: false,
        mustWinHome: false,
        mustWinAway: false,
        lowDivision: tier === "low",
        weatherRisk: "low",
        playoff: false,
        relegationRisk: 0,
        rivalRivalry: false,
        copaVsLeague: false,
        prizeMoney: 0,
        psychologicalPressure: 30,
        underdogFreedom: 40,
        favoriteParalysis: 20,
      },
    };
  }
}
