import { NextRequest } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { getMLStatus } from "@/backend/lib/analysis/ml-client";

export async function GET(_request: NextRequest) {
  const status = await getMLStatus();
  const { getMLServiceManagerState } = await import("@/backend/lib/ml/ml-service-manager");
  return successResponse({
    ...status,
    manager: getMLServiceManagerState(),
  });
}
