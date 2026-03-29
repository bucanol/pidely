import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Configuración del motor de IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 1. DEFINICIÓN DE HERRAMIENTAS (Corregido para la versión actual del SDK)
const tools = [
  {
    functionDeclarations: [
      {
        name: "consultar_mesas",
        description: "Obtiene el estado actual de todas las mesas del restaurante (libres, ocupadas, etc).",
      }
    ],
  },
];

// Usamos el nombre de modelo más estable para evitar el 404
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash", 
  tools: tools,
});

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user; // Ajuste para evitar errores de tipo
    const { message } = req.body;
    
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });
    if (!user || !user.restaurantId) return res.status(401).json({ error: "Sesión no válida" });

    const restaurantId = user.restaurantId;
    const restaurant = await storage.getRestaurant(restaurantId);
    
    // Contexto dinámico según el rol
    let systemPrompt = `Eres el asistente inteligente de "${restaurant?.name}". `;
    if (user.role === "owner") systemPrompt += "Tu función es ayudar al Dueño con la gestión.";
    else if (user.role === "waiter") systemPrompt += "Ayudas a los Meseros a saber qué mesas atender.";
    else if (user.role === "cook") systemPrompt += "Eres el asistente de Cocina.";

    // 2. INICIO DEL CHAT CON HISTORIAL LIMPIO
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Entendido. Soy el asistente de Pidely para " + restaurant?.name + ". ¿En qué puedo apoyarte?" }] },
      ],
    });

    // 3. ENVIAR MENSAJE
    let result = await chat.sendMessage(message);
    let response = result.response;

    // REVISAR SI LA IA QUIERE USAR LA FUNCIÓN (MANEJO DE TOOL CALLS)
    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

    if (call && call.functionCall) {
      const functionName = call.functionCall.name;

      if (functionName === "consultar_mesas") {
        // Consultamos la base de datos real
        const tables = await storage.getTablesByRestaurant(restaurantId);
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        
        // Formateamos la info para que la IA la entienda
        const infoMesas = tables.map(t => {
          const tieneOrdenActiva = orders.some(o => 
            Number(o.tableId) === t.number && 
            o.status !== "delivered" && 
            o.status !== "cancelled"
          );
          return `Mesa ${t.number}: ${tieneOrdenActiva ? 'Ocupada' : 'Libre'}`;
        }).join(", ");

        // Enviamos la respuesta de la función de vuelta a la IA
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: "consultar_mesas",
              response: { content: infoMesas },
            },
          },
        ]);
        response = result.response;
      }
    }

    const reply = response.text();
    res.json({ reply });

  } catch (err: any) {
    console.error("AI error detalle:", err);
    // Manejo de errores específicos
    if (err.status === 404) {
       return res.status(500).json({ error: "Modelo no encontrado. Revisa la región de tu API Key." });
    }
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      return res.status(429).json({ error: "IA saturada, espera un momento." });
    }
    res.status(500).json({ error: "Error del asistente" });
  }
}