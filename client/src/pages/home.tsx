import { useLocation } from "wouter";
import { QrCode, UtensilsCrossed, ChefHat, ArrowRight, Smartphone, LayoutGrid, BarChart3, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const [, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <header className="px-5 sm:px-8 py-4 sm:py-6 flex items-center justify-between border-b border-gray-100/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1B1B1B] rounded-lg flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4 text-white" />
          </div>
          <span className="font-serif text-base sm:text-lg font-semibold text-[#1B1B1B] tracking-tight">Pidely</span>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => navigate("/") })}
                data-testid="button-logout"
              >
                Salir
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" onClick={() => navigate("/auth")} data-testid="button-login">
              <LogIn className="w-3.5 h-3.5 mr-1.5" />
              Iniciar sesión
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-12 sm:py-24">
        <div className="max-w-xl w-full text-center space-y-6 sm:space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-gray-100/80 rounded-full text-xs text-gray-500 font-medium tracking-widest uppercase">
            <QrCode className="w-3 h-3" />
            Pedidos QR
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1B1B1B] leading-[1.05] tracking-tighter">
            Escanea.
            <br />
            <span className="text-gray-300">Pide. Listo.</span>
          </h1>

          <div className="flex flex-col gap-3 pt-2 max-w-xs mx-auto">
            {user ? (
              <>
                <Button
                  size="lg"
                  onClick={() => navigate("/admin/cocina")}
                  className="w-full gap-2 h-12 text-sm"
                  data-testid="button-go-kitchen"
                >
                  <ChefHat className="w-4 h-4" />
                  Ir a mi panel
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/admin/menu")}
                    className="h-11 text-sm"
                    data-testid="button-admin-menu"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 mr-1.5" />
                    Menú
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/admin/mesas")}
                    className="h-11 text-sm"
                    data-testid="button-admin-tables"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                    Mesas
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/admin/ventas")}
                    className="h-11 text-sm"
                    data-testid="button-admin-analytics"
                  >
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                    Ventas
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/admin/cocina")}
                    className="h-11 text-sm"
                    data-testid="button-demo-kitchen"
                  >
                    <ChefHat className="w-3.5 h-3.5 mr-1.5" />
                    Cocina
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={() => navigate("/auth")}
                  className="w-full gap-2 h-12 text-sm"
                  data-testid="button-get-started"
                >
                  Registra tu restaurante
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/elcielo/mesa/4")}
                  className="w-full gap-2 h-12 text-sm"
                  data-testid="button-demo-client"
                >
                  <Smartphone className="w-4 h-4" />
                  Ver demo del cliente
                </Button>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="px-5 sm:px-8 py-5 border-t border-gray-100/60 text-center text-xs text-gray-300">
        Pidely by Make To Create
      </footer>
    </div>
  );
}
