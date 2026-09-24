# benqui-bot-hub

API multi-tenant para bots de WhatsApp (Meta Cloud API), en Node + TypeScript, desplegada en Vercel.
Un solo webhook recibe los mensajes de todos los clientes y los deriva según el `phone_number_id`.

## Estructura

```
api/
  webhook.ts        GET = verificación de Meta · POST = mensajes entrantes
  health.ts         GET /api/health
src/
  lib/
    process.ts      parsea el payload, busca el tenant y envía las respuestas
    whatsapp.ts     cliente de la Graph API (texto, botones, marcar leído)
    signature.ts    valida X-Hub-Signature-256 con el App Secret
    env.ts
  tenants/
    registry.ts     lista de tenants + mapeo phone_number_id -> tenant
    demo.ts         tenant de ejemplo (menú con botones)
    types.ts        contrato TenantHandler / BotReply
  types/whatsapp.ts tipos del payload de Meta
```

## Variables de entorno

Ver [.env.example](.env.example).

| Variable | Descripción |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | String que vos inventás; el mismo va en la configuración del webhook en Meta |
| `META_APP_SECRET` | Clave secreta de la app (Configuración > Básica). Si falta, no se valida la firma |
| `GRAPH_API_VERSION` | Por defecto `v22.0` |
| `TENANT_<ID>_PHONE_NUMBER_ID` | `phone_number_id` del número de ese cliente |
| `TENANT_<ID>_ACCESS_TOKEN` | Token permanente del System User de ese cliente |

## Deploy

1. `npm install`
2. Importar el repo en Vercel y cargar las variables de entorno.
3. En Meta > WhatsApp > Configuración > Webhook:
   - URL de devolución de llamada: `https://<tu-proyecto>.vercel.app/api/webhook`
   - Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN`
   - Suscribirse al campo **messages**.
4. Escribir "hola" al número de prueba desde un número agregado como destinatario.

Desarrollo local: `npm run dev` (necesita `npm i -g vercel`) y un túnel tipo ngrok para que Meta llegue a tu máquina.

## Agregar un cliente

1. Copiar `src/tenants/demo.ts` a `src/tenants/<cliente>.ts` y cambiar `id` y la lógica.
2. Agregarlo al array `handlers` en `src/tenants/registry.ts`.
3. Cargar en Vercel `TENANT_<CLIENTE>_PHONE_NUMBER_ID` y `TENANT_<CLIENTE>_ACCESS_TOKEN`.

El handler recibe un `IncomingMessage` normalizado y devuelve un `BotReply`, un array de ellos o `null` para no responder.
Puede ser `async`, así que puede consultar un Sheet, una DB o la API del cliente.
