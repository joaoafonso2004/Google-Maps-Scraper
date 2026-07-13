import { NextResponse } from "next/server";
import { validateJsonRequest } from "@/lib/api-security";
import { isValidEmailSyntax, normalizeEmail } from "@/lib/outreach";
import { suppressEmail } from "@/lib/outreach-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestError = validateJsonRequest(request);
  if (requestError) return NextResponse.json({ error: requestError }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { email?: string };
  if (!body.email || !isValidEmailSyntax(body.email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  await suppressEmail(email);
  return NextResponse.json({ ok: true, email });
}
