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
import { 
    fetchZonesForProxy, 
    saveZoneAsProxy, 
    deleteZoneAsProxy, 
    toggleZoneStatusAsProxy 
} from "@/actions/admin/proxy-zones";

interface DeliveryZoneManagerProps {
    storeId?: string;
    isImpersonating?: boolean;
}

export function DeliveryZoneManager({ storeId, isImpersonating }: DeliveryZoneManagerProps) {
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
            let data;
            if (isImpersonating && storeId) {
                data = await fetchZonesForProxy(storeId);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                const { data: zData, error } = await supabase
                    .from("delivery_zones")
                    .select("*")
                    .eq('store_id', user.id)
                    .order("name");
                if (error) throw error;
                data = zData;
            }
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
            if (isImpersonating && storeId) {
                await saveZoneAsProxy(storeId, editingZone ? editingZone.id : 'novo', { name: formData.name, price });
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Não autenticado");

                if (editingZone) {
                    const { error } = await supabase.from("delivery_zones").update({ name: formData.name, price }).eq("id", editingZone.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from("delivery_zones").insert({ store_id: user.id, name: formData.name, price, is_active: true });
                    if (error) throw error;
                }
            }

            toast.success(editingZone ? "Zona atualizada!" : "Zona criada!");
            setIsModalOpen(false);
            fetchZones();
        } catch (error) {
            console.error("Erro ao salvar zona:", error);
            toast.error("Erro ao salvar zona");
        }
    };

    const toggleActive = async (zone: DeliveryZone) => {
        const newStatus = !zone.is_active;
        try {
            if (isImpersonating && storeId) {
                await toggleZoneStatusAsProxy(storeId, zone.id, newStatus);
            } else {
                const { error } = await supabase.from("delivery_zones").update({ is_active: newStatus }).eq("id", zone.id);
                if (error) throw error;
            }
            toast.success(`Zona ${newStatus ? "ativada" : "desativada"}`);
            fetchZones();
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            toast.error("Erro ao atualizar status");
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            if (isImpersonating && storeId) {
                await deleteZoneAsProxy(storeId, deleteId);
            } else {
                const { error } = await supabase.from("delivery_zones").delete().eq("id", deleteId);
                if (error) throw error;
            }
            toast.success("Zona excluída!");
            setDeleteId(null);
            fetchZones();
        } catch (error) {
            console.error("Erro ao excluir:", error);
            toast.error("Erro ao excluir zona");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-black">Zonas de Entrega</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isImpersonating ? "Gerenciando zonas de entrega como Super Admin." : "Gerencie as taxas de entrega por bairro."}
                    </p>
                </div>
                <Button onClick={openCreateModal} className="bg-black text-white hover:bg-zinc-800">
                    <Plus className="mr-2 h-4 w-4" /> Nova Zona
                </Button>
            </div>

            <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-black">Bairro / Região</th>
                            <th className="px-6 py-4 font-semibold text-black text-center">Taxa</th>
                            <th className="px-6 py-4 font-semibold text-black text-center">Status</th>
                            <th className="px-6 py-4 font-semibold text-black text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {loading ? (
                            [1, 2, 3].map(i => (
                                <tr key={i}><td colSpan={4} className="px-6 py-4"><Skeleton className="h-6 w-full bg-zinc-100" /></td></tr>
                            ))
                        ) : zones.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-20 text-center text-zinc-400 italic">Nenhuma zona cadastrada.</td></tr>
                        ) : (
                            zones.map((zone) => (
                                <tr key={zone.id} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-black flex items-center gap-3">
                                        <MapPin className="h-4 w-4 text-zinc-400" /> {zone.name}
                                    </td>
                                    <td className="px-6 py-4 text-center text-zinc-600">
                                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(zone.price)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <Switch
                                            checked={zone.is_active}
                                            onCheckedChange={() => toggleActive(zone)}
                                            className="data-[state=checked]:bg-black"
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <Button variant="ghost" size="icon" onClick={() => openEditModal(zone)} className="hover:text-black">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(zone.id)} className="hover:text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="bg-white border-zinc-200">
                    <DialogHeader>
                        <DialogTitle className="text-black">{editingZone ? "Editar Zona" : "Nova Zona de Entrega"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-zinc-500">Nome do Bairro</label>
                            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Centro" className="border-zinc-300" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-zinc-500">Taxa de Entrega (R$)</label>
                            <Input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0,00" className="border-zinc-300" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} className="bg-black text-white px-8">Salvar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
                <DialogContent className="bg-white border-zinc-200">
                    <DialogHeader><DialogTitle className="text-black font-bold">Excluir Zona?</DialogTitle></DialogHeader>
                    <div className="py-4 text-zinc-500 text-sm">A zona de entrega será removida e não poderá ser recuperada.</div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteId(null)}>Manter</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-black text-white hover:bg-zinc-900 border-none">Excluir</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
