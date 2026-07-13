import test from "node:test";
import assert from "node:assert/strict";
import { detectAutomationSignals } from "../lib/automation-signals.ts";

function input(overrides: Partial<Parameters<typeof detectAutomationSignals>[0]> = {}) {
  return {
    html: "<html><body>Contactos</body></html>",
    text: "Contactos",
    pageCount: 3,
    hasMobilePhone: true,
    hasPhone: true,
    hasEmail: false,
    hasContactForm: false,
    sourceUrl: "https://clinica.pt",
    ...overrides,
  };
}

test("identifica telemóvel como único canal e ausência provável de app", () => {
  const result = detectAutomationSignals(input());
  assert.equal(result.noApp.status, "probable");
  assert.equal(result.manualContact.status, "probable");
  assert.match(result.manualContact.detail, /telemóvel/i);
});

test("confirma quando o website manda marcar por telefone ou WhatsApp", () => {
  const result = detectAutomationSignals(input({ text: "Marcações via WhatsApp" }));
  assert.equal(result.manualContact.status, "confirmed");
});

test("reduz a oportunidade quando encontra app e marcação online", () => {
  const result = detectAutomationSignals(input({
    html: '<a href="https://apps.apple.com/pt/app/clinica/id123">App</a>',
    text: "Faça a sua marcação online",
  }));
  assert.equal(result.noApp.status, "contradicted");
  assert.equal(result.manualContact.status, "contradicted");
});
