"use client";

import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type MLStatusPayload = {
  available: boolean;
  models: string[];
  metadata?: Record<string, unknown>;
  extended_libraries?: Record<string, boolean>;
  extended_ready?: boolean;
};

async function fetchMLStatus(): Promise<MLStatusPayload> {
  const response = await fetch("/api/ml/status");
  if (!response.ok) {
    throw new Error(`Error al consultar ML status (${response.status})`);
  }
  return unwrapApiData(await response.json());
}

export function useMLStatus(options?: { enabled?: boolean }) {
  return useQuery<MLStatusPayload, Error>({
    queryKey: ["ml-status"],
    queryFn: fetchMLStatus,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
