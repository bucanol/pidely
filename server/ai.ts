import type { Request, Response } from "express";
import { storage } from "./storage";
import Groq from "groq-sdk";

let groq: Groq;
// Modelos para escalabilidad: 8b para velocidad/bajo costo, 70b para análisis profundo
const POWER_MODEL = "llama-3.3-70b-versatile";
const LIGHT_MODEL = "llama-3.1-8b-instant";

function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

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

function buildSystemPrompt(role: string, restaurantName: string, tableId?: string): string {
  const roleNames: Record<string, string> = {
    client: "Cliente en mesa",
    cook: "Cocinero/Chef",
    waiter: "Mesero",
    owner: "Dueño del restaurante"
  };

  const base = `Eres el asistente inteligente de "${restaurantName}", una plataforma llamada Pidely. Responde siempre en el mismo idioma que el usuario. Cuando envíes información a cocina o al sistema, hazlo siempre en español. Sé conciso, amable y útil.
TU ROL ACTUAL ES: ${roleNames[role] || role}.

REGLAS DE FORMATO:
- Usa Markdown para dar estructura a tus respuestas.
- Usa SIEMPRE saltos de línea (\n) entre párrafos para que el texto sea legible.

REGLAS DE SEGURIDAD Y DATOS:
- NO INVENTES PLATILLOS. Si necesitas conocer el menú, usa obligatoriamente la herramienta 'get_menu'.
- Si un platillo no está en el resultado de la herramienta, informa que no está disponible actualmente.`;

  switch (role) {
    case "client":
      return `${base}

Eres el asistente de mesa para la Mesa ${tableId}. Tu rol es:
- Ayudar al cliente a explorar el menú, sugerir platillos y combos
- Detectar alergias o restricciones dietéticas y filtrar el menú automáticamente
- Hacer upselling inteligente (sugerir complementos cuando el cliente pide algo)
- Permitir que el cliente haga pedidos directamente por chat
- Mostrar el total acumulado de su cuenta cuando lo pidan
- Llamar al mesero o solicitar la cuenta cuando el cliente lo pida
- Si el cliente dice que tiene alguna alergia, recuérdala durante toda la conversación y úsala para filtrar sugerencias

Cuando el cliente quiera ordenar, usa la herramienta place_order con los productos exactos del menú.
Cuando sugieras platillos, menciona siempre el precio.
Sé cálido, eficiente y proactivo.`;

    case "cook":
      return `${base}

Eres el asistente de cocina. Tu rol es:
- Mostrar las órdenes activas (pendientes y en preparación)
- Consultar ingredientes y descripciones de platillos del menú
- Alertar sobre ingredientes con alta demanda en órdenes activas
- Responder preguntas sobre recetas o preparación de platillos basándote en sus descripciones

Sé directo y eficiente. La cocina necesita información rápida y clara.`;

    case "waiter":
      return `${base}

Eres el asistente para meseros. Tu rol es:
- Mostrar el estado de todas las mesas de un vistazo
- Consultar la cuenta detallada de cualquier mesa
- Mostrar llamadas de mesero pendientes
- Sugerir cuándo una mesa podría necesitar atención

Sé directo y eficiente.`;

    case "owner":
      return `${base}

Eres el asistente ejecutivo del dueño de "${restaurantName}". Tienes acceso completo al negocio. Tu rol es:
- Proporcionar analytics y estadísticas de ventas detalladas
- Detectar patrones: horas pico, platillos más/menos vendidos, tendencias
- Sugerir promociones basadas en datos reales del negocio
- Sugerir ajustes de precios basados en demanda
- Generar ideas de marketing y promociones para redes sociales
- Mostrar estado actual del restaurante: mesas, órdenes, llamadas
- Consultar historial de tickets y pagos
- Dar reportes ejecutivos claros y accionables

Cuando el dueño pida sugerencias de promociones o marketing, sé creativo y usa datos reales del menú y ventas.`;

    default:
      return base;
  }
}

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { message, history = [], tableId, slug } = req.body;

    if (!message) return res.status(400).json({ error: "Mensaje requerido" });
    if (!user || !user.restaurantId) return res.status(401).json({ error: "Sesión no válida" });

    const restaurantId = user.restaurantId;
    const role = user.role;
    const restaurant = await storage.getRestaurant(restaurantId);

    // Selección de modelo: 70b para dueño, 8b para los demás (ahorro de tokens y velocidad)
    const selectedModel = role === "owner" ? POWER_MODEL : LIGHT_MODEL;

    const tools =
      role === "owner" ? ownerTools :
      role === "cook" ? kitchenTools :
      role === "waiter" ? waiterTools :
      clientTools;

    const systemPrompt = buildSystemPrompt(role, restaurant?.name || "el restaurante", tableId);

    // Limpieza de historial para evitar corrupción técnica
    const cleanHistory = Array.isArray(history) 
      ? history.filter((m: any) => m.role && (m.content !== undefined || m.tool_calls)) 
      : [];

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      { role: "user", content: message },
    ];

    let response = await getGroq().chat.completions.create({
      model: selectedModel,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.1,
    });

    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc) => {
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = await executeTool(tc.function.name, args, restaurantId, role, tableId, slug);
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: result,
            };
          } catch (e) {
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: JSON.stringify({ error: "Error procesando herramienta" }),
            };
          }
        })
      );

      messages.push(...toolResults);

      response = await getGroq().chat.completions.create({
        model: selectedModel,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 1024,
      });

      assistantMessage = response.choices[0].message;
    }

    res.json({ reply: assistantMessage.content || "Lo siento, no pude procesar tu solicitud." });

  } catch (err: any) {
    console.error("AI error:", err);
    res.status(500).json({ error: "Error del asistente. Por favor intenta de nuevo." });
  }
}

export async function handlePublicAIChat(req: Request, res: Response) {
  try {
    const { message, history = [], tableId, slug } = req.body;

    if (!message) return res.status(400).json({ error: "Mensaje requerido" });
    if (!slug || !tableId) return res.status(400).json({ error: "Mesa o restaurante no identificado" });

    const restaurant = await storage.getRestaurantBySlug(slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurante no encontrado" });

    const restaurantId = restaurant.id;
    const systemPrompt = buildSystemPrompt("client", restaurant.name, tableId);

    const cleanHistory = Array.isArray(history) 
      ? history.filter((m: any) => m.role && (m.content !== undefined || m.tool_calls)) 
      : [];

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      { role: "user", content: message },
    ];

    let response = await getGroq().chat.completions.create({
      model: LIGHT_MODEL, // Siempre ligero para clientes públicos (más rápido)
      messages,
      tools: clientTools,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.1,
    });

    let assistantMessage = response.choices[0].message;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc) => {
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = await executeTool(tc.function.name, args, restaurantId, "client", tableId, slug);
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: result,
            };
          } catch (e) {
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: JSON.stringify({ error: "Error en herramienta" }),
            };
          }
        })
      );

      messages.push(...toolResults);

      response = await getGroq().chat.completions.create({
        model: LIGHT_MODEL,
        messages,
        tools: clientTools,
        tool_choice: "auto",
        max_tokens: 1024,
      });

      assistantMessage = response.choices[0].message;
    }

    res.json({ reply: assistantMessage.content || "Lo siento, no pude procesar tu solicitud." });

  } catch (err: any) {
    console.error("AI public error:", err);
    res.status(500).json({ error: "Error del asistente. Por favor intenta de nuevo." });
  }
}