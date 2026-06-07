import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { getFixtureBookmakerOdds } from "@/backend/lib/odds/bookmaker-odds-service";
import { compareBookmakerOdds } from "@/backend/lib/odds/odds-intelligence";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "odds-intelligence:compare", 60, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId")?.trim();
  if (!fixtureId) {
    return errorResponse({ code: "VALIDATION_ERROR", message: "fixtureId es requerido" }, 400);
  }

  const bookmakerA = url.searchParams.get("bookmakerA") ?? undefined;
  const bookmakerB = url.searchParams.get("bookmakerB") ?? undefined;

  const bookmakers = await getFixtureBookmakerOdds(fixtureId);
  if (Object.keys(bookmakers).length === 0) {
    return errorResponse(
      { code: "NOT_FOUND", message: "No hay cuotas multi-bookmaker para este partido." },
      404
    );
  }

  let fixtureName = fixtureId;
  try {
    const fixture = await getDataProvider().getMatch(fixtureId);
    fixtureName = `${fixture.home.name} vs ${fixture.away.name}`;
  } catch {
    // non-fatal
  }

  const compare = compareBookmakerOdds(fixtureId, bookmakers, bookmakerA, bookmakerB);

  return successResponse({
    fixtureId,
    fixtureName,
    compare,
  });
});
