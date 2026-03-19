import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AdminNav from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Users, ChefHat, UtensilsCrossed, Crown } from "lucide-react";
import { useState } from "react";

type TeamMember = {
  id: string;
  email: string;
  name: string;
  restaurantId: string | null;
  role: string;
};

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: "Dueño", icon: Crown, color: "bg-amber-100 text-amber-800" },
  waiter: { label: "Mesero", icon: UtensilsCrossed, color: "bg-sky-100 text-sky-800" },
  cook: { label: "Cocinero", icon: ChefHat, color: "bg-emerald-100 text-emerald-800" },
};

export default function AdminTeamPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("waiter");

  const isOwner = user?.role === "owner";

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/admin/team"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string; role: string }) => {
      const res = await apiRequest("POST", "/api/admin/team", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/team"] });
      setDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("waiter");
      toast({ title: "Miembro agregado" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo crear el miembro", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/team/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/team"] });
      toast({ title: "Miembro eliminado" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo eliminar", variant: "destructive" });
    },
  });

  function handleCreate() {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    createMutation.mutate({ name: newName, email: newEmail, password: newPassword, role: newRole });
  }

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] flex flex-col">
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1B1B1B] flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[#1B1B1B] tracking-tight" data-testid="text-team-title">Equipo</h1>
                <p className="text-xs text-gray-400">{members.length} miembro{members.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {isOwner && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-member">
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo miembro</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 pt-2">
                    <div>
                      <Label>Nombre</Label>
                      <Input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nombre completo"
                        data-testid="input-member-name"
                      />
                    </div>
                    <div>
                      <Label>Correo electrónico</Label>
                      <Input
                        type="email"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="correo@ejemplo.com"
                        data-testid="input-member-email"
                      />
                    </div>
                    <div>
                      <Label>Contraseña</Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        data-testid="input-member-password"
                      />
                    </div>
                    <div>
                      <Label>Rol</Label>
                      <Select value={newRole} onValueChange={setNewRole}>
                        <SelectTrigger data-testid="select-member-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="waiter">Mesero</SelectItem>
                          <SelectItem value="cook">Cocinero</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                      data-testid="button-submit-member"
                    >
                      {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      Crear miembro
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              No hay miembros en el equipo
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {members.map(member => {
                const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.waiter;
                const RoleIcon = roleConfig.icon;
                const isCurrentUser = member.id === user?.id;
                return (
                  <Card key={member.id} className="p-4" data-testid={`card-member-${member.id}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <RoleIcon className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[#1B1B1B] truncate" data-testid={`text-member-name-${member.id}`}>
                              {member.name}
                            </span>
                            <Badge variant="secondary" className={`text-[10px] ${roleConfig.color}`} data-testid={`badge-member-role-${member.id}`}>
                              {roleConfig.label}
                            </Badge>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-[10px]">Tú</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate" data-testid={`text-member-email-${member.id}`}>
                            {member.email}
                          </p>
                        </div>
                      </div>
                      {isOwner && member.role !== "owner" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(member.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-member-${member.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-gray-400" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <AdminNav />
    </div>
  );
}
