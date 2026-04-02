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

// --- TUS TOOLS SE MANTIENEN IGUAL ---
const clientTools = [
  {
    type: "function" as const,
    function: {
      name: "get_menu",
      description: "Obtiene el menú completo del restaurante con categorías, platillos, precios, descripciones y disponibilidad.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_my_bill",
      description: "Obtiene la cuenta actual de la mesa: pedidos realizados, productos y total acumulado.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "place_order",
      description: "Envía un pedido a cocina en nombre del cliente.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Lista de productos a pedir",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                name: { type: "string" },
                price: { type: "number" },
                quantity: { type: "number" },
                notes: { type: "string" },
              },
              required: ["productId", "name", "price", "quantity"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "call_waiter",
      description: "Llama al mesero a la mesa del cliente.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_bill",
      description: "Solicita la cuenta para que el mesero la traiga.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

const kitchenTools = [
  {
    type: "function" as const,
    function: {
      name: "get_active_orders",
      description: "Obtiene todas las órdenes activas (pendientes o en preparación) del restaurante.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_menu_with_details",
      description: "Obtiene el menú completo con descripciones detalladas de ingredientes y recetas.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_ingredient_alerts",
      description: "Analiza las órdenes activas y detecta ingredientes con alta demanda.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

const waiterTools = [
  {
    type: "function" as const,
    function: {
      name: "get_tables_status",
      description: "Obtiene el estado de todas las mesas: libre, ocupada, con llamada de mesero, total acumulado.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_table_bill",
      description: "Obtiene la cuenta detallada de una mesa específica.",
      parameters: {
        type: "object",
        properties: {
          tableId: { type: "string", description: "Número o ID de la mesa" },
        },
        required: ["tableId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_waiter_calls",
      description: "Obtiene las llamadas de mesero pendientes de resolver.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

const ownerTools = [
  ...waiterTools,
  {
    type: "function" as const,
    function: {
      name: "get_analytics",
      description: "Obtiene estadísticas completas: ventas de hoy, semana, mes, productos más vendidos, ventas por día.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_full_menu",
      description: "Obtiene el menú completo con precios, categorías y disponibilidad.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_active_orders",
      description: "Obtiene todas las órdenes activas del restaurante.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_tickets_history",
      description: "Obtiene el historial de tickets cerrados/pagados.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

async function executeTool(
  name: string,
  args: any,
  restaurantId: string,
  role: string,
  tableId?: string,
  slug?: string
): Promise<string> {
  try {
    switch (name) {
      case "get_menu":
      case "get_full_menu":
      case "get_menu_with_details": {
        const categories = await storage.getCategoriesByRestaurant(restaurantId);
        const products = await storage.getProductsByRestaurant(restaurantId);
        const menu = categories.map(cat => ({
          categoria: cat.name,
          platillos: products
            .filter(p => p.categoryId === cat.id)
            .map(p => ({
              id: p.id,
              nombre: p.name,
              descripcion: p.description || "",
              precio: Number(p.price),
              disponible: p.isAvailable,
            })),
        }));
        return JSON.stringify(menu);
      }

      case "get_my_bill": {
        if (!tableId) return JSON.stringify({ error: "No se encontró la mesa" });
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) return JSON.stringify({ total: 0, pedidos: [] });
        const orders = await storage.getOrdersByTicket(ticket.id);
        return JSON.stringify({
          total: Number(ticket.total),
          pedidos: orders.map(o => ({
            hora: new Date(o.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
            estado: o.status,
            items: o.itemsJson,
            subtotal: Number(o.total),
          })),
        });
      }

      case "place_order": {
        if (!tableId || !slug) return JSON.stringify({ error: "Datos de mesa incompletos" });
        const { items } = args;
        if (!items || items.length === 0) return JSON.stringify({ error: "No hay items para pedir" });
        const total = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);

        let ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) {
          ticket = await storage.createTicket({ restaurantId, tableId, status: "open", total: "0" });
        }
        const order = await storage.createOrder({
          restaurantId,
          tableId,
          ticketId: ticket.id,
          itemsJson: items,
          status: "pending",
          total: total.toFixed(2),
        });
        const newTotal = (Number(ticket.total) + total).toFixed(2);
        await storage.updateTicketTotal(ticket.id, newTotal);

        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "new_order", data: { order, tableId } });

        return JSON.stringify({ success: true, orderId: order.id, total: total.toFixed(2) });
      }

      case "call_waiter": {
        if (!tableId) return JSON.stringify({ error: "No se encontró la mesa" });
        const call = await storage.createWaiterCall({ restaurantId, tableId, resolved: false });
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "waiter_call", data: { call, tableId } });
        return JSON.stringify({ success: true });
      }

      case "request_bill": {
        if (!tableId) return JSON.stringify({ error: "No se encontró la mesa" });
        const ticket = await storage.getOpenTicketByTable(restaurantId, tableId);
        if (!ticket) return JSON.stringify({ error: "No hay cuenta abierta" });
        await storage.requestBill(ticket.id);
        const { broadcastToRestaurant } = await import("./websocket");
        broadcastToRestaurant(restaurantId, { type: "bill_request", data: { tableId, ticketId: ticket.id } });
        return JSON.stringify({ success: true });
      }

      case "get_active_orders": {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        const active = orders.filter(o => o.status === "pending" || o.status === "preparing");
        return JSON.stringify(active.map(o => ({
          id: o.id,
          mesa: o.tableId,
          estado: o.status,
          items: o.itemsJson,
          total: Number(o.total),
          hora: new Date(o.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
        })));
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
        const alerts = Object.entries(itemCount)
          .filter(([, qty]) => qty >= 3)
          .map(([name, qty]) => ({ platillo: name, cantidadActiva: qty }));
        return JSON.stringify({ alertas: alerts });
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
          pedidos: orders.map(o => ({
            hora: new Date(o.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
            estado: o.status,
            items: o.itemsJson,
            subtotal: Number(o.total),
          })),
        });
      }

      case "get_waiter_calls": {
        const calls = await storage.getWaiterCallsByRestaurant(restaurantId);
        const pending = calls.filter(c => !c.resolved);
        return JSON.stringify(pending.map(c => ({ mesa: c.tableId, hora: new Date(c.createdAt).toLocaleTimeString("es") })));
      }

      case "get_analytics": {
        const allOrders = await storage.getOrdersByRestaurant(restaurantId);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let totalToday = 0, totalWeek = 0, totalMonth = 0, totalAll = 0;
        let ordersToday = 0, ordersWeek = 0, ordersMonth = 0;
        const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

        for (const order of allOrders) {
          const d = new Date(order.createdAt);
          const t = Number(order.total);
          totalAll += t;
          if (d >= startOfToday) { totalToday += t; ordersToday++; }
          if (d >= startOfWeek) { totalWeek += t; ordersWeek++; }
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
        const leastProducts = Object.values(productSales).sort((a, b) => a.quantity - b.quantity).slice(0, 5);

        return JSON.stringify({
          hoy: { ventas: totalToday, ordenes: ordersToday },
          semana: { ventas: totalWeek, ordenes: ordersWeek },
          mes: { ventas: totalMonth, ordenes: ordersMonth },
          total: { ventas: totalAll, ordenes: allOrders.length },
          topProductos: topProducts,
          menosVendidos: leastProducts,
        });
      }

      case "get_tickets_history": {
        const tickets = await storage.getPaidTicketsByRestaurant(restaurantId);
        return JSON.stringify(tickets.slice(0, 20).map(t => ({
          id: t.id,
          mesa: t.tableId,
          total: Number(t.total),
          metodoPago: t.paymentMethod,
          cerrado: t.closedAt,
        })));
      }

      default:
        return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

function buildSystemPrompt(role: string, restaurantName: string, menuData: string, tableId?: string): string {
  const base = `Eres el asistente de "${restaurantName}", plataforma Pidely. 
RESPONDE SIEMPRE EN ESPAÑOL. Usa Markdown y saltos de línea (\n).

MENÚ REAL DISPONIBLE (SÓLO PUEDES VENDER ESTO):
${menuData}

REGLAS DE ORO (BLINDAJE TOTAL):
1. PROHIBIDO INVENTAR COMIDA. Si el usuario pregunta por algo que NO está en la lista de arriba (ej: TACOS, CARNITAS, HAMBURGUESAS), responde EXACTAMENTE: "Lo sentimos, no contamos con ese platillo en nuestro menú actual."
2. No intentes ser amable inventando opciones. Si no está en el MENÚ REAL, NO EXISTE.
3. EJEMPLO DE RESPUESTA CORRECTA:
   Usuario: "¿Tienen tacos?"
   Asistente: "Lo sentimos, no contamos con ese platillo en nuestro menú actual. ¿Te gustaría probar nuestras Tostadas de Atún o el Ribeye?"`;

  switch (role) {
    case "client":
      return `${base}\n\nAsistente de Mesa ${tableId}. Cíñete al menú de arriba.`;
    case "cook":
      return `${base}\n\nAsistente de cocina.`;
    case "waiter":
      return `${base}\n\nAsistente de meseros.`;
    case "owner":
      return `${base}\n\nAsistente ejecutivo.`;
    default:
      return base;
  }
}

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurant(user.restaurantId);
    const menuJson = await executeTool("get_menu", {}, user.restaurantId, user.role);

    const systemPrompt = buildSystemPrompt(user.role, restaurant?.name || "el restaurante", menuJson, tableId);
    
    // MODELO PODEROSO para evitar mentiras si pregunta por comida
    const isFoodQuery = /taco|comida|hambre|menu|precio|platillo/i.test(message);
    const selectedModel = (user.role === "owner" || isFoodQuery) ? POWER_MODEL : LIGHT_MODEL;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.filter((m: any) => m.role && (m.content !== undefined || m.tool_calls)),
      { role: "user", content: message },
    ];

    let response = await getGroq().chat.completions.create({
      model: selectedModel,
      messages,
      tools: user.role === "owner" ? ownerTools : user.role === "cook" ? kitchenTools : user.role === "waiter" ? waiterTools : clientTools,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0,
    });

    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);
      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc) => {
          const result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), user.restaurantId, user.role, tableId, slug);
          return { role: "tool" as const, tool_call_id: tc.id, content: result };
        })
      );
      messages.push(...toolResults);
      response = await getGroq().chat.completions.create({ model: selectedModel, messages, max_tokens: 1024 });
      assistantMessage = response.choices[0].message;
    }
    res.json({ reply: assistantMessage.content });
  } catch (err: any) {
    res.status(500).json({ error: "Error del asistente." });
  }
}

export async function handlePublicAIChat(req: Request, res: Response) {
  try {
    const { message, history = [], tableId, slug } = req.body;
    const restaurant = await storage.getRestaurantBySlug(slug);
    if (!restaurant) return res.status(404).json({ error: "No encontrado" });

    const menuJson = await executeTool("get_menu", {}, restaurant.id, "client");

    const systemPrompt = buildSystemPrompt("client", restaurant.name, menuJson, tableId);
    
    // MODELO PODEROSO para clientes si preguntan por comida
    const isFoodQuery = /taco|comida|hambre|menu|precio|platillo/i.test(message);
    const selectedModel = isFoodQuery ? POWER_MODEL : LIGHT_MODEL;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.filter((m: any) => m.role && (m.content !== undefined || m.tool_calls)),
      { role: "user", content: message },
    ];

    let response = await getGroq().chat.completions.create({
      model: selectedModel,
      messages,
      tools: clientTools,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0,
    });

    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);
      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc) => {
          const result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"), restaurant.id, "client", tableId, slug);
          return { role: "tool" as const, tool_call_id: tc.id, content: result };
        })
      );
      messages.push(...toolResults);
      response = await getGroq().chat.completions.create({ model: selectedModel, messages, max_tokens: 1024 });
      assistantMessage = response.choices[0].message;
    }
    res.json({ reply: assistantMessage.content });
  } catch (err: any) {
    res.status(500).json({ error: "Error del asistente." });
  }
}