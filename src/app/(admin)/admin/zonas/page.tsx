"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { DeliveryZone } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DeliveryZonesPage() {
    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
    const [formData, setFormData] = useState({ name: "", price: "" });

    // Delete State
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const supabase = createClient();

    const fetchZones = async () => {
        try {
            const { data, error } = await supabase
                .from("delivery_zones")
                .select("*")
                .order("name");

            if (error) throw error;
            setZones(data || []);
        } catch (error) {
            console.error("Erro ao carregar zonas:", error);
            toast.error("Erro ao carregar zonas de entrega");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchZones();
    }, []);

    // Create / Edit Handlers
    const openCreateModal = () => {
        setEditingZone(null);
        setFormData({ name: "", price: "" });
        setIsModalOpen(true);
    };

    const openEditModal = (zone: DeliveryZone) => {
        setEditingZone(zone);
        setFormData({ name: zone.name, price: zone.price.toString() });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.price) {
            toast.warning("Preencha todos os campos obrigatórios");
            return;
        }

        const price = parseFloat(formData.price.replace(",", "."));
        if (isNaN(price)) {
            toast.error("Valor inválido");
            return;
        }

        try {
            if (editingZone) {
                // UPDATE
                const updatedZone = { ...editingZone, name: formData.name, price };

                // Optimistic Update
                setZones(zones.map(z => z.id === editingZone.id ? updatedZone : z));
                setIsModalOpen(false);

                const { error } = await supabase
                    .from("delivery_zones")
                    .update({ name: formData.name, price })
                    .eq("id", editingZone.id);

                if (error) throw error;
                toast.success("Zona atualizada com sucesso!");
            } else {
                // INSERT
                const newZone = {
                    name: formData.name,
                    price,
                    is_active: true, // Default active
                };

                // Optimistic UI can be tricky without ID, so we wait or generate temp ID. 
                // Let's rely on fast response or refresh for creation.
                // Or generate uuid locally if we want full optimistic.

                const { data, error } = await supabase
                    .from("delivery_zones")
                    .insert(newZone)
                    .select()
                    .single();

                if (error) throw error;

                setZones([...zones, data].sort((a, b) => a.name.localeCompare(b.name)));
                setIsModalOpen(false);
                toast.success("Zona criada com sucesso!");
            }
        } catch (error) {
            console.error("Erro ao salvar zona:", error);
            toast.error("Erro ao salvar zona");
            fetchZones(); // Rollback/Refresh
        }
    };

    // Toggle Active
    const toggleActive = async (zone: DeliveryZone) => {
        const previousZones = [...zones];
        const newStatus = !zone.is_active;

        // Optimistic
        setZones(zones.map(z => z.id === zone.id ? { ...z, is_active: newStatus } : z));

        try {
            const { error } = await supabase
                .from("delivery_zones")
                .update({ is_active: newStatus })
                .eq("id", zone.id);

            if (error) throw error;
            toast.success(`Zona ${newStatus ? "ativada" : "desativada"}`);
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            toast.error("Erro ao atualizar status");
            setZones(previousZones);
        }
    };

    // Delete Handler
    const confirmDelete = async () => {
        if (!deleteId) return;

        const previousZones = [...zones];
        // Optimistic
        setZones(zones.filter(z => z.id !== deleteId));
        setDeleteId(null);

        try {
            const { error, data } = await supabase
                .from("delivery_zones")
                .delete()
                .eq("id", deleteId)
                .select("id");

            if (error) throw error;

            // If RLS blocks delete, data will be empty
            if (!data || data.length === 0) {
                throw new Error("Permissão negada ou erro ao excluir (RLS)");
            }

            toast.success("Zona excluída com sucesso!");
        } catch (error) {
            console.error("Erro ao excluir:", error);
            // Revert interface
            toast.error("Erro ao excluir zona (permissão?)");
            setZones(previousZones);
            // Force refresh to get real state back
            fetchZones();
        }
    };



    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Zonas de Entrega" }
            ]} />
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Zonas de Entrega</h1>
                <Button onClick={openCreateModal}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Zona
                </Button>
            </div>

            <div className="border rounded-lg">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[40%]">Nome</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Valor</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Ativa</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                                        <td className="p-4"><Skeleton className="h-6 w-10" /></td>
                                        <td className="p-4"><Skeleton className="h-8 w-8 ml-auto" /></td>
                                    </tr>
                                ))
                            ) : zones.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                        Nenhuma zona cadastrada
                                    </td>
                                </tr>
                            ) : (
                                zones.map((zone) => (
                                    <tr key={zone.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle font-medium flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                            {zone.name}
                                        </td>
                                        <td className="p-4 align-middle">
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(zone.price)}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <Switch
                                                checked={zone.is_active}
                                                onCheckedChange={() => toggleActive(zone)}
                                            />
                                        </td>
                                        <td className="p-4 align-middle text-right gap-2 flex justify-end">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditModal(zone)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteId(zone.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingZone ? "Editar Zona" : "Nova Zona de Entrega"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="name" className="text-right text-sm font-medium">
                                Nome
                            </label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3"
                                placeholder="Ex: Centro, Bairro X"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="price" className="text-right text-sm font-medium">
                                Valor (R$)
                            </label>
                            <Input
                                id="price"
                                type="number"
                                step="0.01"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                className="col-span-3"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave}>Salvar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Excluir Zona?</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-muted-foreground">
                        Tem certeza que deseja excluir esta zona de entrega? Esta ação não pode ser desfeita.
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setDeleteId(null)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} className="text-white font-bold">
                            Excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
