import { checkHealth, setStartupTime } from "@/backend/server/health-service";
import { withErrorHandling, successResponse, errorResponse } from "@/lib/api-utils";

setStartupTime();

export const GET = withErrorHandling(async () => {
  try {
    const health = await checkHealth();

    const statusCode =
      health.status === "unhealthy" ? 503 : health.status === "degraded" ? 200 : 200;

    return successResponse(health, statusCode);
  } catch {
    return errorResponse("Health check failed", 500);
  }
});
