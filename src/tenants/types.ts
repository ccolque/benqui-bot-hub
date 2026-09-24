import type { WhatsAppMessage } from "../types/whatsapp.js";

/** Mensaje entrante ya normalizado, listo para la lógica del tenant. */
export interface IncomingMessage {
  id: string;
  from: string; // número del cliente final (wa_id)
  contactName?: string;
  type: string;
  /** Texto escrito, o título del botón / opción de lista elegida. */
  text?: string;
  /** id del botón / opción de lista elegida (si aplica). */
  replyId?: string;
  raw: WhatsAppMessage;
}

export type BotReply =
  | { type: "text"; text: string }
  | {
      type: "buttons";
      text: string;
      /** Máximo 3 botones, título de hasta 20 caracteres. */
      buttons: { id: string; title: string }[];
    };

export type HandlerResult = BotReply | BotReply[] | null;

export interface TenantHandler {
  id: string;
  name: string;
  /** Devuelve la(s) respuesta(s) a enviar, o null para no responder. */
  handleMessage(msg: IncomingMessage): HandlerResult | Promise<HandlerResult>;
}

export interface Tenant {
  handler: TenantHandler;
  phoneNumberId: string;
  accessToken: string;
}
