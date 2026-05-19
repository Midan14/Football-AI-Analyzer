import { SportmonksProvider } from "@/backend/lib/providers/sportmonks-provider";
import { ApiFootballProvider } from "@/backend/lib/providers/api-football-provider";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";
import { ScrapingProvider } from "@/backend/lib/providers/scraping-provider";

export const DEFAULT_DATA_PROVIDER = "api-football";

export function getActiveProviderName() {
  return process.env.DATA_PROVIDER ?? DEFAULT_DATA_PROVIDER;
}

export function getDataProvider() {
  const provider = getActiveProviderName();

  if (provider === "sportmonks") {
    return new SportmonksProvider();
  }

  if (provider === "demo") {
    return new DemoProvider();
  }

  if (provider === "scraping") {
    return new ScrapingProvider();
  }

  if (provider === "api-football") {
    return new ApiFootballProvider();
  }

  throw new Error(`Unsupported DATA_PROVIDER: ${provider}`);
}
