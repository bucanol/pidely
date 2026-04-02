import type { Request, Response } from "express";
import { storage } from "./storage";
import Groq from "groq-sdk";

let groq: Groq;
const MODEL = "llama-3.3-70b-versatile";

function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

const clientTools = [
  { type: "function" as const, function: { name: "get_menu", description: "Obtiene el menú completo del restaurante con precios y disponibilidad.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_my_bill", description: "Obtiene la cuenta actual de la mesa.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "place_order", description: "Envía un pedido a cocina.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, name: { type: "string" }, price: { type: "number" }, quantity: { type: "number" }, notes: { type: "string" } }, required: ["productId", "name", "price", "quantity"] } } }, required: ["items"] } } },
  { type: "function" as const, function: { name: "call_waiter", description: "Llama al mesero a la mesa.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "request_bill", description: "Solicita la cuenta.", parameters: { type: "object", properties: {}, required: [] } } },
];

const kitchenTools = [
  { type: "function" as const, function: { name: "get_active_orders", description: "Obtiene órdenes activas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_menu_with_details", description: "Obtiene el menú con ingredientes y recetas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_ingredient_alerts", description: "Detecta ingredientes con alta demanda.", parameters: { type: "object", properties: {}, required: [] } } },
];

const waiterTools = [
  { type: "function" as const, function: { name: "get_tables_status", description: "Estado de todas las mesas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_table_bill", description: "Cuenta de una mesa específica.", parameters: { type: "object", properties: { tableId: { type: "string" } }, required: ["tableId"] } } },
  { type: "function" as const, function: { name: "get_waiter_calls", description: "Llamadas de mesero pendientes.", parameters: { type: "object", properties: {}, required: [] } } },
];

const ownerTools = [
  ...waiterTools,
  { type: "function" as const, function: { name: "get_analytics", description: "Estadísticas completas de ventas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_full_menu", description: "Menú completo administrativo.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_tickets_history", description: "Historial de tickets pagados.", parameters: { type: "object", properties: {}, required: [] } } },
];

async function executeTool(name: string, args: any, restaurantId: string, role: string, tableId?: string, slug?: string): Promise<string> {
  try {
    switch (name) {
      case "get_menu":
      case "get_full_menu":
      case "get_menu_with_details": {
        const categories = await storage.getCategoriesByRestaurant(restaurantId);
        const products = await storage.getProductsByRestaurant(restaurantId);
        return JSON.stringify(categories.map(cat => ({
          categoria: cat.name,
          platillos: products.filter(p => p.categoryId === cat.id).map(p => ({
            id: p.id,
            nombre: p.name,
            descripcion: p.description || "",
            precio: Number(p.price),
            disponible: p.isAvailable,
          }))
        })));
      }
      case "get_my_bill": {
        if (!tableId) return JSON.stringify({ error: "Mesa no identificada" });
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) return JSON.stringify({ total: 0, pedidos: [] });
        const orders = await storage.getOrdersByTicket(ticket.id);
        return JSON.stringify({
          total: Number(ticket.total),
          pedidos: orders.map(o => ({ hora: new Date(o.createdAt).toLocaleTimeString("es"), estado: o.status, items: o.itemsJson, total: Number(o.total) }))
        });
      }
      case "place_order": {
        const { items } = args;
        if (!items || items.length === 0) return JSON.stringify({ error: "No hay items" });
        const total = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
        let ticket = await storage.getOpenTicketByTable(restaurantId, tableId!);
        if (!ticket) ticket = await storage.createTicket({ restaurantId, tableId: tableId!, status: "open", total: "0" });
        const order = await storage.createOrder({ restaurantId, tableId: tableId!, ticketId: ticket.id, itemsJson: items, status: "pending", total: total.toFixed(2) });
        await storage.updateTicketTotal(ticket.id, (Number(ticket.total) + total).toFixed(2));
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "new_order", data: { order, tableId } });
        return JSON.stringify({ success: true, total: total.toFixed(2) });
      }
      case "call_waiter": {
        if (!tableId) return JSON.stringify({ error: "Mesa no identificada" });
        const call = await storage.createWaiterCall({ restaurantId, tableId, resolved: false });
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "waiter_call", data: { call, tableId } });
        return JSON.stringify({ success: true });
      }
      case "request_bill": {
        if (!tableId) return JSON.stringify({ error: "Mesa no identificada" });
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) return JSON.stringify({ error: "No hay cuenta abierta" });
        await storage.requestBill(ticket.id);
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "bill_request", data: { tableId, ticketId: ticket.id } });
        return JSON.stringify({ success: true });
      }
      case "get_active_orders": {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        const active = orders.filter(o => o.status !== "delivered");
        return JSON.stringify(active.map(o => ({ id: o.id, mesa: o.tableId, estado: o.status, items: o.itemsJson, total: Number(o.total) })));
      }
      case "get_ingredient_alerts": {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        const active = orders.filter(o => o.status === "pending" || o.status === "preparing");
        const itemCount: Record<string, number> = {};
        for (const order of active) {
          const items = order.itemsJson as Array<{ name: string; quantity: number }>;
          if (Array.isArray(items)) {
            for (const item of items) {
              itemCount[item.name] = (itemCount[item.name] || 0) + item.quantity;
            }
          }
        }
        return JSON.stringify(Object.entries(itemCount).filter(([, qty]) => qty >= 3).map(([name, qty]) => ({ platillo: name, cantidad: qty })));
      }
      case "get_tables_status": {
        const tables = await storage.getTablesByRestaurant(restaurantId);
        const allOrders = await storage.getOrdersByRestaurant(restaurantId);
        const allCalls = await storage.getWaiterCallsByRestaurant(restaurantId);
        const allTickets = await storage.getTicketsByRestaurant(restaurantId);
        return JSON.stringify(tables.map(t => {
          const activeOrders = allOrders.filter(o => o.tableId === String(t.number) && o.status !== "delivered");
          const hasCall = allCalls.some(c => c.tableId === String(t.number) && !c.resolved);
          const openTicket = allTickets.find(tk => tk.tableId === String(t.number) && tk.status === "open");
          return {
            mesa: t.number,
            estado: hasCall ? "llamada_mesero" : activeOrders.length > 0 || openTicket ? "ocupada" : "libre",
            ordenesActivas: activeOrders.length,
            total: openTicket ? Number(openTicket.total) : 0,
            cuentaSolicitada: openTicket?.billRequested || false,
          };
        }));
      }
      case "get_table_bill": {
        const { tableId: tId } = args;
        const ticket = await storage.getOpenTicketByTable(restaurantId, tId);
        if (!ticket) return JSON.stringify({ mesa: tId, total: 0, pedidos: [] });
        const orders = await storage.getOrdersByTicket(ticket.id);
        return JSON.stringify({
          mesa: tId,
          total: Number(ticket.total),
          cuentaSolicitada: ticket.billRequested,
          pedidos: orders.map(o => ({ hora: new Date(o.createdAt).toLocaleTimeString("es"), estado: o.status, items: o.itemsJson, total: Number(o.total) }))
        });
      }
      case "get_waiter_calls": {
        const calls = await storage.getWaiterCallsByRestaurant(restaurantId);
        return JSON.stringify(calls.filter(c => !c.resolved).map(c => ({ mesa: c.tableId, hora: new Date(c.createdAt).toLocaleTimeString("es") })));
      }
      case "get_analytics": {
        const allOrders = await storage.getOrdersByRestaurant(restaurantId);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        let totalToday = 0, totalMonth = 0, totalAll = 0;
        let ordersToday = 0, ordersMonth = 0;
        const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
        for (const order of allOrders) {
          const d = new Date(order.createdAt);
          const t = Number(order.total);
          totalAll += t;
          if (d >= startOfToday) { totalToday += t; ordersToday++; }
          if (d >= startOfMonth) { totalMonth += t; ordersMonth++; }
          const items = order.itemsJson as Array<{ productId: string; name: string; price: number; quantity: number }>;
          if (Array.isArray(items)) {
            for (const item of items) {
              if (!productSales[item.productId]) productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
              productSales[item.productId].quantity += item.quantity;
              productSales[item.productId].revenue += item.price * item.quantity;
            }
          }
        }
        const topProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
        return JSON.stringify({
          hoy: { ventas: totalToday, ordenes: ordersToday },
          mes: { ventas: totalMonth, ordenes: ordersMonth },
          total: { ventas: totalAll, ordenes: allOrders.length },
          topProductos: topProducts,
        });
      }
      case "get_tickets_history": {
        const tickets = await storage.getPaidTicketsByRestaurant(restaurantId);
        return JSON.stringify(tickets.slice(0, 20).map(t => ({ mesa: t.tableId, total: Number(t.total), metodoPago: t.paymentMethod, cerrado: t.closedAt })));
      }
      default:
        return JSON.stringify({ error: "Herramienta no encontrada" });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

