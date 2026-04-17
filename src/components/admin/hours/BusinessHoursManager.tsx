"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Info, Save, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { saveBusinessHoursAsProxy } from "@/actions/admin/proxy-hours";

const DAYS = [
    "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"
];

interface DayConfig {
    day_of_week: number;
    is_open: boolean;
    periods: {
        open_time: string;
        close_time: string;
    }[];
}

interface BusinessHoursManagerProps {
    storeId?: string;
    isImpersonating?: boolean;
}

export function BusinessHoursManager({ storeId, isImpersonating }: BusinessHoursManagerProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [autoEnabled, setAutoEnabled] = useState(false);
    const [daysConfig, setDaysConfig] = useState<DayConfig[]>([]);

    const supabase = createClient();

    const loadData = async () => {
        try {
            let config;
            if (isImpersonating && storeId) {
                const { data, error } = await supabase
                    .from("store_config")
                    .select("id, auto_schedule_enabled, business_hours(id, day_of_week, is_open, periods:business_hour_periods(id, open_time, close_time))")
                    .eq("id", storeId)
                    .single();

                if (error) throw error;
                config = data;
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                const { data, error } = await supabase
                    .from("store_config")
                    .select("id, auto_schedule_enabled, business_hours(id, day_of_week, is_open, periods:business_hour_periods(id, open_time, close_time))")
                    .eq("id", user.id)
                    .single();
                if (error) throw error;
                config = data;
            }

            if (config) {
                setAutoEnabled(config.auto_schedule_enabled || false);
                const days: DayConfig[] = [];
                for (let i = 0; i < 7; i++) {
                    const existing = config.business_hours?.find(bh => bh.day_of_week === i);
                    days.push({
                        day_of_week: i,
                        is_open: existing ? existing.is_open : false,
                        periods: existing?.periods?.map((p) => ({
                            open_time: p.open_time.slice(0, 5),
                            close_time: p.close_time.slice(0, 5),
                        })) || []
                    });
                }
                setDaysConfig(days);
            }
        } catch (error) {
            console.error("Erro ao carregar horários:", error);
            toast.error("Erro ao carregar horários.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleToggleDay = (dayIndex: number) => {
        setDaysConfig(prev => prev.map(d => {
            if (d.day_of_week === dayIndex) {
                const toggled = !d.is_open;
                return {
                    ...d,
                    is_open: toggled,
                    periods: toggled && d.periods.length === 0 ? [{ open_time: "08:00", close_time: "18:00" }] : d.periods
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
        setIsSaving(true);
        try {
            if (isImpersonating && storeId) {
                await saveBusinessHoursAsProxy(storeId, {
                    auto_schedule_enabled: autoEnabled,
                    days: daysConfig
                });
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Não autenticado");

                await supabase.from("store_config").update({ auto_schedule_enabled: autoEnabled }).eq("id", user.id);
                for (const day of daysConfig) {
                    const { data: hour } = await supabase.from("business_hours").upsert({ store_config_id: user.id, day_of_week: day.day_of_week, is_open: day.is_open }, { onConflict: "store_config_id,day_of_week" }).select("id").single();
                    if (hour) {
                        await supabase.from("business_hour_periods").delete().eq("business_hour_id", hour.id);
                        if (day.is_open && day.periods.length > 0) {
                            await supabase.from("business_hour_periods").insert(day.periods.map((p, i) => ({ business_hour_id: hour.id, ...p, sort_order: i })));
                        }
                    }
                }
            }

            toast.success("Horários salvos com sucesso!");
            loadData();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            toast.error("Erro ao salvar horários.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6 pt-6">
                <Skeleton className="h-20 w-full rounded-2xl bg-muted" />
                <Skeleton className="h-[400px] w-full rounded-2xl bg-muted" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Horários</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isImpersonating ? "Configurando horários como Super Admin." : "Gerencie os horários de funcionamento da sua loja."}
                    </p>
                </div>
                <Button onClick={onSave} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Save className="mr-2 h-4 w-4" /> {isSaving ? "Salvando..." : "Salvar Alterações"}
                </Button>
            </div>

            <Card className="border border-border bg-muted/50 shadow-none rounded-2xl">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <Switch
                            checked={autoEnabled}
                            onCheckedChange={setAutoEnabled}
                            id="auto-mode"
                        />
                        <div className="space-y-0.5">
                            <label htmlFor="auto-mode" className="font-bold text-foreground cursor-pointer">
                                Modo de Horário Automático
                            </label>
                            <p className="text-xs text-muted-foreground">
                                A loja abre e fecha sozinha conforme as regras abaixo.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!autoEnabled ? (
                <div className="py-20 text-center border-2 border-dashed border-border rounded-2xl bg-muted/20">
                    <Info className="w-10 h-10 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-bold text-muted-foreground">Controle Manual Ativo</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        Ative o Modo Automático para configurar horários semanais.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {daysConfig.map((day) => (
                        <div key={day.day_of_week} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-background border border-border rounded-2xl shadow-sm gap-4">
                            <div className="flex items-center gap-4 min-w-[200px]">
                                <Switch
                                    checked={day.is_open}
                                    onCheckedChange={() => handleToggleDay(day.day_of_week)}
                                />
                                <span className={cn("font-bold text-lg", !day.is_open && "text-muted-foreground/50")}>
                                    {DAYS[day.day_of_week]}
                                </span>
                            </div>

                            {day.is_open ? (
                                <div className="flex-1 flex flex-wrap items-center gap-3">
                                    {day.periods.map((period, pIndex) => (
                                        <div key={pIndex} className="flex items-center bg-muted/50 px-3 py-2 rounded-xl border border-border gap-2 animate-in fade-in zoom-in duration-200">
                                            <Input
                                                type="time"
                                                value={period.open_time}
                                                onChange={(e) => handleTimeChange(day.day_of_week, pIndex, "open_time", e.target.value)}
                                                className="w-[90px] h-8 border-none bg-transparent font-medium p-0 focus-visible:ring-0"
                                            />
                                            <span className="text-muted-foreground font-bold text-xs">ATÉ</span>
                                            <Input
                                                type="time"
                                                value={period.close_time}
                                                onChange={(e) => handleTimeChange(day.day_of_week, pIndex, "close_time", e.target.value)}
                                                className="w-[90px] h-8 border-none bg-transparent font-medium p-0 focus-visible:ring-0"
                                            />
                                            <button onClick={() => handleRemovePeriod(day.day_of_week, pIndex)} className="text-muted-foreground/50 hover:text-foreground">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <Button variant="ghost" size="sm" onClick={() => handleAddPeriod(day.day_of_week)} className="text-muted-foreground hover:text-foreground font-bold h-10 px-4 border border-dashed border-border rounded-xl">
                                        <Plus className="w-4 h-4 mr-1" /> ADICIONAR
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex-1 text-right">
                                    <span className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest">Fechado</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
