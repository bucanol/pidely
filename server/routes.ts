import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { insertCategorySchema, insertProductSchema, insertOrderSchema, insertWaiterCallSchema, insertTableSchema } from "@shared/schema";
import { broadcastToRestaurant } from "./websocket";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import express from "express";
import bcrypt from "bcryptjs";
import { handleAIChat } from "./ai";

const uploadStorage = multer.diskStorage({
  destination: "uploads/",
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/uploads", express.static("uploads"));

  app.get("/api/restaurants/:slug", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    res.json(restaurant);
  });

  app.get("/api/restaurants/:slug/categories", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const cats = await storage.getCategoriesByRestaurant(restaurant.id);
    res.json(cats);
  });

  app.get("/api/restaurants/:slug/products", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const prods = await storage.getProductsByRestaurant(restaurant.id);
    res.json(prods);
  });

  app.post("/api/restaurants/:slug/orders", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const parsed = insertOrderSchema.safeParse({ ...req.body, restaurantId: restaurant.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    let ticket = await storage.getOpenTicketByTable(restaurant.id, parsed.data.tableId);
    if (!ticket) {
      ticket = await storage.createTicket({ restaurantId: restaurant.id, tableId: parsed.data.tableId, status: "open", total: "0" });
    }

    const order = await storage.createOrder({ ...parsed.data, ticketId: ticket.id });

    const newTotal = (Number(ticket.total) + Number(order.total)).toFixed(2);
    await storage.updateTicketTotal(ticket.id, newTotal);

    broadcastToRestaurant(restaurant.id, { type: "new_order", data: { order, tableId: parsed.data.tableId } });
    res.status(201).json(order);
  });

  app.get("/api/restaurants/:slug/ticket/:tableId", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const ticket = await storage.getOpenTicketByTable(restaurant.id, req.params.tableId);
    if (!ticket) return res.json(null);
    const ticketOrders = await storage.getOrdersByTicket(ticket.id);
    res.json({ ...ticket, orders: ticketOrders });
  });

  app.post("/api/restaurants/:slug/waiter-calls", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const parsed = insertWaiterCallSchema.safeParse({ ...req.body, restaurantId: restaurant.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const call = await storage.createWaiterCall(parsed.data);
    broadcastToRestaurant(restaurant.id, { type: "waiter_call", data: { call, tableId: req.body.tableId } });
    res.status(201).json(call);
  });

  app.post("/api/admin/upload", requireAuth, upload.single("image"), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  app.get("/api/admin/restaurant", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const restaurant = await storage.getRestaurant(restaurantId);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    res.json(restaurant);
  });

  app.get("/api/admin/orders", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const ordrs = await storage.getOrdersByRestaurant(restaurantId);
    res.json(ordrs);
  });

  app.patch("/api/admin/orders/:id/status", requireAuth, async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status required" });
    const order = await storage.updateOrderStatus(req.params.id, status);
    broadcastToRestaurant(req.user!.restaurantId!, { type: "order_status_changed", data: { order } });
    res.json(order);
  });

  app.get("/api/admin/waiter-calls", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const calls = await storage.getWaiterCallsByRestaurant(restaurantId);
    res.json(calls);
  });

  app.patch("/api/admin/waiter-calls/:id/resolve", requireAuth, async (req, res) => {
    const call = await storage.resolveWaiterCall(req.params.id);
    res.json(call);
  });

  app.get("/api/admin/categories", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const cats = await storage.getCategoriesByRestaurant(restaurantId);
    res.json(cats);
  });

  app.post("/api/admin/categories", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const parsed = insertCategorySchema.safeParse({ ...req.body, restaurantId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const cat = await storage.createCategory(parsed.data);
    res.status(201).json(cat);
  });

  app.patch("/api/admin/categories/:id", requireAuth, async (req, res) => {
    const cat = await storage.updateCategory(req.params.id, req.body);
    res.json(cat);
  });

  app.delete("/api/admin/categories/:id", requireAuth, async (req, res) => {
    await storage.deleteCategory(req.params.id);
    res.status(204).send();
  });

  app.get("/api/admin/products", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const prods = await storage.getProductsByRestaurant(restaurantId);
    res.json(prods);
  });

  app.post("/api/admin/products", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const parsed = insertProductSchema.safeParse({ ...req.body, restaurantId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const product = await storage.createProduct(parsed.data);
    res.status(201).json(product);
  });

  app.patch("/api/admin/products/:id", requireAuth, async (req, res) => {
    const product = await storage.updateProduct(req.params.id, req.body);
    res.json(product);
  });

  app.delete("/api/admin/products/:id", requireAuth, async (req, res) => {
    await storage.deleteProduct(req.params.id);
    res.status(204).send();
  });

  app.get("/api/admin/tables", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const tbls = await storage.getTablesByRestaurant(restaurantId);
    res.json(tbls);
  });

  app.get("/api/admin/tables/status", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const tbls = await storage.getTablesByRestaurant(restaurantId);
    const allOrders = await storage.getOrdersByRestaurant(restaurantId);
    const allCalls = await storage.getWaiterCallsByRestaurant(restaurantId);
    const allTickets = await storage.getTicketsByRestaurant(restaurantId);

    const tablesWithStatus = tbls.map(t => {
      const tableOrders = allOrders.filter(o => o.tableId === String(t.number) && o.status !== "delivered");
      const hasWaiterCall = allCalls.some(c => c.tableId === String(t.number));
      const openTicket = allTickets.find(tk => tk.tableId === String(t.number) && tk.status === "open");
      let status: "free" | "occupied" | "waiter" = "free";
      if (hasWaiterCall) status = "waiter";
      else if (tableOrders.length > 0 || openTicket) status = "occupied";
      return {
        ...t,
        status,
        activeOrders: tableOrders.length,
        hasWaiterCall,
        ticketId: openTicket?.id || null,
        ticketTotal: openTicket ? Number(openTicket.total) : 0,
        billRequested: openTicket?.billRequested || false,
      };
    });
    res.json(tablesWithStatus);
  });

  app.get("/api/admin/tickets/:id", requireAuth, async (req, res) => {
    const ticket = await storage.getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const ticketOrders = await storage.getOrdersByTicket(ticket.id);
    res.json({ ...ticket, orders: ticketOrders });
  });

  app.post("/api/admin/tickets/:id/close", requireAuth, async (req, res) => {
    const { paymentMethod } = req.body;
    const ticket = await storage.closeTicket(req.params.id, paymentMethod || "cash");
    res.json(ticket);
  });

  app.post("/api/admin/tables", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const parsed = insertTableSchema.safeParse({ ...req.body, restaurantId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const table = await storage.createTable(parsed.data);
    res.status(201).json(table);
  });

  app.delete("/api/admin/tables/:id", requireAuth, async (req, res) => {
    await storage.deleteTable(req.params.id);
    res.status(204).send();
  });

  app.get("/api/admin/analytics", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const allOrders = await storage.getOrdersByRestaurant(restaurantId);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    let totalToday = 0, totalWeek = 0, totalMonth = 0, totalAll = 0;
    let ordersToday = 0, ordersWeek = 0, ordersMonth = 0;
    const dailySales: Record<string, number> = {};

    for (const order of allOrders) {
      const orderDate = new Date(order.createdAt);
      const orderTotal = Number(order.total);
      totalAll += orderTotal;

      const dateKey = orderDate.toISOString().split("T")[0];
      dailySales[dateKey] = (dailySales[dateKey] || 0) + orderTotal;

      if (orderDate >= startOfToday) { totalToday += orderTotal; ordersToday++; }
      if (orderDate >= startOfWeek) { totalWeek += orderTotal; ordersWeek++; }
      if (orderDate >= startOfMonth) { totalMonth += orderTotal; ordersMonth++; }

      const items = order.itemsJson as Array<{ productId: string; name: string; price: number; quantity: number }>;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!productSales[item.productId]) {
            productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
          }
          productSales[item.productId].quantity += item.quantity;
          productSales[item.productId].revenue += item.price * item.quantity;
        }
      }
    }

    const productList = Object.entries(productSales).map(([id, data]) => ({ productId: id, ...data }));
    productList.sort((a, b) => b.quantity - a.quantity);

    const last30Days: Array<{ date: string; total: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      last30Days.push({ date: key, total: dailySales[key] || 0 });
    }

    res.json({
      totals: {
        today: { amount: totalToday, orders: ordersToday },
        week: { amount: totalWeek, orders: ordersWeek },
        month: { amount: totalMonth, orders: ordersMonth },
        all: { amount: totalAll, orders: allOrders.length },
      },
      topProducts: productList.slice(0, 10),
      leastProducts: productList.length > 1 ? [...productList].reverse().slice(0, 5) : [],
      dailySales: last30Days,
    });
  });

  app.patch("/api/admin/restaurant", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const { name, description, logoUrl } = req.body;
    const updated = await storage.updateRestaurant(restaurantId, { name, description, logoUrl });
    res.json(updated);
  });

  app.get("/api/admin/tickets-history", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const paidTickets = await storage.getPaidTicketsByRestaurant(restaurantId);
    const ticketsWithOrders = await Promise.all(
      paidTickets.map(async (ticket) => {
        const orders = await storage.getOrdersByTicket(ticket.id);
        return { ...ticket, orders };
      })
    );
    res.json(ticketsWithOrders);
  });

  app.post("/api/restaurants/:slug/request-bill", async (req, res) => {
    const restaurant = await storage.getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const { tableId } = req.body;
    const ticket = await storage.getOpenTicketByTable(restaurant.id, tableId);
    if (!ticket) return res.status(404).json({ error: "No open ticket for this table" });
    const updated = await storage.requestBill(ticket.id);
    broadcastToRestaurant(restaurant.id, { type: "bill_request", data: { tableId, ticketId: ticket.id } });
    res.json(updated);
  });

  const requireOwner = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "No autenticado" });
    if (req.user.role !== "owner") return res.status(403).json({ message: "Solo el dueño puede hacer esto" });
    next();
  };

  app.get("/api/admin/team", requireAuth, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const members = await storage.getUsersByRestaurant(restaurantId);
    const safe = members.map(({ password, ...u }) => u);
    res.json(safe);
  });

  app.post("/api/admin/team", requireOwner, async (req, res) => {
    const restaurantId = req.user!.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: "No restaurant linked" });
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: "Faltan campos" });
    if (!["waiter", "cook"].includes(role)) return res.status(400).json({ error: "Rol inválido" });
    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "Email ya registrado" });
    const hashed = await bcrypt.hash(password, 10);
    const user = await storage.createUser({ name, email, password: hashed, restaurantId, role });
    const { password: _, ...safe } = user;
    res.status(201).json(safe);
  });

  app.delete("/api/admin/team/:id", requireOwner, async (req, res) => {
    const member = await storage.getUser(req.params.id);
    if (!member || member.restaurantId !== req.user!.restaurantId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    if (member.role === "owner") return res.status(400).json({ error: "No puedes eliminar al dueño" });
    await storage.deleteUser(req.params.id);
    res.status(204).send();
  });

  app.post("/api/admin/ai/chat", requireAuth, handleAIChat);

  return httpServer;
}