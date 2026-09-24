import type { BusinessInfo, CatalogSource, Category, Order, Product } from "./types.js";

/**
 * Catálogo servido por una API externa (la del cliente, o una propia sobre
 * Google Sheets / Supabase / etc.). Contrato esperado:
 *
 *   GET  /info                     -> BusinessInfo
 *   GET  /categorias               -> Category[]
 *   GET  /productos?categoria=:id  -> Product[]
 *   GET  /productos?q=:texto       -> Product[]   (la búsqueda la resuelve la API)
 *   GET  /productos/:id            -> Product     (404 si no existe)
 *   POST /pedidos                  <- Order
 */
export function httpCatalog(baseUrl: string, apiKey?: string): CatalogSource {
  const base = baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T | undefined> {
    const res = await fetch(base + path, { ...init, headers });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`API ${init?.method ?? "GET"} ${path} -> ${res.status}`);
    return res.status === 204 ? undefined : ((await res.json()) as T);
  }
  const list = async <T>(path: string) => (await request<T[]>(path)) ?? [];
  const q = encodeURIComponent;

  return {
    info: async () => (await request<BusinessInfo>("/info"))!,
    categories: () => list<Category>("/categorias"),
    productsByCategory: (id) => list<Product>(`/productos?categoria=${q(id)}`),
    search: (text) => list<Product>(`/productos?q=${q(text)}`),
    product: (id) => request<Product>(`/productos/${q(id)}`),
    async createOrder(order: Order) {
      await request("/pedidos", { method: "POST", body: JSON.stringify(order) });
    },
  };
}
