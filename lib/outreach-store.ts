import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), ".data");
const suppressionFile = path.join(dataDirectory, "outreach-suppression.json");
const logFile = path.join(dataDirectory, "outreach-log.jsonl");

async function ensureDataDirectory() {
  await mkdir(dataDirectory, { recursive: true });
}

export async function getSuppressedEmails() {
  try {
    const raw = await readFile(suppressionFile, "utf8");
    return new Set((JSON.parse(raw) as string[]).map((email) => email.toLocaleLowerCase("pt")));
  } catch {
    return new Set<string>();
  }
}

export async function suppressEmail(email: string) {
  await ensureDataDirectory();
  const suppressed = await getSuppressedEmails();
  suppressed.add(email.trim().toLocaleLowerCase("pt"));
  await writeFile(suppressionFile, JSON.stringify([...suppressed].sort(), null, 2), "utf8");
}

export async function appendOutreachLog(entry: Record<string, unknown>) {
  await ensureDataDirectory();
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function countSuccessfulSendsSince(since: Date) {
  try {
    const raw = await readFile(logFile, "utf8");
    return raw.split("\n").filter(Boolean).reduce((count, line) => {
      try {
        const entry = JSON.parse(line) as { status?: string; sentAt?: string };
        return entry.status === "sent" && entry.sentAt && new Date(entry.sentAt) >= since ? count + 1 : count;
      } catch {
        return count;
      }
    }, 0);
  } catch {
    return 0;
  }
}
