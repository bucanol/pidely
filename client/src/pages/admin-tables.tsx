import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Trash2, Loader2, QrCode, Download,
  Users, BellRing, Coffee, X, Receipt, CreditCard, Banknote, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TableWithStatus, Table as TableType, Restaurant, Order, OrderItem, Ticket } from "@shared/schema";
import { Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import AdminNav from "@/components/admin-nav";

const STATUS_STYLES = {
  free: { bg: "bg-gray-50", border: "border-gray-200/50", dot: "bg-gray-300", label: "Libre", text: "text-gray-500" },
  occupied: { bg: "bg-sky-50", border: "border-sky-200/50", dot: "bg-sky-400", label: "Ocupada", text: "text-sky-600" },
  waiter: { bg: "bg-amber-50", border: "border-amber-200/50", dot: "bg-amber-400", label: "Mesero", text: "text-amber-600" },
};

function getBaseUrl() {
  return window.location.origin;
}

function QRModal({ table, slug }: { table: TableWithStatus; slug: string }) {
  const qrRef = useRef<HTMLDivElement>(null);
  const url = `${getBaseUrl()}/${slug}/mesa/${table.number}`;

  function handleDownload() {
    const svgEl = qrRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = 1024;
      canvas.height = 1200;
      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const qrSize = 800;
        const qrX = (canvas.width - qrSize) / 2;
        ctx.drawImage(img, qrX, 80, qrSize, qrSize);
        ctx.fillStyle = "#1B1B1B";
        ctx.font = "bold 64px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Mesa ${table.number}`, canvas.width / 2, 1020);
        ctx.fillStyle = "#999999";
        ctx.font = "32px Inter, sans-serif";
        ctx.fillText("Escanea para ver el menú", canvas.width / 2, 1080);
        const link = document.createElement("a");
        link.download = `mesa-${table.number}-qr.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="w-9 h-9 rounded-xl bg-white border border-black/[0.04] flex items-center justify-center active:scale-90 transition-transform"
          data-testid={`button-qr-table-${table.number}`}
        >
          <QrCode className="w-4 h-4 text-gray-400" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-center">Mesa {table.number}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5 py-4">
          <div ref={qrRef} className="bg-white p-6 rounded-2xl border border-black/[0.04]">
            <QRCodeSVG
              value={url}
              size={220}
              level="H"
              bgColor="#FFFFFF"
              fgColor="#1B1B1B"
            />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm text-gray-500 break-all px-4">{url}</p>
          </div>
          <Button
            onClick={handleDownload}
            variant="outline"
            className="rounded-full gap-2"
            data-testid={`button-download-qr-${table.number}`}
          >
            <Download className="w-4 h-4" />
            Descargar QR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TicketWithOrders = Ticket & { orders: Order[] };

function TicketDialog({ table, onClose }: { table: TableWithStatus; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: ticket, isLoading } = useQuery<TicketWithOrders>({
    queryKey: ["/api/admin/tickets", table.ticketId],
    queryFn: () => fetch(`/api/admin/tickets/${table.ticketId}`).then(r => r.json()),
    enabled: !!table.ticketId,
  });

  const closeMutation = useMutation({
    mutationFn: (paymentMethod: string) =>
      apiRequest("POST", `/api/admin/tickets/${table.ticketId}/close`, { paymentMethod }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
      toast({ title: "Cuenta cobrada" });
      onClose();
    },
    onError: () => toast({ title: "Error al cerrar cuenta", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {ticket.orders.map((order) => {
          const items = order.itemsJson as OrderItem[];
          return (
            <div key={order.id} className="bg-gray-50/80 rounded-xl p-3 space-y-1.5" data-testid={`ticket-order-${order.id}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                  {new Date(order.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{order.status}</span>
              </div>
              {Array.isArray(items) && items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{item.quantity}x {item.name}</span>
                  <span className="text-gray-500 tabular-nums">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="border-t border-black/[0.04] pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Total</span>
          <span className="font-serif text-2xl font-semibold text-[#1B1B1B]">${Number(ticket.total).toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => closeMutation.mutate("cash")}
            disabled={closeMutation.isPending}
            variant="outline"
            className="gap-2 rounded-xl h-11"
            data-testid="button-pay-cash"
          >
            <Banknote className="w-4 h-4" />
            Efectivo
          </Button>
          <Button
            onClick={() => closeMutation.mutate("card")}
            disabled={closeMutation.isPending}
            variant="outline"
            className="gap-2 rounded-xl h-11"
            data-testid="button-pay-card"
          >
            <CreditCard className="w-4 h-4" />
            Tarjeta
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTablesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableLabel, setNewTableLabel] = useState("");
  const [ticketTable, setTicketTable] = useState<TableWithStatus | null>(null);

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ["/api/admin/restaurant"],
  });

  useWebSocket(user?.restaurantId);

  useEffect(() => {
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
    }, 30000);
    return () => clearInterval(interval);
  }, [qc]);

  const { data: tablesStatus = [], isLoading } = useQuery<TableWithStatus[]>({
    queryKey: ["/api/admin/tables/status"],
    refetchInterval: 30000,
  });

  const addTableMutation = useMutation({
    mutationFn: (data: { number: number; label?: string }) =>
      apiRequest("POST", `/api/admin/tables`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
      setShowAddDialog(false);
      setNewTableNumber("");
      setNewTableLabel("");
      toast({ title: "Mesa agregada" });
    },
    onError: () => toast({ title: "Error al agregar mesa", variant: "destructive" }),
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/tables/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tables/status"] });
      toast({ title: "Mesa eliminada" });
    },
    onError: () => toast({ title: "Error al eliminar mesa", variant: "destructive" }),
  });

  function handleAddTable() {
    const num = parseInt(newTableNumber);
    if (isNaN(num) || num < 1) {
      toast({ title: "Número de mesa inválido", variant: "destructive" });
      return;
    }
    if (tablesStatus.some(t => t.number === num)) {
      toast({ title: "Ya existe una mesa con ese número", variant: "destructive" });
      return;
    }
    addTableMutation.mutate({ number: num, label: newTableLabel || undefined });
  }

  const totalTables = tablesStatus.length;
  const occupiedCount = tablesStatus.filter(t => t.status === "occupied").length;
  const waiterCount = tablesStatus.filter(t => t.status === "waiter").length;
  const freeCount = tablesStatus.filter(t => t.status === "free").length;

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-4 sm:px-6 py-3 max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link href="/">
                <button className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
              </Link>
              <div className="min-w-0">
                <h1 className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight truncate">Mesas</h1>
                <p className="text-[11px] text-gray-400 tracking-wide">{restaurant?.name || "..."}</p>
              </div>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <button
                  className="w-9 h-9 rounded-xl bg-[#1B1B1B] flex items-center justify-center active:scale-90 transition-transform"
                  data-testid="button-add-table"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-sm rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-serif">Nueva mesa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Número de mesa</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newTableNumber}
                      onChange={e => setNewTableNumber(e.target.value)}
                      placeholder="Ej: 11"
                      className="rounded-xl"
                      data-testid="input-table-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Etiqueta (opcional)</Label>
                    <Input
                      value={newTableLabel}
                      onChange={e => setNewTableLabel(e.target.value)}
                      placeholder="Ej: Terraza, VIP"
                      className="rounded-xl"
                      data-testid="input-table-label"
                    />
                  </div>
                  <Button
                    onClick={handleAddTable}
                    disabled={addTableMutation.isPending}
                    className="w-full rounded-xl h-11"
                    data-testid="button-confirm-add-table"
                  >
                    {addTableMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Agregar mesa"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 pt-4 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-black/[0.04] rounded-2xl p-3 text-center">
            <p className="text-2xl font-serif font-semibold text-[#1B1B1B]" data-testid="stat-free">{freeCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Libres</p>
          </div>
          <div className="bg-sky-50 border border-sky-200/50 rounded-2xl p-3 text-center">
            <p className="text-2xl font-serif font-semibold text-sky-600" data-testid="stat-occupied">{occupiedCount}</p>
            <p className="text-[11px] text-sky-500 mt-0.5">Ocupadas</p>
          </div>
          <div className="bg-amber-50 border border-amber-200/50 rounded-2xl p-3 text-center">
            <p className="text-2xl font-serif font-semibold text-amber-600" data-testid="stat-waiter">{waiterCount}</p>
            <p className="text-[11px] text-amber-500 mt-0.5">Mesero</p>
          </div>
        </div>
      </div>

      <main className="flex-1 px-4 sm:px-6 py-4 max-w-6xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : tablesStatus.length === 0 ? (
          <div className="text-center py-24 space-y-3">
            <Coffee className="w-10 h-10 text-gray-200 mx-auto" />
            <p className="font-serif text-base text-gray-300">Sin mesas</p>
            <p className="text-xs text-gray-300">Agrega mesas con el botón +</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {tablesStatus.map(table => {
              const style = STATUS_STYLES[table.status];
              return (
                <div
                  key={table.id}
                  className={`rounded-2xl border ${style.border} ${style.bg} p-4 space-y-3 relative group`}
                  data-testid={`table-card-${table.number}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${style.dot} ${table.status === "waiter" ? "animate-pulse" : ""}`} />
                      <span className="font-serif text-lg font-semibold text-[#1B1B1B]">{table.number}</span>
                    </div>
                    <span className={`text-[10px] font-semibold ${style.text} uppercase tracking-widest`}>
                      {style.label}
                    </span>
                  </div>

                  {table.label && (
                    <p className="text-[11px] text-gray-400">{table.label}</p>
                  )}

                  {table.ticketTotal > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Receipt className="w-3 h-3" />
                      <span>${table.ticketTotal.toFixed(2)}</span>
                    </div>
                  )}

                  {table.activeOrders > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-sky-600">
                      <Users className="w-3 h-3" />
                      <span>{table.activeOrders} {table.activeOrders === 1 ? "pedido" : "pedidos"}</span>
                    </div>
                  )}

                  {table.billRequested && (
                    <div className="flex items-center gap-1.5 text-xs text-purple-600 font-medium animate-pulse">
                      <Receipt className="w-3 h-3" />
                      <span>Cuenta solicitada</span>
                    </div>
                  )}

                  {table.hasWaiterCall && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <BellRing className="w-3 h-3" />
                      <span>Llamada activa</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    {table.ticketId && (
                      <button
                        onClick={() => setTicketTable(table)}
                        className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        data-testid={`button-cobrar-table-${table.number}`}
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Cobrar
                      </button>
                    )}
                    <QRModal table={table} slug={restaurant?.slug || ""} />
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar mesa ${table.number}?`)) {
                          deleteTableMutation.mutate(table.id);
                        }
                      }}
                      className="w-9 h-9 rounded-xl bg-white border border-black/[0.04] flex items-center justify-center active:scale-90 transition-transform"
                      data-testid={`button-delete-table-${table.number}`}
                    >
                      <Trash2 className="w-4 h-4 text-gray-300" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!ticketTable} onOpenChange={(open) => !open && setTicketTable(null)}>
        <DialogContent className="max-w-sm rounded-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">
              Cuenta — Mesa {ticketTable?.number}
            </DialogTitle>
          </DialogHeader>
          {ticketTable && (
            <TicketDialog table={ticketTable} onClose={() => setTicketTable(null)} />
          )}
        </DialogContent>
      </Dialog>

      <AdminNav />
    </div>
  );
}
