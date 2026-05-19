import { describe, expect, it } from "vitest";
import { resolvePrediction } from "./outcome-resolver";

const baseResult = {
  homeGoals: 2,
  awayGoals: 1,
  bttsActual: true,
  totalGoals: 3,
};

describe("resolvePrediction", () => {
  it("returns WON with positive ROI for a correct 1X2 home pick", () => {
    const r = resolvePrediction({
      market: "WIN_1X2",
      prediction: "HOME_WIN",
      stakeUnits: 1,
      odds: 2.5,
      result: baseResult,
    });
    expect(r.status).toBe("WON");
    expect(r.roi).toBe(1.5);
  });

  it("returns LOST with negative ROI when prediction misses", () => {
    const r = resolvePrediction({
      market: "WIN_1X2",
      prediction: "AWAY_WIN",
      stakeUnits: 1,
      odds: 3.0,
      result: baseResult,
    });
    expect(r.status).toBe("LOST");
    expect(r.roi).toBe(-1);
  });

  it("classifies a draw correctly", () => {
    const r = resolvePrediction({
      market: "WIN_1X2",
      prediction: "DRAW",
      stakeUnits: 0.75,
      odds: 3.4,
      result: { ...baseResult, homeGoals: 1, awayGoals: 1 },
    });
    expect(r.status).toBe("WON");
    expect(r.roi).toBe(1.8);
  });

  it("voids on abandoned match regardless of score", () => {
    const r = resolvePrediction({
      market: "WIN_1X2",
      prediction: "HOME_WIN",
      stakeUnits: 1,
      odds: 2.5,
      result: { ...baseResult, abandoned: true },
    });
    expect(r.status).toBe("VOID");
    expect(r.roi).toBe(0);
  });

  it("voids a winning bet that has no odds (manual review)", () => {
    const r = resolvePrediction({
      market: "WIN_1X2",
      prediction: "HOME_WIN",
      stakeUnits: 1,
      odds: null,
      result: baseResult,
    });
    expect(r.status).toBe("VOID");
    expect(r.reason).toBe("won_but_missing_odds");
  });

  it("voids unknown markets rather than guessing", () => {
    const r = resolvePrediction({
      market: "TOTALLY_MADE_UP_MARKET",
      prediction: "X",
      stakeUnits: 1,
      odds: 5,
      result: baseResult,
    });
    expect(r.status).toBe("VOID");
    expect(r.reason).toContain("market_not_implemented");
  });

  it("voids player-data markets when scorer info is missing", () => {
    const r = resolvePrediction({
      market: "FIRST_GOAL_SCORER",
      prediction: "Messi",
      stakeUnits: 1,
      odds: 5,
      result: baseResult, // no scorers field
    });
    expect(r.status).toBe("VOID");
    expect(r.reason).toBe("requires_match_stats:scorers");
  });

  describe("OVER_UNDER", () => {
    it("wins OVER_2.5 when total goals exceed line", () => {
      const r = resolvePrediction({
        market: "OVER_UNDER",
        prediction: "OVER_2.5",
        stakeUnits: 1,
        odds: 1.9,
        result: { ...baseResult, totalGoals: 3 },
      });
      expect(r.status).toBe("WON");
      expect(r.roi).toBe(0.9);
    });

    it("loses UNDER_2.5 when total exceeds line", () => {
      const r = resolvePrediction({
        market: "OVER_UNDER",
        prediction: "UNDER_2.5",
        stakeUnits: 1,
        odds: 2.0,
        result: { ...baseResult, totalGoals: 3 },
      });
      expect(r.status).toBe("LOST");
      expect(r.roi).toBe(-1);
    });

    it("voids on integer-line push", () => {
      const r = resolvePrediction({
        market: "OVER_UNDER",
        prediction: "OVER_3",
        stakeUnits: 1,
        odds: 2,
        result: { ...baseResult, totalGoals: 3 },
      });
      expect(r.status).toBe("VOID");
      expect(r.reason).toBe("push_on_line");
    });

    it("voids on malformed prediction string", () => {
      const r = resolvePrediction({
        market: "OVER_UNDER",
        prediction: "OVER",
        stakeUnits: 1,
        odds: 2,
        result: baseResult,
      });
      expect(r.status).toBe("VOID");
    });
  });

  describe("EXACT_SCORE", () => {
    // NOTE(user): adjust prediction strings below to match the format you implement.
    it("wins when predicted score equals actual score", () => {
      const r = resolvePrediction({
        market: "EXACT_SCORE",
        prediction: "2-1",
        stakeUnits: 1,
        odds: 8.0,
        result: baseResult, // 2-1
      });
      expect(r.status).toBe("WON");
      expect(r.roi).toBe(7);
    });

    it("loses when score differs", () => {
      const r = resolvePrediction({
        market: "EXACT_SCORE",
        prediction: "1-1",
        stakeUnits: 1,
        odds: 6,
        result: baseResult, // 2-1
      });
      expect(r.status).toBe("LOST");
      expect(r.roi).toBe(-1);
    });

    it("voids on malformed prediction string", () => {
      const r = resolvePrediction({
        market: "EXACT_SCORE",
        prediction: "two-one",
        stakeUnits: 1,
        odds: 8,
        result: baseResult,
      });
      expect(r.status).toBe("VOID");
    });

    it("voids on abandoned match even if score would match", () => {
      const r = resolvePrediction({
        market: "EXACT_SCORE",
        prediction: "2-1",
        stakeUnits: 1,
        odds: 8,
        result: { ...baseResult, abandoned: true },
      });
      expect(r.status).toBe("VOID");
    });
  });

  describe("DOUBLE_CHANCE", () => {
    it("wins 1X on home win", () => {
      const r = resolvePrediction({ market: "DOUBLE_CHANCE", prediction: "1X", stakeUnits: 1, odds: 1.3, result: baseResult });
      expect(r.status).toBe("WON");
    });
    it("loses 12 on draw", () => {
      const r = resolvePrediction({ market: "DOUBLE_CHANCE", prediction: "12", stakeUnits: 1, odds: 1.3, result: { ...baseResult, homeGoals: 1, awayGoals: 1 } });
      expect(r.status).toBe("LOST");
    });
  });

  describe("EXACT_TOTAL_GOALS", () => {
    it("wins on exact match for 0-3", () => {
      const r = resolvePrediction({ market: "EXACT_TOTAL_GOALS", prediction: "3", stakeUnits: 1, odds: 6, result: baseResult });
      expect(r.status).toBe("WON");
    });
    it("wins 4_PLUS bucket", () => {
      const r = resolvePrediction({ market: "EXACT_TOTAL_GOALS", prediction: "4_PLUS", stakeUnits: 1, odds: 4, result: { ...baseResult, totalGoals: 5 } });
      expect(r.status).toBe("WON");
    });
  });

  describe("GOALS_ODD_EVEN", () => {
    it("ODD wins with 3 goals", () => {
      const r = resolvePrediction({ market: "GOALS_ODD_EVEN", prediction: "ODD", stakeUnits: 1, odds: 1.9, result: baseResult });
      expect(r.status).toBe("WON");
    });
    it("EVEN wins with 0 goals", () => {
      const r = resolvePrediction({ market: "GOALS_ODD_EVEN", prediction: "EVEN", stakeUnits: 1, odds: 1.9, result: { ...baseResult, totalGoals: 0, homeGoals: 0, awayGoals: 0, bttsActual: false } });
      expect(r.status).toBe("WON");
    });
  });

  describe("ASIAN_HANDICAP", () => {
    it("HOME_-1.5 wins when home wins by 2 (3-1)", () => {
      const r = resolvePrediction({ market: "ASIAN_HANDICAP", prediction: "HOME_-1.5", stakeUnits: 1, odds: 2.1, result: { ...baseResult, homeGoals: 3, awayGoals: 1, totalGoals: 4 } });
      expect(r.status).toBe("WON");
    });
    it("HOME_-1.5 loses when home wins by 1 (2-1)", () => {
      const r = resolvePrediction({ market: "ASIAN_HANDICAP", prediction: "HOME_-1.5", stakeUnits: 1, odds: 2.1, result: baseResult });
      expect(r.status).toBe("LOST");
    });
  });

  describe("WIN_TO_NIL / CLEAN_SHEET / TEAM_TO_SCORE", () => {
    const result = { homeGoals: 2, awayGoals: 0, bttsActual: false, totalGoals: 2 };
    it("WIN_TO_NIL HOME wins on 2-0", () => {
      expect(resolvePrediction({ market: "WIN_TO_NIL", prediction: "HOME", stakeUnits: 1, odds: 2, result }).status).toBe("WON");
    });
    it("CLEAN_SHEET HOME wins (away didn't score)", () => {
      expect(resolvePrediction({ market: "CLEAN_SHEET", prediction: "HOME", stakeUnits: 1, odds: 2, result }).status).toBe("WON");
    });
    it("TEAM_TO_SCORE AWAY loses on 2-0", () => {
      expect(resolvePrediction({ market: "TEAM_TO_SCORE", prediction: "AWAY", stakeUnits: 1, odds: 2, result }).status).toBe("LOST");
    });
  });

  describe("HT markets", () => {
    const ht = { ...baseResult, firstHalfHome: 1, firstHalfAway: 0 };
    it("HT_RESULT wins HOME_WIN at half", () => {
      expect(resolvePrediction({ market: "HT_RESULT", prediction: "HOME_WIN", stakeUnits: 1, odds: 2, result: ht }).status).toBe("WON");
    });
    it("HT_FT wins HOME/HOME", () => {
      expect(resolvePrediction({ market: "HT_FT", prediction: "HOME_HOME", stakeUnits: 1, odds: 4, result: ht }).status).toBe("WON");
    });
    it("HT_OVER_UNDER OVER_0.5 wins with 1 HT goal", () => {
      expect(resolvePrediction({ market: "HT_OVER_UNDER", prediction: "OVER_0.5", stakeUnits: 1, odds: 1.5, result: ht }).status).toBe("WON");
    });
    it("GOAL_BOTH_HALVES YES wins (1H=1, 2H=2)", () => {
      expect(resolvePrediction({ market: "GOAL_BOTH_HALVES", prediction: "YES", stakeUnits: 1, odds: 2, result: ht }).status).toBe("WON");
    });
    it("HT_RESULT voids when HT data missing", () => {
      const r = resolvePrediction({ market: "HT_RESULT", prediction: "HOME_WIN", stakeUnits: 1, odds: 2, result: baseResult });
      expect(r.status).toBe("VOID");
      expect(r.reason).toBe("requires_match_stats:half_time");
    });
  });

  describe("Tier 3 stats markets", () => {
    const withStats = {
      ...baseResult,
      corners: { home: 6, away: 4 },
      cards: { yellowHome: 2, yellowAway: 3, redHome: 0, redAway: 1 },
      penaltyAwarded: true,
    };
    it("CORNERS_OVER_UNDER OVER_9.5 wins with 10 corners", () => {
      expect(resolvePrediction({ market: "CORNERS_OVER_UNDER", prediction: "OVER_9.5", stakeUnits: 1, odds: 1.9, result: withStats }).status).toBe("WON");
    });
    it("CARDS_OVER_UNDER OVER_4.5 wins with 6 cards", () => {
      expect(resolvePrediction({ market: "CARDS_OVER_UNDER", prediction: "OVER_4.5", stakeUnits: 1, odds: 1.9, result: withStats }).status).toBe("WON");
    });
    it("RED_CARD_MATCH YES wins", () => {
      expect(resolvePrediction({ market: "RED_CARD_MATCH", prediction: "YES", stakeUnits: 1, odds: 3, result: withStats }).status).toBe("WON");
    });
    it("PENALTY_MATCH YES wins", () => {
      expect(resolvePrediction({ market: "PENALTY_MATCH", prediction: "YES", stakeUnits: 1, odds: 3, result: withStats }).status).toBe("WON");
    });
    it("CORNERS_OVER_UNDER voids when corners missing", () => {
      const r = resolvePrediction({ market: "CORNERS_OVER_UNDER", prediction: "OVER_9.5", stakeUnits: 1, odds: 2, result: baseResult });
      expect(r.reason).toBe("requires_match_stats:corners");
    });
  });

  describe("Player markets", () => {
    const withScorers = {
      ...baseResult,
      scorers: [
        { player: "Messi", team: "home" as const, minute: 12 },
        { player: "Suarez", team: "home" as const, minute: 35 },
        { player: "Mbappe", team: "away" as const, minute: 70 },
      ],
      bookedPlayers: ["Ramos"],
    };
    it("FIRST_GOAL_SCORER wins for Messi", () => {
      expect(resolvePrediction({ market: "FIRST_GOAL_SCORER", prediction: "Messi", stakeUnits: 1, odds: 8, result: withScorers }).status).toBe("WON");
    });
    it("ANYTIME_SCORER wins for Mbappe", () => {
      expect(resolvePrediction({ market: "ANYTIME_SCORER", prediction: "Mbappe", stakeUnits: 1, odds: 3, result: withScorers }).status).toBe("WON");
    });
    it("HAT_TRICK loses with 1 goal", () => {
      expect(resolvePrediction({ market: "HAT_TRICK", prediction: "Messi", stakeUnits: 1, odds: 25, result: withScorers }).status).toBe("LOST");
    });
    it("PLAYER_BOOKED wins for Ramos", () => {
      expect(resolvePrediction({ market: "PLAYER_BOOKED", prediction: "Ramos", stakeUnits: 1, odds: 3.5, result: withScorers }).status).toBe("WON");
    });
    it("FIRST_GOAL_SCORER voids on 0-0 (industry refund)", () => {
      const r = resolvePrediction({ market: "FIRST_GOAL_SCORER", prediction: "Messi", stakeUnits: 1, odds: 8, result: { ...baseResult, scorers: [], homeGoals: 0, awayGoals: 0, totalGoals: 0, bttsActual: false } });
      expect(r.status).toBe("VOID");
      expect(r.reason).toBe("no_goals_scored");
    });
  });

  describe("BTTS", () => {
    it("wins YES when both teams scored", () => {
      const r = resolvePrediction({
        market: "BTTS",
        prediction: "YES",
        stakeUnits: 1,
        odds: 1.8,
        result: { ...baseResult, bttsActual: true },
      });
      expect(r.status).toBe("WON");
      expect(r.roi).toBe(0.8);
    });

    it("loses NO when both teams scored", () => {
      const r = resolvePrediction({
        market: "BTTS",
        prediction: "NO",
        stakeUnits: 1,
        odds: 2.1,
        result: { ...baseResult, bttsActual: true },
      });
      expect(r.status).toBe("LOST");
    });

    it("voids on bad prediction string", () => {
      const r = resolvePrediction({
        market: "BTTS",
        prediction: "MAYBE",
        stakeUnits: 1,
        odds: 2,
        result: baseResult,
      });
      expect(r.status).toBe("VOID");
    });
  });
});
