# benqui-bot-hub

API multi-tenant para bots de WhatsApp (Meta Cloud API), en Node + TypeScript, desplegada en Vercel.
Un solo webhook recibe los mensajes de todos los clientes y los deriva según el `phone_number_id`.

## Estructura

```
api/
  webhook.ts          GET = verificación de Meta · POST = mensajes entrantes
  health.ts           GET /api/health
public/
  privacy.html        política de privacidad (/privacy.html)
src/
  lib/
    process.ts        parsea el payload, arma la sesión, llama al tenant y envía las respuestas
    whatsapp.ts       cliente de la Graph API (texto, botones, listas, marcar leído)
    kv.ts             almacenamiento: Upstash Redis o memoria
    signature.ts      valida X-Hub-Signature-256 con el App Secret
  tenants/
    registry.ts       lista de tenants + mapeo phone_number_id -> tenant
    demo.ts           tenant demo: elegir tipo de negocio y delegar en su vertical
    types.ts          contrato TenantHandler / BotReply / HandlerContext
  verticals/          flujos reutilizables por tipo de negocio
    catalog.ts        buscar productos / categorías -> pedido (ferretería, restaurante)
    clinic.ts         especialidad -> profesional -> horario -> turno (centro médico)
  data/
    types.ts          contratos de datos (CatalogSource, ClinicSource)
    json-sources.ts   fuente de datos desde JSON (demo)
    http-catalog.ts   fuente de datos desde una API externa
    demo/*.json       datos de ejemplo
```

## Cómo se separan flujo y datos

- **Flujo** (qué pregunta el bot y en qué orden): código en `src/verticals/`.
- **Datos** (horarios, dirección, productos, agenda): una fuente que implementa `CatalogSource` o `ClinicSource`.
  Hoy son JSON en `src/data/demo/`. Para usar la API de un cliente se define
  `TENANT_DEMO_<NEGOCIO>_API_URL`, y el flujo no cambia. El contrato de la API está documentado en
  [src/data/http-catalog.ts](src/data/http-catalog.ts).
- **Estado de la conversación**, pedidos y turnos: en Upstash Redis (`src/lib/kv.ts`).

## Variables de entorno

Ver [.env.example](.env.example).

| Variable | Descripción |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | String que vos inventás; el mismo va en la configuración del webhook en Meta |
| `META_APP_SECRET` | Clave secreta de la app (Configuración > Básica). Si falta, no se valida la firma |
| `GRAPH_API_VERSION` | Por defecto `v22.0` |
| `TENANT_<ID>_PHONE_NUMBER_ID` | `phone_number_id` del número de ese cliente |
| `TENANT_<ID>_ACCESS_TOKEN` | Token permanente del System User de ese cliente |
| `TENANT_DEMO_OPERATOR_PHONE` | (Opcional) WhatsApp que recibe el aviso de cada pedido de la ferretería |
| `TENANT_DEMO_<NEGOCIO>_API_URL` / `_API_KEY` | (Opcional) API externa para el catálogo de ese negocio |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis. Se crean al agregar Upstash desde el Marketplace de Vercel |

## Deploy

1. `npm install`
2. Importar el repo en Vercel y cargar las variables de entorno.
3. En Vercel > Storage, agregar **Upstash Redis** (plan gratis) y conectarlo al proyecto.
4. En Meta > WhatsApp > Configuración > Webhook:
   - URL de devolución de llamada: `https://<tu-proyecto>.vercel.app/api/webhook`
   - Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN`
   - Suscribirse al campo **messages**.
5. Escribir "hola" al número de prueba desde un número agregado como destinatario.

Desarrollo local: `npm run dev` (necesita `npm i -g vercel`) y un túnel tipo ngrok para que Meta llegue a tu máquina.

## Agregar un cliente

1. Crear `src/tenants/<cliente>.ts` con un `TenantHandler`. Lo normal es que use un solo vertical
   (por ejemplo `createCatalogVertical(httpCatalog(url), {...})`) sin el selector de negocio del demo.
2. Agregarlo al array `handlers` en `src/tenants/registry.ts`.
3. Cargar en Vercel `TENANT_<CLIENTE>_PHONE_NUMBER_ID` y `TENANT_<CLIENTE>_ACCESS_TOKEN`.
