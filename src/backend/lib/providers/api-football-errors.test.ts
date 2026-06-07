import { describe, expect, it } from "vitest";
import {
  ApiFootballQuotaError,
  ApiFootballRateLimitError,
  isApiFootballQuotaError,
  isApiFootballRateLimitError,
} from "./api-football-errors";

describe("isApiFootballQuotaError", () => {
  it("detects daily-quota errors from API-Football payload messages", () => {
    const err = new ApiFootballQuotaError(
      "requests: You have reached the request limit for the day"
    );
    expect(isApiFootballQuotaError(err)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isApiFootballQuotaError(new Error("Network timeout"))).toBe(false);
  });

  it("does NOT treat HTTP 429 as daily quota (per-second throttle is distinct)", () => {
    expect(
      isApiFootballQuotaError(new Error("API-Football request failed: 429"))
    ).toBe(false);
    expect(
      isApiFootballQuotaError(new Error("Got HTTP 429 from upstream"))
    ).toBe(false);
  });
});

describe("isApiFootballRateLimitError", () => {
  it("detects HTTP 429 rate-limit errors", () => {
    expect(
      isApiFootballRateLimitError(
        new ApiFootballRateLimitError("API-Football rate limit (HTTP 429) on /fixtures")
      )
    ).toBe(true);
    expect(
      isApiFootballRateLimitError(new Error("Got HTTP 429 from upstream"))
    ).toBe(true);
    expect(
      isApiFootballRateLimitError(new Error("server returned status 429"))
    ).toBe(true);
  });

  it("ignores quota and unrelated errors", () => {
    expect(
      isApiFootballRateLimitError(
        new ApiFootballQuotaError("You have reached the request limit for the day")
      )
    ).toBe(false);
    expect(isApiFootballRateLimitError(new Error("Network timeout"))).toBe(false);
  });
});
