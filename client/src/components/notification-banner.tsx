import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { requestNotificationPermission, getNotificationStatus } from "@/hooks/use-websocket";

export default function NotificationBanner() {
  const [status, setStatus] = useState<string>(getNotificationStatus());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("pidely_notif_dismissed");
    if (saved === "true") setDismissed(true);
  }, []);

  if (dismissed || status === "granted" || status === "unsupported") return null;
  if (status === "denied") return null;

  async function handleEnable() {
    const result = await requestNotificationPermission();
    setStatus(result);
    if (result === "granted") {
      localStorage.setItem("pidely_notif_dismissed", "true");
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("pidely_notif_dismissed", "true");
  }

  return (
    <div className="mx-4 mt-3 mb-1 bg-[#1B1B1B] text-white rounded-2xl p-4 flex items-center gap-3 relative" data-testid="notification-banner">
      <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
        <Bell className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Activa las notificaciones</p>
        <p className="text-[11px] text-white/50 mt-0.5">Para recibir alertas de pedidos aunque no tengas la app abierta</p>
      </div>
      <button
        onClick={handleEnable}
        className="flex-shrink-0 px-3.5 py-2 bg-white text-[#1B1B1B] text-xs font-semibold rounded-xl active:scale-95 transition-transform"
        data-testid="button-enable-notifications"
      >
        Activar
      </button>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-white/30 hover:text-white/60"
        data-testid="button-dismiss-notifications"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
