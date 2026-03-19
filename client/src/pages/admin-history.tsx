import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Receipt, Clock, CreditCard, Banknote } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Restaurant, Ticket, Order, OrderItem } from "@shared/schema";
import AdminNav from "@/components/admin-nav";

type TicketWithOrders = Ticket & { orders: Order[] };

function formatCurrency(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatTime(dateStr: string | Date | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatDateFull(dateStr: string | Date | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

type FilterPeriod = "today" | "week" | "month";

function filterByPeriod(tickets: TicketWithOrders[], period: FilterPeriod): TicketWithOrders[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "today") {
    return tickets.filter(t => t.closedAt && new Date(t.closedAt) >= startOfToday);
  }

  if (period === "week") {
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    return tickets.filter(t => t.closedAt && new Date(t.closedAt) >= startOfWeek);
  }

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return tickets.filter(t => t.closedAt && new Date(t.closedAt) >= startOfMonth);
}

function PaymentIcon({ method }: { method: string | null }) {
  if (method === "card") return <CreditCard className="w-3.5 h-3.5 text-gray-400" />;
  return <Banknote className="w-3.5 h-3.5 text-gray-400" />;
}

function paymentLabel(method: string | null) {
  if (method === "card") return "Tarjeta";
  if (method === "cash") return "Efectivo";
  return method || "Efectivo";
}

export default function AdminHistoryPage() {
  const [period, setPeriod] = useState<FilterPeriod>("today");
  const { user } = useAuth();

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ["/api/admin/restaurant"],
  });

  const { data: allTickets, isLoading } = useQuery<TicketWithOrders[]>({
    queryKey: ["/api/admin/tickets-history"],
  });

  const periodLabels: Record<FilterPeriod, string> = {
    today: "Hoy",
    week: "Semana",
    month: "Mes",
  };

  const filtered = allTickets ? filterByPeriod(allTickets, period) : [];
  const totalAmount = filtered.reduce((sum, t) => sum + Number(t.total), 0);

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-4 sm:px-6 py-3 max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link href="/">
                <button className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
              </Link>
              <div className="min-w-0">
                <h1 className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight truncate">Historial</h1>
                <p className="text-[11px] text-gray-400 tracking-wide">{restaurant?.name || "..."}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : (
        <main className="flex-1 px-4 sm:px-6 py-4 max-w-3xl mx-auto w-full space-y-4">
          <div className="flex bg-gray-100 rounded-full p-0.5">
            {(["today", "week", "month"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  period === p ? "bg-white text-[#1B1B1B] shadow-sm" : "text-gray-400"
                }`}
                data-testid={`filter-period-${p}`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          <div className="bg-white border border-black/[0.04] rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total cobrado</p>
                <p className="font-serif text-2xl font-semibold text-[#1B1B1B] tabular-nums mt-0.5" data-testid="text-total-amount">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Tickets</p>
                <p className="font-serif text-2xl font-semibold text-[#1B1B1B] tabular-nums mt-0.5" data-testid="text-ticket-count">
                  {filtered.length}
                </p>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No hay tickets cobrados en este periodo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(ticket => {
                const allItems: OrderItem[] = [];
                ticket.orders.forEach(order => {
                  const items = order.itemsJson as OrderItem[];
                  if (Array.isArray(items)) {
                    items.forEach(item => {
                      const existing = allItems.find(i => i.productId === item.productId);
                      if (existing) {
                        existing.quantity += item.quantity;
                      } else {
                        allItems.push({ ...item });
                      }
                    });
                  }
                });

                return (
                  <div
                    key={ticket.id}
                    className="bg-white border border-black/[0.04] rounded-2xl p-4 space-y-3"
                    data-testid={`ticket-card-${ticket.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-[#1B1B1B]" data-testid={`text-table-${ticket.id}`}>
                            {ticket.tableId}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1B1B1B]">Mesa {ticket.tableId}</p>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-gray-300" />
                            <span className="text-[11px] text-gray-400" data-testid={`text-time-${ticket.id}`}>
                              {formatDateFull(ticket.closedAt)} {formatTime(ticket.closedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-semibold text-[#1B1B1B] tabular-nums" data-testid={`text-total-${ticket.id}`}>
                          {formatCurrency(Number(ticket.total))}
                        </p>
                        <div className="flex items-center gap-1 justify-end">
                          <PaymentIcon method={ticket.paymentMethod} />
                          <span className="text-[11px] text-gray-400" data-testid={`text-payment-${ticket.id}`}>
                            {paymentLabel(ticket.paymentMethod)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {allItems.length > 0 && (
                      <div className="border-t border-black/[0.04] pt-2.5 space-y-1">
                        {allItems.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] text-gray-300 tabular-nums w-5 flex-shrink-0">{item.quantity}x</span>
                              <span className="text-xs text-gray-600 truncate">{item.name}</span>
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                              {formatCurrency(item.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="h-4" />
        </main>
      )}

      <AdminNav />
    </div>
  );
}
