import assert from "node:assert/strict";
import test from "node:test";
import { defaultFilters, qualifyLead } from "../lib/qualification.ts";
import type { Lead } from "../lib/types.ts";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "test",
    name: "Clínica Teste",
    category: "dental",
    address: "Lisboa",
    area: "Lisboa",
    rating: 4.8,
    reviewCount: 120,
    reviewCountKnown: true,
    website: "https://example.com",
    phone: "+351 210 000 000",
    businessStatus: "OPERATIONAL",
    verifiedAt: new Date().toISOString(),
    source: "demo",
    score: 0,
    qualification: "review",
    qualificationReasons: [],
    signals: {
      professionals: { status: "confirmed", label: "Profissionais", detail: "3", count: 3 },
      reception: { status: "confirmed", label: "Receção", detail: "Sim" },
      ownerPresent: { status: "confirmed", label: "Dono", detail: "Sim" },
      noItTeam: { status: "probable", label: "IT", detail: "Sem sinais" },
      noApp: { status: "probable", label: "App", detail: "Sem app encontrada" },
      manualContact: { status: "probable", label: "Manual", detail: "Sem marcação online" },
      publicContact: { status: "confirmed", label: "Contacto", detail: "Sim" },
      operational: { status: "confirmed", label: "Operacional", detail: "Sim" },
      websiteQuality: { status: "probable", label: "Website", detail: "Simples" },
    },
    ...overrides,
  };
}

test("qualifica um lead que cumpre todos os filtros", () => {
  const result = qualifyLead(lead(), defaultFilters());
  assert.equal(result.qualification, "qualified");
  assert.ok(result.score >= 80);
  assert.equal(result.scoreBreakdown?.reduce((sum, item) => sum + item.maxPoints, 0), 100);
  assert.equal(result.scoreBreakdown?.reduce((sum, item) => sum + item.points, 0), result.score);
});

test("rejeita avaliações fora do intervalo", () => {
  const result = qualifyLead(lead({ reviewCount: 12 }), defaultFilters());
  assert.equal(result.qualification, "rejected");
  assert.match(result.qualificationReasons.join(" "), /avaliações/);
});

test("manda para validação quando um requisito obrigatório não tem evidência", () => {
  const candidate = lead();
  candidate.signals.reception = { status: "unverified", label: "Receção", detail: "Sem dados" };
  const result = qualifyLead(candidate, defaultFilters());
  assert.equal(result.qualification, "review");
});

test("rejeita uma equipa profissional acima do máximo", () => {
  const candidate = lead();
  candidate.signals.professionals.count = 8;
  const result = qualifyLead(candidate, defaultFilters());
  assert.equal(result.qualification, "rejected");
});

test("não aplica o intervalo de reviews no motor gratuito", () => {
  const candidate = lead({ reviewCount: 0, reviewCountKnown: false, source: "osm" });
  const filters = { ...defaultFilters(), requireReviewRange: false };
  const result = qualifyLead(candidate, filters);
  assert.equal(result.qualification, "qualified");
  assert.equal(result.scoreBreakdown?.find((item) => item.label === "Tração comercial")?.points, 5);
});

test("prioriza empresas pequenas com tração, decisor e sem IT", () => {
  const strong = qualifyLead(lead({ reviewCount: 620, email: "geral@clinica.pt", instagram: "@clinica" }), defaultFilters());
  const weakCandidate = lead({ reviewCount: 35, email: undefined, phone: undefined, instagram: undefined });
  weakCandidate.signals.ownerPresent = { status: "unverified", label: "Dono", detail: "Sem dados" };
  weakCandidate.signals.noItTeam = { status: "unverified", label: "IT", detail: "Sem dados" };
  weakCandidate.signals.websiteQuality = { status: "contradicted", label: "Website", detail: "Plataforma digital avançada" };
  const weak = qualifyLead(weakCandidate, defaultFilters());
  assert.ok(strong.score >= 90);
  assert.ok(strong.score > weak.score);
});

test("dá mais potencial a processos manuais sem app nem marcação online", () => {
  const manual = qualifyLead(lead(), defaultFilters());
  const automatedCandidate = lead();
  automatedCandidate.signals.noApp = { status: "contradicted", label: "App", detail: "Tem app própria" };
  automatedCandidate.signals.manualContact = { status: "contradicted", label: "Manual", detail: "Tem marcação online e portal" };
  const automated = qualifyLead(automatedCandidate, defaultFilters());
  assert.equal(manual.scoreBreakdown?.find((item) => item.label === "Potencial de automação")?.maxPoints, 20);
  assert.ok(manual.score >= automated.score + 15);
});
