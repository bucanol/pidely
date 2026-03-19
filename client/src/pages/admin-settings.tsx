import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Camera, X, Loader2, ImagePlus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from "@/components/ui/form";
import type { Restaurant } from "@shared/schema";
import { Link } from "wouter";
import AdminNav from "@/components/admin-nav";

const settingsSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: restaurant, isLoading } = useQuery<Restaurant>({
    queryKey: ["/api/admin/restaurant"],
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { name: "", description: "" },
  });

  if (restaurant && !initialized) {
    form.reset({
      name: restaurant.name,
      description: restaurant.description ?? "",
    });
    setImagePreview(restaurant.logoUrl || null);
    setInitialized(true);
  }

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

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const logoUrl = await uploadImage();
      return apiRequest("PATCH", "/api/admin/restaurant", {
        name: data.name,
        description: data.description || null,
        logoUrl: logoUrl || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/restaurant"] });
      toast({ title: "Perfil actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="px-4 sm:px-6 py-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5">
            <Link href="/admin/cocina">
              <button className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
            </Link>
            <div className="min-w-0">
              <h1 className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight">Ajustes</h1>
              <p className="text-[11px] text-gray-400 tracking-wide">Perfil del restaurante</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 sm:px-6 py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => updateMutation.mutate(data))} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#1B1B1B]">Logo del restaurante</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageSelect}
                className="hidden"
                data-testid="input-logo"
              />
              {imagePreview ? (
                <div className="relative w-32 h-32 rounded-2xl overflow-hidden bg-gray-50 border border-black/[0.04] mx-auto">
                  <img src={imagePreview} alt="Logo" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
                    data-testid="button-remove-logo"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-1.5 right-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[11px] font-medium text-[#1B1B1B] flex items-center gap-1 shadow-sm"
                    data-testid="button-change-logo"
                  >
                    <Camera className="w-3 h-3" />
                    Cambiar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-32 h-32 mx-auto rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                  data-testid="button-upload-logo"
                >
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-[11px] font-medium">Subir logo</span>
                </button>
              )}
            </div>

            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Nombre del restaurante</FormLabel>
                <FormControl>
                  <Input placeholder="Mi Restaurante" className="rounded-xl" {...field} data-testid="input-restaurant-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Descripción</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe tu restaurante..."
                    rows={3}
                    className="rounded-xl"
                    {...field}
                    data-testid="input-restaurant-description"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {restaurant?.slug && (
              <div className="bg-white rounded-2xl border border-black/[0.04] p-4 space-y-1">
                <p className="text-xs font-medium text-gray-400">Enlace público del menú</p>
                <p className="text-sm text-[#1B1B1B] font-mono break-all" data-testid="text-menu-link">
                  {window.location.origin}/{restaurant.slug}/mesa/1
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={updateMutation.isPending || uploading}
              className="w-full rounded-xl"
              data-testid="button-save-settings"
            >
              {(updateMutation.isPending || uploading) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </form>
        </Form>
      </main>

      <AdminNav />
    </div>
  );
}
