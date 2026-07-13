import type { CategoryKey, SearchFilters, SearchRequest } from "./types";

const providers = new Set(["osm", "google"]);
const categories = new Set<CategoryKey>(["dental", "physio", "car_dealer", "custom"]);
const locationModes = new Set(["country", "area", "cities"]);
const booleanFilters: (keyof SearchFilters)[] = [
  "requireReviewRange", "requireOperational", "requirePublicContact", "requireReception",
  "requireOwnerPresent", "requireNoItTeam", "acceptProbable",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function validateSearchRequest(value: unknown): { data?: SearchRequest; error?: string } {
  if (!isRecord(value)) return { error: "O pedido de pesquisa é inválido." };
  if (typeof value.provider !== "string" || !providers.has(value.provider)) return { error: "Seleciona uma fonte de pesquisa válida." };
  if (typeof value.category !== "string" || !categories.has(value.category as CategoryKey)) return { error: "Seleciona uma categoria válida." };
  if (value.provider === "osm" && value.category === "custom") return { error: "A pesquisa personalizada requer a fonte Google." };
  if (typeof value.locationMode !== "string" || !locationModes.has(value.locationMode)) return { error: "Seleciona um modo de localização válido." };
  if (typeof value.area !== "string" || !value.area.trim() || value.area.length > 120) return { error: "Indica uma área de pesquisa válida." };
  if (!Array.isArray(value.locations) || !value.locations.length || value.locations.some((item) => typeof item !== "string" || !item.trim() || item.length > 120)) {
    return { error: "Seleciona pelo menos uma localização válida." };
  }
  const maxLocations = value.provider === "osm" ? 3 : 8;
  if (value.locations.length > maxLocations) return { error: `Pesquisa no máximo ${maxLocations} localizações de cada vez.` };
  if (!finiteNumber(value.maxPages, 1, 3) || !Number.isInteger(value.maxPages)) return { error: "A profundidade da pesquisa é inválida." };
  const filters = value.filters;
  if (!isRecord(filters)) return { error: "Os filtros são obrigatórios." };
  if (booleanFilters.some((key) => typeof filters[key] !== "boolean")) return { error: "Os filtros booleanos são inválidos." };
  const numericKeys: (keyof SearchFilters)[] = ["minReviews", "maxReviews", "minProfessionals", "maxProfessionals"];
  if (numericKeys.some((key) => !finiteNumber(filters[key], 0, 1_000_000) || !Number.isInteger(filters[key]))) return { error: "Os intervalos dos filtros são inválidos." };
  if ((filters.minReviews as number) > (filters.maxReviews as number) || (filters.minProfessionals as number) > (filters.maxProfessionals as number)) {
    return { error: "O mínimo de um filtro não pode ser superior ao máximo." };
  }
  if (value.category === "custom" && (typeof value.customQuery !== "string" || !value.customQuery.trim() || value.customQuery.length > 120)) {
    return { error: "Indica um tipo de negócio válido para a pesquisa personalizada." };
  }
  return { data: value as unknown as SearchRequest };
}
