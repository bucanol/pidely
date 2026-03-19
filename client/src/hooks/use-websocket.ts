import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type WSEvent = {
  type: "new_order" | "order_status_changed" | "waiter_call" | "bill_request";
  restaurantId: string;
  data?: any;
};

type WSCallback = (event: WSEvent) => void;

let swRegistration: ServiceWorkerRegistration | null = null;

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js");
  } catch {}
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  const result = await Notification.requestPermission();
  return result;
}

export function getNotificationStatus(): "granted" | "denied" | "default" | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function sendPushNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if (swRegistration) {
      swRegistration.showNotification(title, {
        body,
        icon: "/favicon.png",
        badge: "/favicon.png",
        vibrate: [200, 100, 200],
        tag: title,
        renotify: true,
      });
    } else {
      new Notification(title, { body, icon: "/favicon.png" });
    }
  } catch {}
}

let audioCtx: AudioContext | null = null;

function getAudioCtx() {
  if (!audioCtx && typeof window !== "undefined") {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
  };
  document.addEventListener("click", unlockAudio, { capture: true });
  document.addEventListener("touchstart", unlockAudio, { capture: true });
  document.addEventListener("keydown", unlockAudio, { capture: true });
}

function playBellTone(frequency: number, duration: number, delay: number = 0, volume: number = 0.25) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const startTime = ctx.currentTime + delay;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = "sine";
    osc1.frequency.value = frequency;

    osc2.type = "sine";
    osc2.frequency.value = frequency * 2.76;
    
    const osc2Gain = ctx.createGain();
    osc2.disconnect();
    osc2.connect(osc2Gain);
    osc2Gain.connect(gain);
    osc2Gain.gain.value = 0.4;

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.setValueAtTime(volume, startTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
  } catch {}
}

function vibrate(pattern: number | number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}

export function playNotificationSound(type: "order" | "waiter" | "bill") {
  if (type === "order") {
    vibrate([200, 100, 200]);
    playBellTone(830, 1.0, 0, 1.0);
    playBellTone(1050, 0.8, 0.35, 1.0);
    playBellTone(1250, 1.0, 0.7, 1.0);
    playBellTone(830, 1.0, 1.1, 1.0);
    playBellTone(1050, 0.8, 1.45, 1.0);
    playBellTone(1250, 1.0, 1.8, 1.0);
  } else if (type === "waiter") {
    playBellTone(700, 1.2, 0, 1.0);
    playBellTone(700, 1.2, 0.6, 1.0);
    playBellTone(700, 1.2, 1.2, 1.0);
    playBellTone(850, 1.2, 1.8, 1.0);
    playBellTone(700, 1.2, 2.4, 1.0);
    vibrate([300, 150, 300, 150, 500]);
  } else {
    vibrate([200, 100, 200]);
    playBellTone(900, 0.6, 0, 1.0);
    playBellTone(1100, 0.6, 0.3, 1.0);
    playBellTone(1350, 0.8, 0.6, 1.0);
    playBellTone(900, 0.6, 1.0, 1.0);
    playBellTone(1100, 0.6, 1.3, 1.0);
    playBellTone(1350, 0.8, 1.6, 1.0);
  }
}

export function useWebSocket(restaurantId: string | undefined | null, onEvent?: WSCallback) {
  const wsRef = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const connect = useCallback(() => {
    if (!restaurantId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws?restaurantId=${restaurantId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (evt) => {
      try {
        const event: WSEvent = JSON.parse(evt.data);
        onEvent?.(event);

        if (event.type === "new_order") {
          playNotificationSound("order");
          sendPushNotification("Nuevo pedido", `Mesa ${event.data?.tableId} hizo un pedido`);
          qc.invalidateQueries({ queryKey: ["/api/admin/orders"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
          toast({ title: `Nuevo pedido — Mesa ${event.data?.tableId}` });
        } else if (event.type === "waiter_call") {
          playNotificationSound("waiter");
          sendPushNotification("Mesero solicitado", `Mesa ${event.data?.tableId} necesita un mesero`);
          qc.invalidateQueries({ queryKey: ["/api/admin/waiter-calls"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
          toast({ title: `Mesero solicitado — Mesa ${event.data?.tableId}` });
        } else if (event.type === "order_status_changed") {
          qc.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        } else if (event.type === "bill_request") {
          playNotificationSound("bill");
          sendPushNotification("Cuenta solicitada", `Mesa ${event.data?.tableId} quiere pagar`);
          qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
          toast({ title: `Cuenta solicitada — Mesa ${event.data?.tableId}` });
        }
      } catch {}
    };

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [restaurantId, onEvent, qc, toast]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
