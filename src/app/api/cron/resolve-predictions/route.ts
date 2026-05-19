import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { runResolveJob } from "@/backend/lib/analysis/resolve-job";

/**
 * GET /api/cron/resolve-predictions
 * System-scoped resolver. Runs over every user's OPEN predictions.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
 * when configured in vercel.json + env. We fail closed if the secret doesn't
 * match — never run unauthenticated since this writes to every user's data.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return errorResponse(Errors.INTERNAL_SERVER_ERROR);
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const summary = await runResolveJob();
  return successResponse(summary);
});

export const dynamic = "force-dynamic";
