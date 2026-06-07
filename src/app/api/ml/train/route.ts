import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const TrainRequestSchema = z.object({
  extract: z.boolean().optional().default(false),
  leagueId: z.string().trim().min(1).max(80).optional(),
  limit: z.number().int().min(10).max(1000).optional().default(100),
  trials: z.number().int().min(1).max(100).optional().default(30),
});

/**
 * POST /api/ml/train
 * Admin-only endpoint to trigger ML model training.
 * Body: { extract?: boolean, leagueId?: string, limit?: number, trials?: number }
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);
  if (session.user.role !== "ADMIN") return errorResponse(Errors.FORBIDDEN);

  const rateLimit = await checkRateLimit(session.user.id, "ml:train", 60, 5);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de entrenamiento." }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const validation = TrainRequestSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { extract, leagueId, limit, trials } = validation.data;
  const { runTraining, runExtraction } = await import("@/backend/lib/ml/trainer");

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
