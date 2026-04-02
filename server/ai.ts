import type { Request, Response } from "express";
import { storage } from "./storage";
import Groq from "groq-sdk";

let groq: Groq;
const POWER_MODEL = "llama-3.3-70b-versatile";
const LIGHT_MODEL = "llama-3.1-8b-instant";

function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

// --- TOOLS (SIN CAMBIOS PARA NO ROMPER NADA) ---
const clientTools = [
  { type: "function" as const, function: { name: "get_menu", description: "Obtiene el menú completo del restaurante con categorías, platillos, precios, descripciones y disponibilidad.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_my_bill", description: "Obtiene la cuenta actual de la mesa: pedidos realizados, productos y total acumulado.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "place_order", description: "Envía un pedido a cocina en nombre del cliente.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, name: { type: "string" }, price: { type: "number" }, quantity: { type: "number" }, notes: { type: "string" } }, required: ["productId", "name", "price", "quantity"] } } }, required: ["items"] } } },
  { type: "function" as const, function: { name: "call_waiter", description: "Llama al mesero a la mesa del cliente.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "request_bill", description: "Solicita la cuenta para que el mesero la traiga.", parameters: { type: "object", properties: {}, required: [] } } },
];

const kitchenTools = [
  { type: "function" as const, function: { name: "get_active_orders", description: "Obtiene todas las órdenes activas (pendientes o en preparación) del restaurante.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_menu_with_details", description: "Obtiene el menú completo con descripciones detalladas de ingredientes y recetas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_ingredient_alerts", description: "Analiza las órdenes activas y detecta ingredientes con alta demanda.", parameters: { type: "object", properties: {}, required: [] } } },
];

const waiterTools = [
  { type: "function" as const, function: { name: "get_tables_status", description: "Obtiene el estado de todas las mesas: libre, ocupada, con llamada de mesero, total acumulado.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_table_bill", description: "Obtiene la cuenta detallada de una mesa específica.", parameters: { type: "object", properties: { tableId: { type: "string" } }, required: ["tableId"] } } },
  { type: "function" as const, function: { name: "get_waiter_calls", description: "Obtiene las llamadas de mesero pendientes de resolver.", parameters: { type: "object", properties: {}, required: [] } } },
];

const ownerTools = [
  ...waiterTools,
  { type: "function" as const, function: { name: "get_analytics", description: "Obtiene estadísticas completas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_full_menu", description: "Obtiene el menú completo con precios.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_tickets_history", description: "Obtiene el historial de tickets cerrados.", parameters: { type: "object", properties: {}, required: [] } } },
];

// --- LÓGICA DE EJECUCIÓN (INTACTA) ---
async function executeTool(name: string, args: any, restaurantId: string, role: string, tableId?: string, slug?: string): Promise<string> {
  try {
    switch (name) {
      case "get_menu":
      case "get_full_menu":
      case "get_menu_with_details": {
        const categories = await storage.getCategoriesByRestaurant(restaurantId);
        const products = await storage.getProductsByRestaurant(restaurantId);
        return JSON.stringify(categories.map(cat => ({ categoria: cat.name, platillos: products.filter(p => p.categoryId === cat.id).map(p => ({ id: p.id, nombre: p.name, descripcion: p.description || "", precio: Number(p.price), disponible: p.isAvailable })) })));
      }
      case "get_my_bill": {
        if (!tableId) return JSON.stringify({ error: "Mesa no identificada" });
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) return JSON.stringify({ total: 0, pedidos: [] });
        const orders = await storage.getOrdersByTicket(ticket.id);
        return JSON.stringify({ total: Number(ticket.total), pedidos: orders.map(o => ({ hora: new Date(o.createdAt).toLocaleTimeString("es"), estado: o.status, items: o.itemsJson, subtotal: Number(o.total) })) });
      }
      case "place_order": {
        if (!tableId || !slug) return JSON.stringify({ error: "Datos de mesa incompletos" });
        const { items } = args;
        const total = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
        let ticket = await storage.getOpenTicketByTable(restaurantId, tableId) || await storage.createTicket({ restaurantId, tableId, status: "open", total: "0" });
        const order = await storage.createOrder({ restaurantId, tableId, ticketId: ticket.id, itemsJson: items, status: "pending", total: total.toFixed(2) });
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
        return JSON.stringify(orders.filter(o => o.status === "pending" || o.status === "preparing").map(o => ({ mesa: o.tableId, estado: o.status, items: o.itemsJson, total: Number(o.total) })));
      }
      case "get_tables_status": {
        const tables = await storage.getTablesByRestaurant(restaurantId);
        return JSON.stringify(tables.map(t => ({ mesa: t.number, estado: "Consultar panel" })));
      }
      case "get_analytics": {
        const allOrders = await storage.getOrdersByRestaurant(restaurantId);
        return JSON.stringify({ totalVentas: allOrders.reduce((sum, o) => sum + Number(o.total), 0), totalOrdenes: allOrders.length });
      }
      default: return JSON.stringify({ error: "No implementado" });
    }
  } catch (err: any) { return JSON.stringify({ error: err.message }); }
}

