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

interface CategoryWithState extends Category {
    isDeleting?: boolean;
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
                    <span className="font-medium">{category.name}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(category)}
                    className="text-muted-foreground hover:text-primary"
                >
                    <Pencil className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(category.id)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<CategoryWithState[]>([]);
    const [originalCategories, setOriginalCategories] = useState<CategoryWithState[]>([]); // To revert changes
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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from("categories")
                .select("*")
                .eq('store_id', user.id)
                .order("sort_order");

            if (error) throw error;
            setCategories(data || []);
            setOriginalCategories(data || []); // Sync original state
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

    // Check if order has changed
    const hasOrderChanged = JSON.stringify(categories.map(c => c.id)) !== JSON.stringify(originalCategories.map(c => c.id));

    // Handle Drag End
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

    // Save New Order
    const handleSaveOrder = async () => {
        setIsSavingOrder(true);
        try {
            const updates = categories.map((cat, index) => ({
                id: cat.id,
                name: cat.name,
                store_id: cat.store_id, // Needed for RLS/Upsert usually
                sort_order: index
            }));

            // Supabase allows upserting multiple rows
            const { error } = await supabase
                .from("categories")
                .upsert(updates, { onConflict: "id" });

            if (error) throw error;

            toast.success("Ordem atualizada com sucesso!");
            setOriginalCategories([...categories]); // Update baseline
            fetchCategories(); // Refresh data ensures consistency
        } catch (error) {
            console.error("Erro ao salvar ordem:", error);
            toast.error("Erro ao salvar ordem. Tente novamente.");
        } finally {
            setIsSavingOrder(false);
        }
    };

    // Revert Order
    const handleRevertOrder = () => {
        setCategories([...originalCategories]);
        toast.info("Alterações de ordem descartadas.");
    };

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

            const tempId = crypto.randomUUID();
            const tempCategory = { ...newCategory, id: tempId, created_at: new Date().toISOString() };
            const newCategoriesList = [...categories, tempCategory];

            setCategories(newCategoriesList);
            setOriginalCategories(newCategoriesList); // Assuming success for optimistic UI in this view, but simpler to just fetch
            setIsCreateOpen(false);
            setNewCategoryName("");

            // @ts-ignore - Supabase type gen might not be updated yet
            const { error } = await supabase.from("categories").insert(newCategory);

            if (error) throw error;

            toast.success("Categoria criada!");
            fetchCategories();
        } catch (error) {
            console.error("Erro ao criar categoria:", error);
            toast.error("Erro ao criar categoria");
            fetchCategories();
        }
    };

    // Update Inline
    const saveEdit = async () => {
        if (!editingId || !editingName.trim()) {
            setEditingId(null);
            return;
        }

        const previousCategories = [...categories];
        setCategories(categories.map(c => c.id === editingId ? { ...c, name: editingName } : c));
        setEditingId(null);

        try {
            const { error } = await supabase
                .from("categories")
                .update({ name: editingName })
                .eq("id", editingId);

            if (error) throw error;
            toast.success("Categoria atualizada!");
            fetchCategories(); // Refresh
        } catch (error) {
            console.error("Erro ao atualizar:", error);
            toast.error("Erro ao atualizar categoria");
            setCategories(previousCategories);
        }
    };

    // Delete
    const confirmDelete = async () => {
        if (!deleteId) return;

        const previousCategories = [...categories];
        const newCategories = categories.filter(c => c.id !== deleteId);
        setCategories(newCategories);
        setOriginalCategories(originalCategories.filter(c => c.id !== deleteId)); // Update original so it doesnt trigger "unsaved changes" diff if we delete
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
            setCategories(previousCategories);
            setOriginalCategories(previousCategories);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20"> {/* pb-20 for fixed footer space if needed, or just visual buffer */}
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Categorias" }
            ]} />

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Categorias</h1>
                    <p className="text-muted-foreground mt-1">
                        Arraste os itens pelos 6 pontinhos para reordenar.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {hasOrderChanged && (
                        <>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRevertOrder}
                                disabled={isSavingOrder}
                            >
                                <X className="mr-2 h-4 w-4" />
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSaveOrder}
                                disabled={isSavingOrder}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                <Save className="mr-2 h-4 w-4" />
                                {isSavingOrder ? "Salvando..." : "Salvar Ordem"}
                            </Button>
                        </>
                    )}

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={hasOrderChanged}>
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
            </div>

            {/* List Container */}
            <div className="mt-6">
                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-lg" />
                        ))}
                    </div>
                ) : categories.length === 0 ? (
                    <div className="text-center py-10 border rounded-lg bg-muted/20">
                        <p className="text-muted-foreground">Nenhuma categoria encontrada.</p>
                        <Button variant="link" onClick={() => setIsCreateOpen(true)}>
                            Criar a primeira categoria
                        </Button>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={categories.map(c => c.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {categories.map((category) => (
                                    <SortableCategoryItem
                                        key={category.id}
                                        category={category}
                                        onEdit={(cat) => {
                                            setEditingId(cat.id);
                                            setEditingName(cat.name);
                                        }}
                                        onDelete={(id) => setDeleteId(id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Edit Dialog (Reusing existing state logic roughly, but cleaner to use a Dialog for edit too or inline) */}
            {/* For now, just a simple Inline Edit Logic replacement or keep the inline input? 
                The table had inline input. The list card can have it too, but a Dialog is cleaner for mobile.
                Let's use a Dialog for Editing to avoid layout shifts in DnD list. 
            */}
            <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Categoria</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                        <Button onClick={saveEdit}>Salvar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
