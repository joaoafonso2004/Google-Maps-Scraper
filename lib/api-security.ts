export function validateJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLocaleLowerCase("en");
  if (contentType !== "application/json") return "O pedido tem de usar Content-Type: application/json.";
  if (request.headers.get("sec-fetch-site") === "cross-site") return "Pedidos de outros sites não são permitidos.";
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return "A origem do pedido não é permitida.";
    } catch {
      return "A origem do pedido é inválida.";
    }
  }
  return undefined;
}
