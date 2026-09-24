import type { KV } from "../lib/kv.js";
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

export interface ReplyButton {
  id: string;
  title: string; // máx. 20 caracteres
}

export interface ListRow {
  id: string;
  title: string; // máx. 24 caracteres
  description?: string; // máx. 72 caracteres
}

export interface ListSection {
  title?: string;
  rows: ListRow[]; // máx. 10 filas sumando todas las secciones
}

export type BotReply = {
  /** Destinatario distinto al que escribió (ej. avisar a un operador). */
  to?: string;
} & (
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; buttons: ReplyButton[] } // máx. 3 botones
  | { type: "list"; text: string; button: string; sections: ListSection[] }
);

export type HandlerResult = BotReply | BotReply[] | null;

/** Estado de la conversación con un usuario (expira a las 24 hs sin actividad). */
export interface Session {
  get<T>(): Promise<T | null>;
  set(value: unknown): Promise<void>;
  clear(): Promise<void>;
}

export interface HandlerContext {
  tenantId: string;
  session: Session;
  kv: KV;
}

export interface TenantHandler {
  id: string;
  name: string;
  /** Devuelve la(s) respuesta(s) a enviar, o null para no responder. */
  handleMessage(msg: IncomingMessage, ctx: HandlerContext): HandlerResult | Promise<HandlerResult>;
}

export interface Tenant {
  handler: TenantHandler;
  phoneNumberId: string;
  accessToken: string;
}
