export class ApiFootballQuotaError extends Error {
  readonly code = "API_FOOTBALL_QUOTA" as const;

  constructor(message: string) {
    super(message);
    this.name = "ApiFootballQuotaError";
  }
}

export function isApiFootballQuotaError(error: unknown): boolean {
  if (error instanceof ApiFootballQuotaError) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("request limit") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("too many requests")
  );
}
