import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

// USAMOS EL MODELO 2.0 ESTABLE PARA EVITAR CAÍDAS
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
    
    let systemPrompt = `Eres el asistente inteligente de "${restaurant?.name}". `;
    if (user.role === "owner") systemPrompt += "Tu función es ayudar al Dueño con la gestión del restaurante.";

    // 2. INICIO DEL CHAT CON HISTORIAL LIMPIO
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Entendido. Soy el asistente de Pidely para " + restaurant?.name + ". ¿En qué puedo apoyarte hoy?" }] },
      ],
    });

    // 3. ENVIAR MENSAJE DEL USUARIO
    let result = await chat.sendMessage(message);
    let response = result.response;

    // 4. LÓGICA DE HERRAMIENTAS (FUNCTION CALLING)
    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

    if (call && call.functionCall) {
      const functionName = call.functionCall.name;

      if (functionName === "consultar_mesas") {
        const tables = await storage.getTablesByRestaurant(restaurantId);
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        
        const infoMesas = tables.length > 0 
          ? tables.map(t => {
              const tieneOrdenActiva = orders.some(o => 
                Number(o.tableId) === t.number && 
                o.status !== "delivered" && 
                o.status !== "cancelled"
              );
              return `Mesa ${t.number}: ${tieneOrdenActiva ? 'Ocupada' : 'Libre'}`;
            }).join(", ")
          : "No hay mesas registradas en el sistema todavía.";

        // ENVIAR LA RESPUESTA DE LA BASE DE DATOS A LA IA
        result = await chat.sendMessage([{
          functionResponse: {
            name: "consultar_mesas",
            response: { content: infoMesas },
          },
        }]);
        response = result.response;
      }
    }

    // 5. RESPUESTA FINAL AL CLIENTE
    res.json({ reply: response.text() });

} catch (err: any) {
    console.error("AI error detalle:", err);
    
    const status = err.status || 500;
    let errorMsg = "Error del asistente. Por favor, intenta de nuevo.";

    if (status === 429) {
      errorMsg = "¡Vas muy rápido! Google me pide que esperemos unos 15 segundos antes de seguir hablando.";
    } else if (status === 503) {
      errorMsg = "El servidor de Google está saturado, intenta en un momento.";
    }
      
    res.status(status).json({ error: errorMsg });
  }
}