import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { runResolveJob } from "@/backend/lib/analysis/resolve-job";

/**
 * POST /api/predictions/resolve
 * Resolve OPEN predictions for the authenticated user.
 */
export const POST = withErrorHandling(async (_request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const summary = await runResolveJob({ userId: session.user.id });
  return successResponse(summary);
});
