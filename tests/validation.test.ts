import test from "node:test";
import assert from "node:assert/strict";
import { validateJsonRequest } from "../lib/api-security.ts";
import { defaultFilters } from "../lib/qualification.ts";
import { validateSearchRequest } from "../lib/search-validation.ts";
import { outreachDailyLimit } from "../lib/outreach.ts";
import { isPrivateAddress } from "../lib/network-safety.ts";

function validSearch() {
  return {
    provider: "osm",
    categories: ["dental"],
    area: "Lisboa",
    locationMode: "area",
    locations: ["Lisboa"],
    maxPages: 1,
    filters: defaultFilters(),
  };
}

test("valida pedidos de pesquisa e rejeita intervalos impossíveis", () => {
  assert.ok(validateSearchRequest(validSearch()).data);
  assert.ok(validateSearchRequest({ ...validSearch(), categories: ["dental", "physio"] }).data);
  assert.match(validateSearchRequest({ ...validSearch(), provider: "outra" }).error ?? "", /fonte/i);
  assert.match(validateSearchRequest({ ...validSearch(), categories: [] }).error ?? "", /um e quatro/i);
  assert.match(validateSearchRequest({ ...validSearch(), categories: ["dental", "dental"] }).error ?? "", /uma vez/i);
  assert.match(validateSearchRequest({ ...validSearch(), categories: ["custom"] }).error ?? "", /Google/i);
  assert.match(validateSearchRequest({ ...validSearch(), locations: ["1", "2", "3", "4"] }).error ?? "", /máximo 3/i);
  assert.match(validateSearchRequest({ ...validSearch(), categories: ["dental", "physio", "car_dealer"], locations: ["Lisboa", "Porto", "Braga"] }).error ?? "", /6 combinações/i);
  assert.match(validateSearchRequest({ ...validSearch(), filters: { ...defaultFilters(), minReviews: 100, maxReviews: 30 } }).error ?? "", /mínimo/i);
});

test("protege rotas JSON contra conteúdo e origens inválidas", () => {
  const valid = new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" } });
  const wrongType = new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "text/plain" } });
  const crossSite = new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.com" } });
  assert.equal(validateJsonRequest(valid), undefined);
  assert.match(validateJsonRequest(wrongType) ?? "", /Content-Type/i);
  assert.match(validateJsonRequest(crossSite) ?? "", /origem/i);
});

test("normaliza o limite diário de campanhas", () => {
  assert.equal(outreachDailyLimit(), 20);
  assert.equal(outreachDailyLimit("0"), 1);
  assert.equal(outreachDailyLimit("100"), 50);
  assert.equal(outreachDailyLimit("inválido"), 20);
});

test("bloqueia endereços privados e reservados no enriquecimento", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.0.0.5"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});
