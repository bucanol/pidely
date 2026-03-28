import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Asistente del Dueño",
  waiter: "Asistente del Mesero",
  cook: "Asistente de Cocina",
};

const ROLE_WELCOME: Record<string, string> = {
  owner: "¡Hola! Soy tu asistente de negocio. Puedo ayudarte con estadísticas, ideas para el menú, estrategias de marketing y cualquier consulta sobre tu restaurante.",
  waiter: "¡Hola! Soy tu asistente. Puedo ayudarte con información del menú, estado de mesas y órdenes activas.",
  cook: "¡Hola! Soy tu asistente de cocina. Puedo ayudarte a organizar pedidos pendientes y prioridades.",
};

export default function AdminAIPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const role = user?.role || "owner";

  useEffect(() => {
    setMessages([{ role: "assistant", content: ROLE_WELCOME[role] || ROLE_WELCOME.owner }]);
  }, [role]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || data.error || "Error al responder." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#FAFAFA]">
      <div className="border-b bg-white px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-semibold text-sm">{ROLE_LABELS[role] || "Asistente IA"}</p>
          <p className="text-xs text-gray-400">Powered by Gemini</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-black text-white rounded-tr-sm"
                : "bg-white border text-gray-800 rounded-tl-sm"
            }`}>
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-1">
                <User className="w-3.5 h-3.5 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white border rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t bg-white px-4 py-3 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="Escribe tu mensaje..."
          className="flex-1"
          disabled={loading}
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" className="bg-black hover:bg-gray-800">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}