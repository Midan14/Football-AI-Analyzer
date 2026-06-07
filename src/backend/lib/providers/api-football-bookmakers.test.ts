import { describe, expect, it } from "vitest";
import { extractAllBookmakerOdds } from "./api-football-provider";

describe("extractAllBookmakerOdds", () => {
  it("preserves the real bookmaker name on parsed fixture markets", () => {
    const result = extractAllBookmakerOdds([
      {
        id: 8,
        name: "Bet365",
        bets: [
          {
            id: 1,
            name: "Match Winner",
            values: [
              { value: "Home", odd: "1.92" },
              { value: "Draw", odd: "3.40" },
              { value: "Away", odd: "4.10" },
            ],
          },
        ],
      },
    ] as any);

    expect(result.Bet365?.bookmakerName).toBe("Bet365");
    expect(result.Bet365?.homeWinOdds).toBe(1.92);
  });
});
