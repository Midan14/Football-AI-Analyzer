export type CoverageTier = "elite" | "standard" | "low";

import type { FixtureStatus } from "@/shared/fixture-status";

export type { FixtureStatus };

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
  /** men | women | youth | reserve | cup — inferred from league name/type */
  category?: "men" | "women" | "youth" | "reserve" | "cup" | "other";
  coverageScore: number;
  logo?: string;
};

export type LeagueCoverageCapabilities = {
  fixtures: boolean;
  standings: boolean;
  odds: boolean;
  lineups: boolean;
  xg: boolean;
  injuries: boolean;
  referee: boolean;
  h2h: boolean;
  momentum: boolean;
};

export type LeagueCoverageReport = {
  leagueId: string;
  leagueName: string;
  tier: CoverageTier;
  coverageScore: number;
  provider: string;
  season: string;
  capabilities: LeagueCoverageCapabilities;
  confidenceImpact: string;
  source: "provider-metadata" | "inferred";
};

export type LeagueStandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  teamLogo?: string;
  played: number;
  points: number;
  goalDiff: number;
};

export type LeagueSeasonStats = {
  leagueId: string;
  from: string;
  to: string;
  sampleSize: number;
  finishedMatches: number;
  liveMatches: number;
  avgGoals: number;
  withOddsPct: number;
};

export type TeamRecentMatch = {
  date: string;
  fixtureId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeXg?: number;
  awayXg?: number;
  teamPossession?: number;
  teamCorners?: number;
  teamShotsOnTarget?: number;
  statsSource?: "api-football";
  /** Result from the perspective of the team this list belongs to */
  result: "W" | "D" | "L";
};

export type TeamSnapshot = {
  id: string;
  name: string;
  logo?: string;
  form: string[];
  recentMatches?: TeamRecentMatch[];
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  tablePosition: number;
  restDays: number;
  travelKm: number;
  /** Human-readable travel line when geocoded (optional). */
  travelNote?: string;
  motivation: number;
  keyPlayer: string;
  keyPlayerStatus: "available" | "doubtful" | "injured" | "suspended";
  squadRotationRisk: number;
  pointsTotal: number;
  matchesPlayed: number;
  /** Rolling tactical rates from API-Football /fixtures/statistics (optional). */
  possessionAvg?: number;
  cornersAvg?: number;
  shotsOnTargetAvg?: number;
  tacticalStatsSource?: "api-football";
  xgSource?: "api-football";
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
  hasTacticalStats?: boolean;
};

