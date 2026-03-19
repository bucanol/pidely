import { useLocation } from "wouter";
import { ChefHat, UtensilsCrossed, LayoutGrid, BarChart3, Receipt, LogOut, Settings, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const ALL_NAV_ITEMS = [
  { href: "/admin/cocina", label: "Cocina", icon: ChefHat, roles: ["owner", "waiter", "cook"] },
  { href: "/admin/menu", label: "Menú", icon: UtensilsCrossed, roles: ["owner"] },
  { href: "/admin/mesas", label: "Mesas", icon: LayoutGrid, roles: ["owner", "waiter"] },
  { href: "/admin/ventas", label: "Ventas", icon: BarChart3, roles: ["owner"] },
  { href: "/admin/historial", label: "Historial", icon: Receipt, roles: ["owner"] },
  { href: "/admin/equipo", label: "Equipo", icon: Users, roles: ["owner"] },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings, roles: ["owner"] },
];

export default function AdminNav() {
  const [location, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();

  const userRole = user?.role || "cook";
  const navItems = ALL_NAV_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <nav className="sticky bottom-0 z-40 bg-white/90 backdrop-blur-xl border-t border-black/[0.04] safe-area-bottom">
      <div className="max-w-6xl mx-auto flex items-center justify-around px-2 py-1.5">
        {navItems.map(item => {
          const active = location === item.href;
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px] ${
                active ? "text-[#1B1B1B]" : "text-gray-300"
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={`w-5 h-5 ${active ? "text-[#1B1B1B]" : "text-gray-300"}`} />
              <span className={`text-[10px] font-medium tracking-wide ${active ? "text-[#1B1B1B]" : "text-gray-300"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => navigate("/") })}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px] text-gray-300"
          data-testid="nav-logout"
        >
          <LogOut className="w-5 h-5 text-gray-300" />
          <span className="text-[10px] font-medium tracking-wide text-gray-300">Salir</span>
        </button>
      </div>
    </nav>
  );
}
