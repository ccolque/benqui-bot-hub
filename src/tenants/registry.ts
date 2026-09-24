import { demo } from "./demo.js";
import type { Tenant, TenantHandler } from "./types.js";

/**
 * Para agregar un cliente:
 *   1. Crear src/tenants/<cliente>.ts exportando un TenantHandler.
 *   2. Agregarlo a esta lista.
 *   3. Definir en Vercel TENANT_<ID>_PHONE_NUMBER_ID y TENANT_<ID>_ACCESS_TOKEN.
 */
const handlers: TenantHandler[] = [demo];

function envKey(id: string, suffix: string): string {
  return `TENANT_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${suffix}`;
}

function buildRegistry(): Map<string, Tenant> {
  const map = new Map<string, Tenant>();
  for (const handler of handlers) {
    const phoneNumberId = process.env[envKey(handler.id, "PHONE_NUMBER_ID")];
    const accessToken = process.env[envKey(handler.id, "ACCESS_TOKEN")];
    if (!phoneNumberId || !accessToken) {
      console.warn(`[registry] Tenant "${handler.id}" sin credenciales, se omite.`);
      continue;
    }
    map.set(phoneNumberId, { handler, phoneNumberId, accessToken });
  }
  return map;
}

let registry: Map<string, Tenant> | undefined;

export function getTenantByPhoneNumberId(phoneNumberId: string): Tenant | undefined {
  registry ??= buildRegistry();
  return registry.get(phoneNumberId);
}