export type FixtureMarket = {
  bookmakerName?: string;
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

export type MatchVenue = {
  name: string;
  city?: string;
  country?: string;
};

export type MatchWeather = {
  temperatureC?: number;
  condition?: string;
  humidity?: number;
  windKmh?: number;
  description?: string;
  /** Real provider when available; omitted or "estimate" for heuristics. */
  source?: "open-meteo" | "estimate";
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
  status: FixtureStatus;
  statusShort?: string;
  statusLong?: string;
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
  venue?: MatchVenue;
  weather?: MatchWeather;
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
    /** Score before mode/scenario adjustments (when preferences were applied server-side). */
    baseScore?: number;
    adjustments?: {
      modelMode: string;
      scenario: string;
      modeDelta: number;
      scenarioDelta: number;
      totalDelta: number;
      hint: string;
    };
    penalties: Array<{ id: string; label: string; points: number }>;
  };
  riskFlags: Array<{ id: string; label: string; severity: "low" | "medium" | "high" }>;
  radar: Array<{ axis: string; home: number; away: number; value: number }>;
  radarHalfTime?: Array<{ axis: string; home: number; away: number; value: number }>;
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
  // Advanced models output (all 19 models)
  advancedModels?: {
    dixonColes: { rho: number; prob00: number; prob11: number; correction00: number; correction11: number };
    hierarchical: { lambdaHome: number; lambdaAway: number; expectedTotalGoals: number; homeWin: number; draw: number; awayWin: number };
    skellam: { mostLikelyDiff: number; expectedDiff: number; ahMinus05: { home: number; away: number }; ahMinus1: { home: number; away: number } };
    zip: { prob00: number; drawAdjustment: number; piHome: number; piAway: number };
    kalman: { homeAttack: number; homeDefense: number; awayAttack: number; awayDefense: number; homeTrend: string; awayTrend: string };
    xThreat: { homeThreat: number; awayThreat: number; dominance: string; dominanceScore: number };
    valueBets: { bestBet: { market: string; ev: number; grade: string } | null; totalPositiveEV: number; overround: number; marketEfficiency: number };
    hawkes: { homeMomentum: number; awayMomentum: number; nextGoalIn10min: number; expectedTotalGoals: number; clusteringCoeff: number };
    bayesian: {
      posterior: { homeWin: number; draw: number; awayWin: number; over25: number; btts: number };
      shift: { homeWin: number; draw: number; awayWin: number };
      updateConfidence: number;
      keyEvents: Array<{ event: string; minute: number; impact: number; direction: string }>;
      xgRemaining: { home: number; away: number };
      timeDecay: number;
    };
    bivariatePoisson: {
      lambdaHome: number;
      lambdaAway: number;
      kappa: number;
      homeWin: number;
      draw: number;
      awayWin: number;
      covariance: number;
    };
    temporalBlend: {
      recentWeight: number;
      seasonWeight: number;
      blendedHomeXg: number;
      blendedAwayXg: number;
      homeWin: number;
      draw: number;
      awayWin: number;
    };
    mlOps: {
      runId: string;
      schemaValid: boolean;
      driftScore: number;
      driftStatus: string;
      featureCompleteness: number;
      qualityGatePassed: boolean;
    };
    timeSeries: {
      prophetTrend: number;
      arimaHomeWin: number;
      tftHomeWin: number;
      nbeatsHomeWin: number;
      sarimaHomeWin: number;
      sarimaSeasonality: number;
      ensembleHomeWin: number;
      ensembleDraw: number;
      ensembleAwayWin: number;
    };
    halfTime: {
      homeWinHT: number;
      drawHT: number;
      awayWinHT: number;
      expectedGoalsHT: number;
      over05HT: number;
    };
    cornersEsp: {
      expectedTotalCorners: number;
      homeCorners: number;
      awayCorners: number;
      over95Corners: number;
    };
    cardsRisk: {
      expectedYellows: number;
      expectedReds: number;
      homeCardsIndex: number;
      awayCardsIndex: number;
      highCardRisk: boolean;
    };
    xgModel: {
      homeXg: number;
      awayXg: number;
      totalXg: number;
      bttsFromXg: number;
      engine: string;
    };
    explainability: {
      topDrivers: Array<{ feature: string; impact: number }>;
      method: string;
      dominantOutcome: string;
    };
    featureEngineering: {
      rollingFeatureCount: number;
      tsfreshProxyScore: number;
    };
    autoMl: {
      championModel: string;
      engines: string[];
      optunaEnabled: boolean;
      randomForestEnabled: boolean;
    };
    causalSurvival: {
      gnnDelta: number;
      causalLift: number;
      survivalProbNoGoal60: number;
      medianMinutesToNextGoal: number;
    };
    quantumOptimizer: {
      method: string;
      optimalExposure: number;
      energy: number;
      topMarket: string | null;
    };
    calibration?: {
      rawProbability: number;
      calibratedProbability: number;
      adjustment: number;
      source: "market" | "league" | "global" | "none";
      reliability: "high" | "medium" | "low";
      sampleSize: number;
      abstained: boolean;
      reason: string;
    };
    /** Dixon-Coles → XGBoost hybrid pipeline (unified markets) */
    hybridPipeline?: {
      active: boolean;
      pipeline: string;
      lambdaLocal: number;
      muVisitante: number;
      rho: number;
      modelsUsed: string[];
      exactScoreTop: Array<{ score: string; probability: number }>;
      asianHandicap: Record<string, { Home?: number; Away?: number }>;
      valueBets: Array<{
        market: string;
        modelProbability: number;
        marketProbability: number;
        edge: number;
        odds?: number;
      }>;
      consistencyFlags?: string[];
      dixonColes1x2?: { homeWin: number; draw: number; awayWin: number };
      marketPrior1x2?: { homeWin: number; draw: number; awayWin: number } | null;
    };
    multiMarket?: {
      goalCore: {
        dixonColesReady: boolean;
        xgIntegrated: boolean;
        dynamicEloReady: boolean;
        lowScoreCorrection: number;
      };
      cards: {
        engine: string;
        expectedTotalCards: number;
        over45Cards: number;
        refereeFactor: number;
        hawkesIntensity: number;
        xgboostFeatureScore: number;
        dataQuality: number;
        marketsUnlocked: string[];
      };
      corners: {
        engine: string;
        expectedTotalCorners: number;
        over85Corners: number;
        over95Corners: number;
        pressureIndex: number;
        ppdaProxy: number;
        markovWingAttack: number;
        dataQuality: number;
        marketsUnlocked: string[];
      };
      playerProps: {
        status: "ready" | "limited" | "blocked";
        lineupConfidence: number;
        playerXgProxy: number;
        rotationRisk: number;
        marketsUnlocked: string[];
        dataGaps: string[];
      };
      live: {
        bayesianUpdateReady: boolean;
        gameStateIndex: number;
        nextGoalHazard10m: number;
        redCardAdjustmentReady: boolean;
        sequenceModelStatus: "heuristic" | "lstm-ready" | "blocked";
        criticalEvents: Array<{ event: string; impact: number }>;
      };
      externalContext: {
        weatherImpact: number;
        fatigueIndex: number;
        motivationIndex: number;
        newsSentimentStatus: "available" | "proxy" | "missing";
        dataGaps: string[];
      };
      calibration: {
        method: "platt-isotonic-ready" | "historical-proxy";
        marketCalibrationScore: number;
        valueFilterScore: number;
        edgeThreshold: number;
        applyBeforeKelly: boolean;
      };
      risk: {
        kellyFraction: number;
        drawdownLimit: number;
        bankrollRuinRisk: number;
        correlatedPickWarning: boolean;
        portfolioMethod: string;
        maxDailyExposure: number;
      };
      dataReadiness: Array<{ layer: string; score: number; status: "ready" | "limited" | "blocked"; reason: string }>;
      expectedThreat?: {
        fieldTilt: number;
        homeXThreat: number;
        awayXThreat: number;
        dominanceRatio: number;
      };
      conformalRange?: {
        homeWinRange: [number, number];
        drawRange: [number, number];
        awayWinRange: [number, number];
        confidenceGuaranteed: boolean;
      };
      oddsDroppingTracker?: {
        steamMoveDetected: boolean;
        dropPercent: number;
        oddsMovementStatus: string;
        openingVsActiveDiff: number;
      };
      qLearningStakes?: {
        stateDescription: string;
        optimalAction: "conservative" | "standard" | "aggressive";
        suggestedStakes: number;
        recentWinRate: number;
      };
      mcmcSimulation?: {
        transitionProbabilityGoal: number;
        transitionProbabilityCorner: number;
        transitionProbabilityCard: number;
        averageGameTension: number;
      };
    };
    /** Which sections were computed by the Python ml-service vs TS fallback */
    modelSources?: {
      timeSeries?: string;
      bivariatePoisson?: string;
      temporalBlend?: string;
      mlOps?: string;
      causalSurvival?: string;
      quantumOptimizer?: string;
      halfTime?: string;
      cornersEsp?: string;
      cardsRisk?: string;
      xgModel?: string;
      multiMarket?: string;
      explainability?: string;
      pythonLibraries?: Record<string, boolean>;
    };
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
    hybridMix?: {
      poissonPct: number;
      heavyTailPct: number;
    };
    topScorelines?: Array<{ score: string; probability: number }>;
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

export type { AnalysisPipelineStatus, AnalysisPipelineLayer, AnalysisPipelineTier } from "./analysis-pipeline";

export type MatchAnalysisResponse = {
  fixture: Fixture;
  analysis: AnalysisResult;
  lineups?: unknown[];
  events?: unknown[];
  statistics?: unknown[];
  mlPrediction?: {
    prediction?: string;
    confidence?: number;
    probabilities?: {
      ensemble?: Record<string, number>;
    };
    models_used?: string[];
    source?: string;
    shap?: {
      top_features?: Array<{ feature: string; impact: number }>;
    };
  } | null;
  analysisPipeline?: import("./analysis-pipeline").AnalysisPipelineStatus;
};
