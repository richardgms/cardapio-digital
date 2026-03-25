"use client"

import { useState, useEffect } from "react"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GripVertical } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface GroupForReorder {
    id: string
    title: string
    pricing_mode: "addon" | "replacement"
}

function SortableGroupItem({ group }: { group: GroupForReorder }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: group.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        position: isDragging ? ("relative" as const) : undefined,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-3 p-3 mb-2 bg-card border rounded-lg shadow-sm transition-colors",
                isDragging && "opacity-50 ring-2 ring-primary bg-accent"
            )}
        >
            <button
                {...attributes}
                {...listeners}
                className="touch-none cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded text-muted-foreground"
                title="Arrastar para reordenar"
                type="button"
            >
                <GripVertical className="h-5 w-5" />
            </button>
            <span className="flex-1 text-sm font-medium truncate">{group.title || "Sem título"}</span>
            <Badge variant={group.pricing_mode === "replacement" ? "default" : "secondary"}>
                {group.pricing_mode === "replacement" ? "Tamanho" : "Adicional"}
            </Badge>
        </div>
    )
}

interface ReorderGroupsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    groups: GroupForReorder[]
    onSaved: (newOrderedIds: string[]) => void
}

export function ReorderGroupsModal({ open, onOpenChange, groups, onSaved }: ReorderGroupsModalProps) {
    const supabase = createClient()
    const [items, setItems] = useState<GroupForReorder[]>([])
    const [isSaving, setIsSaving] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    useEffect(() => {
        if (open) setItems([...groups])
    }, [open, groups])

    const hasOrderChanged =
        JSON.stringify(items.map(g => g.id)) !== JSON.stringify(groups.map(g => g.id))

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (active.id !== over?.id) {
            setItems(prev => {
                const oldIndex = prev.findIndex(g => g.id === active.id)
                const newIndex = prev.findIndex(g => g.id === over?.id)
                return arrayMove(prev, oldIndex, newIndex)
            })
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const results = await Promise.all(
                items.map((g, index) =>
                    supabase
                        .from("product_option_groups")
                        .update({ sort_order: index })
                        .eq("id", g.id)
                )
            )

            const failed = results.find(r => r.error)
            if (failed?.error) throw failed.error

            toast.success("Ordem salva com sucesso!")
            onSaved(items.map(g => g.id))
            onOpenChange(false)
        } catch (err: any) {
            toast.error(`Erro ao salvar ordem: ${err.message || "Erro desconhecido"}`)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Reordenar Grupos de Opções</DialogTitle>
                    <DialogDescription>
                        Arraste os grupos para definir a ordem de exibição no cardápio.
                    </DialogDescription>
                </DialogHeader>

                {items.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum grupo salvo para reordenar.
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(g => g.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="py-2">
                                {items.map(group => (
                                    <SortableGroupItem key={group.id} group={group} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || !hasOrderChanged}>
                        {isSaving ? "Salvando..." : "Salvar Ordem"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
