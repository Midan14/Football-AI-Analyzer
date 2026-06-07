import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { getLineMovementForFixture } from "@/backend/lib/odds/odds-snapshot-service";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "odds-intelligence:movements", 60, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId")?.trim();
  const threshold = Number.parseFloat(url.searchParams.get("threshold") ?? "5");

  if (!fixtureId) {
    return errorResponse({ code: "VALIDATION_ERROR", message: "fixtureId es requerido" }, 400);
  }

  const movements = await getLineMovementForFixture(fixtureId, threshold);

  let fixtureName = fixtureId;
  try {
    const fixture = await getDataProvider().getMatch(fixtureId);
    fixtureName = `${fixture.home.name} vs ${fixture.away.name}`;
  } catch {
    // non-fatal
  }

  return successResponse({
    fixtureId,
    fixtureName,
    threshold,
    movements,
  });
});
