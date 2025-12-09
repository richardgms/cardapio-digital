"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Clock, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { BusinessHour, BusinessHourPeriod } from "@/types/database";

// Days of week mapping
const DAYS = [
    "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"
];

interface DayConfig {
    day_of_week: number;
    is_open: boolean;
    periods: {
        id?: string; // If existing
        open_time: string;
        close_time: string;
    }[];
    db_id?: string; // business_hour id
}

export default function HorariosPage() {
    const { store, fetchStore, loading: storeLoading } = useStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Local state for the form
    const [autoEnabled, setAutoEnabled] = useState(false);
    const [daysConfig, setDaysConfig] = useState<DayConfig[]>([]);

    useEffect(() => {
        if (!store && !storeLoading) return; // Wait for store
        if (store) {
            setAutoEnabled(store.auto_schedule_enabled || false);

            // Configure days (0-6)
            const days: DayConfig[] = [];
            for (let i = 0; i < 7; i++) {
                const existing = store.business_hours?.find(bh => bh.day_of_week === i);
                days.push({
                    day_of_week: i,
                    is_open: existing ? existing.is_open : false,
                    db_id: existing?.id,
                    periods: existing?.periods?.map(p => ({
                        id: p.id,
                        open_time: p.open_time.slice(0, 5),
                        close_time: p.close_time.slice(0, 5),
                    })) || []
                });
            }
            setDaysConfig(days);
            setIsLoading(false);
        }
    }, [store, storeLoading]);

    const handleToggleDay = (dayIndex: number) => {
        setDaysConfig(prev => prev.map(d => {
            if (d.day_of_week === dayIndex) {
                // If turning ON, add a default period if none exists
                const shouldAddPeriod = !d.is_open && d.periods.length === 0;
                return {
                    ...d,
                    is_open: !d.is_open,
                    periods: shouldAddPeriod ? [{ open_time: "08:00", close_time: "18:00" }] : d.periods
                };
            }
            return d;
        }));
    };

    const handleAddPeriod = (dayIndex: number) => {
        setDaysConfig(prev => prev.map(d => {
            if (d.day_of_week === dayIndex) {
                return { ...d, periods: [...d.periods, { open_time: "00:00", close_time: "00:00" }] };
            }
            return d;
        }));
    };

    const handleRemovePeriod = (dayIndex: number, periodIndex: number) => {
        setDaysConfig(prev => prev.map(d => {
            if (d.day_of_week === dayIndex) {
                const newPeriods = [...d.periods];
                newPeriods.splice(periodIndex, 1);
                return { ...d, periods: newPeriods };
            }
            return d;
        }));
    };

    const handleTimeChange = (dayIndex: number, periodIndex: number, field: "open_time" | "close_time", value: string) => {
        setDaysConfig(prev => prev.map(d => {
            if (d.day_of_week === dayIndex) {
                const newPeriods = [...d.periods];
                newPeriods[periodIndex] = { ...newPeriods[periodIndex], [field]: value };
                return { ...d, periods: newPeriods };
            }
            return d;
        }));
    };

    const onSave = async () => {
        if (!store) return;
        setIsSaving(true);
        const supabase = createClient();

        try {
            // 1. Update Store Config
            const { error: configError } = await supabase
                .from("store_config")
                .update({ auto_schedule_enabled: autoEnabled })
                .eq("id", store.id);

            if (configError) throw configError;

            // 2. Update Business Hours & Periods
            // Strategy: Upsert business_hours, then manage periods.
            // For periods, simpler to Delete All for the hour and Re-insert relative to the hour?
            // Or careful diffing?
            // Given "Cascade" on delete in SQL, if we delete a business_hour, periods go.
            // But we don't want to change IDs if possible, but recreating periods is often safer/easier for "list editing".
            // Let's iterate days.

            for (const day of daysConfig) {
                // Upsert hour
                const hourData = {
                    store_config_id: store.id,
                    day_of_week: day.day_of_week,
                    is_open: day.is_open
                };

                // We need the ID. If we have day.db_id, we can update. If not, insert or upsert based on (store, day).
                const { data: hourResult, error: hourError } = await supabase
                    .from("business_hours")
                    .select("id")
                    .eq("store_config_id", store.id)
                    .eq("day_of_week", day.day_of_week)
                    .single(); // Should exist due to seed? If not, insert.

                let hourId = hourResult?.id;

                if (!hourId) {
                    const { data: newHour, error: insertError } = await supabase
                        .from("business_hours")
                        .insert(hourData)
                        .select("id")
                        .single();
                    if (insertError) throw insertError;
                    hourId = newHour.id;
                } else {
                    const { error: updateError } = await supabase
                        .from("business_hours")
                        .update({ is_open: day.is_open })
                        .eq("id", hourId);
                    if (updateError) throw updateError;
                }

                // Handle Periods
                // Simplest robust way: Delete all periods for this hourId and Insert new ones.
                // This avoids complex ID tracking for periods.
                if (hourId) {
                    const { error: deleteError } = await supabase
                        .from("business_hour_periods")
                        .delete()
                        .eq("business_hour_id", hourId);
                    if (deleteError) throw deleteError;

                    if (day.is_open && day.periods.length > 0) {
                        const periodsToInsert = day.periods.map((p, idx) => ({
                            business_hour_id: hourId,
                            open_time: p.open_time,
                            close_time: p.close_time,
                            sort_order: idx
                        }));

                        const { error: periodsError } = await supabase
                            .from("business_hour_periods")
                            .insert(periodsToInsert);
                        if (periodsError) throw periodsError;
                    }
                }
            }

            toast.success("Horários atualizados com sucesso!");
            fetchStore(); // Refresh
        } catch (error) {
            console.error("Erro ao salvar horários:", error);
            toast.error("Erro ao salvar horários.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6 max-w-4xl mx-auto pb-20 pt-6">
                <Skeleton className="h-10 w-48 mb-6" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Horários de Funcionamento" }
            ]} />

            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Horários de Funcionamento</h1>
            </div>

            <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
                <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={autoEnabled}
                                    onCheckedChange={setAutoEnabled}
                                    id="auto-mode"
                                />
                                <label htmlFor="auto-mode" className="font-semibold cursor-pointer">
                                    Usar horário automático
                                </label>
                            </div>
                            <p className="text-sm text-muted-foreground pl-12">
                                Quando ativado, a loja abre e fecha automaticamente nos horários definidos abaixo (Horário de Brasília).
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!autoEnabled ? (
                <Card className="bg-muted/50 border-dashed">
                    <CardContent className="py-12 text-center space-y-2">
                        <Info className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
                        <h3 className="text-lg font-medium text-muted-foreground">Modo Manual Ativo</h3>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                            A loja está sendo controlada manualmente pelo botão no Dashboard.
                            Ative a opção acima para configurar os dias.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {daysConfig.map((day, index) => (
                        <Card key={day.day_of_week}>
                            <CardContent className="p-4 pt-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-medium text-lg flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-muted-foreground" />
                                        {DAYS[day.day_of_week]}
                                    </div>
                                    <Switch
                                        checked={day.is_open}
                                        onCheckedChange={() => handleToggleDay(day.day_of_week)}
                                    />
                                </div>

                                {day.is_open ? (
                                    <div className="space-y-3 pl-6 border-l-2 border-muted ml-2">
                                        {day.periods.map((period, periodIndex) => (
                                            <div key={periodIndex} className="flex items-center gap-2">
                                                <Input
                                                    type="time"
                                                    value={period.open_time}
                                                    onChange={(e) => handleTimeChange(day.day_of_week, periodIndex, "open_time", e.target.value)}
                                                    className="w-32"
                                                />
                                                <span className="text-sm text-muted-foreground">às</span>
                                                <Input
                                                    type="time"
                                                    value={period.close_time}
                                                    onChange={(e) => handleTimeChange(day.day_of_week, periodIndex, "close_time", e.target.value)}
                                                    className="w-32"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemovePeriod(day.day_of_week, periodIndex)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleAddPeriod(day.day_of_week)}
                                            className="h-8 text-primary"
                                        >
                                            <Plus className="w-3 h-3 mr-1" />
                                            Adicionar horário
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="pl-6 ml-2 py-2 text-sm text-muted-foreground italic">
                                        Fechado
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 md:pl-72 z-10 flex justify-end gap-4 shadow-up">
                <div className="w-full max-w-2xl mx-auto flex justify-end"> {/* Centering matching the content */}
                    <Button size="lg" onClick={onSave} disabled={isSaving} className="w-full sm:w-auto">
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            "Salvar Horários"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
