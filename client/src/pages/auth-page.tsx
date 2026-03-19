import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { UtensilsCrossed, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { loginMutation, registerMutation } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantSlug, setRestaurantSlug] = useState("");

  function generateSlug(val: string) {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30);
  }

  function handleRestaurantNameChange(val: string) {
    setRestaurantName(val);
    setRestaurantSlug(generateSlug(val));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: () => navigate("/admin/cocina"),
        onError: (err: any) => toast({ title: err.message || "Error al iniciar sesión", variant: "destructive" }),
      }
    );
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantSlug) {
      toast({ title: "La URL del restaurante es requerida", variant: "destructive" });
      return;
    }
    registerMutation.mutate(
      { email, password, name, restaurantName, restaurantSlug },
      {
        onSuccess: () => navigate("/admin/cocina"),
        onError: (err: any) => toast({ title: err.message || "Error al registrarse", variant: "destructive" }),
      }
    );
  }

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="px-5 sm:px-8 py-4 sm:py-6 flex items-center justify-center border-b border-gray-100/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1B1B1B] rounded-lg flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4 text-white" />
          </div>
          <span className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight">Pidely</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[#1B1B1B] tracking-tight">
              {mode === "login" ? "Bienvenido" : "Crea tu cuenta"}
            </h1>
            <p className="text-sm text-gray-400">
              {mode === "login"
                ? "Ingresa a tu panel de administración"
                : "Registra tu restaurante en minutos"}
            </p>
          </div>

          <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
            {mode === "register" && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Tu nombre</Label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Juan Pérez"
                    required
                    className="rounded-xl h-11"
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Nombre del restaurante</Label>
                  <Input
                    value={restaurantName}
                    onChange={e => handleRestaurantNameChange(e.target.value)}
                    placeholder="Mi Restaurante"
                    required
                    className="rounded-xl h-11"
                    data-testid="input-restaurant-name"
                  />
                </div>
                {restaurantSlug && (
                  <div className="bg-gray-50 rounded-xl px-4 py-2.5 border border-black/[0.04]">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-0.5">URL de tu menú</p>
                    <p className="text-sm text-[#1B1B1B] font-medium" data-testid="text-slug-preview">
                      /{restaurantSlug}/mesa/1
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Correo electrónico</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                required
                className="rounded-xl h-11"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Contraseña</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="rounded-xl h-11"
                data-testid="input-password"
              />
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-12 rounded-xl gap-2 text-sm"
              data-testid="button-submit-auth"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Iniciar sesión" : "Crear cuenta y restaurante"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="text-center">
            {mode === "login" ? (
              <p className="text-sm text-gray-400">
                ¿No tienes cuenta?{" "}
                <button onClick={() => setMode("register")} className="text-[#1B1B1B] font-medium" data-testid="button-switch-register">
                  Regístrate
                </button>
              </p>
            ) : (
              <p className="text-sm text-gray-400">
                ¿Ya tienes cuenta?{" "}
                <button onClick={() => setMode("login")} className="text-[#1B1B1B] font-medium" data-testid="button-switch-login">
                  Inicia sesión
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
