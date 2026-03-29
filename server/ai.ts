import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 1. DEFINICIÓN DE HERRAMIENTAS (Para que pueda leer las mesas)
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

// USAMOS EL MODELO QUE YA VIMOS QUE SÍ FUNCIONA
const model = genAI.getGenerativeModel({ 
  model: "gemini-flash-latest", 
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

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Entendido. Soy el asistente de Pidely para " + restaurant?.name + ". ¿En qué puedo apoyarte?" }] },
      ],
    });

    let result = await chat.sendMessage(message);
    let response = result.response;

    // REVISAR SI LA IA QUIERE USAR LA FUNCIÓN DE MESAS
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

        // RESPUESTA DE LA FUNCIÓN
        result = await chat.sendMessage([{
          functionResponse: {
            name: "consultar_mesas",
            response: { content: infoMesas },
          },
        }]);
        response = result.response;
      }
    }

    res.json({ reply: response.text() });

  } catch (err: any) {
    console.error("AI error detalle:", err);
    res.status(500).json({ error: "Error del asistente. Intenta de nuevo." });
  }
}