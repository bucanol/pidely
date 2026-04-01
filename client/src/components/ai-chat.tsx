import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Bot, X, Send, Mic, MicOff, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatProps {
  mode: "client" | "admin";
  slug?: string;
  tableId?: string;
  onOrderPlaced?: () => void;
}

export default function AIChat({ mode, slug, tableId, onOrderPlaced }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const endpoint = mode === "client"
        ? `/api/restaurants/${slug}/ai/chat`
        : "/api/admin/ai/chat";

      const res = await apiRequest("POST", endpoint, { message, history, tableId, slug });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (data.reply?.includes("pedido") || data.reply?.includes("orden")) {
        onOrderPlaced?.();
      }
    },
    onError: () => {
      setMessages(prev => [...prev, { role: "assistant", content: "Ocurrió un error. Intenta de nuevo." }]);
    },
  });

  function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg) return;
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    mutation.mutate(msg);
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      sendMessage(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-[#1B1B1B] text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
      >
        <Bot className="w-6 h-6" />
      </button>

      {/* Panel del chat */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md h-[75dvh] sm:h-[600px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1B1B1B] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1B1B1B]">Asistente Pidely</p>
                  <p className="text-[11px] text-gray-400">
                    {mode === "client" ? `Mesa ${tableId}` : "Panel Admin"}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center pt-8 space-y-2">
                  <Bot className="w-10 h-10 text-gray-200 mx-auto" />
                  <p className="text-sm text-gray-400">
                    {mode === "client"
                      ? "Hola, soy tu asistente. Puedo sugerirte platillos, ayudarte a pedir o llamar al mesero."
                      : "Hola, soy tu asistente. Pregúntame sobre ventas, mesas, menú o promociones."}
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#1B1B1B] text-white rounded-br-sm"
                      : "bg-gray-100 text-[#1B1B1B] rounded-bl-sm"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {mutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-transparent text-sm text-[#1B1B1B] placeholder-gray-400 outline-none"
                />
                <button
                  onClick={toggleVoice}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    listening ? "bg-red-500 text-white" : "text-gray-400"
                  }`}
                >
                  {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || mutation.isPending}
                  className="w-8 h-8 rounded-full bg-[#1B1B1B] text-white flex items-center justify-center disabled:opacity-30 transition-opacity"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}