import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { log } from "./index";

type WSEvent = {
  type: "new_order" | "order_status_changed" | "waiter_call" | "bill_request";
  restaurantId: string;
  data?: any;
};

const clients = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const restaurantId = url.searchParams.get("restaurantId");

    if (!restaurantId) {
      ws.close(1008, "restaurantId required");
      return;
    }

    if (!clients.has(restaurantId)) {
      clients.set(restaurantId, new Set());
    }
    clients.get(restaurantId)!.add(ws);
    log(`WS client connected for restaurant ${restaurantId}`, "websocket");

    ws.on("close", () => {
      clients.get(restaurantId)?.delete(ws);
      if (clients.get(restaurantId)?.size === 0) {
        clients.delete(restaurantId);
      }
    });

    ws.on("error", () => {
      clients.get(restaurantId)?.delete(ws);
    });
  });

  log("WebSocket server initialized on /ws", "websocket");
}

export function broadcastToRestaurant(restaurantId: string, event: Omit<WSEvent, "restaurantId">) {
  const restaurantClients = clients.get(restaurantId);
  if (!restaurantClients || restaurantClients.size === 0) return;

  const message = JSON.stringify({ ...event, restaurantId });
  for (const ws of restaurantClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}
