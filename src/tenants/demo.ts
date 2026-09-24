import centroMedicoData from "../data/demo/centro-medico.json" with { type: "json" };
import ferreteriaData from "../data/demo/ferreteria.json" with { type: "json" };
import restauranteData from "../data/demo/restaurante.json" with { type: "json" };
import { httpCatalog } from "../data/http-catalog.js";
import { jsonCatalog, jsonClinic } from "../data/json-sources.js";
import type { CatalogData, CatalogSource } from "../data/types.js";
import { normalize } from "../lib/text.js";
import { createCatalogVertical } from "../verticals/catalog.js";
import { createClinicVertical } from "../verticals/clinic.js";
import type { ConversationState, Vertical } from "../verticals/shared.js";
import type { BotReply, IncomingMessage, TenantHandler } from "./types.js";

/**
 * Tenant de demostración: el usuario elige qué tipo de negocio probar.
 * Un cliente real no necesita el selector: su tenant usa un solo vertical.
 */

/** Si existe TENANT_DEMO_<NEGOCIO>_API_URL se usa esa API; si no, el JSON de ejemplo. */
function catalogSource(business: string, data: CatalogData): CatalogSource {
  const prefix = `TENANT_DEMO_${business.toUpperCase()}`;
  const apiUrl = process.env[`${prefix}_API_URL`];
  return apiUrl
    ? httpCatalog(apiUrl, process.env[`${prefix}_API_KEY`])
    : jsonCatalog(data, `demo:${business}`);
}

const verticals: Vertical[] = [
  createCatalogVertical(catalogSource("ferreteria", ferreteriaData), {
    id: "ferreteria",
    label: "Ferretería",
    emoji: "🔧",
    intro: "¿Qué necesitás? También podés escribir directamente lo que buscás, por ejemplo *tornillos* o *taladro*.",
    searchPrompt: "Escribí el nombre del producto, por ejemplo: taladro, pintura, tornillos.",
    searchHint: "Ej: taladro, pintura, tornillos",
    browseTitle: "Ver categorías",
    showStock: true,
    askDelivery: false,
    operatorConfirms: true,
    operatorPhone: process.env.TENANT_DEMO_OPERATOR_PHONE,
  }),
  createCatalogVertical(catalogSource("restaurante", restauranteData), {
    id: "restaurante",
    label: "Restaurante",
    emoji: "🍽️",
    intro: "¿Qué te gustaría pedir hoy? Mirá la carta o escribí lo que tenés ganas de comer.",
    searchPrompt: "Escribí lo que tenés ganas de comer, por ejemplo: empanadas, pizza, flan.",
    searchHint: "Ej: empanadas, pizza, flan",
    browseTitle: "Ver la carta",
    showStock: false,
    askDelivery: true,
    operatorConfirms: false,
  }),
  createClinicVertical(jsonClinic(centroMedicoData, "demo:centro_medico"), {
    id: "centro_medico",
    label: "Centro médico",
  }),
];

const GREETINGS = ["hola", "buenas", "menu", "inicio", "empezar", "start"];
const SWITCH_WORDS = ["cambiar", "negocio", "salir"];

function picker(msg: IncomingMessage): BotReply {
  const name = msg.contactName ? ` ${msg.contactName}` : "";
  return {
    type: "buttons",
    text:
      `¡Hola${name}! 👋 Soy el bot de demostración de *BenquiTech*.\n` +
      "¿Qué tipo de negocio querés probar?\n\n" +
      "_En cualquier momento escribí *menu* para volver al inicio o *cambiar* para probar otro negocio._",
    buttons: verticals.map((v) => ({ id: `biz:${v.id}`, title: v.label })),
  };
}

function reset(s: ConversationState, business?: string) {
  s.business = business;
  s.step = undefined;
  s.data = undefined;
  s.cart = [];
}

export const demo: TenantHandler = {
  id: "demo",
  name: "Demo BenquiTech",

  async handleMessage(msg, ctx) {
    const s = (await ctx.session.get<ConversationState>()) ?? {};
    const id = msg.replyId ?? "";
    const typed = normalize(msg.text ?? "");
    const route = async () => {
      if (id.startsWith("biz:")) {
        const chosen = verticals.find((v) => v.id === id.slice(4));
        if (chosen) {
          reset(s, chosen.id);
          return chosen.menu(s);
        }
      }
      if (id === "nav:switch" || (!id && SWITCH_WORDS.includes(typed))) {
        reset(s);
        return picker(msg);
      }
      const current = verticals.find((v) => v.id === s.business);
      if (!current) return picker(msg);
      if (id === "nav:menu" || (!id && GREETINGS.includes(typed))) {
        s.step = undefined;
        s.data = undefined;
        return current.menu(s);
      }
      return current.handle(msg, s, ctx);
    };

    const result = await route();
    await ctx.session.set(s);
    return result;
  },
};
