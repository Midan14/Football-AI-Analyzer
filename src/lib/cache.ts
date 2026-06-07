import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | null = null;
let redisAvailable = true;
let connectionAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_INTERVAL = 30000;
const memoryCache = new Map<string, { expiresAt: number; value: string }>();

function getMemoryValue<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

function setMemoryValue<T>(key: string, value: T, ttlSeconds: number): void {
  memoryCache.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value: JSON.stringify(value),
  });
}

function getRedisClientSync() {
  if (!process.env.REDIS_URL) return null;

  if (redisClient) return redisClient;

  if (!redisAvailable) return null;

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          connectionAttempt = retries;
          const delay = Math.min(retries * 1000, MAX_RECONNECT_INTERVAL);
          return delay;
        },
      },
    });

    redisClient.on("error", (err) => {
      console.warn("[Cache] Redis error:", err.message);
    });

    redisClient.on("ready", () => {
      redisAvailable = true;
      connectionAttempt = 0;
    });

    redisClient.on("end", () => {
      redisClient = null;
    });

    redisClient.connect().catch((err) => {
      console.warn("[Cache] Redis connection failed:", err.message);
      redisAvailable = false;
      redisClient = null;
      scheduleReconnect();
    });
  } catch {
    redisAvailable = false;
    redisClient = null;
  }

  return redisClient;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min((connectionAttempt + 1) * 2000, MAX_RECONNECT_INTERVAL);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    redisAvailable = true;
    connectionAttempt++;
    getRedisClientSync();
  }, delay);
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClientSync();
    if (!client) return getMemoryValue<T>(key);
    try {
      const value = await client.get(key);
      if (value) return JSON.parse(value) as T;
      return getMemoryValue<T>(key);
    } catch (err) {
      console.warn("[Cache] Get error:", (err as Error).message);
      return getMemoryValue<T>(key);
    }
  },

  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    setMemoryValue(key, value, ttlSeconds);
    const client = getRedisClientSync();
    if (!client) return;
    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      console.warn("[Cache] Set error:", (err as Error).message);
    }
  },

  async delete(key: string): Promise<void> {
    memoryCache.delete(key);
    const client = getRedisClientSync();
    if (!client) return;
    try {
      await client.del(key);
    } catch (err) {
      console.warn("[Cache] Delete error:", (err as Error).message);
    }
  },

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) memoryCache.delete(key);
    const client = getRedisClientSync();
    if (!client) return;
    try {
      await client.del(keys);
    } catch (err) {
      console.warn("[Cache] DeleteMany error:", (err as Error).message);
    }
  },

  async clear(): Promise<void> {
    memoryCache.clear();
    const client = getRedisClientSync();
    if (!client) return;
    try {
      await client.flushDb();
    } catch (err) {
      console.warn("[Cache] Clear error:", (err as Error).message);
    }
  },
};

export const cacheKeys = {
  countries: () => "football:countries",
  leagues: (countryId: string) => `football:leagues:${countryId}`,
  fixtures: (leagueId: string, date?: string) =>
    `football:fixtures:v2:${leagueId}:${date || "all"}`,
  fixturesRange: (
    leagueId: string,
    countryId: string,
    from: string,
    to: string,
    includeFixtures: boolean
  ) =>
    `football:fixtures:range:v1:${leagueId}:${countryId}:${from}:${to}:${includeFixtures ? "fx" : "count"}`,
  fixtureEdgeHints: (leagueId: string, countryId: string, date: string) =>
    `football:fixtures:edge-hints:v2:${leagueId}:${countryId}:${date}`,
  leagueCoverage: (leagueId: string, countryId: string) =>
    `football:leagues:coverage:v1:${leagueId}:${countryId}`,
  leagueStandings: (leagueId: string, countryId: string, limit: number) =>
    `football:leagues:standings:v1:${leagueId}:${countryId}:${limit}`,
  leagueStats: (leagueId: string, date: string, windowDays: number) =>
    `football:leagues:stats:v1:${leagueId}:${date}:${windowDays}`,
  liveFixtures: () => "football:live:fixtures:v1",
  liveDetail: (fixtureId: string) => `football:live:detail:v1:${fixtureId}`,
  oddsByDate: (leagueId: string, date: string) =>
    `football:odds-by-date:v2:${leagueId}:${date}`,
  fixture: (fixtureId: string) => `football:fixture:${fixtureId}`,
  analysis: (fixtureId: string, modelMode = "Balanceado", scenario = "base") =>
    `football:analysis:v2:${fixtureId}:${modelMode}:${scenario}`,
  deepAnalysis: (fixtureId: string) => `football:deep-analysis:${fixtureId}`,
  user: (userId: string) => `user:${userId}`,
  userWatchlist: (userId: string) => `user:${userId}:watchlist`,
  userPredictions: (userId: string) => `user:${userId}:predictions`,
};
