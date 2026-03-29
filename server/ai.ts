import type { Request, Response } from "express";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// USAMOS EL ALIAS QUE SIEMPRE APUNTA AL ÚLTIMO FLASH
const model = genAI.getGenerativeModel({ 
  model: "gemini-flash-latest" 
});

export async function handleAIChat(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { message } = req.body;
    
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });
    if (!user || !user.restaurantId) return res.status(401).json({ error: "Sesión no válida" });

    const restaurant = await storage.getRestaurant(user.restaurantId);
    
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: `Eres el asistente de "${restaurant?.name}".` }] },
        { role: "model", parts: [{ text: "Hola, ¿en qué te ayudo?" }] },
      ],
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    res.json({ reply: response.text() });

  } catch (err: any) {
    console.error("AI error detalle:", err);
    res.status(500).json({ error: "Error de conexión: El modelo no responde. Revisa la consola." });
  }
}