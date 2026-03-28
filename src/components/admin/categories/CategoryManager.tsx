"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { Category } from "@/types/database";
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
import { Trash2, Plus, GripVertical, Pencil, Save, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { 
    fetchCategoriesForProxy, 
    saveCategoryAsProxy, 
    deleteCategoryAsProxy, 
    reorderCategoriesAsProxy 
} from "@/actions/admin/proxy-categories";

interface CategoryWithState extends Category {
    isDeleting?: boolean;
}

interface CategoryManagerProps {
    storeId?: string;
    isImpersonating?: boolean;
}

// Sortable Item Component
function SortableCategoryItem({ category, onEdit, onDelete }: {
    category: CategoryWithState;
    onEdit: (category: Category) => void;
    onDelete: (id: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: category.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        position: isDragging ? "relative" as const : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center justify-between p-4 mb-2 bg-card border rounded-lg shadow-sm transition-colors",
                isDragging && "opacity-50 ring-2 ring-primary bg-accent"
            )}
        >
            <div className="flex items-center gap-4 flex-1">
                <button
                    {...attributes}
                    {...listeners}
                    className="touch-none cursor-grab active:cursor-grabbing p-2 hover:bg-muted rounded-md text-muted-foreground"
                    title="Arrastar para reordenar"
                >
                    <GripVertical className="h-5 w-5" />
                </button>

                <div className="flex flex-col">
                    <span className="font-medium text-foreground">{category.name}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(category)}
                    className="text-muted-foreground hover:text-black"
                >
                    <Pencil className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    onClick={() => onDelete(category.id)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

export function CategoryManager({ storeId, isImpersonating }: CategoryManagerProps) {
    const [categories, setCategories] = useState<CategoryWithState[]>([]);
    const [originalCategories, setOriginalCategories] = useState<CategoryWithState[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isSavingOrder, setIsSavingOrder] = useState(false);

    const supabase = createClient();

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchCategories = async () => {
        try {
            let data;
            
            if (isImpersonating && storeId) {
                data = await fetchCategoriesForProxy(storeId);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: catData, error } = await supabase
                    .from("categories")
                    .select("*")
                    .eq('store_id', user.id)
                    .order("sort_order");

                if (error) throw error;
                data = catData;
            }

            setCategories(data || []);
            setOriginalCategories(data || []);
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

    const hasOrderChanged = JSON.stringify(categories.map(c => c.id)) !== JSON.stringify(originalCategories.map(c => c.id));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setCategories((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over?.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleSaveOrder = async () => {
        setIsSavingOrder(true);
        try {
            const updates = categories.map((cat, index) => ({
                id: cat.id,
                sort_order: index
            }));

            if (isImpersonating && storeId) {
                await reorderCategoriesAsProxy(storeId, updates);
            } else {
                // Lógica original de fallback (pode extrair pra action depois se quiser)
                const { error } = await supabase
                    .from("categories")
                    .upsert(categories.map((c, i) => ({ ...c, sort_order: i })), { onConflict: "id" });
                if (error) throw error;
            }

            toast.success("Ordem atualizada com sucesso!");
            setOriginalCategories([...categories]);
            fetchCategories();
        } catch (error) {
            console.error("Erro ao salvar ordem:", error);
            toast.error("Erro ao salvar ordem");
        } finally {
            setIsSavingOrder(false);
        }
    };

    const handleRevertOrder = () => {
        setCategories([...originalCategories]);
        toast.info("Alterações descartadas.");
    };

    const handleCreate = async () => {
        if (!newCategoryName.trim()) return;

        try {
            if (isImpersonating && storeId) {
                await saveCategoryAsProxy(storeId, 'novo', newCategoryName);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Não autenticado");
                const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1);
                const { error } = await supabase.from("categories").insert({
                    store_id: user.id,
                    name: newCategoryName,
                    sort_order: maxOrder + 1,
                });
                if (error) throw error;
            }

            toast.success("Categoria criada!");
            setNewCategoryName("");
            setIsCreateOpen(false);
            fetchCategories();
        } catch (error) {
            console.error("Erro ao criar:", error);
            toast.error("Erro ao criar categoria");
        }
    };

    const saveEdit = async () => {
        if (!editingId || !editingName.trim()) {
            setEditingId(null);
            return;
        }

        try {
            if (isImpersonating && storeId) {
                await saveCategoryAsProxy(storeId, editingId, editingName);
            } else {
                const { error } = await supabase
                    .from("categories")
                    .update({ name: editingName })
                    .eq("id", editingId);
                if (error) throw error;
            }

            toast.success("Categoria atualizada!");
            setEditingId(null);
            fetchCategories();
        } catch (error) {
            console.error("Erro ao atualizar:", error);
            toast.error("Erro ao atualizar categoria");
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        try {
            if (isImpersonating && storeId) {
                await deleteCategoryAsProxy(storeId, deleteId);
            } else {
                const { error } = await supabase.from("categories").delete().eq("id", deleteId);
                if (error) throw error;
            }

            toast.success("Categoria excluída!");
            setDeleteId(null);
            fetchCategories();
        } catch (error) {
            console.error("Erro ao excluir:", error);
            toast.error("Erro ao excluir categoria");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-black">Categorias</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isImpersonating ? "Gerenciando categorias como Super Admin." : "Gerencie suas categorias do cardápio."}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {hasOrderChanged && (
                        <>
                            <Button variant="outline" size="sm" onClick={handleRevertOrder} disabled={isSavingOrder} className="border-black">
                                <X className="mr-2 h-4 w-4" /> Cancelar
                            </Button>
                            <Button onClick={handleSaveOrder} disabled={isSavingOrder} className="bg-black text-white hover:bg-zinc-800">
                                <Save className="mr-2 h-4 w-4" /> {isSavingOrder ? "Salvando..." : "Salvar Ordem"}
                            </Button>
                        </>
                    )}

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={hasOrderChanged} className="bg-black text-white hover:bg-zinc-800">
                                <Plus className="mr-2 h-4 w-4" /> Nova Categoria
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border border-zinc-200">
                            <DialogHeader>
                                <DialogTitle className="text-black">Criar Categoria</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <Input
                                    placeholder="Nome da categoria"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    className="border-zinc-300 focus:ring-black"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                                <Button onClick={handleCreate} className="bg-black text-white">Criar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="mt-6">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl bg-zinc-100" />)}
                    </div>
                ) : categories.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
                        <p className="text-muted-foreground italic">Nenhuma categoria encontrada.</p>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-1">
                                {categories.map((category) => (
                                    <SortableCategoryItem
                                        key={category.id}
                                        category={category}
                                        onEdit={(cat) => { setEditingId(cat.id); setEditingName(cat.name); }}
                                        onDelete={(id) => setDeleteId(id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Dialogs de Edição e Exclusão (P&B) */}
            <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
                <DialogContent className="bg-white border-zinc-200">
                    <DialogHeader><DialogTitle className="text-black">Editar Categoria</DialogTitle></DialogHeader>
                    <div className="py-4"><Input value={editingName} onChange={(e) => setEditingName(e.target.value)} /></div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                        <Button onClick={saveEdit} className="bg-black text-white">Salvar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
                <DialogContent className="bg-white border-zinc-200">
                    <DialogHeader><DialogTitle className="text-black">Excluir Categoria?</DialogTitle></DialogHeader>
                    <div className="py-4 text-zinc-500 text-sm">Esta ação é irreversível e removerá a categoria do cardápio.</div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteId(null)}>Manter</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="bg-black text-white hover:bg-zinc-900 border-none">Excluir</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
