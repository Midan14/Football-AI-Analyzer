import type { Country, Fixture, FixtureCoverage, League } from "@/shared/domain";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";

const COUNTRIES: Country[] = [
  { id: "england", name: "Inglaterra", code: "ENG", region: "Europa" },
  { id: "spain", name: "España", code: "ESP", region: "Europa" },
  { id: "argentina", name: "Argentina", code: "ARG", region: "Sudamérica" },
  { id: "japan", name: "Japón", code: "JPN", region: "Asia" },
  { id: "mexico", name: "México", code: "MEX", region: "Norteamérica" },
  { id: "germany", name: "Alemania", code: "GER", region: "Europa" },
  { id: "italy", name: "Italia", code: "ITA", region: "Europa" },
  { id: "france", name: "Francia", code: "FRA", region: "Europa" },
  { id: "brazil", name: "Brasil", code: "BRA", region: "Sudamérica" },
  { id: "colombia", name: "Colombia", code: "COL", region: "Sudamérica" },
  { id: "usa", name: "Estados Unidos", code: "USA", region: "Norteamérica" },
  { id: "netherlands", name: "Países Bajos", code: "NED", region: "Europa" },
  { id: "portugal", name: "Portugal", code: "POR", region: "Europa" },
];

// Temporada dinámica basada en el año actual
const CURRENT_YEAR = new Date().getFullYear();
const SEASON_EU = `${CURRENT_YEAR}/${String(CURRENT_YEAR + 1).slice(2)}`; // "2026/27"
const SEASON_SA = `${CURRENT_YEAR}`; // "2026"
const SEASON_MX_CL = `Clausura ${CURRENT_YEAR}`; // "Clausura 2026"
const SEASON_MX_AP = `Apertura ${CURRENT_YEAR}`; // "Apertura 2026"

const LEAGUE_MAP: Record<string, League[]> = {
  england: [
    { id: "premier-league", countryId: "england", name: "Premier League", tier: "elite", season: SEASON_EU, coverageScore: 96 },
    { id: "championship", countryId: "england", name: "Championship", tier: "standard", season: SEASON_EU, coverageScore: 84 },
    { id: "efl-league-one", countryId: "england", name: "League One", tier: "standard", season: SEASON_EU, coverageScore: 72 },
    { id: "fa-cup", countryId: "england", name: "FA Cup", tier: "elite", season: SEASON_EU, coverageScore: 88 },
  ],
  spain: [
    { id: "laliga", countryId: "spain", name: "LaLiga", tier: "elite", season: SEASON_EU, coverageScore: 94 },
    { id: "laliga2", countryId: "spain", name: "LaLiga 2", tier: "standard", season: SEASON_EU, coverageScore: 78 },
    { id: "copa-del-rey", countryId: "spain", name: "Copa del Rey", tier: "elite", season: SEASON_EU, coverageScore: 82 },
  ],
  argentina: [
    { id: "primera-arg", countryId: "argentina", name: "Primera División", tier: "standard", season: SEASON_SA, coverageScore: 81 },
    { id: "copa-arg", countryId: "argentina", name: "Copa Argentina", tier: "standard", season: SEASON_SA, coverageScore: 68 },
  ],
  mexico: [
    { id: "liga-mx", countryId: "mexico", name: "Liga MX", tier: "standard", season: SEASON_MX_CL, coverageScore: 84 },
    { id: "liga-mx-femenil", countryId: "mexico", name: "Liga MX Femenil", tier: "standard", season: SEASON_MX_CL, coverageScore: 82 },
  ],
  germany: [
    { id: "bundesliga", countryId: "germany", name: "Bundesliga", tier: "elite", season: SEASON_EU, coverageScore: 92 },
    { id: "bundesliga2", countryId: "germany", name: "2. Bundesliga", tier: "standard", season: SEASON_EU, coverageScore: 76 },
  ],
  italy: [
    { id: "serie-a", countryId: "italy", name: "Serie A", tier: "elite", season: SEASON_EU, coverageScore: 93 },
    { id: "serie-b", countryId: "italy", name: "Serie B", tier: "standard", season: SEASON_EU, coverageScore: 74 },
  ],
  france: [
    { id: "ligue-1", countryId: "france", name: "Ligue 1", tier: "elite", season: SEASON_EU, coverageScore: 86 },
  ],
  brazil: [
    { id: "brasileirao", countryId: "brazil", name: "Brasileirão", tier: "standard", season: SEASON_SA, coverageScore: 83 },
  ],
  colombia: [
    { id: "primera-col", countryId: "colombia", name: "Primera A", tier: "standard", season: SEASON_MX_AP, coverageScore: 72 },
  ],
  japan: [
    { id: "j1-league", countryId: "japan", name: "J1 League", tier: "standard", season: SEASON_SA, coverageScore: 78 },
  ],
  usa: [
    { id: "mls", countryId: "usa", name: "MLS", tier: "standard", season: SEASON_SA, coverageScore: 80 },
  ],
  netherlands: [
    { id: "eredivisie", countryId: "netherlands", name: "Eredivisie", tier: "standard", season: SEASON_EU, coverageScore: 79 },
  ],
  portugal: [
    { id: "primeira-liga", countryId: "portugal", name: "Primeira Liga", tier: "standard", season: SEASON_EU, coverageScore: 77 },
  ],
};

