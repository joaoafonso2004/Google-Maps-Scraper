import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { validateJsonRequest } from "@/lib/api-security";
import {
  appendComplianceFooter,
  isBusinessEmail,
  isValidEmailSyntax,
  MAX_OUTREACH_BATCH,
  normalizeEmail,
  outreachDailyLimit,
  renderOutreachTemplate,
} from "@/lib/outreach";
import { hasMailExchange } from "@/lib/outreach-server";
import { appendOutreachLog, countSuccessfulSendsSince, getSuppressedEmails } from "@/lib/outreach-store";
import type { OutreachCampaign } from "@/lib/types";

export const runtime = "nodejs";

type SendBody = OutreachCampaign & {
  confirmation?: string;
  lawfulBasisConfirmed?: boolean;
};

function validText(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function validTemplateText(value: unknown, min: number, max: number) {
  return validText(value, min, max) && !/[\r\n]/.test(value as string);
}

function validPublicUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validCollectedAt(value: unknown) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function POST(request: Request) {
  const requestError = validateJsonRequest(request);
  if (requestError) return NextResponse.json({ error: requestError }, { status: 400 });
  if (process.env.OUTREACH_ENABLED !== "true") {
    return NextResponse.json({ error: "O envio está desativado. Configura o SMTP e ativa OUTREACH_ENABLED." }, { status: 503 });
  }
  const requiredEnv = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;
  if (requiredEnv.some((key) => !process.env[key])) {
    return NextResponse.json({ error: "A conta remetente ainda não está completamente configurada." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as Partial<SendBody>;
  if (body.confirmation !== "ENVIAR" || body.lawfulBasisConfirmed !== true) {
    return NextResponse.json({ error: "Confirma a campanha e a base legal antes do envio." }, { status: 400 });
  }
  if (!validText(body.subject, 2, 150) || /[\r\n]/.test(body.subject ?? "")) {
    return NextResponse.json({ error: "O assunto é inválido." }, { status: 400 });
  }
  if (!validText(body.message, 10, 5000) || !validText(body.senderName, 2, 100) ||
      !validText(body.companyName, 2, 120) || !validText(body.postalAddress, 5, 250)) {
    return NextResponse.json({ error: "Preenche a mensagem e a identificação completa do remetente." }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.length < 1 || body.recipients.length > MAX_OUTREACH_BATCH) {
    return NextResponse.json({ error: `Seleciona entre 1 e ${MAX_OUTREACH_BATCH} contactos por lote.` }, { status: 400 });
  }

  const recipients = [...new Map(body.recipients.map((recipient) => [normalizeEmail(recipient.email), recipient])).values()];
  if (recipients.some((recipient) =>
    !isBusinessEmail(recipient.email) ||
    !validTemplateText(recipient.name, 1, 200) ||
    !validTemplateText(recipient.area, 1, 120) ||
    !validPublicUrl(recipient.contactSourceUrl) ||
    !validCollectedAt(recipient.contactCollectedAt)
  )) {
    return NextResponse.json({ error: "Todos os destinatários precisam de email empresarial, fonte pública e data de recolha." }, { status: 400 });
  }

  const dailyLimit = outreachDailyLimit(process.env.OUTREACH_DAILY_LIMIT);
  const sentToday = await countSuccessfulSendsSince(startOfToday());
  if (sentToday + recipients.length > dailyLimit) {
    return NextResponse.json({ error: `Limite diário: ${dailyLimit}. Já foram enviados ${sentToday} hoje.` }, { status: 429 });
  }

  const suppressed = await getSuppressedEmails();
  const blocked = recipients.filter((recipient) => suppressed.has(normalizeEmail(recipient.email)));
  if (blocked.length) {
    return NextResponse.json({ error: `${blocked.length} contacto(s) estão na lista “não contactar”.` }, { status: 409 });
  }

  const mxChecks = await Promise.all(recipients.map(async (recipient) => ({
    recipient,
    valid: await hasMailExchange(recipient.email),
  })));
  const invalid = mxChecks.filter((check) => !check.valid);
  if (invalid.length) {
    return NextResponse.json({ error: `Não foi possível validar o domínio de ${invalid.map(({ recipient }) => recipient.email).join(", ")}.` }, { status: 400 });
  }

  const smtpPort = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    return NextResponse.json({ error: "A porta SMTP configurada é inválida." }, { status: 503 });
  }
  const replyAddress = process.env.MAIL_REPLY_TO || process.env.SMTP_USER;
  if (!replyAddress || !isValidEmailSyntax(replyAddress)) {
    return NextResponse.json({ error: "MAIL_REPLY_TO ou SMTP_USER tem de ser um endereço de email válido." }, { status: 503 });
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transporter.verify();
  } catch {
    return NextResponse.json({ error: "Não foi possível autenticar no servidor SMTP. Confirma os dados do remetente." }, { status: 502 });
  }

  const results: { email: string; status: "sent" | "failed"; error?: string }[] = [];
  for (const [index, recipient] of recipients.entries()) {
    const email = normalizeEmail(recipient.email);
    try {
      const subject = renderOutreachTemplate(body.subject!, recipient).replace(/[\r\n]+/g, " ").trim().slice(0, 150);
      const text = appendComplianceFooter(
        renderOutreachTemplate(body.message!, recipient),
        body.senderName!,
        body.companyName!,
        body.postalAddress!,
      );
      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM,
        replyTo: replyAddress,
        to: email,
        subject,
        text,
        headers: {
          "List-Unsubscribe": `<mailto:${replyAddress}?subject=REMOVER>`,
        },
      });
      await appendOutreachLog({
        status: "sent",
        sentAt: new Date().toISOString(),
        email,
        leadId: recipient.leadId,
        sourceUrl: recipient.contactSourceUrl,
        collectedAt: recipient.contactCollectedAt,
        messageId: info.messageId,
      });
      results.push({ email, status: "sent" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Falha desconhecida";
      await appendOutreachLog({ status: "failed", sentAt: new Date().toISOString(), email, leadId: recipient.leadId, error: detail });
      results.push({ email, status: "failed", error: detail });
    }
    if (index < recipients.length - 1) await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return NextResponse.json({
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  });
}
