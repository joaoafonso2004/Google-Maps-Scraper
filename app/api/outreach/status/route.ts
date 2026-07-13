import { NextResponse } from "next/server";
import { outreachDailyLimit } from "@/lib/outreach";
import { getSuppressedEmails } from "@/lib/outreach-store";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(
    process.env.OUTREACH_ENABLED === "true" &&
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.MAIL_FROM,
  );
  const suppressed = await getSuppressedEmails();
  const dailyLimit = outreachDailyLimit(process.env.OUTREACH_DAILY_LIMIT);
  return NextResponse.json({
    configured,
    from: configured ? process.env.MAIL_FROM : undefined,
    dailyLimit,
    batchLimit: 10,
    suppressed: [...suppressed],
  });
}