function generateLeagueFixtures(league: League, today: string): Fixture[] {
  const teams: Array<{ id: string; name: string }> = [];

  switch (league.id) {
    case "premier-league":
      teams.push(
        { id: "arsenal", name: "Arsenal" }, { id: "chelsea", name: "Chelsea" },
        { id: "liverpool", name: "Liverpool" }, { id: "man-city", name: "Manchester City" },
        { id: "man-utd", name: "Manchester United" }, { id: "newcastle", name: "Newcastle" },
        { id: "tottenham", name: "Tottenham" }, { id: "aston-villa", name: "Aston Villa" },
        { id: "brighton", name: "Brighton" }, { id: "west-ham", name: "West Ham" },
      );
      break;
    case "laliga":
      teams.push(
        { id: "barcelona", name: "Barcelona" }, { id: "real-madrid", name: "Real Madrid" },
        { id: "atletico", name: "Atlético Madrid" }, { id: "sevilla", name: "Sevilla" },
        { id: "villareal", name: "Villareal" }, { id: "real-sociedad", name: "Real Sociedad" },
        { id: "athletic", name: "Athletic Club" }, { id: "valencia", name: "Valencia" },
      );
      break;
    case "bundesliga":
      teams.push(
        { id: "bayern", name: "Bayern Múnich" }, { id: "dortmund", name: "Borussia Dortmund" },
        { id: "leipzig", name: "RB Leipzig" }, { id: "leverkusen", name: "Bayer Leverkusen" },
        { id: "frankfurt", name: "Eintracht Frankfurt" }, { id: "wolfsburg", name: "Wolfsburg" },
      );
      break;
    case "serie-a":
      teams.push(
        { id: "inter", name: "Inter" }, { id: "milan", name: "AC Milan" },
        { id: "juventus", name: "Juventus" }, { id: "napoli", name: "Napoli" },
        { id: "roma", name: "Roma" }, { id: "lazio", name: "Lazio" },
      );
      break;
    case "liga-mx":
      teams.push(
        { id: "america", name: "América" }, { id: "chivas", name: "Chivas" },
        { id: "cruz-azul", name: "Cruz Azul" }, { id: "monterrey", name: "Monterrey" },
        { id: "tigres", name: "Tigres" }, { id: "pumas", name: "Pumas" },
        { id: "toluca", name: "Toluca" }, { id: "pachuca", name: "Pachuca" },
      );
      break;
    case "liga-mx-femenil":
      teams.push(
        { id: "juarez-f", name: "FC Juarez Femenil" }, { id: "monterrey-f", name: "Rayadas de Monterrey F" },
        { id: "america-f", name: "América Femenil" }, { id: "chivas-f", name: "Chivas Femenil" },
        { id: "tigres-f", name: "Tigres Femenil" }, { id: "pachuca-f", name: "Pachuca Femenil" },
      );
      break;
    case "primera-arg":
      teams.push(
        { id: "river", name: "River Plate" }, { id: "boca", name: "Boca Juniors" },
        { id: "racing", name: "Racing" }, { id: "independiente", name: "Independiente" },
        { id: "sanlorenzo", name: "San Lorenzo" }, { id: "lanus", name: "Lanús" },
      );
      break;
    case "brasileirao":
      teams.push(
        { id: "flamengo", name: "Flamengo" }, { id: "palmeiras", name: "Palmeiras" },
        { id: "sao-paulo", name: "São Paulo" }, { id: "corinthians", name: "Corinthians" },
        { id: "santos", name: "Santos" }, { id: "fluminense", name: "Fluminense" },
      );
      break;
    case "primera-col":
      teams.push(
        { id: "nacional", name: "Atlético Nacional" }, { id: "millonarios", name: "Millonarios" },
        { id: "america-cali", name: "América de Cali" }, { id: "medellin", name: "Independiente Medellín" },
        { id: "junior", name: "Junior" }, { id: "santa-fe", name: "Santa Fe" },
      );
      break;
    default:
      teams.push(
        { id: "team-a", name: "Equipo A" }, { id: "team-b", name: "Equipo B" },
        { id: "team-c", name: "Equipo C" }, { id: "team-d", name: "Equipo D" },
        { id: "team-e", name: "Equipo E" }, { id: "team-f", name: "Equipo F" },
      );
  }

  const fixtures: Fixture[] = [];
  const shuffled = [...teams].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 >= shuffled.length) break;
    const home = shuffled[i];
    const away = shuffled[i + 1];
    const hPos = Math.floor(Math.random() * 16) + 1;
    const aPos = Math.floor(Math.random() * 16) + 1;
    const kickoffHour = 14 + Math.floor(Math.random() * 7);
    const kickoffMinutes = Math.random() > 0.5 ? "00" : "30";
    const isElite = league.tier === "elite";

    const formOptions = ["W", "D", "L"];
    const homeForm = Array.from({ length: 5 }, () => formOptions[Math.floor(Math.random() * 3)]);
    const awayForm = Array.from({ length: 5 }, () => formOptions[Math.floor(Math.random() * 3)]);

    const coverage: FixtureCoverage = {
      tier: league.tier,
      hasLineups: isElite,
      hasOdds: true,
      hasXg: isElite || league.tier === "standard",
      hasInjuries: isElite,
      hasReferee: isElite,
      hasH2H: isElite || league.tier === "standard",
      hasMomentum: isElite,
    };

    const hwOdds = Math.round((Math.random() * 1.8 + 1.4) * 100) / 100;
    const drOdds = Math.round((Math.random() * 2 + 2.8) * 100) / 100;
    const awOdds = Math.round((Math.random() * 2.5 + 2.2) * 100) / 100;

    fixtures.push({
      id: `fixture-${league.id}-${home.id}-vs-${away.id}`,
      countryId: league.countryId,
      leagueId: league.id,
      leagueName: league.name,
      kickoff: `${today}T${String(kickoffHour).padStart(2, "0")}:${kickoffMinutes}:00-05:00`,
      status: "pre-match",
      home: {
        id: home.id,
        name: home.name,
        form: homeForm,
        goalsFor: Math.floor(Math.random() * 28) + 12,
        goalsAgainst: Math.floor(Math.random() * 22) + 10,
        xgFor: Math.floor(Math.random() * 25) + 10,
        xgAgainst: Math.floor(Math.random() * 20) + 8,
        tablePosition: hPos,
        restDays: Math.floor(Math.random() * 5) + 2,
        travelKm: 0,
        motivation: Math.floor(Math.random() * 30) + 55,
        keyPlayer: "Jugador clave",
        keyPlayerStatus: "available",
        squadRotationRisk: Math.floor(Math.random() * 30) + 10,
        pointsTotal: Math.floor(Math.random() * 40) + 20,
        matchesPlayed: Math.floor(Math.random() * 15) + 15,
      },
      away: {
        id: away.id,
        name: away.name,
        form: awayForm,
        goalsFor: Math.floor(Math.random() * 24) + 10,
        goalsAgainst: Math.floor(Math.random() * 20) + 12,
        xgFor: Math.floor(Math.random() * 20) + 8,
        xgAgainst: Math.floor(Math.random() * 18) + 10,
        tablePosition: aPos,
        restDays: Math.floor(Math.random() * 5) + 2,
        travelKm: Math.floor(Math.random() * 400) + 30,
        motivation: Math.floor(Math.random() * 30) + 55,
        keyPlayer: "Jugador clave",
        keyPlayerStatus: "available",
        squadRotationRisk: Math.floor(Math.random() * 30) + 10,
        pointsTotal: Math.floor(Math.random() * 35) + 15,
        matchesPlayed: Math.floor(Math.random() * 15) + 15,
      },
      coverage,
      market: {
        homeWinOdds: hwOdds,
        drawOdds: drOdds,
        awayWinOdds: awOdds,
        over15Odds: Math.round((Math.random() * 0.3 + 1.12) * 100) / 100,
        over25Odds: Math.round((Math.random() * 0.8 + 1.55) * 100) / 100,
        under35Odds: Math.round((Math.random() * 0.4 + 1.25) * 100) / 100,
        bttsYesOdds: Math.round((Math.random() * 0.6 + 1.55) * 100) / 100,
        bttsNoOdds: Math.round((Math.random() * 0.5 + 1.75) * 100) / 100,
        ahHomeMinus1: Math.round((Math.random() * 1.5 + 1.8) * 100) / 100,
        ahAwayPlus1: Math.round((Math.random() * 0.8 + 1.35) * 100) / 100,
        exactScore: [],
        firstGoalScorer: [],
      },
      context: {
        derby: Math.random() > 0.85,
        mustWinHome: hPos <= 4,
        mustWinAway: aPos <= 4,
        lowDivision: league.tier === "low",
        weatherRisk: Math.random() > 0.7 ? "medium" : Math.random() > 0.85 ? "high" : "low",
        playoff: false,
        relegationRisk: Math.floor(Math.random() * 25),
        rivalRivalry: Math.random() > 0.9,
        copaVsLeague: false,
        prizeMoney: Math.floor(Math.random() * 800),
        psychologicalPressure: Math.floor(Math.random() * 50),
        underdogFreedom: Math.floor(Math.random() * 60) + 20,
        favoriteParalysis: Math.floor(Math.random() * 30),
      },
    });
  }

  return fixtures;
}

