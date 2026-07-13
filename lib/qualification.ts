import type { EvidenceStatus, Lead, SearchFilters } from "./types";

const rank: Record<EvidenceStatus, number> = {
  contradicted: 0,
  unverified: 1,
  probable: 2,
  confirmed: 3,
};

function passes(status: EvidenceStatus, acceptProbable: boolean) {
  return rank[status] >= (acceptProbable ? rank.probable : rank.confirmed);
}

export function qualifyLead(lead: Lead, filters: SearchFilters): Lead {
  const failed: string[] = [];
  const uncertain: string[] = [];
  const check = (enabled: boolean, status: EvidenceStatus, label: string) => {
    if (!enabled) return;
    if (status === "contradicted") failed.push(label);
    else if (!passes(status, filters.acceptProbable)) uncertain.push(label);
  };

  if (filters.requireReviewRange && !lead.reviewCountKnown) {
    uncertain.push("número de avaliações Google");
  } else if (filters.requireReviewRange && (lead.reviewCount < filters.minReviews || lead.reviewCount > filters.maxReviews)) {
    failed.push(`avaliações fora de ${filters.minReviews}–${filters.maxReviews}`);
  }

  if (lead.signals.professionals.count !== undefined) {
    const count = lead.signals.professionals.count;
    if (count < filters.minProfessionals || count > filters.maxProfessionals) {
      failed.push(`número de profissionais fora de ${filters.minProfessionals}–${filters.maxProfessionals}`);
    }
  } else if (filters.minProfessionals > 0) {
    uncertain.push("número de profissionais");
  }

  check(filters.requireOperational, lead.signals.operational.status, "negócio operacional");
  check(filters.requirePublicContact, lead.signals.publicContact.status, "contacto público");
  check(filters.requireReception, lead.signals.reception.status, "receção própria");
  check(filters.requireOwnerPresent, lead.signals.ownerPresent.status, "proprietário presente");
  check(filters.requireNoItTeam, lead.signals.noItTeam.status, "ausência de equipa de IT");

  let score = 100;
  score -= failed.length * 30;
  score -= uncertain.length * 8;
  if (lead.reviewCount >= 100) score += 4;
  if (lead.website) score += 2;
  if (lead.email) score += 3;
  score = Math.max(0, Math.min(100, score));

  const qualification = failed.length
    ? "rejected"
    : uncertain.length
      ? "review"
      : "qualified";

  return {
    ...lead,
    score,
    qualification,
    qualificationReasons: failed.length
      ? failed
      : uncertain.length
        ? uncertain.map((item) => `por validar: ${item}`)
        : ["cumpre todos os filtros selecionados"],
  };
}

export function defaultFilters(): SearchFilters {
  return {
    requireReviewRange: true,
    minReviews: 30,
    maxReviews: 1000,
    minProfessionals: 1,
    maxProfessionals: 5,
    requireOperational: true,
    requirePublicContact: true,
    requireReception: true,
    requireOwnerPresent: true,
    requireNoItTeam: true,
    acceptProbable: true,
  };
}
