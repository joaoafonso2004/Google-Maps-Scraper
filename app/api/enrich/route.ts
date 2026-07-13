import { NextResponse } from "next/server";
import { validateJsonRequest } from "@/lib/api-security";
import { enrichLead } from "@/lib/web-enrichment";
import type { Lead, SearchFilters } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const requestError = validateJsonRequest(request);
    if (requestError) return NextResponse.json({ error: requestError }, { status: 400 });
    const body = (await request.json()) as { lead: Lead; filters: SearchFilters };
    if (!body.lead || !body.filters || typeof body.lead.website !== "string" || body.lead.website.length > 2048) {
      return NextResponse.json({ error: "Resultado, website e filtros válidos são obrigatórios." }, { status: 400 });
    }
    const lead = await enrichLead(body.lead, body.filters);
    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível analisar o website." }, { status: 500 });
  }
}
