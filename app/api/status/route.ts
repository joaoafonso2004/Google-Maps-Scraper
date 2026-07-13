import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    app: "radar-local",
    configured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    mode: process.env.GOOGLE_PLACES_API_KEY ? "live" : "demo",
  });
}
