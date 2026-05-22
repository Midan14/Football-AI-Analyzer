import { NextRequest } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { getMLStatus } from "@/backend/lib/analysis/ml-client";

export async function GET(_request: NextRequest) {
  const status = await getMLStatus();
  return successResponse(status);
}
