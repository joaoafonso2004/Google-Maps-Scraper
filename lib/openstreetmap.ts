import { getCategory } from "./catalog";
import { qualifyLead } from "./qualification";
import type { CategoryKey, Lead, SearchRequest } from "./types";

type NominatimResult = {
  boundingbox?: [string, string, string, string];
  display_name: string;
  name?: string;
  osm_id?: number;
  osm_type?: "node" | "way" | "relation";
  category?: string;
  extratags?: Record<string, string>;
};
type OsmElement = { id: number; type: "node" | "way" | "relation"; tags?: Record<string, string> };
type OverpassResponse = { elements?: OsmElement[] };

const geoCache = new Map<string, NominatimResult>();
const customSearchCache = new Map<string, { expiresAt: number; results: NominatimResult[] }>();
const overpassCache = new Map<string, { expiresAt: number; data: OverpassResponse }>();
const cacheTtlMs = 30 * 60 * 1_000;
const overpassEndpoints = (process.env.OVERPASS_ENDPOINTS
  ? process.env.OVERPASS_ENDPOINTS.split(",")
  : ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
).map((endpoint) => endpoint.trim()).filter(Boolean);
let nominatimQueue: Promise<void> = Promise.resolve();
let nextNominatimRequestAt = 0;
let overpassUnavailableUntil = 0;

const osmFilters: Record<Exclude<CategoryKey, "custom">, string[]> = {
  dental: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
  physio: ['["healthcare"="physiotherapist"]'],
  veterinary: ['["amenity"="veterinary"]', '["healthcare"="veterinary"]'],
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, 10_000) : 2_000;
}

async function fetchNominatim(url: URL, timeoutMs: number) {
  const task = nominatimQueue.then(async () => {
    await wait(Math.max(0, nextNominatimRequestAt - Date.now()));
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(url, {
        headers: { "User-Agent": "RadarLocal/0.1 (local lead research application)", "Accept-Language": "pt" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      nextNominatimRequestAt = Date.now() + 1_100;
      if (response.status !== 429 || attempt === 1) return response;
      await wait(retryDelay(response));
    }
    return response!;
  });
  nominatimQueue = task.then(() => undefined, () => undefined);
  return task;
}

async function fetchOverpass(query: string) {
  const cached = overpassCache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (overpassUnavailableUntil > Date.now()) throw new Error("Overpass temporariamente indisponível; a usar pesquisa alternativa.");
  let lastStatus: number | undefined;
  let lastError: unknown;

  for (const [index, endpoint] of overpassEndpoints.entries()) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RadarLocal/0.1 (local lead research application)" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(12_000),
      });
      lastStatus = response.status;
      if (response.ok) {
        const data = (await response.json()) as OverpassResponse;
        overpassUnavailableUntil = 0;
        overpassCache.set(query, { expiresAt: Date.now() + cacheTtlMs, data });
        return data;
      }
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (index < overpassEndpoints.length - 1) await wait(1_100);
  }

  overpassUnavailableUntil = Date.now() + 2 * 60 * 1_000;
  if (lastStatus) throw new Error(`Os servidores gratuitos estão temporariamente ocupados (${lastStatus}). A app já tentou uma alternativa; volta a tentar dentro de alguns minutos.`);
  throw new Error(lastError instanceof Error ? `Não foi possível contactar os servidores gratuitos: ${lastError.message}` : "Não foi possível contactar os servidores gratuitos.");
}

