import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const tools: any = [
  {
    functionDeclarations: [
      {
        name: "consultar_mesas",
        description: "Obtiene el estado actual de todas las mesas del restaurante.",
      }
    ],
  },
];

// MODELO DE MAXIMA COMPATIBILIDAD
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.0-pro", 
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
    
    let systemPrompt = `Eres el asistente de "${restaurant?.name}". Ayuda al usuario con su negocio.`;

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Hola, soy tu asistente de Pidely. ¿En qué te ayudo?" }] },
      ],
    });

    let result = await chat.sendMessage(message);
    let response = result.response;

    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

    if (call && call.functionCall) {
      if (call.functionCall.name === "consultar_mesas") {
        const tables = await storage.getTablesByRestaurant(restaurantId);
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        
        const infoMesas = tables.map(t => {
          const ocupada = orders.some(o => Number(o.tableId) === t.number && o.status !== "delivered");
          return `Mesa ${t.number}: ${ocupada ? 'Ocupada' : 'Libre'}`;
        }).join(", ");

        result = await chat.sendMessage([{
          functionResponse: { name: "consultar_mesas", response: { content: infoMesas } },
        }]);
        response = result.response;
      }
    }

    res.json({ reply: response.text() });

  } catch (err: any) {
    console.error("AI error detalle:", err);
    res.status(500).json({ error: "Error de conexión: El modelo no responde. Intenta de nuevo." });
  }
}