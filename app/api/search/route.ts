import { NextResponse } from "next/server";
import { validateJsonRequest } from "@/lib/api-security";
import { getCategory } from "@/lib/catalog";
import { getDemoLeads } from "@/lib/demo";
import { searchGooglePlaces } from "@/lib/google-places";
import { searchOpenStreetMap } from "@/lib/openstreetmap";
import { validateSearchRequest } from "@/lib/search-validation";
import type { Lead, SearchRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const requestError = validateJsonRequest(request);
    if (requestError) return NextResponse.json({ error: requestError }, { status: 400 });
    const validation = validateSearchRequest(await request.json());
    if (!validation.data) return NextResponse.json({ error: validation.error }, { status: 400 });
    const body = validation.data;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const results: Lead[] = [];
    const googleRequestLimit = Math.max(1, Math.floor(12 / body.categories.length));

    for (const [categoryIndex, category] of body.categories.entries()) {
      const categoryFilters = getCategory(category).professionalLabel
        ? body.filters
        : { ...body.filters, minProfessionals: 0, maxProfessionals: 99 };
      const categoryRequest: SearchRequest = { ...body, category, filters: categoryFilters };

      if (body.provider === "osm") {
        if (categoryIndex > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
        results.push(...await searchOpenStreetMap(categoryRequest));
      } else if (apiKey) {
        results.push(...await searchGooglePlaces(categoryRequest, apiKey, googleRequestLimit));
      } else {
        results.push(...body.locations.flatMap((location, locationIndex) =>
          getDemoLeads(category, location, categoryFilters).map((lead) => ({
            ...lead,
            id: `${category}-${lead.id}-${locationIndex}`,
          })),
        ));
      }
    }

    const leads = [...new Map(results.map((lead) => [`${lead.source}:${lead.id}`, lead])).values()];
    const sectorNotice = body.categories.length > 1 ? ` Pesquisa combinada em ${body.categories.length} setores.` : "";
    return NextResponse.json({
      leads,
      mode: body.provider === "osm" ? "free" : apiKey ? "live" : "demo",
      searchedAt: new Date().toISOString(),
      notice: body.provider === "osm" ? `Resultados gratuitos do OpenStreetMap. Avaliações Google ficam por validar.${sectorNotice}` : apiKey ? sectorNotice.trim() || undefined : `Modo demonstração: adiciona GOOGLE_PLACES_API_KEY ao ficheiro .env.local para obter resultados reais.${sectorNotice}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a pesquisa." }, { status: 500 });
  }
}
