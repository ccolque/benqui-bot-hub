import { getTenantByPhoneNumberId } from "../tenants/registry.js";
import type { IncomingMessage } from "../tenants/types.js";
import type { WebhookPayload, WebhookValue, WhatsAppMessage } from "../types/whatsapp.js";
import { markAsRead, sendReply } from "./whatsapp.js";

function normalize(msg: WhatsAppMessage, value: WebhookValue): IncomingMessage {
  const contact = value.contacts?.find((c) => c.wa_id === msg.from);
  const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
  return {
    id: msg.id,
    from: msg.from,
    contactName: contact?.profile?.name,
    type: msg.type,
    text: msg.text?.body ?? reply?.title ?? msg.button?.text,
    replyId: reply?.id ?? msg.button?.payload,
    raw: msg,
  };
}

async function handleValue(value: WebhookValue): Promise<void> {
  if (!value.messages?.length) return; // statuses (entregado/leído) se ignoran por ahora

  const phoneNumberId = value.metadata.phone_number_id;
  const tenant = getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.warn(`[webhook] Mensaje para phone_number_id desconocido: ${phoneNumberId}`);
    return;
  }

  for (const raw of value.messages) {
    const msg = normalize(raw, value);
    try {
      await markAsRead(tenant, msg.id).catch((e) => console.warn("[webhook] markAsRead", e));
      const result = await tenant.handler.handleMessage(msg);
      const replies = result == null ? [] : Array.isArray(result) ? result : [result];
      for (const reply of replies) {
        await sendReply(tenant, msg.from, reply);
      }
    } catch (err) {
      console.error(`[webhook] Error en tenant "${tenant.handler.id}" msg ${msg.id}`, err);
    }
  }
}

export async function processWebhook(payload: WebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;
  const tasks = payload.entry.flatMap((entry) =>
    entry.changes.filter((c) => c.field === "messages").map((c) => handleValue(c.value)),
  );
  await Promise.allSettled(tasks);
}