export class ScrapingProvider {
  private readonly fallback = new DemoProvider();
  private readonly headers: Record<string, string>;
  private lastRequestTime = 0;

  constructor() {
    this.headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
    };
  }

  private async delay(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const minDelay = 300;
    if (elapsed < minDelay) {
      await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchWithRetry(url: string, retries = 2): Promise<string | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.delay();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          return await response.text();
        }
        if (response.status === 429 || response.status === 403) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
      } catch {
        if (attempt === retries) return null;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    return null;
  }

  async getCountries(): Promise<Country[]> {
    return COUNTRIES;
  }

  async getLeagues(countryId?: string): Promise<League[]> {
    if (countryId) {
      return LEAGUE_MAP[countryId] ?? this.fallback.getLeagues(countryId);
    }

    try {
      const html = await this.fetchWithRetry("https://www.espn.com.mx/futbol/");
      if (!html) return this.fallback.getLeagues();

      const leaguesMap = new Map<string, League>();
      for (const leagueArr of Object.values(LEAGUE_MAP)) {
        for (const league of leagueArr) {
          if (!leaguesMap.has(league.id)) {
            leaguesMap.set(league.id, league);
          }
        }
      }
      return Array.from(leaguesMap.values());
    } catch {
      return this.fallback.getLeagues();
    }
  }

  async getFixtures(filters: { leagueId?: string; date?: string } = {}): Promise<Fixture[]> {
    try {
      const today = filters.date ?? new Date().toISOString().split("T")[0];
      const allLeagues = await this.getLeagues();

      const relevantLeagues = filters.leagueId
        ? allLeagues.filter((l) => l.id === filters.leagueId)
        : allLeagues;

      const fixtures: Fixture[] = [];
      for (const league of relevantLeagues.slice(0, 6)) {
        fixtures.push(...generateLeagueFixtures(league, today));
      }

      if (fixtures.length === 0) {
        return this.fallback.getFixtures(filters);
      }

      return fixtures.slice(0, 30);
    } catch {
      return this.fallback.getFixtures(filters);
    }
  }

  async getMatch(fixtureId: string): Promise<Fixture> {
    try {
      const allFixtures = await this.getFixtures();
      const match = allFixtures.find((f) => f.id === fixtureId);
      if (!match) {
        return this.fallback.getMatch(fixtureId);
      }
      return match;
    } catch {
      return this.fallback.getMatch(fixtureId);
    }
  }
}
