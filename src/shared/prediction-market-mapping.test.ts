import { describe, expect, it } from "vitest";
import { mapRecommendationMarket, normalizeRecommendationMarket, predictionMarketKey } from "./prediction-market-mapping";

describe("prediction market mapping", () => {
  it("maps recommendation labels to stored prediction markets", () => {
    expect(mapRecommendationMarket("Local gana")).toEqual({ market: "WIN_1X2", prediction: "HOME_WIN" });
    expect(mapRecommendationMarket("Over 2.5")).toEqual({ market: "OVER_UNDER", prediction: "OVER_2.5" });
    expect(mapRecommendationMarket("BTTS Sí")).toEqual({ market: "BTTS", prediction: "YES" });
  });

  it("normalizes no-odds fallback labels before mapping", () => {
    expect(normalizeRecommendationMarket("Sin cuota real disponible (Visitante gana)")).toBe("Visitante gana");
    expect(predictionMarketKey("Sin cuota real disponible (Visitante gana)")).toBe("WIN_1X2");
  });
});
