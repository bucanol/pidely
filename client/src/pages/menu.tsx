import { useState, useMemo, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Minus, BellRing, Send, Loader2, AlertCircle, X, MessageSquare, Check, ArrowLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Restaurant, Category, Product, OrderItem, Ticket, Order } from "@shared/schema";

export default function MenuPage() {
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<"review" | "confirm">("review");
  const [billOpen, setBillOpen] = useState(false);
  const categoriesRef = useRef<HTMLDivElement>(null);

  const { data: restaurant, isLoading: loadingRestaurant } = useQuery<Restaurant>({
    queryKey: ["/api/restaurants", slug],
    queryFn: () => fetch(`/api/restaurants/${slug}`).then(r => r.json()),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/restaurants", slug, "categories"],
    queryFn: () => fetch(`/api/restaurants/${slug}/categories`).then(r => r.json()),
    enabled: !!restaurant,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/restaurants", slug, "products"],
    queryFn: () => fetch(`/api/restaurants/${slug}/products`).then(r => r.json()),
    enabled: !!restaurant,
  });

  type TicketWithOrders = Ticket & { orders: Order[] };

  const { data: ticket, refetch: refetchTicket } = useQuery<TicketWithOrders | null>({
    queryKey: ["/api/restaurants", slug, "ticket", tableId],
    queryFn: () => fetch(`/api/restaurants/${slug}/ticket/${tableId}`).then(r => r.json()),
    enabled: !!restaurant,
  });

  const activeCategoryId = selectedCategory ?? categories[0]?.id ?? null;

  const filteredProducts = useMemo(() => {
    if (!activeCategoryId) return products;
    return products.filter(p => p.categoryId === activeCategoryId);
  }, [products, activeCategoryId]);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1, notes: "" }];
    });
  }

  function removeFromCart(productId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === productId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter(i => i.productId !== productId);
      return prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i);
    });
  }

  function updateNotes(productId: string, notes: string) {
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, notes } : i));
  }

  function getCartQty(productId: string) {
    return cart.find(i => i.productId === productId)?.quantity ?? 0;
  }

  function handleOpenCart() {
    setConfirmStep("review");
    setEditingNotes(null);
    setCartOpen(true);
  }

  const orderMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/restaurants/${slug}/orders`, {
      tableId,
      itemsJson: cart.map(item => ({
        ...item,
        notes: item.notes?.trim() || undefined,
      })),
      status: "pending",
      total: cartTotal.toFixed(2),
    }),
    onSuccess: () => {
      setCart([]);
      setCartOpen(false);
      setConfirmStep("review");
      refetchTicket();
      toast({ title: "Pedido enviado", description: "Tu orden está siendo preparada." });
    },
    onError: () => {
      toast({ title: "Error al enviar pedido", variant: "destructive" });
    },
  });

  const billRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/restaurants/${slug}/request-bill`, { tableId }),
    onSuccess: () => {
      refetchTicket();
      toast({ title: "Cuenta solicitada", description: "El mesero traerá tu cuenta." });
    },
    onError: () => {
      toast({ title: "Error al pedir la cuenta", variant: "destructive" });
    },
  });

  const waiterMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/restaurants/${slug}/waiter-calls`, {
      tableId,
      resolved: false,
    }),
    onSuccess: () => {
      toast({ title: "Mesero notificado", description: "Alguien vendrá a tu mesa." });
    },
    onError: () => {
      toast({ title: "Error al llamar mesero", variant: "destructive" });
    },
  });

  if (loadingRestaurant) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAFA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          <p className="text-xs text-gray-300">Cargando menú...</p>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAFA] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-gray-200 mx-auto" />
          <p className="text-gray-400 text-sm">Restaurante no encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-5 py-3.5 flex items-center justify-between gap-3 max-w-2xl mx-auto">
          <div className="min-w-0">
            <h1 className="font-serif text-lg font-semibold text-[#1B1B1B] tracking-tight truncate" data-testid="text-restaurant-name">
              {restaurant.name}
            </h1>
            <p className="text-[11px] text-gray-400 tracking-wide uppercase mt-0.5">Mesa {tableId}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {ticket && Number(ticket.total) > 0 && (
              <button
                onClick={() => setBillOpen(true)}
                data-testid="button-view-bill"
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 border border-emerald-200/80 bg-emerald-50 rounded-full px-3 py-2 active:scale-[0.97] transition-transform"
              >
                <Receipt className="w-3.5 h-3.5" />
                ${Number(ticket.total).toFixed(2)}
              </button>
            )}
            <button
              onClick={() => waiterMutation.mutate()}
              disabled={waiterMutation.isPending}
              data-testid="button-call-waiter"
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 border border-gray-200/80 bg-white rounded-full px-3 py-2 active:scale-[0.97] transition-transform"
            >
              {waiterMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BellRing className="w-3.5 h-3.5" />
              )}
              Mesero
            </button>
          </div>
        </div>
      </header>

      {categories.length > 0 && (
        <div ref={categoriesRef} className="sticky top-[57px] z-30 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
          <div className="px-5 py-2.5 max-w-2xl mx-auto">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  data-testid={`button-category-${cat.id}`}
                  className={`whitespace-nowrap px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-all flex-shrink-0 active:scale-[0.96] ${
                    activeCategoryId === cat.id
                      ? "bg-[#1B1B1B] text-white shadow-sm"
                      : "text-gray-400"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-3xl mx-auto w-full px-5 md:px-8 pt-5 pb-36">
        {restaurant.description && (
          <p className="text-gray-400 text-[13px] mb-6 leading-relaxed italic font-serif">{restaurant.description}</p>
        )}

        <div className="space-y-3">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-gray-300">
              <p className="font-serif text-base">No hay platillos</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  qty={getCartQty(product.id)}
                  onAdd={() => addToCart(product)}
                  onRemove={() => removeFromCart(product.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={handleOpenCart}
            data-testid="button-open-cart"
            className="w-full max-w-2xl mx-auto flex items-center justify-between bg-[#1B1B1B] text-white rounded-2xl px-5 py-4 shadow-2xl active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center text-xs font-semibold">
                {cartCount}
              </div>
              <span className="text-sm font-medium">Ver carrito</span>
            </div>
            <span className="font-serif text-sm font-semibold">${cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={(open) => {
        setCartOpen(open);
        if (!open) {
          setConfirmStep("review");
          setEditingNotes(null);
        }
      }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] flex flex-col px-0">
          <SheetHeader className="px-6 pb-3">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
            {confirmStep === "review" ? (
              <>
                <SheetTitle className="font-serif text-lg tracking-tight text-left">Tu pedido</SheetTitle>
                <p className="text-xs text-gray-400 text-left">Mesa {tableId} · Revisa y agrega notas</p>
              </>
            ) : (
              <>
                <SheetTitle className="font-serif text-lg tracking-tight text-left">Confirmar pedido</SheetTitle>
                <p className="text-xs text-gray-400 text-left">Mesa {tableId} · Verifica que todo esté correcto</p>
              </>
            )}
          </SheetHeader>

          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <ShoppingCart className="w-8 h-8 text-gray-200 mx-auto" />
                <p className="text-gray-300 text-sm">Sin items</p>
              </div>
            </div>
          ) : confirmStep === "review" ? (
            <div className="flex-1 overflow-y-auto px-6 space-y-3 py-2">
              {cart.map(item => (
                <div key={item.productId} className="bg-gray-50/80 rounded-2xl p-4 space-y-3" data-testid={`cart-item-${item.productId}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1B1B1B] truncate">{item.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">${item.price.toFixed(2)} c/u</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="w-8 h-8 rounded-full bg-white border border-black/[0.04] flex items-center justify-center active:scale-90 transition-transform"
                        data-testid={`button-decrease-${item.productId}`}
                      >
                        <Minus className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-[#1B1B1B] tabular-nums">{item.quantity}</span>
                      <button
                        onClick={() => {
                          const p = products.find(p => p.id === item.productId);
                          if (p) addToCart(p);
                        }}
                        className="w-8 h-8 rounded-full bg-[#1B1B1B] text-white flex items-center justify-center active:scale-90 transition-transform"
                        data-testid={`button-increase-${item.productId}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-[#1B1B1B] w-16 text-right tabular-nums">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>

                  {editingNotes === item.productId ? (
                    <div className="space-y-2">
                      <Textarea
                        value={item.notes || ""}
                        onChange={e => updateNotes(item.productId, e.target.value)}
                        placeholder="Ej: Sin cebolla, extra picante, sin gluten..."
                        className="text-sm rounded-xl border-black/[0.06] bg-white resize-none min-h-[60px]"
                        rows={2}
                        data-testid={`input-notes-${item.productId}`}
                      />
                      <button
                        onClick={() => setEditingNotes(null)}
                        className="text-xs text-gray-400 font-medium"
                        data-testid={`button-done-notes-${item.productId}`}
                      >
                        Listo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingNotes(item.productId)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 active:scale-[0.97] transition-transform"
                      data-testid={`button-add-notes-${item.productId}`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      {item.notes?.trim() ? (
                        <span className="text-[#1B1B1B] font-medium">{item.notes.trim()}</span>
                      ) : (
                        <span>Agregar nota</span>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 space-y-2 py-2">
              <div className="bg-amber-50/80 border border-amber-200/40 rounded-2xl p-4 mb-3">
                <p className="text-xs text-amber-700 font-medium text-center">
                  Revisa tu pedido antes de enviarlo a cocina
                </p>
              </div>
              {cart.map((item, idx) => (
                <div key={item.productId} className="flex items-start gap-3 py-2.5 border-b border-black/[0.03] last:border-0" data-testid={`confirm-item-${item.productId}`}>
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[#1B1B1B] truncate">{item.name}</p>
                      <span className="text-xs font-bold text-gray-400 tabular-nums flex-shrink-0">{item.quantity}x</span>
                    </div>
                    {item.notes?.trim() && (
                      <p className="text-xs text-amber-600 mt-1 italic">"{item.notes.trim()}"</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 tabular-nums">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-serif text-xl font-semibold text-[#1B1B1B]">${cartTotal.toFixed(2)}</span>
              </div>

              {confirmStep === "review" ? (
                <Button
                  className="w-full gap-2 h-13 text-sm rounded-xl"
                  size="lg"
                  onClick={() => setConfirmStep("confirm")}
                  data-testid="button-review-order"
                >
                  <Check className="w-4 h-4" />
                  Revisar pedido ({cartCount} {cartCount === 1 ? "item" : "items"})
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    className="w-full gap-2 h-13 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700"
                    size="lg"
                    onClick={() => orderMutation.mutate()}
                    disabled={orderMutation.isPending}
                    data-testid="button-confirm-order"
                  >
                    {orderMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Confirmar y enviar a cocina
                  </Button>
                  <button
                    onClick={() => setConfirmStep("review")}
                    className="w-full text-center text-xs text-gray-400 py-2 active:scale-[0.98] transition-transform"
                    data-testid="button-back-to-review"
                  >
                    <ArrowLeft className="w-3 h-3 inline mr-1" />
                    Volver a editar
                  </button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] flex flex-col px-0">
          <SheetHeader className="px-6 pb-3">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
            <SheetTitle className="font-serif text-lg tracking-tight text-left">Mi cuenta</SheetTitle>
            <p className="text-xs text-gray-400 text-left">Mesa {tableId} · Pedidos acumulados</p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 space-y-3 py-2">
            {ticket && ticket.orders && ticket.orders.length > 0 ? (
              ticket.orders.map((order) => {
                const items = order.itemsJson as OrderItem[];
                return (
                  <div key={order.id} className="bg-gray-50/80 rounded-2xl p-4 space-y-2" data-testid={`bill-order-${order.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                        {new Date(order.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`text-[10px] font-medium uppercase tracking-wider ${
                        order.status === "delivered" ? "text-emerald-500" :
                        order.status === "preparing" ? "text-amber-500" : "text-gray-400"
                      }`}>
                        {order.status === "pending" ? "Pendiente" :
                         order.status === "preparing" ? "Preparando" :
                         order.status === "delivered" ? "Entregado" : order.status}
                      </span>
                    </div>
                    {Array.isArray(items) && items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{item.quantity}x {item.name}</span>
                        <span className="text-gray-500 tabular-nums">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 space-y-2">
                <Receipt className="w-8 h-8 text-gray-200 mx-auto" />
                <p className="text-gray-300 text-sm">Sin pedidos aún</p>
              </div>
            )}
          </div>

          {ticket && Number(ticket.total) > 0 && (
            <div className="px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total acumulado</span>
                <span className="font-serif text-xl font-semibold text-[#1B1B1B]">${Number(ticket.total).toFixed(2)}</span>
              </div>
              {ticket.billRequested ? (
                <div className="mt-3 py-2.5 rounded-xl bg-purple-50 text-purple-600 text-xs font-medium text-center" data-testid="text-bill-requested">
                  Cuenta solicitada — el mesero viene en camino
                </div>
              ) : (
                <button
                  onClick={() => billRequestMutation.mutate()}
                  disabled={billRequestMutation.isPending}
                  className="mt-3 w-full py-3 rounded-xl bg-[#1B1B1B] text-white text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
                  data-testid="button-request-bill"
                >
                  {billRequestMutation.isPending ? "Solicitando..." : "Pedir la cuenta"}
                </button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ProductCard({ product, qty, onAdd, onRemove }: {
  product: Product;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const unavailable = !product.isAvailable;

  return (
    <div
      className={`bg-white rounded-2xl border border-black/[0.04] overflow-visible transition-all ${unavailable ? "opacity-50 grayscale-[30%]" : ""}`}
      data-testid={`product-card-${product.id}`}
    >
      {product.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-t-2xl bg-gray-50">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-[#1B1B1B] text-[15px] leading-tight">{product.name}</h3>
              {unavailable && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Agotado</Badge>}
            </div>
            {product.description && (
              <p className="text-[13px] text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{product.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3.5 gap-3">
          <span className="font-serif text-[#1B1B1B] font-semibold text-base tracking-tight">
            ${Number(product.price).toFixed(2)}
          </span>

          {qty > 0 ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={onRemove}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                data-testid={`button-remove-${product.id}`}
              >
                <Minus className="w-4 h-4 text-gray-500" />
              </button>
              <span className="w-5 text-center text-sm font-bold text-[#1B1B1B] tabular-nums">{qty}</span>
              <button
                onClick={onAdd}
                disabled={unavailable}
                className="w-9 h-9 rounded-full bg-[#1B1B1B] text-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
                data-testid={`button-add-${product.id}`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              disabled={unavailable}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1B1B1B] bg-gray-100 rounded-full px-4 py-2.5 active:scale-[0.96] transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid={`button-add-${product.id}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
