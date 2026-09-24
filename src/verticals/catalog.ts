import type { CatalogSource, Order, OrderItem, Product } from "../data/types.js";
import type {
  BotReply,
  HandlerContext,
  HandlerResult,
  IncomingMessage,
  ListRow,
} from "../tenants/types.js";
import {
  infoReply,
  money,
  NAV_MENU,
  NAV_SWITCH,
  shortId,
  text,
  type ConversationState,
  type Vertical,
} from "./shared.js";

export interface CatalogOptions {
  id: string;
  label: string;
  emoji: string;
  intro: string;
  searchPrompt: string;
  /** Texto corto bajo "Buscar producto" en el menú (máx. 72 caracteres). */
  searchHint: string;
  browseTitle: string;
  showStock: boolean;
  /** Pregunta delivery / retiro antes de cerrar el pedido. */
  askDelivery: boolean;
  /** El pedido queda pendiente hasta que un operador lo confirme. */
  operatorConfirms: boolean;
  /** WhatsApp del operador al que se avisa de cada pedido nuevo. */
  operatorPhone?: string;
}

/**
 * Flujo de catálogo: buscar por nombre o categoría, armar el pedido y confirmarlo.
 * Sirve para ferretería, restaurante, kiosco, etc. (cambian las opciones).
 */
