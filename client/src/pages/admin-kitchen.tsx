import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  ChefHat, BellRing, Clock, CheckCheck, Loader2,
  ArrowLeft, X, Flame, CircleDot, LogOut, UtensilsCrossed, LayoutGrid, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Order, WaiterCall, OrderItem, Restaurant, Product } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import AdminNav from "@/components/admin-nav";
import NotificationBanner from "@/components/notification-banner";
import AIChat from "@/components/ai-chat";

const STATUS_CONFIG = {
  pending: { label: "Nuevo", bg: "bg-amber-50", border: "border-amber-200/60", dot: "bg-amber-400", text: "text-amber-700" },
  preparing: { label: "En fuego", bg: "bg-sky-50", border: "border-sky-200/60", dot: "bg-sky-400", text: "text-sky-700" },
  ready: { label: "Listo", bg: "bg-emerald-50", border: "border-emerald-200/60", dot: "bg-emerald-400", text: "text-emerald-700" },
  delivered: { label: "Entregado", bg: "bg-gray-50", border: "border-gray-200/60", dot: "bg-gray-300", text: "text-gray-500" },
} as const;

function timeAgo(date: Date | string) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function AdminKitchenPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user, logoutMutation } = useAuth();
  const [filter, setFilter] = useState<"active" | "all">("active");

  const [, navigate] = useLocation();

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ["/api/admin/restaurant"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  useWebSocket(user?.restaurantId);

  useEffect(() => {
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/waiter-calls"] });
    }, 30000);
    return () => clearInterval(interval);
  }, [qc]);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    refetchInterval: 30000,
  });

  const { data: waiterCalls = [] } = useQuery<WaiterCall[]>({
    queryKey: ["/api/admin/waiter-calls"],
    refetchInterval: 30000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/orders/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const resolveCallMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/waiter-calls/${id}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/waiter-calls"] });
    },
  });

  const activeOrders = orders.filter(o => o.status !== "delivered");
  const visibleOrders = filter === "active" ? activeOrders : orders;
  const pendingCount = orders.filter(o => o.status === "pending").length;

  function getNextStatus(current: string) {
    if (current === "pending") return "preparing";
    if (current === "preparing") return "ready";
    if (current === "ready") return "delivered";
    return null;
  }

  function getNextLabel(current: string) {
    if (current === "pending") return "Preparar";
    if (current === "preparing") return "Listo";
    if (current === "ready") return "Entregado";
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-4 sm:px-6 py-3 max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#1B1B1B] flex items-center justify-center flex-shrink-0">
                <ChefHat className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight truncate">Cocina</h1>
                <p className="text-[11px] text-gray-400 tracking-wide">{restaurant?.name || "..."}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {pendingCount > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 rounded-full px-2.5 py-1 text-xs font-semibold" data-testid="badge-pending-count">
                  <Flame className="w-3 h-3" />
                  {pendingCount}
                </div>
              )}
              <div className="flex bg-gray-100 rounded-full p-0.5">
                <button
                  onClick={() => setFilter("active")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filter === "active" ? "bg-white text-[#1B1B1B] shadow-sm" : "text-gray-400"
                  }`}
                  data-testid="filter-active"
                >
                  Activos
                </button>
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filter === "all" ? "bg-white text-[#1B1B1B] shadow-sm" : "text-gray-400"
                  }`}
                  data-testid="filter-all-orders"
                >
                  Todos
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <NotificationBanner />

      {waiterCalls.length > 0 && (
        <div className="px-4 sm:px-6 pt-3 max-w-6xl mx-auto w-full">
          <div className="bg-amber-50 border border-amber-200/50 rounded-2xl p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <BellRing className="w-3.5 h-3.5 text-amber-500" />
              <p className="font-medium text-amber-700 text-xs tracking-wide uppercase">Mesero solicitado</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {waiterCalls.map(call => (
                <button
                  key={call.id}
                  onClick={() => resolveCallMutation.mutate(call.id)}
                  className="flex items-center gap-2 bg-white border border-amber-200/50 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
                  data-testid={`waiter-call-${call.id}`}
                >
                  <span className="text-sm font-semibold text-[#1B1B1B]">Mesa {call.tableId}</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(call.createdAt)}</span>
                  <X className="w-3 h-3 text-amber-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 sm:px-6 py-4 max-w-6xl mx-auto w-full">
        {ordersLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : visibleOrders.length === 0 && products.length === 0 ? (
          <div className="text-center py-16 space-y-5 max-w-xs mx-auto">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto">
              <UtensilsCrossed className="w-7 h-7 text-gray-200" />
            </div>
            <div className="space-y-2">
              <p className="font-serif text-lg text-[#1B1B1B] font-semibold">¡Bienvenido!</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                Configura tu restaurante para empezar a recibir pedidos.
              </p>
            </div>
            <div className="space-y-2.5 pt-2">
              <Button
                onClick={() => navigate("/admin/menu")}
                className="w-full h-11 rounded-xl gap-2 text-sm"
                data-testid="button-setup-menu"
              >
                <UtensilsCrossed className="w-4 h-4" />
                Crear tu menú
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/admin/mesas")}
                className="w-full h-11 rounded-xl gap-2 text-sm"
                data-testid="button-setup-tables"
              >
                <LayoutGrid className="w-4 h-4" />
                Configurar mesas
              </Button>
            </div>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-center py-24 space-y-3">
            <ChefHat className="w-10 h-10 text-gray-200 mx-auto" />
            <p className="font-serif text-base text-gray-300">Sin comandas</p>
            <p className="text-xs text-gray-300">Esperando órdenes...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleOrders.map(order => {
              const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
              const items = order.itemsJson as OrderItem[];
              const nextStatus = getNextStatus(order.status);
              const nextLabel = getNextLabel(order.status);

              return (
                <div
                  key={order.id}
                  className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4 space-y-3`}
                  data-testid={`order-card-${order.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="font-serif text-base font-semibold text-[#1B1B1B]">Mesa {order.tableId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400 flex items-center gap-1 tabular-nums">
                        <Clock className="w-2.5 h-2.5" />
                        {timeAgo(order.createdAt)}
                      </span>
                      <span className={`text-[10px] font-semibold ${cfg.text} uppercase tracking-widest`}>{cfg.label}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-white/60 rounded-xl p-3">
                    {items.map((item, idx) => (
                      <div key={idx} data-testid={`order-item-${order.id}-${idx}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-[#1B1B1B]">{item.name}</span>
                          <span className="text-xs font-bold text-gray-400 tabular-nums">{item.quantity}x</span>
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-amber-600 italic mt-0.5 pl-0.5">⚠ {item.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="font-serif text-sm font-semibold text-[#1B1B1B] tabular-nums">${Number(order.total).toFixed(2)}</span>
                    {nextStatus && nextLabel && (
                      <Button
                        size="sm"
                        variant={order.status === "pending" ? "default" : "outline"}
                        onClick={() => updateStatusMutation.mutate({ id: order.id, status: nextStatus })}
                        disabled={updateStatusMutation.isPending}
                        className="rounded-full text-xs h-8"
                        data-testid={`button-advance-${order.id}`}
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 mr-1" />
                        )}
                        {nextLabel}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AIChat mode="admin" />
      <AdminNav />
    </div>
  );
}