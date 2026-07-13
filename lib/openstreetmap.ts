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

const osmFilters: Record<Exclude<CategoryKey, "custom">, string[]> = {
  dental: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
  physio: ['["healthcare"="physiotherapist"]'],
  car_dealer: ['["shop"="car"]'],
};

async function geocode(location: string) {
  const key = location.toLocaleLowerCase("pt");
  const cached = geoCache.get(key);
  if (cached) return cached;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${location}, Portugal`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": "RadarLocal/0.1 (local lead research application)", "Accept-Language": "pt" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Não foi possível localizar ${location} no OpenStreetMap.`);
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

async function searchCustomOpenStreetMap(request: SearchRequest, locations: string[]) {
  const query = request.customQuery?.trim();
  if (!query) throw new Error("Indica o tipo de negócio a pesquisar.");
  const unique = new Map<string, Lead>();

  for (let index = 0; index < locations.length; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
    const location = locations[index];
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${query}, ${location}, Portugal`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "40");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("namedetails", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": "RadarLocal/0.1 (local lead research application)", "Accept-Language": "pt" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`O serviço gratuito está ocupado (${response.status}). Tenta novamente dentro de alguns minutos.`);
    const results = (await response.json()) as NominatimResult[];
    for (const result of results) {
      if (!result.osm_id || !result.osm_type || result.category === "boundary" || result.category === "place") continue;
      const name = result.name || result.display_name.split(",")[0]?.trim();
      if (!name) continue;
      const sourceUrl = `https://www.openstreetmap.org/${result.osm_type}/${result.osm_id}`;
      const lead = createLead({
        id: `osm-${result.osm_type}-${result.osm_id}`,
        name,
        category: "custom",
        address: result.display_name,
        area: location,
        tags: result.extratags ?? {},
        sourceUrl,
        filters: request.filters,
      });
      unique.set(lead.id, lead);
    }
  }
  return [...unique.values()];
}

export async function searchOpenStreetMap(request: SearchRequest): Promise<Lead[]> {
  if (request.locationMode === "country") throw new Error("Para proteger o serviço gratuito, seleciona uma área ou cidades específicas em vez de Portugal inteiro.");
  const locations = request.locations.slice(0, 3);
  if (request.category === "custom") return searchCustomOpenStreetMap(request, locations);
  const unique = new Map<string, Lead>();
  for (let index = 0; index < locations.length; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
    const location = locations[index];
    const geo = await geocode(location);
    const [south, north, west, east] = geo.boundingbox!;
    const query = queryFor(request.category, `${south},${west},${north},${east}`);
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RadarLocal/0.1 (local lead research application)" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok) throw new Error(`O serviço gratuito está ocupado (${response.status}). Tenta novamente dentro de alguns minutos.`);
    const data = (await response.json()) as OverpassResponse;
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
