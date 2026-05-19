import { NextRequest } from "next/server";
import { getAnalysisHistory } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveAnalysisHistory } from "@/backend/lib/analysis/analysis-history-resolver";

/**
 * GET /api/analysis-history
 * Returns the authenticated user's persisted analysis history.
 * Query params:
 *   limit  — max records to return (default 20, max 100)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const rateLimit = await checkRateLimit(session.user.id, "analysis-history", 30, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? "20", 10) || 20));

  const resolveSummary = await resolveAnalysisHistory(session.user.id, { limit: 25 });
  const analyses = await getAnalysisHistory(session.user.id, limit);

  return successResponse({ analyses, resolved: resolveSummary });
});
