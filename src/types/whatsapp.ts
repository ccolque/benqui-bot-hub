// Tipos mínimos del payload que Meta envía al webhook.
// Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components

export interface WebhookPayload {
  object: string; // "whatsapp_business_account"
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string; // WABA ID
  changes: WebhookChange[];
}

export interface WebhookChange {
  field: string; // "messages"
  value: WebhookValue;
}

export interface WebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WhatsAppMessage[];
  statuses?: unknown[]; // sent / delivered / read / failed
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string; // text | interactive | button | image | audio | location | ...
  text?: { body: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
  [key: string]: unknown;
}
