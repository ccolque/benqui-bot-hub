import type { ClinicSource, Doctor } from "../data/types.js";
import { normalize } from "../lib/text.js";
import type { BotReply, HandlerResult, IncomingMessage } from "../tenants/types.js";
import {
  infoReply,
  NAV_MENU,
  NAV_SWITCH,
  shortId,
  text,
  type ConversationState,
  type Vertical,
} from "./shared.js";

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const AR_OFFSET_MS = -3 * 60 * 60 * 1000; // Argentina no usa horario de verano
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "20260929-0930" -> { dow: 2, date: "29/09", time: "09:30" } */
function parseSlot(slot: string) {
  const [y, mo, d, h, mi] = [slot.slice(0, 4), slot.slice(4, 6), slot.slice(6, 8), slot.slice(9, 11), slot.slice(11, 13)];
  const dow = new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay();
  return { dow, date: `${d}/${mo}`, time: `${h}:${mi}` };
}

export function describeSlot(slot: string): string {
  const { dow, date, time } = parseSlot(slot);
  return `${DAY_LONG[dow]} ${date} a las ${time}`;
}

const nowSlotKey = () => {
  const now = new Date(Date.now() + AR_OFFSET_MS);
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
};

/** Próximos turnos libres: hasta `perDay` por día y `max` en total (límite de las listas de WhatsApp). */
export function freeSlots(doctor: Doctor, taken: Set<string>, max = 10, perDay = 3): string[] {
  const now = new Date(Date.now() + AR_OFFSET_MS);
  const earliest = now.getUTCHours() * 60 + now.getUTCMinutes() + 60; // hoy, con 1 h de anticipación
  const slots: string[] = [];

  for (let d = 0; d < 28 && slots.length < max; d++) {
    const day = new Date(now.getTime() + d * DAY_MS);
    const date = `${day.getUTCFullYear()}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}`;
    let today = 0;
    for (const block of doctor.agenda.filter((b) => b.dias.includes(day.getUTCDay()))) {
      const end = toMinutes(block.hasta);
      for (let m = toMinutes(block.desde); m + doctor.duracionMin <= end; m += doctor.duracionMin) {
        if (d === 0 && m < earliest) continue;
        const key = `${date}-${pad(Math.floor(m / 60))}${pad(m % 60)}`;
        if (taken.has(key)) continue;
        slots.push(key);
        if (++today >= perDay || slots.length >= max) break;
      }
      if (today >= perDay || slots.length >= max) break;
    }
  }
  return slots;
}

function scheduleSummary(doctor: Doctor): string {
  return doctor.agenda
    .map((b) => `${b.dias.map((d) => DAY_SHORT[d]).join(", ")} ${b.desde} a ${b.hasta}`)
    .join(" / ");
}

