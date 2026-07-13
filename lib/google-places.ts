import { getCategory } from "./catalog";
import { qualifyLead } from "./qualification";
import type { Lead, SearchRequest } from "./types";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  businessStatus?: string;
};

type GoogleResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
};

const fieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

export async function searchGooglePlaces(request: SearchRequest, apiKey: string): Promise<Lead[]> {
  const config = getCategory(request.category);
  const query = request.category === "custom" ? request.customQuery?.trim() : config.query;
  if (!query) throw new Error("Indica o tipo de negócio a pesquisar.");

  const all = new Map<string, { place: GooglePlace; area: string }>();
  const pages = Math.max(1, Math.min(request.maxPages, 3));
  const locations = (request.locations?.length ? request.locations : [request.area]).slice(0, 8);
  let requestsMade = 0;

  for (const location of locations) {
    let pageToken: string | undefined;
    for (let page = 0; page < pages && requestsMade < 12; page += 1) {
      const body: Record<string, unknown> = {
        textQuery: `${query} em ${location}, Portugal`,
        languageCode: "pt",
        regionCode: "PT",
        pageSize: 20,
      };
      if (pageToken) body.pageToken = pageToken;

      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      requestsMade += 1;
      const data = (await response.json()) as GoogleResponse;
      if (!response.ok) {
        throw new Error(data.error?.message || `A Google Places API respondeu com ${response.status}.`);
      }
      for (const place of data.places ?? []) all.set(place.id, { place, area: location });
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  }

  const checkedAt = new Date().toISOString();
  return [...all.values()]
    .map(({ place, area }): Lead => {
      const operational = place.businessStatus === "OPERATIONAL";
      const hasContact = Boolean(place.nationalPhoneNumber || place.websiteUri);
      const base: Lead = {
        id: place.id,
        name: place.displayName?.text || "Sem nome",
        category: request.category,
        address: place.formattedAddress || "Morada não encontrada",
        area,
        rating: place.rating,
        reviewCount: place.userRatingCount ?? 0,
        reviewCountKnown: true,
        website: place.websiteUri,
        phone: place.nationalPhoneNumber,
        mapsUrl: place.googleMapsUri,
        businessStatus: place.businessStatus,
        verifiedAt: checkedAt,
        source: "google",
        score: 0,
        qualification: "review",
        qualificationReasons: [],
        signals: {
          professionals: { status: "unverified", label: "Profissionais", detail: "É necessário analisar o website da empresa." },
          reception: { status: "unverified", label: "Receção própria", detail: "É necessário analisar o website ou confirmar por telefone." },
          ownerPresent: { status: "unverified", label: "Dono presente", detail: "É necessário analisar fontes públicas da empresa." },
          noItTeam: { status: "unverified", label: "Sem equipa de IT", detail: "A ausência de uma equipa de IT não pode ser provada nesta fonte." },
          noApp: { status: "unverified", label: "Sem app própria", detail: "A Google Places não indica se a empresa tem uma aplicação própria.", sourceUrl: place.googleMapsUri },
          manualContact: { status: place.nationalPhoneNumber && !place.websiteUri ? "probable" : "unverified", label: "Contacto/processo manual", detail: place.nationalPhoneNumber && !place.websiteUri ? "O telefone é o único canal direto devolvido e não foi encontrado website; confirmar se marcações e pedidos são manuais." : "É necessário analisar o website para procurar marcação online, portal ou automações.", sourceUrl: place.googleMapsUri },
          publicContact: { status: hasContact ? "confirmed" : "unverified", label: "Contacto público", detail: hasContact ? "Website ou telefone devolvido pela Google Places API." : "Nenhum contacto público devolvido." , sourceUrl: place.googleMapsUri },
          operational: { status: operational ? "confirmed" : place.businessStatus ? "contradicted" : "unverified", label: "Operacional", detail: place.businessStatus ? `Estado: ${place.businessStatus}.` : "Estado não disponibilizado.", sourceUrl: place.googleMapsUri },
          websiteQuality: { status: place.websiteUri ? "unverified" : "probable", label: "Website simples", detail: place.websiteUri ? "Website ainda não analisado." : "Não foi devolvido um website próprio.", sourceUrl: place.websiteUri },
        },
      };
      return qualifyLead(base, request.filters);
    })
    .filter((lead) => lead.reviewCount >= request.filters.minReviews && lead.reviewCount <= request.filters.maxReviews);
}
