import { qualifyLead } from "./qualification";
import type { CategoryKey, Lead, SearchFilters } from "./types";

const now = () => new Date().toISOString();

function demoLead(input: Partial<Lead> & Pick<Lead, "id" | "name" | "reviewCount">, category: CategoryKey): Lead {
  return {
    id: input.id,
    name: input.name,
    category,
    address: input.address ?? "Avenida Central, Lisboa",
    area: input.area ?? "Lisboa",
    rating: input.rating ?? 4.7,
    reviewCount: input.reviewCount,
    reviewCountKnown: true,
    website: input.website ?? "https://example.com",
    phone: input.phone ?? "+351 210 000 000",
    email: input.email,
    instagram: input.instagram,
    mapsUrl: input.mapsUrl,
    businessStatus: "OPERATIONAL",
    verifiedAt: now(),
    source: "demo",
    score: 0,
    qualification: "review",
    qualificationReasons: [],
    signals: input.signals ?? {
      professionals: { status: "confirmed", label: "Profissionais", count: 4, detail: "4 profissionais identificados na página Equipa.", sourceUrl: "https://example.com/equipa" },
      reception: { status: "probable", label: "Receção própria", detail: "O website menciona receção e atendimento presencial.", sourceUrl: "https://example.com/contactos" },
      ownerPresent: { status: "confirmed", label: "Dono presente", detail: "Fundador apresentado também como diretor clínico.", sourceUrl: "https://example.com/sobre" },
      noItTeam: { status: "probable", label: "Sem equipa de IT", detail: "Equipa publicada é pequena e exclusivamente operacional; ausência não pode ser provada automaticamente.", sourceUrl: "https://example.com/equipa" },
      publicContact: { status: "confirmed", label: "Contacto público", detail: "Telefone público encontrado.", sourceUrl: "https://example.com/contactos" },
      operational: { status: "confirmed", label: "Operacional", detail: "Estado OPERATIONAL devolvido pela fonte.", sourceUrl: "https://example.com" },
      websiteQuality: { status: "probable", label: "Website simples", detail: "Website pequeno com estrutura básica.", sourceUrl: "https://example.com" },
    },
  };
}

export function getDemoLeads(category: CategoryKey, area: string, filters: SearchFilters): Lead[] {
  const label = category === "car_dealer" ? "Auto" : category === "physio" ? "Movimento" : "Clínica";
  const leads = [
    demoLead({ id: "demo-1", name: `${label} Aurora`, reviewCount: 184, area, address: `Rua Central, ${area}`, phone: "+351 912 345 678", email: "geral@example.com", instagram: "@clinicaaurora" }, category),
    demoLead({ id: "demo-2", name: `${label} do Jardim`, reviewCount: 67, area, address: `Avenida da República, ${area}`, signals: {
      professionals: { status: "probable", label: "Profissionais", count: 3, detail: "3 perfis profissionais encontrados.", sourceUrl: "https://example.com/equipa" },
      reception: { status: "unverified", label: "Receção própria", detail: "Não há evidência pública suficiente." },
      ownerPresent: { status: "probable", label: "Dono presente", detail: "O gerente assina a apresentação da empresa.", sourceUrl: "https://example.com/sobre" },
      noItTeam: { status: "probable", label: "Sem equipa de IT", detail: "Nenhuma função tecnológica aparece na equipa publicada.", sourceUrl: "https://example.com/equipa" },
      publicContact: { status: "confirmed", label: "Contacto público", detail: "Telefone encontrado no website.", sourceUrl: "https://example.com/contactos" },
      operational: { status: "confirmed", label: "Operacional", detail: "Estado OPERATIONAL devolvido pela fonte." },
      websiteQuality: { status: "probable", label: "Website simples", detail: "Website institucional básico.", sourceUrl: "https://example.com" },
    } }, category),
    demoLead({ id: "demo-3", name: `${label} Horizonte`, reviewCount: 1214, area, address: `Praça Nova, ${area}` }, category),
    demoLead({ id: "demo-4", name: `${label} Norte`, reviewCount: 43, area, address: `Rua do Mercado, ${area}`, signals: {
      professionals: { status: "confirmed", label: "Profissionais", count: 8, detail: "8 profissionais identificados.", sourceUrl: "https://example.com/equipa" },
      reception: { status: "confirmed", label: "Receção própria", detail: "Receção identificada no website.", sourceUrl: "https://example.com/contactos" },
      ownerPresent: { status: "unverified", label: "Dono presente", detail: "Não há evidência pública suficiente." },
      noItTeam: { status: "unverified", label: "Sem equipa de IT", detail: "Não há uma página de equipa completa." },
      publicContact: { status: "confirmed", label: "Contacto público", detail: "Telefone público encontrado." },
      operational: { status: "confirmed", label: "Operacional", detail: "Estado OPERATIONAL devolvido pela fonte." },
      websiteQuality: { status: "probable", label: "Website simples", detail: "Website institucional básico." },
    } }, category),
  ];
  return leads.map((lead) => qualifyLead(lead, filters));
}