/** Flujo de turnos: especialidad -> profesional -> horario -> paciente -> confirmación. */
export function createClinicVertical(src: ClinicSource, o: { id: string; label: string }): Vertical {
  async function menu(): Promise<BotReply> {
    const info = await src.info();
    return {
      type: "list",
      text: `🩺 *${info.nombre}*\n¿En qué te puedo ayudar?`,
      button: "Ver opciones",
      sections: [
        {
          title: "Opciones",
          rows: [
            { id: "book", title: "Sacar turno", description: "Elegí especialidad, profesional y horario" },
            { id: "mine", title: "Mis turnos", description: "Ver los turnos que tenés agendados" },
            { id: "info", title: "Horarios y ubicación" },
            NAV_SWITCH,
          ],
        },
      ],
    };
  }

  async function specialties(): Promise<BotReply> {
    const list = await src.specialties();
    return {
      type: "list",
      text: "🩺 ¿Para qué especialidad necesitás el turno?",
      button: "Especialidades",
      sections: [{ title: "Especialidades", rows: list.map((e) => ({ id: `esp:${e.id}`, title: e.nombre })) }],
    };
  }

  async function doctors(s: ConversationState, specialtyId: string): Promise<HandlerResult> {
    const list = await src.doctors(specialtyId);
    if (!list.length) return [text("No hay profesionales para esa especialidad."), await specialties()];
    if (list.length === 1) return slots(s, list[0].id);
    return {
      type: "list",
      text: "👨‍⚕️ Elegí el profesional:",
      button: "Profesionales",
      sections: [
        {
          title: "Profesionales",
          rows: list.map((m) => ({ id: `doc:${m.id}`, title: m.nombre, description: scheduleSummary(m) })),
        },
      ],
    };
  }

  async function slots(s: ConversationState, doctorId: string): Promise<HandlerResult> {
    const doctor = await src.doctor(doctorId);
    if (!doctor) return [text("Ese profesional ya no está disponible."), await menu()];
    const free = freeSlots(doctor, new Set(await src.takenSlots(doctorId)));
    if (!free.length) {
      return {
        type: "buttons",
        text: `😕 ${doctor.nombre} no tiene turnos libres en las próximas semanas.`,
        buttons: [{ id: "book", title: "Otra especialidad" }, NAV_MENU],
      };
    }
    return {
      type: "list",
      text: `📅 Próximos turnos con *${doctor.nombre}*:`,
      button: "Ver horarios",
      sections: [
        {
          title: "Horarios disponibles",
          rows: free.map((slot) => {
            const { dow, date, time } = parseSlot(slot);
            return { id: `slot:${doctor.id}:${slot}`, title: `${DAY_SHORT[dow]} ${date} · ${time}` };
          }),
        },
      ],
    };
  }

  async function confirmPrompt(s: ConversationState): Promise<HandlerResult> {
    const { doctorId = "", slot = "", patient = "" } = s.data ?? {};
    const doctor = await src.doctor(doctorId);
    if (!doctor) return [text("Ese profesional ya no está disponible."), await menu()];
    const esp = (await src.specialties()).find((e) => e.id === doctor.especialidad)?.nombre;
    s.step = "confirm";
    return {
      type: "buttons",
      text: `📋 *Confirmá el turno*\n👨‍⚕️ ${doctor.nombre}${esp ? ` (${esp})` : ""}\n📅 ${describeSlot(slot)}\n🧑 Paciente: ${patient}`,
      buttons: [
        { id: "appt:confirm", title: "Confirmar" },
        { id: `doc:${doctor.id}`, title: "Otro horario" },
        { id: "nav:menu", title: "Cancelar" },
      ],
    };
  }

  async function book(s: ConversationState, msg: IncomingMessage): Promise<HandlerResult> {
    const { doctorId, slot, patient } = s.data ?? {};
    if (!doctorId || !slot || !patient) return [text("Empecemos de nuevo."), await specialties()];
    const doctor = await src.doctor(doctorId);
    const ok = await src.book({
      id: shortId(),
      medicoId: doctorId,
      slot,
      paciente: patient,
      telefono: msg.from,
      creado: new Date().toISOString(),
    });
    s.step = undefined;
    s.data = undefined;
    if (!ok) {
      const again = await slots(s, doctorId);
      return [text("Uy, ese horario se acaba de ocupar 😕 Elegí otro:"), ...[again ?? []].flat()];
    }
    const info = await src.info();
    return {
      type: "buttons",
      text:
        `✅ *Turno confirmado*\n👨‍⚕️ ${doctor?.nombre}\n📅 ${describeSlot(slot)}\n🧑 ${patient}\n📍 ${info.direccion}\n\n` +
        "Te pedimos llegar 10 minutos antes con tu DNI y la credencial de tu obra social.",
      buttons: [{ id: "mine", title: "Mis turnos" }, NAV_MENU],
    };
  }

  async function mine(msg: IncomingMessage): Promise<BotReply> {
    const now = nowSlotKey();
    const upcoming = (await src.appointmentsOf(msg.from))
      .filter((a) => a.slot >= now)
      .sort((a, b) => a.slot.localeCompare(b.slot));
    if (!upcoming.length) {
      return {
        type: "buttons",
        text: "No tenés turnos próximos.",
        buttons: [{ id: "book", title: "Sacar turno" }, NAV_MENU],
      };
    }
    const lines = await Promise.all(
      upcoming.map(async (a) => {
        const doctor = await src.doctor(a.medicoId);
        return `• ${describeSlot(a.slot)}\n   ${doctor?.nombre ?? ""} · Paciente: ${a.paciente}`;
      }),
    );
    return {
      type: "buttons",
      text: `📅 *Tus próximos turnos*\n${lines.join("\n")}`,
      buttons: [{ id: "book", title: "Sacar otro turno" }, NAV_MENU],
    };
  }

  return {
    id: o.id,
    label: o.label,
    menu,

    async handle(msg, s) {
      const id = msg.replyId ?? "";
      const [action, arg, arg2] = id.split(":");

      if (id === "book") return specialties();
      if (action === "esp") return doctors(s, arg);
      if (action === "doc") return slots(s, arg);
      if (action === "slot") {
        s.step = "patient";
        s.data = { doctorId: arg, slot: arg2 };
        return text("🧑 Escribí el *nombre y apellido* del paciente.");
      }
      if (id === "appt:confirm") return book(s, msg);
      if (id === "mine") return mine(msg);
      if (id === "info") return infoReply(await src.info());

      const typed = msg.type === "text" ? msg.text?.trim() : undefined;
      if (typed && s.step === "patient" && s.data?.slot) {
        s.data.patient = typed;
        return confirmPrompt(s);
      }
      if (typed && normalize(typed).includes("turno")) return specialties();
      return [text("Elegí una opción del menú 👇"), await menu()];
    },
  };
}
