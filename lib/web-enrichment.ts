import dns from "node:dns/promises";
import { detectAutomationSignals } from "./automation-signals";
import { getCategory } from "./catalog";
import { isPortugueseMobile } from "./contact-links";
import { isPrivateAddress } from "./network-safety";
import { qualifyLead } from "./qualification";
import type { Evidence, Lead, SearchFilters } from "./types";

async function assertSafeUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("O website tem de usar HTTP ou HTTPS.");
  if (url.username || url.password) throw new Error("URLs com credenciais não são permitidos.");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("O endereço do website não é permitido.");
  }
  return url;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function findEmails(html: string) {
  const excluded = /^(?:no-?reply|privacy|privacidade|rgpd|dpo|abuse)@|@example\.(?:com|org|net)$/i;
  const preferred = /^(?:geral|info|contacto|contato|hello|rececao|recepcao|secretaria|comercial|administracao)@/i;
  return [...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
    .map((email) => email.toLocaleLowerCase("pt"))
    .filter((email) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email) && !excluded.test(email)))]
    .sort((a, b) => Number(preferred.test(b)) - Number(preferred.test(a)))
    .slice(0, 5);
}

function findInstagram(html: string) {
  return [...new Set((html.match(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?/gi) ?? []))][0];
}

function findInternalLinks(html: string, origin: string) {
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((match) => match[1]);
  const priority = /(equipa|team|sobre|about|quem-somos|contact|contacto)/i;
  return [...new Set(links
    .filter((href) => priority.test(href))
    .map((href) => {
      try {
        const url = new URL(href, origin);
        return url.origin === origin ? url.toString() : "";
      } catch { return ""; }
    })
    .filter(Boolean))]
    .slice(0, 3);
}

async function fetchPage(rawUrl: string) {
  let current = await assertSafeUrl(rawUrl);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetch(current, {
      headers: { "User-Agent": "RadarLocal/0.1 (+local research tool)" },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("O website devolveu um redirecionamento inválido.");
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Website respondeu com ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) throw new Error("O endereço não devolveu uma página HTML.");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 2_000_000) throw new Error("A página é demasiado grande para análise segura.");
    return { html: (await response.text()).slice(0, 2_000_000), finalUrl: current.toString() };
  }
  throw new Error("O website tem demasiados redirecionamentos.");
}

function evidenceFromTerms(text: string, terms: string[], label: string, sourceUrl: string): Evidence {
  const found = terms.find((term) => text.toLocaleLowerCase("pt").includes(term.toLocaleLowerCase("pt")));
  return found
    ? { status: "probable", label, detail: `Foi encontrada a expressão “${found}” no website.`, sourceUrl }
    : { status: "unverified", label, detail: "Não foi encontrada evidência pública suficiente no website.", sourceUrl };
}

function estimateProfessionalCount(text: string, roleTerms: string[]) {
  if (!roleTerms.length) return undefined;
  const lower = text.toLocaleLowerCase("pt");
  const matches = roleTerms.flatMap((term) => lower.match(new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}s?\\b`, "gi")) ?? []);
  if (!matches.length) return undefined;
  return Math.min(20, matches.length);
}

export async function enrichLead(lead: Lead, filters: SearchFilters): Promise<Lead> {
  if (!lead.website) throw new Error("Este resultado não tem website para analisar.");
  const url = await assertSafeUrl(lead.website);
  const mainPage = await fetchPage(url.toString());
  const mainHtml = mainPage.html;
  const origin = new URL(mainPage.finalUrl).origin;
  const internalLinks = findInternalLinks(mainHtml, origin);
  const pages = [{ url: mainPage.finalUrl, html: mainHtml }];
  for (const link of internalLinks) {
    try {
      const page = await fetchPage(link);
      if (new URL(page.finalUrl).origin === origin) pages.push({ url: page.finalUrl, html: page.html });
    } catch {
      // Uma subpágina indisponível não deve cancelar todo o enriquecimento.
    }
  }
  const combinedHtml = pages.map((page) => page.html).join("\n");
  const text = stripHtml(combinedHtml);
  const lowerText = text.toLocaleLowerCase("pt");
  const config = getCategory(lead.category);
  const emails = findEmails(combinedHtml);
  const emailSourceUrl = emails[0]
    ? pages.find((page) => page.html.toLocaleLowerCase("pt").includes(emails[0]))?.url ?? lead.website
    : lead.website;
  const instagram = findInstagram(combinedHtml);
  const professionalCount = estimateProfessionalCount(text, config.roleTerms);
  const itTerms = ["equipa de it", "equipa de ti", "informática", "developer", "programador", "cto", "diretor de tecnologia"];
  const hasItSignal = itTerms.some((term) => lowerText.includes(term));
  const noItTeam: Evidence = hasItSignal
    ? { status: "contradicted", label: "Sem equipa de IT", detail: "Foi encontrada uma função ou equipa tecnológica no website.", sourceUrl: lead.website }
    : { status: pages.length > 1 ? "probable" : "unverified", label: "Sem equipa de IT", detail: pages.length > 1 ? "As páginas públicas analisadas não apresentam funções tecnológicas; é uma inferência, não uma prova de ausência." : "Não há uma página de equipa suficiente para inferir este requisito.", sourceUrl: lead.website };
  const hasContactForm = /<form\b/i.test(combinedHtml) && /<(?:input|textarea)\b/i.test(combinedHtml);
  const { noApp, manualContact } = detectAutomationSignals({
    html: combinedHtml,
    text,
    pageCount: pages.length,
    hasMobilePhone: isPortugueseMobile(lead.phone),
    hasPhone: Boolean(lead.phone),
    hasEmail: Boolean(emails.length),
    hasContactForm,
    sourceUrl: lead.website,
  });

  const enriched: Lead = {
    ...lead,
    email: emails[0] ?? lead.email,
    instagram: instagram ?? lead.instagram,
    verifiedAt: new Date().toISOString(),
    signals: {
      ...lead.signals,
      professionals: professionalCount
        ? { status: "probable", label: "Profissionais", count: professionalCount, detail: `${professionalCount} referências a funções profissionais encontradas; confirmar perfis duplicados.`, sourceUrl: internalLinks[0] ?? lead.website }
        : { status: "unverified", label: "Profissionais", detail: "Não foi possível estimar o número de profissionais.", sourceUrl: lead.website },
      reception: evidenceFromTerms(text, config.receptionTerms, "Receção própria", lead.website),
      ownerPresent: evidenceFromTerms(text, config.ownerTerms, "Dono presente", lead.website),
      noItTeam,
      noApp,
      manualContact,
      publicContact: emails.length || lead.phone
        ? { status: "confirmed", label: "Contacto público", detail: emails.length ? "Email público encontrado no website." : "Telefone público disponível.", sourceUrl: emailSourceUrl }
        : lead.signals.publicContact,
      websiteQuality: { status: combinedHtml.length < 500_000 ? "probable" : "unverified", label: "Website simples", detail: combinedHtml.length < 500_000 ? "Website com dimensão e estrutura relativamente simples." : "Website mais extenso; requer avaliação visual.", sourceUrl: lead.website },
    },
  };
  return qualifyLead(enriched, filters);
}
