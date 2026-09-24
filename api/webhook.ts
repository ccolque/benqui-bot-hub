import { waitUntil } from "@vercel/functions";
import { requireEnv } from "../src/lib/env.js";
import { processWebhook } from "../src/lib/process.js";
import { isValidSignature } from "../src/lib/signature.js";
import type { WebhookPayload } from "../src/types/whatsapp.js";

/** Verificación del webhook: Meta lo llama al configurarlo. */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === requireEnv("WHATSAPP_VERIFY_TOKEN") && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Mensajes entrantes de todos los tenants. */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    console.warn("[webhook] META_APP_SECRET no configurado: no se verifica la firma.");
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Respondemos 200 enseguida (si no, Meta reintenta) y procesamos en segundo plano.
  waitUntil(processWebhook(payload));
  return new Response("OK", { status: 200 });
}
