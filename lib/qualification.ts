import type { EvidenceStatus, Lead, ScoreComponent, SearchFilters } from "./types";

const rank: Record<EvidenceStatus, number> = {
  contradicted: 0,
  unverified: 1,
  probable: 2,
  confirmed: 3,
};

function passes(status: EvidenceStatus, acceptProbable: boolean) {
  return rank[status] >= (acceptProbable ? rank.probable : rank.confirmed);
}

function evidencePoints(status: EvidenceStatus, maxPoints: number) {
  if (status === "confirmed") return maxPoints;
  if (status === "probable") return Math.round(maxPoints * 0.75);
  if (status === "unverified") return Math.round(maxPoints * 0.25);
  return 0;
}

function tractionPoints(lead: Lead, filters: SearchFilters) {
  if (!lead.reviewCountKnown) return { points: 5, detail: "Avaliações ainda por validar; recebe apenas pontuação de incerteza." };
  if (filters.requireReviewRange && (lead.reviewCount < filters.minReviews || lead.reviewCount > filters.maxReviews)) {
    return { points: 0, detail: `Fora do intervalo de ${filters.minReviews}–${filters.maxReviews} avaliações definido para o ICP.` };
  }
  if (lead.reviewCount >= 500) return { points: 15, detail: "500+ avaliações: procura e operação comercial muito fortes." };
  if (lead.reviewCount >= 250) return { points: 13, detail: "250+ avaliações: negócio com tração forte." };
  if (lead.reviewCount >= 100) return { points: 10, detail: "100+ avaliações: procura já comprovada." };
  if (lead.reviewCount >= 30) return { points: 7, detail: "30+ avaliações: atividade comercial suficiente para investigar." };
  if (lead.reviewCount > 0) return { points: 4, detail: "Alguma atividade pública, mas ainda com pouca tração." };
  return { points: 0, detail: "Sem avaliações conhecidas." };
}

function saasOpportunityScore(lead: Lead, filters: SearchFilters) {
  const traction = tractionPoints(lead, filters);
  const professionalCount = lead.signals.professionals.count;
  const sizeFits = professionalCount !== undefined && professionalCount >= filters.minProfessionals && professionalCount <= filters.maxProfessionals;
  const sizePoints = professionalCount === undefined ? 4 : sizeFits ? 15 : 0;
  const ownerPoints = evidencePoints(lead.signals.ownerPresent.status, 15);
  const noItPoints = evidencePoints(lead.signals.noItTeam.status, 10);
  const receptionPoints = evidencePoints(lead.signals.reception.status, 6);
  const operationalPoints = evidencePoints(lead.signals.operational.status, 4);
  const noAppPoints = evidencePoints(lead.signals.noApp.status, 8);
  const manualContactPoints = evidencePoints(lead.signals.manualContact.status, 12);
  const digitalGapPoints = evidencePoints(lead.signals.websiteQuality.status, 5);
  const publicContactPoints = evidencePoints(lead.signals.publicContact.status, 7);
  const directChannels = (lead.email ? 2 : 0) + (lead.phone ? 1 : 0) + (lead.instagram ? 1 : 0);
  const contactPoints = Math.min(10, publicContactPoints + directChannels);

  const breakdown: ScoreComponent[] = [
    { label: "Tração comercial", points: traction.points, maxPoints: 15, detail: traction.detail },
    { label: "Dimensão adequada", points: sizePoints, maxPoints: 15, detail: professionalCount === undefined ? "Dimensão da equipa por confirmar." : sizeFits ? `${professionalCount} profissionais: dentro do intervalo selecionado.` : `${professionalCount} profissionais: fora do intervalo selecionado.` },
    { label: "Acesso ao decisor", points: ownerPoints, maxPoints: 15, detail: lead.signals.ownerPresent.detail },
    { label: "Sem equipa interna de IT", points: noItPoints, maxPoints: 10, detail: lead.signals.noItTeam.detail },
    { label: "Processo operacional", points: receptionPoints + operationalPoints, maxPoints: 10, detail: `${lead.signals.reception.detail} ${lead.signals.operational.detail}` },
    { label: "Potencial de automação", points: noAppPoints + manualContactPoints, maxPoints: 20, detail: `${lead.signals.noApp.detail} ${lead.signals.manualContact.detail}` },
    { label: "Lacuna digital", points: digitalGapPoints, maxPoints: 5, detail: lead.signals.websiteQuality.detail },
    { label: "Facilidade de contacto", points: contactPoints, maxPoints: 10, detail: [lead.email && "email", lead.phone && "telefone", lead.instagram && "Instagram"].filter(Boolean).length ? `Canais encontrados: ${[lead.email && "email", lead.phone && "telefone", lead.instagram && "Instagram"].filter(Boolean).join(", ")}.` : lead.signals.publicContact.detail },
  ];

  return { score: breakdown.reduce((sum, component) => sum + component.points, 0), breakdown };
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

  const opportunity = saasOpportunityScore(lead, filters);

  const qualification = failed.length
    ? "rejected"
    : uncertain.length
      ? "review"
      : "qualified";

  return {
    ...lead,
    score: opportunity.score,
    scoreBreakdown: opportunity.breakdown,
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
