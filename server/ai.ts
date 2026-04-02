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

// --- CONFIGURACIÓN DE HERRAMIENTAS (TOOLS) ---
const clientTools = [
  { type: "function" as const, function: { name: "get_menu", description: "Obtiene el menú completo del restaurante.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_my_bill", description: "Obtiene la cuenta actual de la mesa.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "place_order", description: "Envía un pedido a cocina.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, name: { type: "string" }, price: { type: "number" }, quantity: { type: "number" }, notes: { type: "string" } }, required: ["productId", "name", "price", "quantity"] } } }, required: ["items"] } } },
  { type: "function" as const, function: { name: "call_waiter", description: "Llama al mesero a la mesa.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "request_bill", description: "Solicita la cuenta física.", parameters: { type: "object", properties: {}, required: [] } } },
];

const kitchenTools = [
  { type: "function" as const, function: { name: "get_active_orders", description: "Órdenes pendientes.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_menu_with_details", description: "Menú con recetas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_ingredient_alerts", description: "Alertas de demanda.", parameters: { type: "object", properties: {}, required: [] } } },
];

const waiterTools = [
  { type: "function" as const, function: { name: "get_tables_status", description: "Estado de mesas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_table_bill", description: "Cuenta de mesa específica.", parameters: { type: "object", properties: { tableId: { type: "string" } }, required: ["tableId"] } } },
  { type: "function" as const, function: { name: "get_waiter_calls", description: "Llamadas pendientes.", parameters: { type: "object", properties: {}, required: [] } } },
];

const ownerTools = [
  ...waiterTools,
  { type: "function" as const, function: { name: "get_analytics", description: "Ventas y estadísticas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_full_menu", description: "Menú administrativo.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_tickets_history", description: "Historial de pagos.", parameters: { type: "object", properties: {}, required: [] } } },
];

// --- EJECUCIÓN DE HERRAMIENTAS (LOGICA DE NEGOCIO) ---
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
            id: p.id, nombre: p.name, descripcion: p.description || "", precio: Number(p.price), disponible: p.isAvailable
          }))
        })));
      }
      case "get_my_bill": {
        if (!tableId) return JSON.stringify({ error: "Mesa no identificada" });
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) return JSON.stringify({ total: 0, pedidos: [] });
        const orders = await storage.getOrdersByTicket(ticket.id);
        return JSON.stringify({ total: Number(ticket.total), pedidos: orders.map(o => ({ hora: new Date(o.createdAt).toLocaleTimeString("es"), estado: o.status, items: o.itemsJson, total: Number(o.total) })) });
      }
      case "place_order": {
        const { items } = args;
        const total = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
        let ticket = await storage.getOpenTicketByTable(restaurantId, tableId!) || await storage.createTicket({ restaurantId, tableId: tableId!, status: "open", total: "0" });
        const order = await storage.createOrder({ restaurantId, tableId: tableId!, ticketId: ticket.id, itemsJson: items, status: "pending", total: total.toFixed(2) });
        await storage.updateTicketTotal(ticket.id, (Number(ticket.total) + total).toFixed(2));
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "new_order", data: { order, tableId } });
        return JSON.stringify({ success: true, total: total.toFixed(2) });
      }
      case "call_waiter": {
        const call = await storage.createWaiterCall({ restaurantId, tableId: tableId!, resolved: false });
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "waiter_call", data: { call, tableId } });
        return JSON.stringify({ success: true });
      }
      case "request_bill": {
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId!);
        if (!ticket) return JSON.stringify({ error: "No hay cuenta activa" });
        await storage.requestBill(ticket.id);
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "bill_request", data: { tableId, ticketId: ticket.id } });
        return JSON.stringify({ success: true });
      }
      case "get_active_orders": {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        return JSON.stringify(orders.filter(o => o.status !== "delivered").map(o => ({ mesa: o.tableId, estado: o.status, items: o.itemsJson, total: Number(o.total) })));
      }
      case "get_analytics": {
        const allOrders = await storage.getOrdersByRestaurant(restaurantId);
        return JSON.stringify({ ventasTotales: allOrders.reduce((sum, o) => sum + Number(o.total), 0), ordenes: allOrders.length });
      }
      default: return JSON.stringify({ error: "No disponible" });
    }
  } catch (err: any) { return JSON.stringify({ error: err.message }); }
}

// --- PROMPT Y MODELOS ---
function buildSystemPrompt(role: string, restaurantName: string, menuData: string, tableId?: string): string {
  return `Eres el asistente de "${restaurantName}" en Pidely. Responde en español.
FORMATO: Respuestas cortas (máximo 3 líneas). Usa saltos de línea.

MENÚ REAL DISPONIBLE:
${menuData}

REGLAS:
1. SÓLO PUEDES SUGERIR LO QUE ESTÁ EN EL MENÚ REAL ARRIBA.
2. Si piden algo que NO está (ej: tacos, pizza), di: "Lo sentimos, no contamos con ese platillo actualmente."
3. NO INVENTES PRECIOS. Rol actual: ${role}. Mesa: ${tableId || "N/A"}.`;
}

async function runAILoop(messages: any[], tools: any[], restaurantId: string, role: string, tableId?: string, slug?: string, model: string = POWER_MODEL): Promise<string> {
  let response = await getGroq().chat.completions.create({ model, messages, tools, tool_choice: "auto", max_tokens: 300, temperature: 0 });
  let assistantMessage = response.choices[0].message;

  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);
    const results = await Promise.all(assistantMessage.tool_calls.map(async (tc) => ({
      role: "tool" as const, tool_call_id: tc.id, content: await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), restaurantId, role, tableId, slug)
    })));
    messages.push(...results);
    response = await getGroq().chat.completions.create({ model, messages, tools, max_tokens: 300 });
    assistantMessage = response.choices[0].message;
  }
  return assistantMessage.content || "¿En qué te ayudo?";
}

// --- HANDLERS FINALES ---
export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurant(user.restaurantId);
    const menuJson = await executeTool("get_menu", {}, user.restaurantId, user.role);

    const isFood = /taco|comida|menu|precio|platillo|hambre|pide|ordenar/i.test(message);
    const model = (user.role === "owner" || isFood) ? POWER_MODEL : LIGHT_MODEL;

    const messages = [{ role: "system", content: buildSystemPrompt(user.role, restaurant?.name || "restaurante", menuJson, tableId) }, ...history.slice(-6), { role: "user", content: message }];
    const reply = await runAILoop(messages, user.role === "owner" ? ownerTools : user.role === "cook" ? kitchenTools : user.role === "waiter" ? waiterTools : clientTools, user.restaurantId, user.role, tableId, slug, model);
    res.json({ reply });
  } catch (err) { res.status(500).json({ error: "Error de IA" }); }
}

export async function handlePublicAIChat(req: Request, res: Response) {
  try {
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurantBySlug(slug);
    if (!restaurant) return res.status(404).json({ error: "No encontrado" });
    const menuJson = await executeTool("get_menu", {}, restaurant.id, "client");

    const isFood = /taco|comida|menu|precio|platillo|hambre|pide|ordenar/i.test(message);
    const model = isFood ? POWER_MODEL : LIGHT_MODEL;

    const messages = [{ role: "system", content: buildSystemPrompt("client", restaurant.name, menuJson, tableId) }, ...history.slice(-6), { role: "user", content: message }];
    const reply = await runAILoop(messages, clientTools, restaurant.id, "client", tableId, slug, model);
    res.json({ reply });
  } catch (err) { res.status(500).json({ error: "Error de IA" }); }
}