function buildSystemPrompt(role: string, restaurantName: string, tableId?: string): string {
  const base = `Eres el asistente de "${restaurantName}" en Pidely.

FORMATO OBLIGATORIO:
- Respuestas cortas y directas (máximo 3-4 líneas)
- Usa saltos de línea entre ideas
- Nunca hagas párrafos largos
- Usa emojis con moderación
- NUNCA inventes platillos, precios ni datos
- SIEMPRE consulta las herramientas disponibles antes de responder sobre el menú, cuentas u órdenes
- Responde en el mismo idioma del usuario`;

  switch (role) {
    case "client":
      return `${base}

ROL: Asistente de mesa ${tableId}.
- Sugiere platillos del menú real consultando get_menu
- Detecta alergias y filtra sugerencias
- Permite pedir, ver cuenta, llamar mesero
- Si piden algo que no está en el menú: "Lo sentimos, no contamos con ese platillo."
- Haz upselling natural cuando sea apropiado`;

    case "cook":
      return `${base}

ROL: Asistente de cocina.
- Muestra órdenes activas
- Consulta ingredientes y recetas del menú
- Alerta sobre ingredientes con alta demanda
- Sé directo y rápido`;

    case "waiter":
      return `${base}

ROL: Asistente de mesero.
- Muestra estado de mesas
- Consulta cuentas por mesa
- Muestra llamadas pendientes
- Sugiere mesas que necesitan atención`;

    case "owner":
      return `${base}

ROL: Asistente ejecutivo del dueño.
- Acceso completo al negocio
- Reportes de ventas y analytics
- Detecta patrones y sugiere promociones
- Genera ideas de marketing basadas en datos reales
- Sé ejecutivo y orientado a resultados`;

    default:
      return base;
  }
}

