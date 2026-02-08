"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { Category } from "@/types/database"; // Assuming this type exists or will be inferred
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, GripVertical, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CategoryWithState extends Category {
    isDeleting?: boolean;
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<CategoryWithState[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

    const supabase = createClient();

    // Fetch Categories
    const fetchCategories = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from("categories")
                .select("*")
                .eq('store_id', user.id) // Explicit filtering
                .order("sort_order");

            if (error) throw error;
            setCategories(data || []);
        } catch (error) {
            console.error("Erro ao carregar categorias:", error);
            toast.error("Erro ao carregar categorias");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    // Create Category
    const handleCreate = async () => {
        if (!newCategoryName.trim()) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            const maxSortOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1);
            const newCategory = {
                store_id: user.id,
                name: newCategoryName,
                sort_order: maxSortOrder + 1,
            };

            // Optimistic Update (simulated ID until refresh)
            const tempId = crypto.randomUUID();
            const tempCategory = { ...newCategory, id: tempId, created_at: new Date().toISOString() };
            setCategories([...categories, tempCategory]);
            setIsCreateOpen(false);
            setNewCategoryName("");

            // @ts-ignore - Supabase type gen might not be updated yet
            const { error } = await supabase.from("categories").insert(newCategory);

            if (error) throw error;

            toast.success("Categoria criada com sucesso!");
            fetchCategories(); // Refresh to get real ID
        } catch (error) {
            console.error("Erro ao criar categoria:", error);
            toast.error("Erro ao criar categoria");
            fetchCategories(); // Revert
        }
    };

    // Inline Edit
    const startEditing = (category: Category) => {
        setEditingId(category.id);
        setEditingName(category.name);
    };

    const saveEdit = async () => {
        if (!editingId || !editingName.trim()) {
            setEditingId(null);
            return;
        }

        const previousCategories = [...categories];
        // Optimistic Update
        setCategories(categories.map(c => c.id === editingId ? { ...c, name: editingName } : c));
        setEditingId(null);

        try {
            const { error } = await supabase
                .from("categories")
                .update({ name: editingName })
                .eq("id", editingId);

            if (error) throw error;
            toast.success("Categoria atualizada!");
        } catch (error) {
            console.error("Erro ao atualizar:", error);
            toast.error("Erro ao atualizar categoria");
            setCategories(previousCategories); // Revert
        }
    };

    // Delete Category
    // Using a custom confirmation state/dialog instead of missing AlertDialog component
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const confirmDelete = async () => {
        if (!deleteId) return;

        const previousCategories = [...categories];
        // Optimistic Update
        setCategories(categories.filter(c => c.id !== deleteId));
        setDeleteId(null);

        try {
            const { error } = await supabase
                .from("categories")
                .delete()
                .eq("id", deleteId);

            if (error) throw error;
            toast.success("Categoria excluída!");
        } catch (error) {
            console.error("Erro ao excluir:", error);
            toast.error("Erro ao excluir categoria");
            setCategories(previousCategories); // Revert
        }
    };



    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Categorias" }
            ]} />
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Categorias</h1>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nova Categoria
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Criar Nova Categoria</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <Input
                                placeholder="Nome da categoria"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleCreate}>Salvar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-lg">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[100px]">Ordem</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Nome</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        <td className="p-4"><Skeleton className="h-4 w-8" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                                        <td className="p-4"><Skeleton className="h-8 w-8 ml-auto" /></td>
                                    </tr>
                                ))
                            ) : categories.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                                        Nenhuma categoria encontrada
                                    </td>
                                </tr>
                            ) : (
                                categories.map((category) => (
                                    <tr key={category.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle font-medium">{category.sort_order}</td>
                                        <td className="p-4 align-middle">
                                            {editingId === category.id ? (
                                                <Input
                                                    autoFocus
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onBlur={saveEdit}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") saveEdit();
                                                        if (e.key === "Escape") setEditingId(null);
                                                    }}
                                                    className="h-8"
                                                />
                                            ) : (
                                                <span
                                                    onClick={() => startEditing(category)}
                                                    className="cursor-pointer hover:underline decoration-dashed underline-offset-4 flex items-center gap-2"
                                                >
                                                    {category.name}
                                                    <Pencil className="h-3 w-3 text-muted-foreground opacity-50" />
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteId(category.id)}
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

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Excluir Categoria?</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-muted-foreground">
                        Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita.
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
