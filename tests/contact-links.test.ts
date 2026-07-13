import test from "node:test";
import assert from "node:assert/strict";
import { instagramProfileLink, normalizePortugalPhone, phoneLink, whatsappWebLink } from "../lib/contact-links.ts";

test("normaliza números portugueses com e sem indicativo", () => {
  assert.equal(normalizePortugalPhone("+351 912 345 678"), "351912345678");
  assert.equal(normalizePortugalPhone("912 345 678"), "351912345678");
  assert.equal(normalizePortugalPhone("00351 210 123 456"), "351210123456");
});

test("cria ligações de telefone e WhatsApp Web", () => {
  assert.equal(phoneLink("912 345 678"), "tel:+351912345678");
  assert.equal(whatsappWebLink("+351 912 345 678"), "https://web.whatsapp.com/send?phone=351912345678");
  assert.equal(whatsappWebLink("número inválido"), undefined);
});

test("aceita URL ou nome de utilizador do Instagram", () => {
  assert.equal(instagramProfileLink("@clinica.exemplo"), "https://www.instagram.com/clinica.exemplo/");
  assert.equal(instagramProfileLink("https://instagram.com/clinica_exemplo/"), "https://www.instagram.com/clinica_exemplo/");
  assert.equal(instagramProfileLink("https://example.com/perfil"), undefined);
});