function buildSystemPrompt(role: string, restaurantName: string, menuData: string, tableId?: string): string {
  const roleNames: Record<string, string> = { client: "Cliente", cook: "Cocinero", waiter: "Mesero", owner: "Dueño" };
  const base = `Eres el asistente de "${restaurantName}", plataforma Pidely. Responde en español con Markdown.
TU ROL: ${roleNames[role] || role}. Mesa: ${tableId || "N/A"}.

MENÚ REAL DISPONIBLE:
${menuData}

REGLAS:
1. SÓLO PUEDES HABLAR DE LO QUE ESTÁ EN EL MENÚ REAL.
2. Si piden algo fuera del menú (ej: tacos, hamburguesas), di: "Lo sentimos, no contamos con ese platillo en nuestro menú actual."
3. NO INVENTES PRECIOS.`;

  return base;
}

// --- HANDLER PARA ADMIN / COCINA / MESERO ---
export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    
    // CORRECCIÓN: Aseguramos obtener el restaurantId sin importar el rol
    const restaurantId = user.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No se encontró ID de restaurante para este usuario." });

    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurant(restaurantId);
    
    const menuJson = await executeTool("get_menu", {}, restaurantId, user.role);
    const systemPrompt = buildSystemPrompt(user.role, restaurant?.name || "el restaurante", menuJson, tableId);
    
    const isFoodQuery = /taco|comida|hambre|menu|precio|platillo/i.test(message);
    const selectedModel = (user.role === "owner" || isFoodQuery) ? POWER_MODEL : LIGHT_MODEL;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.filter((m: any) => m.role && (m.content !== undefined || m.tool_calls)),
      { role: "user", content: message },
    ];

    let response = await getGroq().chat.completions.create({ model: selectedModel, messages, tools: user.role === "owner" ? ownerTools : user.role === "cook" ? kitchenTools : user.role === "waiter" ? waiterTools : clientTools, tool_choice: "auto", max_tokens: 1024, temperature: 0 });
    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);
      const results = await Promise.all(assistantMessage.tool_calls.map(async (tc) => ({ role: "tool" as const, tool_call_id: tc.id, content: await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), restaurantId, user.role, tableId, slug) })));
      messages.push(...results);
      response = await getGroq().chat.completions.create({ model: selectedModel, messages, max_tokens: 1024 });
      assistantMessage = response.choices[0].message;
    }
    res.json({ reply: assistantMessage.content || "Entendido." });
  } catch (err: any) {
    console.error("Error en handleAIChat:", err);
    res.status(500).json({ error: "Error en el asistente del panel administrativo." });
  }
}

// --- HANDLER PÚBLICO (MESAS) ---
export async function handlePublicAIChat(req: Request, res: Response) {
  try {
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurantBySlug(slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurante no encontrado" });

    const menuJson = await executeTool("get_menu", {}, restaurant.id, "client");
    const systemPrompt = buildSystemPrompt("client", restaurant.name, menuJson, tableId);
    
    const isFoodQuery = /taco|comida|hambre|menu|precio|platillo/i.test(message);
    const selectedModel = isFoodQuery ? POWER_MODEL : LIGHT_MODEL;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.filter((m: any) => m.role && (m.content !== undefined || m.tool_calls)),
      { role: "user", content: message },
    ];

    let response = await getGroq().chat.completions.create({ model: selectedModel, messages, tools: clientTools, tool_choice: "auto", max_tokens: 1024, temperature: 0 });
    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);
      const results = await Promise.all(assistantMessage.tool_calls.map(async (tc) => ({ role: "tool" as const, tool_call_id: tc.id, content: await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), restaurant.id, "client", tableId, slug) })));
      messages.push(...results);
      response = await getGroq().chat.completions.create({ model: selectedModel, messages, max_tokens: 1024 });
      assistantMessage = response.choices[0].message;
    }
    res.json({ reply: assistantMessage.content || "Dime en qué puedo ayudarte." });
  } catch (err: any) {
    console.error("Error en handlePublicAIChat:", err);
    res.status(500).json({ error: "Error en el chat de mesa." });
  }
}