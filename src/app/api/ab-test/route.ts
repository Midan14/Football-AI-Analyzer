import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/ab-test
 * A/B testing for model variants
 * Body: { variant: "A" | "B", fixtureId: string, prediction: string }
 * 
 * Variant A: Standard ensemble
 * Variant B: ML-enhanced ensemble with feature selection
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const body = await request.json();
  const { variant, fixtureId, prediction } = body;

  if (!variant || !fixtureId || !prediction) {
    return errorResponse({ code: "MISSING_FIELDS", message: "variant, fixtureId, prediction requeridos" }, 400);
  }

  // Track which variant was used
  const abTest = await prisma.systemMetric.create({
    data: {
      metric: "ab-test",
      value: variant === "A" ? 0 : 1,
      tags: {
        userId: session.user.id,
        fixtureId,
        prediction,
        variant,
      },
    },
  });

  return successResponse({
    abTestId: abTest.id,
    variant,
    fixtureId,
    prediction,
    message: variant === "A"
      ? "Usando ensemble estándar (Poisson + NegBin + ELO + Forma)"
      : "Usando ensemble ML-enhanced (con feature selection automática)",
  });
});

/**
 * GET /api/ab-test/results
 * Get A/B test results for the user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const tests = await prisma.systemMetric.findMany({
    where: {
      metric: "ab-test",
      tags: { path: ["userId"], equals: session.user.id },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const variantA = tests.filter(t => t.value === 0).length;
  const variantB = tests.filter(t => t.value === 1).length;

  return successResponse({
    totalTests: tests.length,
    variantA: { count: variantA, pct: Math.round((variantA / tests.length) * 100) || 0 },
    variantB: { count: variantB, pct: Math.round((variantB / tests.length) * 100) || 0 },
    recommendation: variantA > variantB * 1.2
      ? "Variante A (ensemble estándar) muestra mejor rendimiento"
      : variantB > variantA * 1.2
      ? "Variante B (ML-enhanced) muestra mejor rendimiento"
      : "Rendimiento similar entre variantes",
  });
});