async function runAILoop(
  messages: any[],
  tools: any[],
  restaurantId: string,
  role: string,
  tableId?: string,
  slug?: string
): Promise<string> {
  let response = await getGroq().chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: "auto",
    max_tokens: 400,
    temperature: 0.3,
  });

  let assistantMessage = response.choices[0].message;

  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);

    const toolResults = await Promise.all(
      assistantMessage.tool_calls.map(async (tc) => ({
        role: "tool" as const,
        tool_call_id: tc.id,
        content: await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), restaurantId, role, tableId, slug),
      }))
    );

    messages.push(...toolResults);

    // IMPORTANTE: siempre incluir tools en el loop
    response = await getGroq().chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 400,
      temperature: 0.3,
    });

    assistantMessage = response.choices[0].message;
  }

  return assistantMessage.content || "¿En qué más puedo ayudarte?";
}

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || !user.restaurantId) return res.status(401).json({ error: "No autorizado" });

    const { message, history = [], tableId, slug } = req.body;
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });

    const restaurant = await storage.getRestaurant(user.restaurantId);
    const role = user.role;

    const tools =
      role === "owner" ? ownerTools :
      role === "cook" ? kitchenTools :
      role === "waiter" ? waiterTools :
      clientTools;

    const systemPrompt = buildSystemPrompt(role, restaurant?.name || "el restaurante", tableId);

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10), // solo los últimos 10 mensajes para no corromper el contexto
      { role: "user", content: message },
    ];

    const reply = await runAILoop(messages, tools, user.restaurantId, role, tableId, slug);
    res.json({ reply });

  } catch (err: any) {
    console.error("AI ADMIN ERROR:", err?.message || err);
    res.status(500).json({ error: "Error del asistente. Intenta de nuevo." });
  }
}

export async function handlePublicAIChat(req: Request, res: Response) {
  try {
    const { message, history = [], tableId, slug } = req.body;
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });
    if (!slug || !tableId) return res.status(400).json({ error: "Mesa no identificada" });

    const restaurant = await storage.getRestaurantBySlug(slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurante no encontrado" });

    const systemPrompt = buildSystemPrompt("client", restaurant.name, tableId);

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10),
      { role: "user", content: message },
    ];

    const reply = await runAILoop(messages, clientTools, restaurant.id, "client", tableId, slug);
    res.json({ reply });

  } catch (err: any) {
    console.error("AI PUBLIC ERROR:", err?.message || err);
    res.status(500).json({ error: "Error del asistente. Intenta de nuevo." });
  }
}