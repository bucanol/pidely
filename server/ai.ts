import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Configuración del motor de IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 1. DEFINICIÓN DE HERRAMIENTAS
const tools: any = [
  {
    functionDeclarations: [
      {
        name: "consultar_mesas",
        description: "Obtiene el estado actual de todas las mesas del restaurante (libres, ocupadas, etc).",
      }
    ],
  },
];

// USAMOS GEMINI-PRO QUE ES EL MÁS ESTABLE
const model = genAI.getGenerativeModel({ 
  model: "gemini-pro", 
  tools: tools,
});

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { message } = req.body;
    
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });
    if (!user || !user.restaurantId) return res.status(401).json({ error: "Sesión no válida" });

    const restaurantId = user.restaurantId;
    const restaurant = await storage.getRestaurant(restaurantId);
    
    let systemPrompt = `Eres el asistente inteligente de "${restaurant?.name}". `;
    if (user.role === "owner") systemPrompt += "Tu función es ayudar al Dueño con la gestión.";
    else if (user.role === "waiter") systemPrompt += "Ayudas a los Meseros a saber qué mesas atender.";
    else if (user.role === "cook") systemPrompt += "Eres el asistente de Cocina.";

    // 2. INICIO DEL CHAT
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Entendido. Soy el asistente de Pidely para " + restaurant?.name + ". ¿En qué puedo apoyarte?" }] },
      ],
    });

    // 3. ENVIAR MENSAJE
    let result = await chat.sendMessage(message);
    let response = result.response;

    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

    if (call && call.functionCall) {
      const functionName = call.functionCall.name;

      if (functionName === "consultar_mesas") {
        const tables = await storage.getTablesByRestaurant(restaurantId);
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        
        const infoMesas = tables.map(t => {
          const tieneOrdenActiva = orders.some(o => 
            Number(o.tableId) === t.number && 
            o.status !== "delivered" && 
            o.status !== "cancelled"
          );
          return `Mesa ${t.number}: ${tieneOrdenActiva ? 'Ocupada' : 'Libre'}`;
        }).join(", ");

        result = await chat.sendMessage([{
          functionResponse: {
            name: "consultar_mesas",
            response: { content: infoMesas },
          },
        }]);
        response = result.response;
      }
    }

    const reply = response.text();
    res.json({ reply });

  } catch (err: any) {
    console.error("AI error detalle:", err);
    
    // MENSAJE DE ERROR CORREGIDO (Para que no nos mienta)
    if (err.status === 404 || err.message?.includes("not found")) {
       return res.status(500).json({ error: "Error de conexión con la IA: Modelo no encontrado." });
    }
    
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      return res.status(429).json({ error: "IA saturada, espera un momento." });
    }
    res.status(500).json({ error: "Error del asistente" });
  }
}