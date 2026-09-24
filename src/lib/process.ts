import { getTenantByPhoneNumberId } from "../tenants/registry.js";
import type { HandlerContext, IncomingMessage, Tenant } from "../tenants/types.js";
import type { WebhookPayload, WebhookValue, WhatsAppMessage } from "../types/whatsapp.js";
import { getKV, type KV } from "./kv.js";
import { markAsRead, sendReply } from "./whatsapp.js";

const SESSION_TTL = 60 * 60 * 24;

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

function contextFor(tenant: Tenant, msg: IncomingMessage, kv: KV): HandlerContext {
  const key = `session:${tenant.handler.id}:${msg.from}`;
  return {
    tenantId: tenant.handler.id,
    kv,
    session: {
      get: <T>() => kv.get<T>(key),
      set: (value) => kv.set(key, value, SESSION_TTL),
      clear: () => kv.del(key),
    },
  };
}

/** Meta puede reenviar el mismo mensaje; evita responderlo dos veces. */
async function alreadyProcessed(kv: KV, messageId: string): Promise<boolean> {
  try {
    const key = `seen:${messageId}`;
    if (await kv.get(key)) return true;
    await kv.set(key, 1, SESSION_TTL);
  } catch (err) {
    console.warn("[webhook] No se pudo verificar duplicado", err);
  }
  return false;
}

async function handleValue(value: WebhookValue): Promise<void> {
  if (!value.messages?.length) return; // statuses (entregado/leído) se ignoran por ahora

  const phoneNumberId = value.metadata.phone_number_id;
  const tenant = getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.warn(`[webhook] Mensaje para phone_number_id desconocido: ${phoneNumberId}`);
    return;
  }

  const kv = getKV();
  for (const raw of value.messages) {
    const msg = normalize(raw, value);
    if (await alreadyProcessed(kv, msg.id)) continue;
    try {
      await markAsRead(tenant, msg.id).catch((e) => console.warn("[webhook] markAsRead", e));
      const result = await tenant.handler.handleMessage(msg, contextFor(tenant, msg, kv));
      const replies = result == null ? [] : Array.isArray(result) ? result : [result];
      for (const reply of replies) {
        await sendReply(tenant, reply.to ?? msg.from, reply);
      }
    } catch (err) {
      console.error(
        `[webhook] Error en tenant "${tenant.handler.id}" msg ${msg.id} from=${msg.from}`,
        err,
      );
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
