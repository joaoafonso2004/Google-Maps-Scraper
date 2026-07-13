export function normalizePortugalPhone(rawPhone?: string) {
  if (!rawPhone) return undefined;
  const firstNumber = rawPhone.split(/[;/,]/)[0];
  let digits = firstNumber.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `351${digits}`;
  return digits.startsWith("351") && digits.length === 12 ? digits : undefined;
}

export function phoneLink(rawPhone?: string) {
  const digits = normalizePortugalPhone(rawPhone);
  return digits ? `tel:+${digits}` : undefined;
}

export function whatsappWebLink(rawPhone?: string) {
  const digits = normalizePortugalPhone(rawPhone);
  return digits ? `https://web.whatsapp.com/send?phone=${digits}` : undefined;
}

export function isPortugueseMobile(rawPhone?: string) {
  const digits = normalizePortugalPhone(rawPhone);
  return Boolean(digits && /^3519\d{8}$/.test(digits));
}

export function instagramProfileLink(rawInstagram?: string) {
  if (!rawInstagram) return undefined;
  const value = rawInstagram.trim();
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const hostname = url.hostname.replace(/^www\./, "").toLocaleLowerCase("pt");
    if (hostname === "instagram.com" && /^\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) {
      return `https://www.instagram.com/${url.pathname.split("/").filter(Boolean)[0]}/`;
    }
  } catch {
    // Se não for URL, tenta interpretar como nome de utilizador.
  }
  const handle = value.replace(/^@/, "").replace(/^instagram\.com\//i, "").replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9._-]+$/.test(handle) ? `https://www.instagram.com/${handle}/` : undefined;
}
