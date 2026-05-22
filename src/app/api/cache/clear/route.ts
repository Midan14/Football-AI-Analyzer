import { auth } from "@/auth";
import { cache } from "@/lib/cache";
import { Errors, errorResponse, successResponse, withErrorHandling } from "@/lib/api-utils";

export const POST = withErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  await cache.clear();
  return successResponse({ cleared: true });
});
