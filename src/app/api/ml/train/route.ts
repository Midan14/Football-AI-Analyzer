import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { runTraining, runExtraction } from "@/backend/lib/ml/trainer";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/ml/train
 * Admin-only endpoint to trigger ML model training.
 * Body: { extract?: boolean, leagueId?: string, limit?: number, trials?: number }
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "ml:train", 60, 5);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de entrenamiento." }, 429);
  }

  // Allow any authenticated user for now; restrict to ADMIN if needed
  const body = await request.json().catch(() => ({}));
  const { extract = false, leagueId, limit = 100, trials = 30 } = body;

  // Optionally extract new data before training
  if (extract) {
    const extraction = await runExtraction({ leagueId, limit });
    if (extraction.error) {
      return successResponse({
        extraction,
        training: { status: "error", message: "Extracción falló. Entrenamiento cancelado." },
      }, 422);
    }
  }

  // Trigger training (non-blocking response with initial status)
  const status = await runTraining({ minSamples: 200, trials });
  return successResponse({ status });
});
