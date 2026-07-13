import dns from "node:dns/promises";
import { isBusinessEmail, normalizeEmail } from "./outreach";

export async function hasMailExchange(email: string) {
  if (!isBusinessEmail(email)) return false;
  const domain = normalizeEmail(email).split("@")[1];
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}
