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

export function sendReply(tenant: Tenant, to: string, reply: BotReply): Promise<void> {
  switch (reply.type) {
    case "text":
      return callGraph(tenant, {
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: reply.text },
      });
    case "buttons":
      return callGraph(tenant, {
        recipient_type: "individual",
        to,
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