async function geocode(location: string) {
  const key = location.toLocaleLowerCase("pt");
  const cached = geoCache.get(key);
  if (cached) return cached;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${location}, Portugal`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const response = await fetchNominatim(url, 15_000);
  if (!response.ok) throw new Error(response.status === 429 ? "O serviço de localizações atingiu o limite temporário. Aguarda um minuto e tenta novamente." : `Não foi possível localizar ${location} no OpenStreetMap.`);
  const results = (await response.json()) as NominatimResult[];
  if (!results[0]?.boundingbox) throw new Error(`A localização “${location}” não foi encontrada.`);
  geoCache.set(key, results[0]);
  return results[0];
}

function queryFor(category: Exclude<CategoryKey, "custom">, bbox: string) {
  const clauses = osmFilters[category].flatMap((filter) => [
    `node${filter}(${bbox});`,
    `way${filter}(${bbox});`,
    `relation${filter}(${bbox});`,
  ]).join("\n");
  return `[out:json][timeout:25];(${clauses});out center tags 250;`;
}

function tag(tags: Record<string, string>, ...keys: string[]) {
  return keys.map((key) => tags[key]).find(Boolean);
}

function address(tags: Record<string, string>, fallback: string) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = tag(tags, "addr:city", "addr:town", "addr:village");
  return [street, city].filter(Boolean).join(", ") || fallback;
}

function createLead(input: {
  id: string;
  name: string;
  category: CategoryKey;
  address: string;
  area: string;
  tags: Record<string, string>;
  sourceUrl: string;
  filters: SearchRequest["filters"];
}) {
  const { id, name, category, area, tags, sourceUrl, filters } = input;
  const website = tag(tags, "website", "contact:website");
  const phone = tag(tags, "phone", "contact:phone", "mobile", "contact:mobile");
  const email = tag(tags, "email", "contact:email");
  const instagram = tag(tags, "contact:instagram", "instagram");
  const contact = Boolean(website || phone || email);
  const lead: Lead = {
    id,
    name,
    category,
    address: input.address,
    area,
    reviewCount: 0,
    reviewCountKnown: false,
    website,
    phone,
    email,
    instagram,
    mapsUrl: sourceUrl,
    verifiedAt: new Date().toISOString(),
    source: "osm",
    score: 0,
    qualification: "review",
    qualificationReasons: [],
    signals: {
      professionals: { status: "unverified", label: "Profissionais", detail: "É necessário analisar o website da empresa." },
      reception: { status: "unverified", label: "Receção própria", detail: "É necessário analisar o website ou confirmar por telefone." },
      ownerPresent: { status: "unverified", label: "Dono presente", detail: "É necessário analisar fontes públicas da empresa." },
      noItTeam: { status: "unverified", label: "Sem equipa de IT", detail: "Não pode ser inferido a partir do OpenStreetMap." },
      noApp: { status: "unverified", label: "Sem app própria", detail: "Esta fonte não permite confirmar a existência de uma aplicação própria.", sourceUrl },
      manualContact: { status: phone && !email && !website ? "probable" : "unverified", label: "Contacto/processo manual", detail: phone && !email && !website ? "O telefone é o único canal estruturado publicado nesta fonte; confirmar marcações e atendimento manuais." : "É necessário analisar o website para procurar marcação online, portal ou automações.", sourceUrl },
      publicContact: { status: contact ? "confirmed" : "unverified", label: "Contacto público", detail: contact ? "Contacto empresarial publicado no OpenStreetMap." : "Contacto não encontrado.", sourceUrl },
      operational: { status: tags.opening_hours ? "probable" : "unverified", label: "Operacional", detail: tags.opening_hours ? "Horário de funcionamento publicado no OpenStreetMap." : "Estado operacional por confirmar.", sourceUrl },
      websiteQuality: { status: website ? "unverified" : "probable", label: "Website simples", detail: website ? "Website ainda não analisado." : "Website próprio não publicado nesta fonte.", sourceUrl },
    },
  };
  return qualifyLead(lead, { ...filters, requireReviewRange: false });
}

async function searchNominatimLocation(request: SearchRequest, location: string, query: string) {
  const cacheKey = `${request.category}|${query.toLocaleLowerCase("pt")}|${location.toLocaleLowerCase("pt")}`;
  const cached = customSearchCache.get(cacheKey);
  let results = cached && cached.expiresAt > Date.now() ? cached.results : undefined;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${query}, ${location}, Portugal`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "40");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  if (!results) {
    const response = await fetchNominatim(url, 12_000);
    if (!response.ok) throw new Error(response.status === 429 ? "O serviço de pesquisa gratuita atingiu o limite temporário. Aguarda um minuto e tenta novamente." : `O serviço gratuito está ocupado (${response.status}). Tenta novamente dentro de alguns minutos.`);
    results = (await response.json()) as NominatimResult[];
    customSearchCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, results });
  }
  const leads: Lead[] = [];
  for (const result of results) {
    if (!result.osm_id || !result.osm_type || result.category === "boundary" || result.category === "place") continue;
    const name = result.name || result.display_name.split(",")[0]?.trim();
    if (!name) continue;
    const sourceUrl = `https://www.openstreetmap.org/${result.osm_type}/${result.osm_id}`;
    const lead = createLead({
      id: `osm-${result.osm_type}-${result.osm_id}`,
      name,
      category: request.category,
      address: result.display_name,
      area: location,
      tags: result.extratags ?? {},
      sourceUrl,
      filters: request.filters,
    });
    leads.push(lead);
  }
  return leads;
}

async function searchCustomOpenStreetMap(request: SearchRequest, locations: string[]) {
  const query = request.customQuery?.trim();
  if (!query) throw new Error("Indica o tipo de negócio a pesquisar.");
  const unique = new Map<string, Lead>();

  for (let index = 0; index < locations.length; index += 1) {
    if (index > 0) await wait(1_100);
    const leads = await searchNominatimLocation(request, locations[index], query);
    for (const lead of leads) unique.set(lead.id, lead);
  }
  return [...unique.values()];
}

export async function searchOpenStreetMap(request: SearchRequest): Promise<Lead[]> {
  if (request.locationMode === "country") throw new Error("Para proteger o serviço gratuito, seleciona uma área ou cidades específicas em vez de Portugal inteiro.");
  const locations = request.locations.slice(0, 3);
  if (request.category === "custom") return searchCustomOpenStreetMap(request, locations);
  const unique = new Map<string, Lead>();
  for (let index = 0; index < locations.length; index += 1) {
    if (index > 0) await wait(1_100);
    const location = locations[index];
    const geo = await geocode(location);
    const [south, north, west, east] = geo.boundingbox!;
    const query = queryFor(request.category, `${south},${west},${north},${east}`);
    let data: OverpassResponse;
    try {
      data = await fetchOverpass(query);
    } catch (overpassError) {
      const fallbackLeads = await searchNominatimLocation(request, location, getCategory(request.category).query);
      if (!fallbackLeads.length) throw overpassError;
      for (const lead of fallbackLeads) unique.set(lead.id, lead);
      continue;
    }
    for (const element of data.elements ?? []) {
      const tags = element.tags ?? {};
      if (!tags.name) continue;
      const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
      const lead = createLead({
        id: `osm-${element.type}-${element.id}`,
        name: tags.name,
        category: request.category,
        address: address(tags, location),
        area: location,
        tags,
        sourceUrl,
        filters: request.filters,
      });
      unique.set(lead.id, lead);
    }
  }
  return [...unique.values()];
}
