import test from "node:test";
import assert from "node:assert/strict";
import { appendComplianceFooter, isBusinessEmail, renderOutreachTemplate } from "../lib/outreach.ts";
import type { OutreachRecipient } from "../lib/types.ts";

const recipient: OutreachRecipient = {
  leadId: "lead-1",
  name: "Clínica Exemplo",
  area: "Lisboa",
  email: "geral@clinicaexemplo.pt",
  website: "https://clinicaexemplo.pt",
  contactSourceUrl: "https://clinicaexemplo.pt/contactos",
  contactCollectedAt: "2026-07-13T12:00:00.000Z",
};

test("aceita domínio empresarial e recusa email gratuito", () => {
  assert.equal(isBusinessEmail("geral@clinicaexemplo.pt"), true);
  assert.equal(isBusinessEmail("clinica@gmail.com"), false);
  assert.equal(isBusinessEmail("email-invalido"), false);
});

test("personaliza as variáveis conhecidas sem apagar as desconhecidas", () => {
  const result = renderOutreachTemplate("{{nome}} · {{ cidade }} · {{desconhecida}}", recipient);
  assert.equal(result, "Clínica Exemplo · Lisboa · {{desconhecida}}");
});

test("acrescenta identificação e oposição ao rodapé", () => {
  const result = appendComplianceFooter("Mensagem", "Ana", "Empresa X", "Rua Exemplo, Lisboa");
  assert.match(result, /Ana · Empresa X/);
  assert.match(result, /Rua Exemplo, Lisboa/);
  assert.match(result, /REMOVER/);
});
