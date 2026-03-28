import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import MenuPage from "@/pages/menu";
import AdminMenuPage from "@/pages/admin-menu";
import AdminKitchenPage from "@/pages/admin-kitchen";
import AdminTablesPage from "@/pages/admin-tables";
import AdminAnalyticsPage from "@/pages/admin-analytics";
import AdminSettingsPage from "@/pages/admin-settings";
import AdminHistoryPage from "@/pages/admin-history";
import AdminTeamPage from "@/pages/admin-team";
import AdminAIPage from "@/pages/admin-ai";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

const ROLE_ACCESS: Record<string, string[]> = {
  owner: ["/admin/cocina", "/admin/menu", "/admin/mesas", "/admin/ventas", "/admin/ajustes", "/admin/historial", "/admin/equipo", "/admin/asistente"],
  waiter: ["/admin/cocina", "/admin/mesas", "/admin/asistente"],
  cook: ["/admin/cocina", "/admin/asistente"],
};

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType; path?: string }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) navigate("/auth");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (!isLoading && user && path) {
      const allowed = ROLE_ACCESS[user.role] || [];
      if (!allowed.includes(path)) {
        navigate("/admin/cocina");
      }
    }
  }, [user, isLoading, path, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!user) return null;
  if (path) {
    const allowed = ROLE_ACCESS[user.role] || [];
    if (!allowed.includes(path)) return null;
  }
  return <Component />;
}

function AuthRoute() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) navigate("/admin/cocina");
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (user) return null;
  return <AuthPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthRoute} />
      <Route path="/admin/menu">{() => <ProtectedRoute component={AdminMenuPage} path="/admin/menu" />}</Route>
      <Route path="/admin/cocina">{() => <ProtectedRoute component={AdminKitchenPage} path="/admin/cocina" />}</Route>
      <Route path="/admin/mesas">{() => <ProtectedRoute component={AdminTablesPage} path="/admin/mesas" />}</Route>
      <Route path="/admin/ventas">{() => <ProtectedRoute component={AdminAnalyticsPage} path="/admin/ventas" />}</Route>
      <Route path="/admin/ajustes">{() => <ProtectedRoute component={AdminSettingsPage} path="/admin/ajustes" />}</Route>
      <Route path="/admin/historial">{() => <ProtectedRoute component={AdminHistoryPage} path="/admin/historial" />}</Route>
      <Route path="/admin/equipo">{() => <ProtectedRoute component={AdminTeamPage} path="/admin/equipo" />}</Route>
      <Route path="/admin/asistente">{() => <ProtectedRoute component={AdminAIPage} path="/admin/asistente" />}</Route>
      <Route path="/:slug/mesa/:tableId" component={MenuPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;