import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, DollarSign,
  ShoppingBag, BarChart3, Calendar
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Restaurant } from "@shared/schema";
import AdminNav from "@/components/admin-nav";

type AnalyticsData = {
  totals: {
    today: { amount: number; orders: number };
    week: { amount: number; orders: number };
    month: { amount: number; orders: number };
    all: { amount: number; orders: number };
  };
  topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  leastProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  dailySales: Array<{ date: string; total: number }>;
};

function formatCurrency(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function MiniBarChart({ data, maxHeight = 80 }: { data: Array<{ date: string; total: number }>; maxHeight?: number }) {
  const maxVal = Math.max(...data.map(d => d.total), 1);
  const barWidth = 100 / data.length;

  return (
    <div className="w-full" style={{ height: maxHeight }}>
      <div className="flex items-end h-full gap-[2px]">
        {data.map((d, i) => {
          const height = (d.total / maxVal) * 100;
          const isToday = i === data.length - 1;
          return (
            <div
              key={d.date}
              className="flex-1 group relative"
              style={{ height: "100%" }}
            >
              <div className="absolute bottom-0 w-full flex flex-col items-center">
                <div
                  className={`w-full rounded-t-sm transition-all ${
                    isToday ? "bg-[#1B1B1B]" : d.total > 0 ? "bg-gray-200" : "bg-gray-100"
                  }`}
                  style={{ height: `${Math.max(height, d.total > 0 ? 4 : 1)}%` }}
                />
              </div>
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1B1B1B] text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {formatDate(d.date)}: {formatCurrency(d.total)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("today");
  const { user } = useAuth();

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ["/api/admin/restaurant"],
  });

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
  });

  const periodLabels = {
    today: "Hoy",
    week: "Esta semana",
    month: "Este mes",
    all: "Todo",
  };

  const currentTotals = analytics?.totals[period];

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
                <h1 className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight truncate">Ventas</h1>
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
      ) : !analytics ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-300 text-sm">Sin datos disponibles</p>
        </div>
      ) : (
        <main className="flex-1 px-4 sm:px-6 py-4 max-w-3xl mx-auto w-full space-y-5">
          <div className="flex bg-gray-100 rounded-full p-0.5">
            {(["today", "week", "month", "all"] as const).map(p => (
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

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-black/[0.04] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-gray-300" />
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Ventas</p>
              </div>
              <p className="font-serif text-2xl font-semibold text-[#1B1B1B] tabular-nums" data-testid="stat-sales-amount">
                {formatCurrency(currentTotals?.amount ?? 0)}
              </p>
            </div>
            <div className="bg-white border border-black/[0.04] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag className="w-4 h-4 text-gray-300" />
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Pedidos</p>
              </div>
              <p className="font-serif text-2xl font-semibold text-[#1B1B1B] tabular-nums" data-testid="stat-orders-count">
                {currentTotals?.orders ?? 0}
              </p>
            </div>
          </div>

          {currentTotals && currentTotals.orders > 0 && (
            <div className="bg-white border border-black/[0.04] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-300" />
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Ticket promedio</p>
              </div>
              <p className="font-serif text-xl font-semibold text-[#1B1B1B] tabular-nums" data-testid="stat-avg-ticket">
                {formatCurrency(currentTotals.amount / currentTotals.orders)}
              </p>
            </div>
          )}

          <div className="bg-white border border-black/[0.04] rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-300" />
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Últimos 30 días</p>
            </div>
            <MiniBarChart data={analytics.dailySales} maxHeight={100} />
            <div className="flex justify-between text-[10px] text-gray-300 px-0.5">
              <span>{formatDate(analytics.dailySales[0]?.date ?? "")}</span>
              <span>Hoy</span>
            </div>
          </div>

          {analytics.topProducts.length > 0 && (
            <div className="bg-white border border-black/[0.04] rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Más vendidos</p>
              </div>
              <div className="space-y-2">
                {analytics.topProducts.map((product, idx) => {
                  const maxQty = analytics.topProducts[0]?.quantity ?? 1;
                  const pct = (product.quantity / maxQty) * 100;
                  return (
                    <div key={product.productId} data-testid={`top-product-${idx}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] text-gray-300 font-semibold w-5 flex-shrink-0 tabular-nums">{idx + 1}</span>
                          <span className="text-sm text-[#1B1B1B] truncate">{product.name}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-gray-400 tabular-nums">{product.quantity} uds</span>
                          <span className="text-xs font-semibold text-[#1B1B1B] tabular-nums w-20 text-right">{formatCurrency(product.revenue)}</span>
                        </div>
                      </div>
                      <div className="ml-7 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {analytics.leastProducts.length > 0 && (
            <div className="bg-white border border-black/[0.04] rounded-2xl p-4 space-y-3 mb-6">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Menos vendidos</p>
              </div>
              <div className="space-y-2">
                {analytics.leastProducts.map((product, idx) => (
                  <div key={product.productId} className="flex items-center justify-between gap-2 py-1" data-testid={`least-product-${idx}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-[#1B1B1B] truncate">{product.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400 tabular-nums">{product.quantity} uds</span>
                      <span className="text-xs font-semibold text-[#1B1B1B] tabular-nums w-20 text-right">{formatCurrency(product.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      <AdminNav />
    </div>
  );
}
