export type CoverageTier = "elite" | "standard" | "low";

export type Country = {
  id: string;
  name: string;
  code: string;
  region: string;
  flag?: string;
};

export type League = {
  id: string;
  countryId: string;
  name: string;
  tier: CoverageTier;
  season: string;
  coverageScore: number;
};

export type TeamSnapshot = {
  id: string;
  name: string;
  logo?: string;
  form: string[];
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  tablePosition: number;
  restDays: number;
  travelKm: number;
  motivation: number;
  keyPlayer: string;
  keyPlayerStatus: "available" | "doubtful" | "injured" | "suspended";
  squadRotationRisk: number;
  pointsTotal: number;
  matchesPlayed: number;
};

export type FixtureCoverage = {
  tier: CoverageTier;
  hasLineups: boolean;
  hasOdds: boolean;
  hasXg: boolean;
  hasInjuries: boolean;
  hasReferee: boolean;
  hasH2H: boolean;
  hasMomentum: boolean;
};

export type FixtureMarket = {
  homeWinOdds: number;
  drawOdds: number;
  awayWinOdds: number;
  over15Odds: number;
  over25Odds: number;
  over35Odds?: number;
  under15Odds?: number;
  under25Odds?: number;
  under35Odds: number;
  bttsYesOdds: number;
  bttsNoOdds: number;
  dc1xOdds?: number;
  dcx2Odds?: number;
  dc12Odds?: number;
  ahHomeMinus1: number;
  ahAwayPlus1: number;
  exactScore: Array<{ score: string; odds: number }>;
  firstGoalScorer: Array<{ player: string; odds: number }>;
};

export type H2HRecord = {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  competition: string;
  venue: string;
  firstHalfHome: number;
  firstHalfAway: number;
  homeXg: number;
  awayXg: number;
  cards: number;
  corners: number;
  dominantTeam: string;
};

export type RefereeProfile = {
  name: string;
  avgCards: number;
  avgPenalties: number;
  strictness: "low" | "medium" | "high";
  homeBias: number;
  controversyHistory: string[];
  lastMatches: number;
};

export type SquadDynamic = {
  injuries: Array<{ player: string; position: string; status: string; impact: number }>;
  suspensions: Array<{ player: string; position: string }>;
  lastLineup: string[];
  tacticalChangeRisk: number;
};

export type DeepContext = {
  derby: boolean;
  mustWinHome: boolean;
  mustWinAway: boolean;
  lowDivision: boolean;
  weatherRisk: "low" | "medium" | "high";
  playoff: boolean;
  relegationRisk: number;
  rivalRivalry: boolean;
  copaVsLeague: boolean;
  prizeMoney: number;
  psychologicalPressure: number;
  underdogFreedom: number;
  favoriteParalysis: number;
};

export type HistoricalOutlier = {
  date: string;
  match: string;
  description: string;
  probability: number;
  category: string;
};

export type Fixture = {
  id: string;
  countryId: string;
  leagueId: string;
  leagueName: string;
  leagueFlag?: string;
  leagueLogo?: string;
  round?: string;
  kickoff: string;
  elapsed?: number | null;
  status: "pre-match" | "live" | "final";
  home: TeamSnapshot;
  away: TeamSnapshot;
  coverage: FixtureCoverage;
  market: FixtureMarket;
  context: DeepContext;
  h2h?: H2HRecord[];
  referee?: RefereeProfile;
  squad?: { home: SquadDynamic; away: SquadDynamic };
  historicalOutliers?: HistoricalOutlier[];
  socialSentiment?: { homePositive: number; awayPositive: number; neutral: number };
  result?: MatchResult;
};

export type MatchResult = {
  homeGoals: number;
  awayGoals: number;
  bttsActual: boolean;
  totalGoals: number;
  abandoned?: boolean;
  // Half-time (Tier 2). Optional so legacy/missing data doesn't break callers.
  firstHalfHome?: number;
  firstHalfAway?: number;
  // Match stats (Tier 3). Resolvers default to VOID:requires_match_stats when missing.
  corners?: { home: number; away: number };
  cards?: { yellowHome: number; yellowAway: number; redHome: number; redAway: number };
  penaltyAwarded?: boolean;
  // Player events (Tier 4-5). Resolvers default to VOID:requires_player_data when missing.
  scorers?: Array<{ player: string; team: "home" | "away"; minute: number }>;
  bookedPlayers?: string[];
};

