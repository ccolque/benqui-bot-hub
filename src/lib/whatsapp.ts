import type { BotReply, Tenant } from "../tenants/types.js";
import { graphApiVersion } from "./env.js";

async function callGraph(tenant: Tenant, body: Record<string, unknown>): Promise<void> {
  const url = `https://graph.facebook.com/${graphApiVersion()}/${tenant.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenant.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) {
    throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  }
}

/**
 * Variantes del destinatario para cuando Meta responde 131030 ("not in allowed list").
 * Pasa con los números de prueba: la lista de destinatarios guarda el número tal como
 * Meta lo interpretó (ej. Argentina: 54 387 15 4153317) y no el wa_id (549 387 4153317).
 * En producción se envía al wa_id directamente y no hace falta ninguna variante.
 */
export function recipientVariants(waId: string): string[] {
  const ar = /^549(\d{10})$/.exec(waId);
  if (ar) {
    const national = ar[1];
    const withMobilePrefix = [2, 3, 4].map(
      (areaLen) => `54${national.slice(0, areaLen)}15${national.slice(areaLen)}`,
    );
    return ["54" + national, ...withMobilePrefix];
  }
  const mx = /^521(\d{10})$/.exec(waId);
  if (mx) return ["52" + mx[1]];
  return [];
}

async function sendTo(tenant: Tenant, waId: string, message: Record<string, unknown>) {
  const candidates = [waId, ...recipientVariants(waId)];
  for (const [i, to] of candidates.entries()) {
    try {
      return await callGraph(tenant, { recipient_type: "individual", to, ...message });
    } catch (err) {
      const notAllowed = String(err).includes("131030");
      if (!notAllowed || i === candidates.length - 1) throw err;
    }
  }
}

export function sendReply(tenant: Tenant, waId: string, reply: BotReply): Promise<void> {
  switch (reply.type) {
    case "text":
      return sendTo(tenant, waId, { type: "text", text: { body: reply.text } });
    case "buttons":
      return sendTo(tenant, waId, {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: reply.text },
          action: {
            buttons: reply.buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      });
  }
}

/** Marca el mensaje como leído (doble tilde azul). */
export function markAsRead(tenant: Tenant, messageId: string): Promise<void> {
  return callGraph(tenant, { status: "read", message_id: messageId });
}
