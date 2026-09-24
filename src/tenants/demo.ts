import type { TenantHandler } from "./types.js";

/**
 * Tenant de ejemplo: menú con botones + eco.
 * Copiá este archivo como base para cada cliente nuevo.
 */
export const demo: TenantHandler = {
  id: "demo",
  name: "Demo Benquitech",

  handleMessage(msg) {
    switch (msg.replyId) {
      case "horarios":
        return { type: "text", text: "Atendemos de lunes a viernes de 9 a 18 hs." };
      case "ubicacion":
        return { type: "text", text: "Estamos en Av. Siempre Viva 742." };
      case "humano":
        return { type: "text", text: "En breve te contacta una persona del equipo." };
    }

    const text = msg.text?.trim().toLowerCase() ?? "";

    if (["hola", "menu", "menú", "inicio"].includes(text)) {
      return {
        type: "buttons",
        text: `¡Hola${msg.contactName ? ` ${msg.contactName}` : ""}! ¿En qué te ayudo?`,
        buttons: [
          { id: "horarios", title: "Horarios" },
          { id: "ubicacion", title: "Ubicación" },
          { id: "humano", title: "Hablar con alguien" },
        ],
      };
    }

    if (msg.type !== "text") {
      return { type: "text", text: "Por ahora solo entiendo mensajes de texto. Escribí *menu*." };
    }

    return { type: "text", text: `Recibí: "${msg.text}". Escribí *menu* para ver opciones.` };
  },
};
