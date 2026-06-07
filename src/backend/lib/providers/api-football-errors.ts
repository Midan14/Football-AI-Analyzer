/**
 * Daily quota exhausted on API-Football (e.g. "You have reached the request
 * limit for the day"). UI surfaces this as a hard "cuota agotada" banner.
 */
export class ApiFootballQuotaError extends Error {
  readonly code = "API_FOOTBALL_QUOTA" as const;

  constructor(message: string) {
    super(message);
    this.name = "ApiFootballQuotaError";
  }
}

/**
 * Transient per-second / per-minute throttle on API-Football (HTTP 429).
 * Distinct from daily quota: this typically clears within a few seconds.
 * UI should NOT show "cuota agotada" for this — prefer a soft retry hint.
 */
export class ApiFootballRateLimitError extends Error {
  readonly code = "API_FOOTBALL_RATE_LIMIT" as const;

  constructor(message: string) {
    super(message);
    this.name = "ApiFootballRateLimitError";
  }
}

export function isApiFootballQuotaError(error: unknown): boolean {
  if (error instanceof ApiFootballQuotaError) return true;
  if (!(error instanceof Error)) return false;
  // Only treat API-Football payload-level messages as quota. HTTP 429 alone
  // is per-second/per-minute throttle (use isApiFootballRateLimitError for it).
  const msg = error.message.toLowerCase();
  return (
    msg.includes("request limit") ||
    msg.includes("quota") ||
    (msg.includes("rate limit") && !msg.includes("http 429"))
  );
}

export function isApiFootballRateLimitError(error: unknown): boolean {
  if (error instanceof ApiFootballRateLimitError) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("http 429") ||
    msg.includes(": 429") ||
    msg.includes("status 429") ||
    msg.includes("too many requests")
  );
}
