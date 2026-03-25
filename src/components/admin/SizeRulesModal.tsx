"use client"

import { useState, useEffect } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import type { GroupSizeRule } from "@/types/database"

interface ReplacementGroupData {
    id: string
    title: string
    options: Array<{
        id: string
        name: string
        is_available?: boolean
    }>
}

interface SizeRulesModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    group: {
        id: string
        title: string
        max_select: number
    }
    replacementGroups: ReplacementGroupData[]
}

export function SizeRulesModal({ open, onOpenChange, group, replacementGroups }: SizeRulesModalProps) {
    const supabase = createClient()

    const [values, setValues] = useState<Record<string, string>>({})
    const [existingRules, setExistingRules] = useState<GroupSizeRule[]>([])
    const [isFetching, setIsFetching] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (!open) return

        setIsFetching(true)
        supabase
            .from("group_size_rules")
            .select("*")
            .eq("group_id", group.id)
            .then(({ data, error }) => {
                if (error) {
                    toast.error("Erro ao carregar regras de tamanho")
                    setIsFetching(false)
                    return
                }
                const rules = data || []
                setExistingRules(rules)
                const init: Record<string, string> = {}
                rules.forEach(r => {
                    init[r.size_option_id] = String(r.max_select)
                })
                setValues(init)
                setIsFetching(false)
            })
    }, [open, group.id])

    const handleSave = async () => {
        // Validate filled values
        for (const [, val] of Object.entries(values)) {
            if (val === "") continue
            const num = Number(val)
            if (!Number.isInteger(num) || num < 1 || num > 20) {
                toast.error("Valores devem ser inteiros entre 1 e 20")
                return
            }
        }

        setIsSaving(true)
        try {
            const upsertPayload: Array<{
                group_id: string
                source_group_id: string
                size_option_id: string
                max_select: number
            }> = []
            const deleteIds: string[] = []

            for (const repGroup of replacementGroups) {
                for (const option of repGroup.options) {
                    const val = values[option.id]
                    const numVal = val ? parseInt(val, 10) : NaN
                    const existingRule = existingRules.find(r => r.size_option_id === option.id)

                    if (!isNaN(numVal) && numVal >= 1 && numVal <= 20) {
                        upsertPayload.push({
                            group_id: group.id,
                            source_group_id: repGroup.id,
                            size_option_id: option.id,
                            max_select: numVal,
                        })
                    } else if (existingRule) {
                        deleteIds.push(existingRule.id)
                    }
                }
            }

            if (upsertPayload.length > 0) {
                const { error } = await supabase
                    .from("group_size_rules")
                    .upsert(upsertPayload, { onConflict: "group_id,size_option_id" })
                if (error) throw error
            }

            if (deleteIds.length > 0) {
                const { error } = await supabase
                    .from("group_size_rules")
                    .delete()
                    .in("id", deleteIds)
                if (error) throw error
            }

            toast.success("Regras salvas com sucesso!")
            onOpenChange(false)
        } catch (err: any) {
            toast.error(`Erro ao salvar regras: ${err.message || "Erro desconhecido"}`)
        } finally {
            setIsSaving(false)
        }
    }

    const allSizes = replacementGroups.flatMap(rg =>
        rg.options.map(o => ({ ...o, sourceGroupTitle: rg.title }))
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Regras por Tamanho — {group.title}</DialogTitle>
                    <DialogDescription>
                        <span className="font-medium">Padrão (tamanhos sem regra):</span> {group.max_select} opção{group.max_select !== 1 ? "ões" : ""}. Preencha apenas os tamanhos que precisam de limite diferente.
                    </DialogDescription>
                </DialogHeader>

                {isFetching ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
                ) : allSizes.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum tamanho configurado nos grupos de substituição.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {allSizes.map(size => {
                            const hasActiveRule = values[size.id] !== undefined && values[size.id] !== ""
                            const showInactiveBadge = size.is_available === false && hasActiveRule
                            return (
                                <div key={size.id} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <Label className="text-sm font-normal truncate block">
                                            {size.name}
                                            {showInactiveBadge && (
                                                <Badge variant="secondary" className="ml-2 text-xs">
                                                    Tamanho inativo
                                                </Badge>
                                            )}
                                        </Label>
                                        {replacementGroups.length > 1 && (
                                            <span className="text-xs text-muted-foreground">{size.sourceGroupTitle}</span>
                                        )}
                                    </div>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={20}
                                        placeholder={String(group.max_select)}
                                        value={values[size.id] ?? ""}
                                        onChange={e =>
                                            setValues(prev => ({
                                                ...prev,
                                                [size.id]: e.target.value,
                                            }))
                                        }
                                        className="w-20 text-right"
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || isFetching}>
                        {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
