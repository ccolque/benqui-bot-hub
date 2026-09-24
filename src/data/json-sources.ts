import { getKV } from "../lib/kv.js";
import { normalize } from "../lib/text.js";
import type {
  Appointment,
  CatalogData,
  CatalogSource,
  ClinicData,
  ClinicSource,
  Order,
  Product,
} from "./types.js";

// Fuentes de datos a partir de un JSON. Lo que se genera durante la conversación
// (pedidos, turnos) se guarda en el KV bajo el namespace indicado.

const STOP_WORDS = new Set(
  "de del la el los las un una unos unas para con y o a en hay tenes tienen tiene busco quiero necesito precio stock".split(" "),
);

/** "tornillos" -> "tornillo", "pinceles" -> "pincel" */
const stem = (word: string) => (word.length > 4 ? word.replace(/(es|s)$/, "") : word);

export function searchProducts(data: CatalogData, query: string): Product[] {
  const words = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
  if (!words.length) return [];

  const categoryName = (p: Product) => data.categorias.find((c) => c.id === p.categoria)?.nombre ?? "";
  const indexed = data.productos.map((p) => ({
    p,
    own: normalize([p.nombre, ...(p.tags ?? [])].join(" ")),
    withCategory: normalize([p.nombre, ...(p.tags ?? []), categoryName(p)].join(" ")),
  }));

  // De más preciso a más amplio: todas las palabras en nombre/tags, luego sumando
  // la categoría, y por último alguna de las palabras.
  const passes: ((e: (typeof indexed)[number]) => boolean)[] = [
    (e) => words.every((w) => e.own.includes(w)),
    (e) => words.every((w) => e.withCategory.includes(w)),
    (e) => words.some((w) => e.withCategory.includes(w)),
  ];
  for (const pass of passes) {
    const found = indexed.filter(pass);
    if (found.length) return found.map((e) => e.p);
  }
  return [];
}

export function jsonCatalog(data: CatalogData, namespace: string): CatalogSource {
  return {
    info: async () => data.info,
    categories: async () => data.categorias,
    productsByCategory: async (categoryId) =>
      data.productos.filter((p) => p.categoria === categoryId),
    search: async (query) => searchProducts(data, query),
    product: async (id) => data.productos.find((p) => p.id === id),
    async createOrder(order: Order) {
      const kv = getKV();
      const key = `orders:${namespace}`;
      const orders = (await kv.get<Order[]>(key)) ?? [];
      await kv.set(key, [order, ...orders].slice(0, 200));
    },
  };
}

export function jsonClinic(data: ClinicData, namespace: string): ClinicSource {
  const takenKey = (doctorId: string) => `booked:${namespace}:${doctorId}`;
  const apptsKey = (phone: string) => `appts:${namespace}:${phone}`;

  return {
    info: async () => data.info,
    specialties: async () => data.especialidades,
    doctors: async (specialtyId) => data.medicos.filter((m) => m.especialidad === specialtyId),
    doctor: async (id) => data.medicos.find((m) => m.id === id),
    takenSlots: async (doctorId) => (await getKV().get<string[]>(takenKey(doctorId))) ?? [],
    async book(appt: Appointment) {
      const kv = getKV();
      const taken = (await kv.get<string[]>(takenKey(appt.medicoId))) ?? [];
      if (taken.includes(appt.slot)) return false;
      await kv.set(takenKey(appt.medicoId), [...taken, appt.slot]);
      const mine = (await kv.get<Appointment[]>(apptsKey(appt.telefono))) ?? [];
      await kv.set(apptsKey(appt.telefono), [...mine, appt]);
      return true;
    },
    appointmentsOf: async (phone) => (await getKV().get<Appointment[]>(apptsKey(phone))) ?? [],
  };
}
