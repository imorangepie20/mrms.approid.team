import type { EmsScreen, EmsSectionsResponse } from "@/lib/ems/sections";

export async function fetchEmsSections(
  screen: EmsScreen,
  sectionLimit: number,
  signal?: AbortSignal,
): Promise<EmsSectionsResponse> {
  const params = new URLSearchParams({
    limit: "12",
    region: "KR",
    screen,
    sectionLimit: String(sectionLimit),
  });
  const response = await fetch(`/api/ems/sections?${params}`, { signal });
  if (!response.ok) throw new Error("ems_sections_failed");
  return response.json() as Promise<EmsSectionsResponse>;
}
