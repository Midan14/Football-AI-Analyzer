import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { getTrainingStatus } from "@/backend/lib/ml/trainer";
import { prisma } from "@/lib/db";

/**
 * GET /api/ml/status
 * Returns current ML training status and dataset size.
 */
export const GET = withErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const status = await getTrainingStatus();
  const samples = await prisma.trainingData.count();

  return successResponse({
    status,
    dataset: { totalSamples: samples },
    nextAutoTrain: "Sundays at 03:00 UTC",
  });
});
