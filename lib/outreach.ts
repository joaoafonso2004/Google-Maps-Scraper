import type { Lead, OutreachRecipient } from "./types";

const freeEmailDomains = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.pt", "outlook.com",
  "outlook.pt", "live.com", "live.pt", "yahoo.com", "yahoo.pt", "icloud.com",
  "me.com", "sapo.pt", "mail.pt", "proton.me", "protonmail.com",
]);

export const MAX_OUTREACH_BATCH = 10;

export function outreachDailyLimit(value?: string) {
  const parsed = Number.parseInt(value ?? "20", 10);
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 20;
}

export function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("pt");
}

export function isValidEmailSyntax(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizeEmail(email));
}

export function isBusinessEmail(email: string) {
  if (!isValidEmailSyntax(email)) return false;
  const domain = normalizeEmail(email).split("@")[1];
  return !freeEmailDomains.has(domain);
}

export function leadToRecipient(lead: Lead): OutreachRecipient | undefined {
  if (!lead.email || !isBusinessEmail(lead.email)) return undefined;
  const contactSourceUrl = lead.signals.publicContact.sourceUrl ?? lead.website ?? lead.mapsUrl;
  if (!contactSourceUrl) return undefined;
  return {
    leadId: lead.id,
    name: lead.name,
    area: lead.area,
    email: normalizeEmail(lead.email),
    website: lead.website,
    contactSourceUrl,
    contactCollectedAt: lead.verifiedAt,
  };
}

export function renderOutreachTemplate(template: string, recipient: OutreachRecipient) {
  const values: Record<string, string> = {
    nome: recipient.name,
    nome_clinica: recipient.name,
    cidade: recipient.area,
    email: recipient.email,
    website: recipient.website ?? "",
  };
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key: string) => values[key.toLocaleLowerCase("pt")] ?? match);
}

export function appendComplianceFooter(message: string, senderName: string, companyName: string, postalAddress: string) {
  return `${message.trim()}\n\n—\n${senderName.trim()} · ${companyName.trim()}\n${postalAddress.trim()}\nSe não quiser receber mais mensagens, responda apenas REMOVER.`;
}
