import { NextResponse } from "next/server";
import { validateJsonRequest } from "@/lib/api-security";
import { getDemoLeads } from "@/lib/demo";
import { searchGooglePlaces } from "@/lib/google-places";
import { searchOpenStreetMap } from "@/lib/openstreetmap";
import { validateSearchRequest } from "@/lib/search-validation";

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
    const leads = body.provider === "osm"
      ? await searchOpenStreetMap(body)
      : apiKey
        ? await searchGooglePlaces(body, apiKey)
        : body.locations.flatMap((location, index) => getDemoLeads(body.category, location, body.filters).map((lead) => ({ ...lead, id: `${lead.id}-${index}` })));
    return NextResponse.json({
      leads,
      mode: body.provider === "osm" ? "free" : apiKey ? "live" : "demo",
      searchedAt: new Date().toISOString(),
      notice: body.provider === "osm" ? "Resultados gratuitos do OpenStreetMap. Avaliações Google ficam por validar." : apiKey ? undefined : "Modo demonstração: adiciona GOOGLE_PLACES_API_KEY ao ficheiro .env.local para obter resultados reais.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a pesquisa." }, { status: 500 });
  }
}
