import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 1. DEFINICIÓN DE HERRAMIENTAS (Lectura y Escritura)
const tools: any = [
  {
    functionDeclarations: [
      {
        name: "consultar_mesas",
        description: "Obtiene el estado actual de todas las mesas del restaurante.",
      },
      {
        name: "crear_mesa",
        description: "Crea una nueva mesa en el sistema con un número específico.",
        parameters: {
          type: "object",
          properties: {
            numero: { type: "number", description: "El número identificador de la mesa." }
          },
          required: ["numero"]
        }
      }
    ],
  },
];

const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash", 
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
    
    let systemPrompt = `Eres el asistente de "${restaurant?.name}". Tienes permiso para consultar y crear mesas.`;

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "¡Hola! Soy el asistente de " + restaurant?.name + ". Puedo ayudarte a gestionar tus mesas. ¿Qué necesitas?" }] },
      ],
    });

    let result = await chat.sendMessage(message);
    let response = result.response;

    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

    if (call && call.functionCall) {
      const { name, args } = call.functionCall;

      // LÓGICA: CONSULTAR
      if (name === "consultar_mesas") {
        const tables = await storage.getTablesByRestaurant(restaurantId);
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        const info = tables.length > 0 
          ? tables.map(t => `Mesa ${t.number}: ${orders.some(o => Number(o.tableId) === t.number && o.status !== 'delivered') ? 'Ocupada' : 'Libre'}`).join(", ")
          : "No hay mesas registradas.";

        result = await chat.sendMessage([{ functionResponse: { name, response: { content: info } } }]);
        response = result.response;
      } 
      
      // LÓGICA: CREAR (Corregido para evitar error de qrCode)
      else if (name === "crear_mesa") {
        const numeroMesa = (args as any).numero;
        
        await storage.createTable({
          restaurantId,
          number: numeroMesa,
          label: `Mesa ${numeroMesa}`, // Cambiado de qrCode a label para que VS Code no chille
        });

        result = await chat.sendMessage([{ 
          functionResponse: { 
            name, 
            response: { content: `Mesa ${numeroMesa} creada exitosamente en la base de datos.` } 
          } 
        }]);
        response = result.response;
      }
    }

    res.json({ reply: response.text() });

  } catch (err: any) {
    console.error("AI error detalle:", err);
    const status = err.status || 500;
    res.status(status).json({ error: status === 429 ? "Espera 15 segundos..." : "Error del asistente." });
  }
}