export function createCatalogVertical(src: CatalogSource, o: CatalogOptions): Vertical {
  const available = (p: Product) =>
    p.disponible !== false && (p.stock === undefined || p.stock > 0);
  const count = (s: ConversationState) => (s.cart ?? []).reduce((n, i) => n + i.cantidad, 0);
  const total = (s: ConversationState) =>
    (s.cart ?? []).reduce((n, i) => n + i.cantidad * i.precio, 0);
  const cartLines = (items: OrderItem[]) =>
    items.map((i) => `• ${i.cantidad} x ${i.nombre} — ${money(i.cantidad * i.precio)}`).join("\n");

  function productRow(p: Product): ListRow {
    let detail = money(p.precio);
    if (!available(p)) detail += " · Sin stock";
    else if (o.showStock && p.stock !== undefined) detail += ` · Stock: ${p.stock}`;
    else if (p.descripcion) detail += ` · ${p.descripcion}`;
    // El título de una fila admite 24 caracteres: si no entra, el nombre completo va en la descripción.
    const description = p.nombre.length > 24 ? `${p.nombre} · ${detail}` : detail;
    return { id: `prod:${p.id}`, title: p.nombre, description };
  }

  function productList(products: Product[], header: string): BotReply {
    const more = products.length > 10 ? `\n(Te muestro 10 de ${products.length}; escribí algo más específico para afinar)` : "";
    return {
      type: "list",
      text: header + more,
      button: "Ver productos",
      sections: [{ title: "Productos", rows: products.slice(0, 10).map(productRow) }],
    };
  }

  async function menu(s: ConversationState): Promise<BotReply> {
    const info = await src.info();
    const n = count(s);
    return {
      type: "list",
      text: `${o.emoji} *${info.nombre}*\n${o.intro}`,
      button: "Ver opciones",
      sections: [
        {
          title: "Opciones",
          rows: [
            { id: "search", title: "Buscar producto", description: o.searchHint },
            { id: "browse", title: o.browseTitle },
            {
              id: "cart:view",
              title: "Mi pedido",
              description: n ? `${n} producto(s) · ${money(total(s))}` : "Todavía está vacío",
            },
            { id: "info", title: "Horarios y ubicación" },
            NAV_SWITCH,
          ],
        },
      ],
    };
  }

  async function categories(): Promise<BotReply> {
    const cats = await src.categories();
    return {
      type: "list",
      text: "📂 Elegí una categoría:",
      button: "Ver categorías",
      sections: [{ title: "Categorías", rows: cats.map((c) => ({ id: `cat:${c.id}`, title: c.nombre })) }],
    };
  }

  async function category(s: ConversationState, categoryId: string): Promise<HandlerResult> {
    const products = await src.productsByCategory(categoryId);
    const cat = (await src.categories()).find((c) => c.id === categoryId);
    if (!products.length) return [text("No hay productos en esa categoría."), await menu(s)];
    return productList(products, `📂 *${cat?.nombre ?? "Productos"}*\nElegí uno para ver el detalle:`);
  }

  async function search(s: ConversationState, query: string): Promise<HandlerResult> {
    s.step = undefined;
    const results = await src.search(query);
    if (!results.length) {
      return {
        type: "buttons",
        text: `😕 No encontré nada para "${query}". Probá con otra palabra o mirá las categorías.`,
        buttons: [{ id: "browse", title: o.browseTitle }, NAV_MENU],
      };
    }
    if (results.length === 1) return product(s, results[0].id);
    return productList(results, `🔎 Encontré ${results.length} resultados para "${query}":`);
  }

  async function product(s: ConversationState, productId: string): Promise<HandlerResult> {
    const p = await src.product(productId);
    if (!p) return [text("Ese producto ya no está disponible."), await menu(s)];

    const lines = [`*${p.nombre}*`, money(p.precio)];
    if (p.descripcion) lines.push(p.descripcion);
    if (!available(p)) {
      lines.push("", "❌ Sin stock por el momento.");
      return {
        type: "buttons",
        text: lines.join("\n"),
        buttons: [{ id: "search", title: "Buscar otro" }, { id: "browse", title: o.browseTitle }],
      };
    }
    if (o.showStock && p.stock !== undefined) lines.push(`✅ Stock: ${p.stock} unidades`);
    lines.push("", "¿Cuántos agregás al pedido? Tocá un botón o escribí la cantidad.");
    s.step = "qty";
    s.data = { productId: p.id };
    return {
      type: "buttons",
      text: lines.join("\n"),
      buttons: [1, 2, 3].map((n) => ({ id: `qty:${p.id}:${n}`, title: String(n) })),
    };
  }

  async function addToCart(s: ConversationState, productId: string, qty: number): Promise<HandlerResult> {
    const p = await src.product(productId);
    if (!p || !available(p)) return [text("Ese producto ya no está disponible."), await menu(s)];
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      return text("Decime una cantidad válida (un número, por ejemplo *2*).");
    }
    const cart = (s.cart ??= []);
    const existing = cart.find((i) => i.id === p.id);
    const newQty = (existing?.cantidad ?? 0) + qty;
    if (p.stock !== undefined && newQty > p.stock) {
      const already = existing ? ` (ya tenés ${existing.cantidad} en el pedido)` : "";
      return text(`Solo tenemos ${p.stock} unidades de ${p.nombre}${already}. Escribí una cantidad menor.`);
    }
    if (existing) existing.cantidad = newQty;
    else cart.push({ id: p.id, nombre: p.nombre, precio: p.precio, cantidad: qty });
    s.step = undefined;
    s.data = undefined;
    return {
      type: "buttons",
      text: `✅ Agregué ${qty} x ${p.nombre}.\n🛒 Llevás ${count(s)} producto(s) · ${money(total(s))}`,
      buttons: [
        { id: "nav:menu", title: "Seguir comprando" },
        { id: "cart:view", title: "Ver pedido" },
        { id: "cart:confirm", title: "Confirmar pedido" },
      ],
    };
  }

  async function cart(s: ConversationState): Promise<HandlerResult> {
    if (!s.cart?.length) return [text("🛒 Tu pedido está vacío."), await menu(s)];
    return {
      type: "buttons",
      text: `🛒 *Tu pedido*\n${cartLines(s.cart)}\n\n*Total: ${money(total(s))}*`,
      buttons: [
        { id: "cart:confirm", title: "Confirmar pedido" },
        { id: "nav:menu", title: "Seguir comprando" },
        { id: "cart:clear", title: "Vaciar pedido" },
      ],
    };
  }

  async function checkout(s: ConversationState, msg: IncomingMessage): Promise<HandlerResult> {
    if (!s.cart?.length) return cart(s);
    if (!o.askDelivery) return placeOrder(s, msg);
    const envio = (await src.info()).pedidos?.costoEnvio;
    return {
      type: "buttons",
      text: `¿Cómo querés recibir tu pedido?${envio ? `\n🛵 Delivery: +${money(envio)}` : ""}`,
      buttons: [
        { id: "chk:delivery", title: "Delivery" },
        { id: "chk:pickup", title: "Retiro en el local" },
      ],
    };
  }

  async function placeOrder(
    s: ConversationState,
    msg: IncomingMessage,
    delivery?: { entrega: "delivery" | "retiro"; direccion?: string },
  ): Promise<HandlerResult> {
    const items = s.cart ?? [];
    if (!items.length) return cart(s);
    const settings = (await src.info()).pedidos ?? {};
    const envio = delivery?.entrega === "delivery" ? (settings.costoEnvio ?? 0) : 0;
    const order: Order = {
      id: shortId(),
      negocio: o.id,
      cliente: msg.from,
      nombre: msg.contactName,
      items,
      envio,
      total: total(s) + envio,
      entrega: delivery?.entrega,
      direccion: delivery?.direccion,
      estado: o.operatorConfirms ? "pendiente" : "confirmado",
      fecha: new Date().toISOString(),
    };
    await src.createOrder(order);
    s.cart = [];
    s.step = undefined;
    s.data = undefined;

    const summary = [
      cartLines(order.items),
      ...(envio ? [`• Envío — ${money(envio)}`] : []),
      `*Total: ${money(order.total)}*`,
    ].join("\n");

    if (o.operatorConfirms) {
      const replies: BotReply[] = [
        text(
          `📝 *Pedido #${order.id} recibido*\n${summary}\n\n` +
            "Un operador va a verificar la disponibilidad y te confirma por acá en breve. ¡Gracias!",
        ),
      ];
      if (o.operatorPhone) {
        replies.push({
          to: o.operatorPhone,
          type: "text",
          text: `🔔 *Nuevo pedido #${order.id}* (${o.label})\nCliente: ${order.nombre ?? ""} +${order.cliente}\n${summary}`,
        });
      }
      return replies;
    }

    const isDelivery = order.entrega === "delivery";
    const eta = isDelivery ? settings.demoraDelivery : settings.demoraRetiro;
    return text(
      `✅ *Pedido #${order.id} confirmado*\n${summary}\n\n` +
        (isDelivery ? `🛵 Lo enviamos a: ${order.direccion}` : "🏪 Lo retirás en el local") +
        (eta ? `\n⏱️ Tiempo estimado: ${eta}` : "") +
        "\n¡Gracias por tu pedido!",
    );
  }

  return {
    id: o.id,
    label: o.label,
    menu,

    async handle(msg, s, _ctx: HandlerContext) {
      const id = msg.replyId ?? "";
      const [action, arg, arg2] = id.split(":");

      if (id === "search") {
        s.step = "search";
        return text(`🔎 ${o.searchPrompt}`);
      }
      if (id === "browse") return categories();
      if (action === "cat") return category(s, arg);
      if (action === "prod") return product(s, arg);
      if (action === "qty") return addToCart(s, arg, Number(arg2));
      if (id === "cart:view") return cart(s);
      if (id === "cart:clear") {
        s.cart = [];
        return [text("🗑️ Listo, vacié tu pedido."), await menu(s)];
      }
      if (id === "cart:confirm") return checkout(s, msg);
      if (id === "chk:pickup") return placeOrder(s, msg, { entrega: "retiro" });
      if (id === "chk:delivery") {
        s.step = "address";
        return text("🛵 ¿A qué dirección lo enviamos? Escribí calle, número y barrio.");
      }
      if (id === "info") return infoReply(await src.info());

      const typed = msg.type === "text" ? msg.text?.trim() : undefined;
      if (typed) {
        if (s.step === "address") return placeOrder(s, msg, { entrega: "delivery", direccion: typed });
        if (/^\d+$/.test(typed)) {
          if (s.step === "qty" && s.data?.productId) return addToCart(s, s.data.productId, Number(typed));
          return text("Primero elegí un producto (buscalo por nombre o desde las categorías) y después la cantidad.");
        }
        // Cualquier otro texto se toma como búsqueda.
        return search(s, typed);
      }
      if (!id) return [text("Por ahora entiendo texto y botones 🙂"), await menu(s)];
      return menu(s);
    },
  };
}
