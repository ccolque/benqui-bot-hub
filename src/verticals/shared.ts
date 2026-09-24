import type { BusinessInfo, OrderItem } from "../data/types.js";
import type {
  BotReply,
  HandlerContext,
  HandlerResult,
  IncomingMessage,
  ListRow,
} from "../tenants/types.js";

/**
 * Un "vertical" es el flujo de un tipo de negocio (ferretería, restaurante,
 * centro médico...). Es reutilizable: un tenant real usa uno solo con sus datos,
 * y el tenant demo deja elegir entre varios.
 */
export interface Vertical {
  id: string;
  label: string;
  menu(session: ConversationState): Promise<BotReply>;
  /** Puede modificar `session`; quien lo llama se encarga de guardarla. */
  handle(
    msg: IncomingMessage,
    session: ConversationState,
    ctx: HandlerContext,
  ): Promise<HandlerResult>;
}

export interface ConversationState {
  business?: string;
  step?: string;
  data?: Record<string, string>;
  cart?: OrderItem[];
}

export const NAV_MENU = { id: "nav:menu", title: "Menú principal" };
export const NAV_SWITCH: ListRow = {
  id: "nav:switch",
  title: "Cambiar de negocio",
  description: "Probar otro tipo de negocio",
};

export const text = (body: string): BotReply => ({ type: "text", text: body });

export const money = (n: number) => `$${n.toLocaleString("es-AR")}`;

export const shortId = () => Date.now().toString(36).slice(-5).toUpperCase();

export function infoReply(info: BusinessInfo): BotReply {
  const lines = [`📍 *${info.nombre}*`, info.direccion];
  if (info.mapsUrl) lines.push(info.mapsUrl);
  lines.push("", "🕒 *Horarios*", ...info.horarios);
  if (info.telefono) lines.push("", `📞 ${info.telefono}`);
  return { type: "buttons", text: lines.join("\n"), buttons: [NAV_MENU] };
}
