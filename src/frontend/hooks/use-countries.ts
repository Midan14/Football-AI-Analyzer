import type { Country } from "@/shared/domain";
import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type CountriesPayload = {
  countries: Country[];
  provider: string;
};

async function fetchCountriesPayload(): Promise<CountriesPayload> {
  const response = await fetch("/api/countries");
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al cargar países" }));
    throw new Error(error.error?.message ?? error.error ?? `Error ${response.status}`);
  }
  return unwrapApiData(await response.json() as CountriesPayload);
}

export function useCountries() {
  return useQuery<CountriesPayload, Error>({
    queryKey: ["countries"],
    queryFn: fetchCountriesPayload,
  });
}