// ── Match Detail types (lineups, events, statistics) ─────────────────────────

export type MatchPlayer = {
  id: number;
  name: string;
  number: number;
  position: string;
  photo?: string;
  rating?: string;
  captain?: boolean;
  substitute?: boolean;
};

export type MatchLineup = {
  teamId: string;
  teamName: string;
  teamLogo?: string;
  formation: string;
  startXI: MatchPlayer[];
  substitutes: MatchPlayer[];
  coach?: { name: string; photo?: string };
};

export type MatchEvent = {
  time: number;
  extraTime?: number;
  team: string;
  teamLogo?: string;
  player: string;
  assist?: string;
  type: "Goal" | "Card" | "subst" | "Var" | string;
  detail: string; // "Normal Goal", "Yellow Card", "Red Card", "Substitution 1", "Penalty", etc.
};

export type MatchStatistic = {
  type: string;
  home: string;
  away: string;
};

export type MatchDetail = {
  fixture: Fixture;
  analysis: AnalysisResult;
  lineups?: MatchLineup[];
  events?: MatchEvent[];
  statistics?: MatchStatistic[];
};

export type AnalysisResult = {
  fixtureId: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over15: number;
    over25: number;
    under35: number;
    btts: number;
  };
  topExactScores: Array<{ score: string; probability: number }>;
  goalMarkets: {
    doubleChance: { "1X": number; "X2": number; "12": number };
    overUnder: Record<string, number>;
    exactTotalGoals: Record<string, number>;
    goalsOddEven: { ODD: number; EVEN: number };
    winToNil: { HOME: number; AWAY: number };
    cleanSheet: { HOME: number; AWAY: number };
    teamToScore: { HOME: number; AWAY: number };
  };
  confidence: {
    score: number;
    penalties: Array<{ id: string; label: string; points: number }>;
  };
  riskFlags: Array<{ id: string; label: string; severity: "low" | "medium" | "high" }>;
  radar: Array<{ axis: string; value: number }>;
  recommendation: {
    market: string;
    fairOdds: number;
    minimumOdds: number;
    stakeUnits: number;
    rationale: string;
  };
  valueTable: Array<{
    market: string;
    modelProbability: number;
    marketProbability: number;
    edge: number;
    verdict: string;
  }>;
  // Ensemble model data
  ensemble?: {
    homeWin: number;
    draw: number;
    awayWin: number;
    models: {
      poisson: { homeWin: number; draw: number; awayWin: number; weight: number };
      negBinom: { homeWin: number; draw: number; awayWin: number; weight: number };
      elo: { homeWin: number; draw: number; awayWin: number; weight: number };
      form: { homeWin: number; draw: number; awayWin: number; weight: number };
    };
    modelAgreement: number;
    dominantModel: string;
  };
  // Kelly Criterion staking
  kelly?: {
    bets: Array<{
      market: string;
      edge: number;
      stakeUnits: number;
      expectedValue: number;
      riskLevel: string;
      recommendation: string;
    }>;
    totalExposure: number;
    expectedROI: number;
    sharpeRatio: number;
  };
};

export type DeepAnalysisResult = Omit<AnalysisResult, 'radar'> & {
  radar: Array<{ axis: string; home: number; away: number }>;
  monteCarlo: {
    iterations: number;
    homeWinDist: number[];
    drawDist: number[];
    awayWinDist: number[];
    over25Confidence: number;
    sharpRatio: number;
  };
  heavyTail: {
    distribution: "t-student";
    degreesOfFreedom: number;
    blackSwanProb: number;
    maxSurpriseScore: number;
  };
  gameTheory: {
    nashEquilibrium: string;
    homeDominantStrategy: string;
    awayDominantStrategy: string;
    payoffMatrix: Array<{ strategy: string; homePayoff: number; awayPayoff: number }>;
  };
  psychological: {
    chokingRisk: number;
    motivationAdvantage: number;
    pressureHandlingScore: number;
    momentumScore: number;
  };
  referee: {
    expectedCards: number;
    homeBiasAdj: number;
    penaltyRisk: number;
  };
  safeMarket: {
    market: string;
    confidence: number;
    edge: number;
    explanation: string;
    riskGrade: "A" | "B" | "C" | "D";
  };
  insights: Array<{
    category: string;
    finding: string;
    action: string;
    confidence: number;
  }>;
  aiPrompt: string;
};
