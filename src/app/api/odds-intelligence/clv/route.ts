import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserClvSummary } from "@/backend/lib/odds/clv-service";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "odds-intelligence:clv", 30, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const summary = await getUserClvSummary(session.user.id);
  return successResponse(summary);
});
