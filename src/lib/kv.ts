/**
 * Almacenamiento clave-valor para sesiones de conversación, pedidos y turnos.
 * Usa Upstash Redis (REST) si está configurado; si no, memoria del proceso
 * (sirve para desarrollo, pero en Vercel se pierde entre instancias).
 */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

class UpstashKV implements KV {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async command(args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(args),
    });
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || json.error) throw new Error(`Upstash ${res.status}: ${json.error ?? ""}`);
    return json.result;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.command(["GET", key]);
    return raw == null ? null : (JSON.parse(raw as string) as T);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const args = ["SET", key, JSON.stringify(value)];
    await this.command(ttlSeconds ? [...args, "EX", ttlSeconds] : args);
  }

  async del(key: string): Promise<void> {
    await this.command(["DEL", key]);
  }
}

class MemoryKV implements KV {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value: JSON.stringify(value), expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let kv: KV | undefined;

export function getKV(): KV {
  if (kv) return kv;
  // La integración de Upstash en Vercel crea KV_REST_API_*; Upstash directo usa UPSTASH_REDIS_REST_*.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    kv = new UpstashKV(url, token);
  } else {
    console.warn("[kv] Upstash no configurado: se usa memoria (las sesiones pueden perderse).");
    kv = new MemoryKV();
  }
  return kv;
}
