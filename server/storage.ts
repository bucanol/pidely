import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  restaurants, categories, products, orders, waiterCalls, tables, users, tickets,
  type Restaurant, type InsertRestaurant,
  type Category, type InsertCategory,
  type Product, type InsertProduct,
  type Order, type InsertOrder,
  type WaiterCall, type InsertWaiterCall,
  type Table, type InsertTable,
  type User, type InsertUser,
  type Ticket, type InsertTicket,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  getUsersByRestaurant(restaurantId: string): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  getRestaurantBySlug(slug: string): Promise<Restaurant | undefined>;
  getRestaurant(id: string): Promise<Restaurant | undefined>;
  getAllRestaurants(): Promise<Restaurant[]>;
  createRestaurant(data: InsertRestaurant): Promise<Restaurant>;
  updateRestaurant(id: string, data: Partial<InsertRestaurant>): Promise<Restaurant>;

  getTablesByRestaurant(restaurantId: string): Promise<Table[]>;
  createTable(data: InsertTable): Promise<Table>;
  deleteTable(id: string): Promise<void>;

  getCategoriesByRestaurant(restaurantId: string): Promise<Category[]>;
  createCategory(data: InsertCategory): Promise<Category>;
  updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  getProductsByRestaurant(restaurantId: string): Promise<Product[]>;
  getProductsByCategory(categoryId: string): Promise<Product[]>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  getOrdersByRestaurant(restaurantId: string): Promise<Order[]>;
  getActiveOrdersByTable(restaurantId: string, tableId: string): Promise<Order[]>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order>;

  getWaiterCallsByRestaurant(restaurantId: string): Promise<WaiterCall[]>;
  getWaiterCallByTable(restaurantId: string, tableId: string): Promise<WaiterCall | undefined>;
  createWaiterCall(data: InsertWaiterCall): Promise<WaiterCall>;
  resolveWaiterCall(id: string): Promise<WaiterCall>;

  getOpenTicketByTable(restaurantId: string, tableId: string): Promise<Ticket | undefined>;
  getTicket(id: string): Promise<Ticket | undefined>;
  getTicketsByRestaurant(restaurantId: string): Promise<Ticket[]>;
  createTicket(data: InsertTicket): Promise<Ticket>;
  updateTicketTotal(id: string, total: string): Promise<Ticket>;
  closeTicket(id: string, paymentMethod: string): Promise<Ticket>;
  getOrdersByTicket(ticketId: string): Promise<Order[]>;
  getPaidTicketsByRestaurant(restaurantId: string): Promise<Ticket[]>;
  requestBill(ticketId: string): Promise<Ticket>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(data: InsertUser) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUsersByRestaurant(restaurantId: string) {
    return db.select().from(users).where(eq(users.restaurantId, restaurantId));
  }

  async deleteUser(id: string) {
    await db.delete(users).where(eq(users.id, id));
  }

  async getRestaurantBySlug(slug: string) {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.slug, slug));
    return restaurant;
  }

  async getRestaurant(id: string) {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    return restaurant;
  }

  async getAllRestaurants() {
    return db.select().from(restaurants);
  }

  async createRestaurant(data: InsertRestaurant) {
    const [restaurant] = await db.insert(restaurants).values(data).returning();
    return restaurant;
  }

  async updateRestaurant(id: string, data: Partial<InsertRestaurant>) {
    const [restaurant] = await db.update(restaurants).set(data).where(eq(restaurants.id, id)).returning();
    return restaurant;
  }

  async getTablesByRestaurant(restaurantId: string) {
    return db.select().from(tables).where(eq(tables.restaurantId, restaurantId)).orderBy(tables.number);
  }

  async createTable(data: InsertTable) {
    const [table] = await db.insert(tables).values(data).returning();
    return table;
  }

  async deleteTable(id: string) {
    await db.delete(tables).where(eq(tables.id, id));
  }

  async getCategoriesByRestaurant(restaurantId: string) {
    return db.select().from(categories).where(eq(categories.restaurantId, restaurantId)).orderBy(categories.displayOrder);
  }

  async createCategory(data: InsertCategory) {
    const [category] = await db.insert(categories).values(data).returning();
    return category;
  }

  async updateCategory(id: string, data: Partial<InsertCategory>) {
    const [category] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    return category;
  }

  async deleteCategory(id: string) {
    await db.delete(products).where(eq(products.categoryId, id));
    await db.delete(categories).where(eq(categories.id, id));
  }

  async getProductsByRestaurant(restaurantId: string) {
    return db.select().from(products).where(eq(products.restaurantId, restaurantId));
  }

  async getProductsByCategory(categoryId: string) {
    return db.select().from(products).where(eq(products.categoryId, categoryId));
  }

  async createProduct(data: InsertProduct) {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>) {
    const [product] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return product;
  }

  async deleteProduct(id: string) {
    await db.delete(products).where(eq(products.id, id));
  }

  async getOrdersByRestaurant(restaurantId: string) {
    return db.select().from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
  }

  async getActiveOrdersByTable(restaurantId: string, tableId: string) {
    const allOrders = await db.select().from(orders).where(
      and(eq(orders.restaurantId, restaurantId), eq(orders.tableId, tableId))
    ).orderBy(desc(orders.createdAt));
    return allOrders.filter(o => o.status !== "delivered");
  }

  async createOrder(data: InsertOrder) {
    const [order] = await db.insert(orders).values(data).returning();
    return order;
  }

  async updateOrderStatus(id: string, status: string) {
    const [order] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning();
    return order;
  }

  async getWaiterCallsByRestaurant(restaurantId: string) {
    return db.select().from(waiterCalls).where(
      and(eq(waiterCalls.restaurantId, restaurantId), eq(waiterCalls.resolved, false))
    ).orderBy(desc(waiterCalls.createdAt));
  }

  async getWaiterCallByTable(restaurantId: string, tableId: string) {
    const [call] = await db.select().from(waiterCalls).where(
      and(eq(waiterCalls.restaurantId, restaurantId), eq(waiterCalls.tableId, tableId), eq(waiterCalls.resolved, false))
    );
    return call;
  }

  async createWaiterCall(data: InsertWaiterCall) {
    const [call] = await db.insert(waiterCalls).values(data).returning();
    return call;
  }

  async resolveWaiterCall(id: string) {
    const [call] = await db.update(waiterCalls).set({ resolved: true }).where(eq(waiterCalls.id, id)).returning();
    return call;
  }

  async getOpenTicketByTable(restaurantId: string, tableId: string) {
    const [ticket] = await db.select().from(tickets).where(
      and(eq(tickets.restaurantId, restaurantId), eq(tickets.tableId, tableId), eq(tickets.status, "open"))
    );
    return ticket;
  }

  async getTicket(id: string) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async getTicketsByRestaurant(restaurantId: string) {
    return db.select().from(tickets).where(eq(tickets.restaurantId, restaurantId)).orderBy(desc(tickets.createdAt));
  }

  async createTicket(data: InsertTicket) {
    const [ticket] = await db.insert(tickets).values(data).returning();
    return ticket;
  }

  async updateTicketTotal(id: string, total: string) {
    const [ticket] = await db.update(tickets).set({ total }).where(eq(tickets.id, id)).returning();
    return ticket;
  }

  async closeTicket(id: string, paymentMethod: string) {
    const [ticket] = await db.update(tickets).set({ status: "paid", paymentMethod, closedAt: new Date() }).where(eq(tickets.id, id)).returning();
    return ticket;
  }

  async getOrdersByTicket(ticketId: string) {
    return db.select().from(orders).where(eq(orders.ticketId, ticketId)).orderBy(desc(orders.createdAt));
  }

  async getPaidTicketsByRestaurant(restaurantId: string) {
    return db.select().from(tickets).where(
      and(eq(tickets.restaurantId, restaurantId), eq(tickets.status, "paid"))
    ).orderBy(desc(tickets.closedAt));
  }

  async requestBill(ticketId: string) {
    const [ticket] = await db.update(tickets).set({ billRequested: true }).where(eq(tickets.id, ticketId)).returning();
    return ticket;
  }
}

export const storage = new DatabaseStorage();
