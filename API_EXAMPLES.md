// Ejemplos de uso de las nuevas APIs

// ============================================
// 1. AUTENTICACIÓN
// ============================================

// Registrar nuevo usuario
const registerExample = async () => {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user@example.com",
      password: "securepass123",
      name: "John Doe",
    }),
  });

  const data = await response.json();
  // { success: true, data: { id, email, name }, meta: { timestamp, version } }
};

// Obtener perfil del usuario
const getProfileExample = async () => {
  const response = await fetch("/api/auth/profile");
  const data = await response.json();
  // Devuelve: { id, email, name, role, timezone, language, modelMode, notificationsEnabled, createdAt }
};

// ============================================
// 2. ANÁLISIS DE PARTIDOS
// ============================================

// Analizar un partido
const analyzeFixtureExample = async (fixtureId: string) => {
  const response = await fetch(`/api/analyze/${fixtureId}`);

  if (response.status === 429) {
    console.log(
      "Rate limit alcanzado:",
      response.headers.get("X-RateLimit-Reset")
    );
    return;
  }

  const data = await response.json();
  // {
  //   success: true,
  //   data: {
  //     homeTeam, awayTeam, league, country, matchDate,
  //     probabilities: { homeWin, draw, awayWin, over15, over25, under35, btts },
  //     confidenceScore,
  //     riskFlags: [{ id, label, severity }],
  //     valueMarkets: [{ market, modelProbability, marketProbability, edge, verdict }],
  //     bestBet,
  //     stakeUnits
  //   }
  // }
};

// ============================================
// 3. PREDICCIONES
// ============================================

// Crear predicción
const createPredictionExample = async () => {
  const response = await fetch("/api/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fixtureId: "fixture-123",
      market: "WIN_1X2",
      prediction: "HOME_WIN",
      probability: 65.5,
      odds: 1.85,
      stakeUnits: 1.0,
      notes: "Strong form at home",
    }),
  });

  const data = await response.json();
  // Devuelve: prediction creado con id, status, createdAt, etc
};

// Obtener predicciones del usuario
const getPredictionsExample = async () => {
  const response = await fetch("/api/predictions");
  const data = await response.json();
  // Devuelve: array de predicciones ordenadas por fecha (DESC)
};

// Actualizar resultado de predicción
const updatePredictionExample = async (predictionId: string) => {
  const response = await fetch(`/api/predictions/${predictionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "WON",
      result: "WIN",
      roi: 0.85, // 85% retorno
    }),
  });

  const data = await response.json();
};

// ============================================
// 4. WATCHLIST
// ============================================

// Agregar a watchlist
const addToWatchlistExample = async () => {
  const response = await fetch("/api/user/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fixtureId: "fixture-123",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      date: "2026-05-15T20:00:00Z",
      notes: "Classic match to analyze",
    }),
  });

  const data = await response.json();
};

// Obtener watchlist
const getWatchlistExample = async () => {
  const response = await fetch("/api/user/watchlist");
  const data = await response.json();
  // Devuelve: array de items en watchlist
};

// Remover de watchlist
const removeFromWatchlistExample = async (fixtureId: string) => {
  const response = await fetch(`/api/user/watchlist/${fixtureId}`, {
    method: "DELETE",
  });

  const data = await response.json();
  // { success: true }
};

// ============================================
// 5. DATOS PÚBLICOS (sin auth)
// ============================================

// Obtener países
const getCountriesExample = async () => {
  const response = await fetch("/api/countries");
  const data = await response.json();
  // Devuelve: array de países (cached 24 horas)
};

// Obtener ligas de un país
const getLeaguesExample = async (countryId: string) => {
  const response = await fetch(`/api/leagues?countryId=${countryId}`);
  const data = await response.json();
  // Devuelve: array de ligas (cached 12 horas)
};

// Obtener partidos de una liga
const getFixturesExample = async (leagueId: string, date?: string) => {
  const url = new URL("/api/fixtures", window.location.origin);
  url.searchParams.append("leagueId", leagueId);
  if (date) url.searchParams.append("date", date);

  const response = await fetch(url.toString());
  const data = await response.json();
  // Devuelve: array de partidos (cached 2 horas)
};

// Obtener detalles de un partido
const getFixtureDetailsExample = async (fixtureId: string) => {
  const response = await fetch(`/api/match/${fixtureId}`);
  const data = await response.json();
  // Devuelve: detalles del partido (cached 1 hora)
};

// ============================================
// 6. MANEJO DE ERRORES
// ============================================

const errorHandlingExample = async () => {
  try {
    const response = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // datos inválidos
        probability: 999, // Fuera de rango
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // {
      //   success: false,
      //   error: {
      //     code: "VALIDATION_ERROR",
      //     message: "Validation failed",
      //     details: { /* errores de validación */ }
      //   }
      // }

      console.error(`Error ${response.status}:`, errorData.error);
      return;
    }

    const data = await response.json();
    console.log("Success:", data.data);
  } catch (error) {
    console.error("Network error:", error);
  }
};

// ============================================
// 7. EJEMPLO COMPLETO: WORKFLOW
// ============================================

const workflowExample = async () => {
  // 1. Obtener ligas del país
  const countriesRes = await fetch("/api/countries");
  const countries = await countriesRes.json();

  const country = countries.data[0]; // España, ej.
  const leaguesRes = await fetch(`/api/leagues?countryId=${country.id}`);
  const leagues = await leaguesRes.json();

  const league = leagues.data[0]; // La Liga, ej.

  // 2. Obtener partidos
  const fixturesRes = await fetch(
    `/api/fixtures?leagueId=${league.id}&date=2026-05-15`
  );
  const fixtures = await fixturesRes.json();

  const fixture = fixtures.data[0]; // Real Madrid vs Barcelona, ej.

  // 3. Agregar a watchlist
  await fetch("/api/user/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fixtureId: fixture.id,
      homeTeam: fixture.home.name,
      awayTeam: fixture.away.name,
      league: league.name,
      country: country.name,
      date: fixture.date,
    }),
  });

  // 4. Analizar partido
  const analysisRes = await fetch(`/api/analyze/${fixture.id}`);
  const analysis = await analysisRes.json();

  // 5. Crear predicción si hay valor
  if (analysis.data.bestBet) {
    const predictionRes = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId: fixture.id,
        market: "WIN_1X2",
        prediction: analysis.data.bestBet,
        probability: analysis.data.probabilities.homeWin,
        odds: 1.85,
        stakeUnits: analysis.data.stakeUnits,
        notes: `Confidence: ${analysis.data.confidenceScore}%`,
      }),
    });

    const prediction = await predictionRes.json();
    console.log("Predicción creada:", prediction.data);
  }

  // 6. Obtener watchlist
  const watchlistRes = await fetch("/api/user/watchlist");
  const watchlist = await watchlistRes.json();
  console.log("Tu watchlist:", watchlist.data);

  // 7. Obtener predicciones
  const predictionsRes = await fetch("/api/predictions");
  const predictions = await predictionsRes.json();
  console.log("Tus predicciones:", predictions.data);
};

export {
  registerExample,
  getProfileExample,
  analyzeFixtureExample,
  createPredictionExample,
  getPredictionsExample,
  updatePredictionExample,
  addToWatchlistExample,
  getWatchlistExample,
  removeFromWatchlistExample,
  getCountriesExample,
  getLeaguesExample,
  getFixturesExample,
  getFixtureDetailsExample,
  errorHandlingExample,
  workflowExample,
};
