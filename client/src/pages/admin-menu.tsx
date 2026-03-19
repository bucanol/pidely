import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Trash2, ChefHat, UtensilsCrossed, Loader2, Eye, EyeOff,
  Pencil, X, FolderOpen, ArrowLeft, ImagePlus, Camera
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import type { Category, Product, Restaurant } from "@shared/schema";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import AdminNav from "@/components/admin-nav";

const productSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().optional(),
  price: z.string().min(1, "Precio requerido").refine(v => !isNaN(Number(v)) && Number(v) > 0, "Precio inválido"),
  imageUrl: z.string().optional(),
  categoryId: z.string().min(1, "Categoría requerida"),
  isAvailable: z.boolean().default(true),
});

const categorySchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
});

type ProductForm = z.infer<typeof productSchema>;
type CategoryForm = z.infer<typeof categorySchema>;

export default function AdminMenuPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ["/api/admin/restaurant"],
  });

  const { data: categories = [], isLoading: catLoading } = useQuery<Category[]>({
    queryKey: ["/api/admin/categories"],
  });

  const { data: products = [], isLoading: prodLoading } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const productForm = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", price: "", imageUrl: "", categoryId: "", isAvailable: true },
  });

  const categoryForm = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "" },
  });

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return imagePreview;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      return url;
    } catch {
      toast({ title: "Error al subir imagen", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "La imagen no puede pesar más de 5MB", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const imageUrl = await uploadImage();
      return apiRequest("POST", `/api/admin/products`, {
        ...data,
        imageUrl: imageUrl || null,
        price: data.price,
        isAvailable: data.isAvailable,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      setShowProductDialog(false);
      productForm.reset();
      clearImage();
      toast({ title: "Platillo creado" });
    },
    onError: () => toast({ title: "Error al crear platillo", variant: "destructive" }),
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProductForm> }) => {
      const imageUrl = await uploadImage();
      return apiRequest("PATCH", `/api/admin/products/${id}`, { ...data, imageUrl: imageUrl || null, price: data.price });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      setShowProductDialog(false);
      setEditingProduct(null);
      productForm.reset();
      clearImage();
      toast({ title: "Platillo actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Platillo eliminado" });
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      apiRequest("PATCH", `/api/admin/products/${id}`, { isAvailable }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: CategoryForm) => apiRequest("POST", `/api/admin/categories`, {
      ...data,
      displayOrder: categories.length,
    }),
    onSuccess: async (res) => {
      const created = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setShowCategoryDialog(false);
      categoryForm.reset();
      toast({ title: "Categoría creada" });
      setSelectedCategoryFilter(created.id);
      openNewProduct(created.id);
    },
    onError: () => toast({ title: "Error al crear categoría", variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Categoría eliminada" });
    },
  });

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    productForm.reset({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      imageUrl: product.imageUrl ?? "",
      categoryId: product.categoryId,
      isAvailable: product.isAvailable,
    });
    setImagePreview(product.imageUrl || null);
    setImageFile(null);
    setShowProductDialog(true);
  }

  function openNewProduct(preselectedCategoryId?: string) {
    setEditingProduct(null);
    const catId = preselectedCategoryId
      || (selectedCategoryFilter !== "all" ? selectedCategoryFilter : "")
      || (categories.length === 1 ? categories[0].id : "");
    productForm.reset({ name: "", description: "", price: "", imageUrl: "", categoryId: catId, isAvailable: true });
    clearImage();
    setShowProductDialog(true);
  }

  const visibleProducts = selectedCategoryFilter === "all"
    ? products
    : products.filter(p => p.categoryId === selectedCategoryFilter);

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-4 sm:px-6 py-3 max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link href="/">
                <button className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
              </Link>
              <div className="min-w-0">
                <h1 className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight truncate">Menú</h1>
                <p className="text-[11px] text-gray-400 tracking-wide">{restaurant?.name || "..."}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowCategoryDialog(true)} className="rounded-full text-xs h-8 gap-1.5" data-testid="button-add-category">
                <FolderOpen className="w-3 h-3" />
                <span className="hidden sm:inline">Categoría</span>
                <span className="sm:hidden">Cat.</span>
              </Button>
              <Button size="sm" onClick={openNewProduct} disabled={categories.length === 0} className="rounded-full text-xs h-8 gap-1.5" data-testid="button-add-product">
                <Plus className="w-3 h-3" />
                <span className="hidden sm:inline">Platillo</span>
                <span className="sm:hidden">Nuevo</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-[57px] z-30 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-4 sm:px-6 py-2.5 max-w-5xl mx-auto">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center">
            <button
              onClick={() => setSelectedCategoryFilter("all")}
              className={`whitespace-nowrap px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-all flex-shrink-0 active:scale-[0.96] ${
                selectedCategoryFilter === "all"
                  ? "bg-[#1B1B1B] text-white shadow-sm"
                  : "text-gray-400"
              }`}
              data-testid="filter-all"
            >
              Todos ({products.length})
            </button>
            {categories.map(cat => {
              const catProducts = products.filter(p => p.categoryId === cat.id);
              const isActive = selectedCategoryFilter === cat.id;
              return (
                <div key={cat.id} className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => setSelectedCategoryFilter(isActive ? "all" : cat.id)}
                    className={`whitespace-nowrap pl-3.5 pr-3.5 py-[7px] rounded-full text-[13px] font-medium transition-all active:scale-[0.96] flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[#1B1B1B] text-white shadow-sm pr-2"
                        : "text-gray-400"
                    }`}
                    data-testid={`filter-category-${cat.id}`}
                  >
                    {cat.name}
                    {isActive && (
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (catProducts.length > 0) {
                            if (!confirm(`"${cat.name}" tiene ${catProducts.length} platillo${catProducts.length > 1 ? "s" : ""}. ¿Eliminar categoría y sus platillos?`)) return;
                          } else {
                            if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
                          }
                          setSelectedCategoryFilter("all");
                          deleteCategoryMutation.mutate(cat.id);
                        }}
                        className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center ml-0.5 hover:bg-white/30"
                        data-testid={`button-delete-category-${cat.id}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => setShowCategoryDialog(true)}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center sm:hidden"
              data-testid="button-add-category-mobile"
            >
              <Plus className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-4">
        {prodLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-16 space-y-5 max-w-xs mx-auto">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto">
              <FolderOpen className="w-7 h-7 text-gray-200" />
            </div>
            <div className="space-y-2">
              <p className="font-serif text-lg text-[#1B1B1B] font-semibold">Empieza con las categorías</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                Crea categorías como "Entradas", "Principales" o "Bebidas" para organizar tu menú.
              </p>
            </div>
            <Button onClick={() => setShowCategoryDialog(true)} className="rounded-xl h-11 gap-2 text-sm" data-testid="button-empty-add-category">
              <FolderOpen className="w-4 h-4" />
              Crear primera categoría
            </Button>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="text-center py-16 space-y-5 max-w-xs mx-auto">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto">
              <ChefHat className="w-7 h-7 text-gray-200" />
            </div>
            <div className="space-y-2">
              <p className="font-serif text-lg text-[#1B1B1B] font-semibold">Agrega tus platillos</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                Ya tienes {categories.length} categoría{categories.length > 1 ? "s" : ""}. Ahora agrega los platillos de tu menú.
              </p>
            </div>
            <Button onClick={openNewProduct} className="rounded-xl h-11 gap-2 text-sm" data-testid="button-empty-add-product">
              <Plus className="w-4 h-4" />
              Agregar primer platillo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visibleProducts.map(product => {
              const category = categories.find(c => c.id === product.categoryId);
              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-2xl border border-black/[0.04] p-3.5 flex items-center gap-3 transition-opacity ${!product.isAvailable ? "opacity-50" : ""}`}
                  data-testid={`admin-product-${product.id}`}
                >
                  {product.imageUrl && (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-xl overflow-hidden bg-gray-50">
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-[#1B1B1B] text-sm truncate">{product.name}</p>
                      {!product.isAvailable && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Agotado</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="font-serif text-sm font-semibold text-[#1B1B1B] tabular-nums">${Number(product.price).toFixed(2)}</p>
                      {category && <span className="text-[11px] text-gray-400">{category.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => toggleAvailabilityMutation.mutate({ id: product.id, isAvailable: !product.isAvailable })}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 active:scale-90 transition-transform"
                      data-testid={`button-toggle-${product.id}`}
                    >
                      {product.isAvailable ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEditProduct(product)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 active:scale-90 transition-transform"
                      data-testid={`button-edit-${product.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteProductMutation.mutate(product.id)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-red-300 active:scale-90 transition-transform"
                      data-testid={`button-delete-${product.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={showProductDialog} onOpenChange={open => { setShowProductDialog(open); if (!open) { setEditingProduct(null); clearImage(); } }}>
        <DialogContent className="sm:max-w-md mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{editingProduct ? "Editar platillo" : "Nuevo platillo"}</DialogTitle>
          </DialogHeader>
          <Form {...productForm}>
            <form onSubmit={productForm.handleSubmit(data => {
              if (editingProduct) {
                updateProductMutation.mutate({ id: editingProduct.id, data });
              } else {
                createProductMutation.mutate(data);
              }
            })} className="space-y-4">
              <FormField control={productForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Nombre</FormLabel>
                  <FormControl><Input placeholder="Tartare de atún" className="rounded-xl" {...field} data-testid="input-product-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={productForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Descripción</FormLabel>
                  <FormControl><Textarea placeholder="Descripción del platillo..." rows={2} className="rounded-xl" {...field} data-testid="input-product-description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={productForm.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Precio</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" className="rounded-xl" {...field} data-testid="input-product-price" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={productForm.control} name="categoryId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Categoría</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl" data-testid="select-category">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Imagen</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageSelect}
                  className="hidden"
                  data-testid="input-product-image"
                />
                {imagePreview ? (
                  <div className="relative w-full h-36 rounded-xl overflow-hidden bg-gray-50 border border-black/[0.04]">
                    <img src={imagePreview} alt="Vista previa" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center"
                      data-testid="button-remove-image"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-medium text-[#1B1B1B] flex items-center gap-1.5 shadow-sm"
                      data-testid="button-change-image"
                    >
                      <Camera className="w-3 h-3" />
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-28 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                    data-testid="button-upload-image"
                  >
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-xs font-medium">Subir foto</span>
                  </button>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowProductDialog(false)} className="rounded-xl">Cancelar</Button>
                <Button type="submit" disabled={createProductMutation.isPending || updateProductMutation.isPending || uploading} className="rounded-xl" data-testid="button-save-product">
                  {(createProductMutation.isPending || updateProductMutation.isPending || uploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingProduct ? "Guardar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="sm:max-w-xs mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Nueva categoría</DialogTitle>
          </DialogHeader>
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit(data => createCategoryMutation.mutate(data))} className="space-y-4">
              <FormField control={categoryForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Nombre</FormLabel>
                  <FormControl><Input placeholder="Entradas, Postres..." className="rounded-xl" {...field} data-testid="input-category-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCategoryDialog(false)} className="rounded-xl">Cancelar</Button>
                <Button type="submit" disabled={createCategoryMutation.isPending} className="rounded-xl" data-testid="button-save-category">
                  {createCategoryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AdminNav />
    </div>
  );
}
