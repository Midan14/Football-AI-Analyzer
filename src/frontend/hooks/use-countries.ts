import { useQuery } from "@tanstack/react-query";
import type { Country } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

async function fetchCountries(): Promise<Country[]> {
  const response = await fetch("/api/countries");
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al cargar países" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  const data = unwrapApiData(await response.json() as { countries: Country[] });
  return data.countries;
}

export function useCountries() {
  return useQuery<Country[], Error>({
    queryKey: ["countries"],
    queryFn: fetchCountries,
  });
}
