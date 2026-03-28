import type { Request, Response } from "express";
import { storage } from "./storage";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  const data = await res.json() as any;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar una respuesta.";
}

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = req.user!;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });

    const restaurantId = user.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "Sin restaurante" });

    const restaurant = await storage.getRestaurant(restaurantId);
    const products = await storage.getProductsByRestaurant(restaurantId);
    const orders = await storage.getOrdersByRestaurant(restaurantId);
    const tables = await storage.getTablesByRestaurant(restaurantId);

    const pendingOrders = orders.filter(o => o.status !== "delivered");
    const productList = products.map(p => `- ${p.name} ($${p.price})`).join("\n");

    let systemPrompt = "";

    if (user.role === "owner") {
      const totalVentas = orders.reduce((acc, o) => acc + Number(o.total), 0).toFixed(2);
      systemPrompt = `Eres un asistente inteligente para el restaurante "${restaurant?.name}". 
Tienes acceso completo a la información del negocio.

MENÚ (${products.length} productos):
${productList}

ESTADÍSTICAS:
- Total de órdenes: ${orders.length}
- Ventas totales: $${totalVentas}
- Mesas: ${tables.length}
- Órdenes pendientes: ${pendingOrders.length}

Puedes ayudar con análisis de ventas, ideas para el menú, estrategias de negocio, marketing y cualquier consulta del dueño.
Responde siempre en español, de forma clara y profesional.`;

    } else if (user.role === "waiter") {
      const waiterCalls = await storage.getWaiterCallsByRestaurant(restaurantId);
      systemPrompt = `Eres un asistente para meseros del restaurante "${restaurant?.name}".

MENÚ:
${productList}

ÓRDENES ACTIVAS (${pendingOrders.length}):
${pendingOrders.map(o => `- Mesa ${o.tableId}: ${o.status}`).join("\n") || "Sin órdenes pendientes"}

LLAMADAS DE MESERO ACTIVAS: ${waiterCalls.length}

Ayuda al mesero con información del menú, estado de órdenes y mesas.
Responde siempre en español, de forma breve y práctica.`;

    } else if (user.role === "cook") {
      systemPrompt = `Eres un asistente para la cocina del restaurante "${restaurant?.name}".

ÓRDENES PENDIENTES (${pendingOrders.length}):
${pendingOrders.map(o => {
  const items = o.itemsJson as Array<{ name: string; quantity: number }>;
  return `- Mesa ${o.tableId}: ${Array.isArray(items) ? items.map(i => `${i.quantity}x ${i.name}`).join(", ") : ""}`;
}).join("\n") || "Sin órdenes pendientes"}

Ayuda al equipo de cocina con prioridades, tiempos y organización de pedidos.
Responde siempre en español, de forma breve y directa.`;
    }

    const fullPrompt = `${systemPrompt}\n\nUsuario: ${message}\n\nAsistente:`;
    const reply = await callGemini(fullPrompt);
    res.json({ reply });

  } catch (err: any) {
    console.error("AI error:", err);
    res.status(500).json({ error: err.message || "Error del asistente" });
  }
}