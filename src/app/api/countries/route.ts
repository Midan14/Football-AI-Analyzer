import { NextRequest } from "next/server";
import { listCountries } from "@/backend/server/football/football-service";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

function allowDemoFallback(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_FALLBACK === "true";
}

export const GET = withErrorHandling(async (_request: NextRequest) => {
  const cached = await cache.get(cacheKeys.countries());
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await listCountries();
    await cache.set(cacheKeys.countries(), data, 86400);
    return successResponse(data);
  } catch (error) {
    captureException(error, { endpoint: "/api/countries" });
    if (allowDemoFallback()) {
      const demo = new DemoProvider();
      const data = { provider: "demo-fallback" as const, countries: await demo.getCountries() };
      await cache.set(cacheKeys.countries(), data, 300);
      return successResponse(data);
    }
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
