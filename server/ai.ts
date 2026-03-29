import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Configuración del motor de IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 1. DEFINICIÓN DE HERRAMIENTAS (Aquí le damos las "manos" al agente)
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

const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash-latest",
  tools: tools, // Le pasamos las herramientas al modelo
});

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = req.user!;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });

    const restaurantId = user.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "Sin restaurante" });

    const restaurant = await storage.getRestaurant(restaurantId);
    
    // Contexto según el rol
    let systemPrompt = `Eres el asistente inteligente de "${restaurant?.name}". `;
    if (user.role === "owner") systemPrompt += "Eres el asistente del Dueño.";
    else if (user.role === "waiter") systemPrompt += "Eres el asistente de los Meseros.";
    else if (user.role === "cook") systemPrompt += "Eres el asistente de Cocina.";

    // 2. INICIO DEL CHAT
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Hola, soy el asistente de Pidely. ¿En qué te ayudo hoy?" }] },
      ],
    });

    // 3. ENVIAR MENSAJE Y MANEJAR HERRAMIENTAS
    let result = await chat.sendMessage(message);
    let response = result.response;

    // REVISAR SI LA IA QUIERE EJECUTAR UNA FUNCIÓN (TOOL CALL)
    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

    if (call && call.functionCall?.name === "consultar_mesas") {
      // EJECUTAMOS LA ACCIÓN REAL EN TU BASE DE DATOS
      const tables = await storage.getTablesByRestaurant(restaurantId);
      const orders = await storage.getOrdersByRestaurant(restaurantId);
      
      // Formateamos la respuesta para la IA
      const infoMesas = tables.map(t => {
        const ocupada = orders.some(o => o.tableId === String(t.number) && o.status !== "delivered");
        return `Mesa ${t.number}: ${ocupada ? 'Ocupada' : 'Libre'}`;
      }).join(", ");

      // Le devolvemos el resultado a la IA para que te responda a ti
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

    const reply = response.text();
    res.json({ reply });

  } catch (err: any) {
    console.error("AI error:", err);
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      return res.status(429).json({ error: "IA ocupada, intenta en 1 minuto." });
    }
    res.status(500).json({ error: "Error del asistente" });
  }
}