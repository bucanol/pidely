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

// --- TOOLS (ESTRUCTURA DE CLAUDE COMPACTADA) ---
const clientTools = [
  { type: "function" as const, function: { name: "get_menu", description: "Menú con precios.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_my_bill", description: "Cuenta de la mesa.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "place_order", description: "Envía pedido a cocina.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, name: { type: "string" }, price: { type: "number" }, quantity: { type: "number" }, notes: { type: "string" } }, required: ["productId", "name", "price", "quantity"] } } }, required: ["items"] } } },
  { type: "function" as const, function: { name: "call_waiter", description: "Llama al mesero.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "request_bill", description: "Solicita la cuenta.", parameters: { type: "object", properties: {}, required: [] } } },
];

const kitchenTools = [
  { type: "function" as const, function: { name: "get_active_orders", description: "Órdenes activas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_menu_with_details", description: "Recetas e ingredientes.", parameters: { type: "object", properties: {}, required: [] } } },
];

const waiterTools = [
  { type: "function" as const, function: { name: "get_tables_status", description: "Estado de mesas.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function" as const, function: { name: "get_table_bill", description: "Cuenta de mesa específica.", parameters: { type: "object", properties: { tableId: { type: "string" } }, required: ["tableId"] } } },
  { type: "function" as const, function: { name: "get_waiter_calls", description: "Llamadas pendientes.", parameters: { type: "object", properties: {}, required: [] } } },
];

const ownerTools = [...waiterTools, { type: "function" as const, function: { name: "get_analytics", description: "Ventas y analytics.", parameters: { type: "object", properties: {}, required: [] } } }];

// --- LÓGICA DE EJECUCIÓN (INTACTA) ---
async function executeTool(name: string, args: any, restaurantId: string, role: string, tableId?: string, slug?: string): Promise<string> {
  try {
    switch (name) {
      case "get_menu": {
        const categories = await storage.getCategoriesByRestaurant(restaurantId);
        const products = await storage.getProductsByRestaurant(restaurantId);
        return JSON.stringify(categories.map(cat => ({ categoria: cat.name, platillos: products.filter(p => p.categoryId === cat.id).map(p => ({ id: p.id, nombre: p.name, precio: Number(p.price), disponible: p.isAvailable })) })));
      }
      case "place_order": {
        const { items } = args;
        const total = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
        let ticket = await storage.getOpenTicketByTable(restaurantId, tableId!) || await storage.createTicket({ restaurantId, tableId: tableId!, status: "open", total: "0" });
        const order = await storage.createOrder({ restaurantId, tableId: tableId!, ticketId: ticket.id, itemsJson: items, status: "pending", total: total.toFixed(2) });
        await storage.updateTicketTotal(ticket.id, (Number(ticket.total) + total).toFixed(2));
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "new_order", data: { order, tableId } });
        return JSON.stringify({ success: true, message: "Orden enviada a cocina con éxito." });
      }
      case "call_waiter": {
        const call = await storage.createWaiterCall({ restaurantId, tableId: tableId!, resolved: false });
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "waiter_call", data: { call, tableId } });
        return JSON.stringify({ success: true, message: "Mesero notificado." });
      }
      case "get_active_orders": {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        return JSON.stringify(orders.filter(o => o.status !== "delivered").map(o => ({ id: o.id, mesa: o.tableId, items: o.itemsJson })));
      }
      default: return JSON.stringify({ error: "No implementado" });
    }
  } catch (err: any) { return JSON.stringify({ error: err.message }); }
}

function buildSystemPrompt(role: string, restaurantName: string, menuData: string, tableId?: string): string {
  const base = `Eres el asistente de "${restaurantName}" en Pidely. Responde en español.

MENÚ REAL DISPONIBLE:
${menuData}

REGLAS CRÍTICAS:
1. SÓLO PUEDES SUGERIR LO QUE ESTÁ EN EL MENÚ REAL.
2. Si piden algo fuera del menú, di: "Lo sentimos, no contamos con ese platillo en nuestro menú actual."
3. FORMATO: Respuestas cortas (máx 3 líneas).
4. CONFIRMACIÓN: Una vez que uses una herramienta (como pedir un flan), confirma amablemente que la acción se realizó. TÚ eres el asistente, nunca pidas cosas para ti.`;

  return base + `\nROL ACTUAL: ${role}. Mesa: ${tableId || "N/A"}.`;
}

// SELECCIÓN DE MODELO PARA AHORRO DE TOKENS
function selectModel(message: string, role: string): string {
  if (role === "owner") return POWER_MODEL;
  const isSensitive = /taco|comida|hambre|menu|precio|platillo|orden|pide|flan|postre/i.test(message);
  return isSensitive ? POWER_MODEL : LIGHT_MODEL;
}

async function runAILoop(messages: any[], tools: any[], restaurantId: string, role: string, tableId?: string, slug?: string, modelUsed: string = POWER_MODEL): Promise<string> {
  let response = await getGroq().chat.completions.create({ model: modelUsed, messages, tools, tool_choice: "auto", max_tokens: 300, temperature: 0 });
  let assistantMessage = response.choices[0].message;

  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);
    const results = await Promise.all(assistantMessage.tool_calls.map(async (tc) => ({
      role: "tool" as const,
      tool_call_id: tc.id,
      content: await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), restaurantId, role, tableId, slug)
    })));
    messages.push(...results);
    
    // Inyección de recordatorio para evitar que la IA pida la cuenta tras la comanda
    messages.push({ role: "system", content: "ACCIÓN COMPLETADA. Confirma al usuario de forma breve. No pidas nada adicional." });

    response = await getGroq().chat.completions.create({ model: modelUsed, messages, tools, max_tokens: 200 });
    assistantMessage = response.choices[0].message;
  }
  return assistantMessage.content || "Entendido.";
}

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurant(user.restaurantId);
    const menuJson = await executeTool("get_menu", {}, user.restaurantId, user.role);
    const systemPrompt = buildSystemPrompt(user.role, restaurant?.name || "el restaurante", menuJson, tableId);
    const model = selectModel(message, user.role);
    const tools = user.role === "owner" ? ownerTools : user.role === "cook" ? kitchenTools : user.role === "waiter" ? waiterTools : clientTools;

    const messages: any[] = [{ role: "system", content: systemPrompt }, ...history.slice(-6), { role: "user", content: message }];
    const reply = await runAILoop(messages, tools, user.restaurantId, user.role, tableId, slug, model);
    res.json({ reply });
  } catch (err: any) { res.status(500).json({ error: "Error del asistente." }); }
}

export async function handlePublicAIChat(req: Request, res: Response) {
  try {
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurantBySlug(slug);
    if (!restaurant) return res.status(404).json({ error: "No encontrado" });
    const menuJson = await executeTool("get_menu", {}, restaurant.id, "client");
    const systemPrompt = buildSystemPrompt("client", restaurant.name, menuJson, tableId);
    const model = selectModel(message, "client");

    const messages: any[] = [{ role: "system", content: systemPrompt }, ...history.slice(-6), { role: "user", content: message }];
    const reply = await runAILoop(messages, clientTools, restaurant.id, "client", tableId, slug, model);
    res.json({ reply });
  } catch (err: any) { res.status(500).json({ error: "Error del asistente." }); }
}