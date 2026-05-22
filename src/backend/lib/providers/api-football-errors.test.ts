import { describe, expect, it } from "vitest";
import { ApiFootballQuotaError, isApiFootballQuotaError } from "./api-football-errors";

describe("isApiFootballQuotaError", () => {
  it("detects quota errors from API-Football payload messages", () => {
    const err = new ApiFootballQuotaError(
      "requests: You have reached the request limit for the day"
    );
    expect(isApiFootballQuotaError(err)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isApiFootballQuotaError(new Error("Network timeout"))).toBe(false);
  });
});
