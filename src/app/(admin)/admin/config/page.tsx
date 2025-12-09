"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { StoreConfig } from "@/types/database";
import { Breadcrumb } from "@/components/admin/Breadcrumb";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Lock, Smartphone } from "lucide-react";

const formSchema = z.object({
    name: z.string().min(3, "Mínimo 3 caracteres").max(50, "Máximo 50 caracteres"),
    whatsapp: z.string()
        .min(10, "Mínimo 10 dígitos (DDD + Número)")
        .max(13, "Máximo 13 dígitos")
        .regex(/^\d+$/, "Apenas números"),
    minimum_order: z.coerce.number().min(0, "Valor não pode ser negativo"),
    logo_url: z.string().nullable().optional(),
    admin_email: z.union([z.string().email(), z.literal("")]).optional(), // Readonly
});

type FormValues = z.infer<typeof formSchema>;

export default function ConfigPage() {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(true);
    const [configId, setConfigId] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            name: "",
            whatsapp: "",
            minimum_order: 0,
            logo_url: null,
            admin_email: "",
        },
    });

    const watchedName = useWatch({ control: form.control, name: "name" });
    const watchedWhatsapp = useWatch({ control: form.control, name: "whatsapp" });

    // Format Phone for Preview: +55 (83) 98807-3784
    const formatPhonePreview = (phone: string) => {
        if (!phone) return "";
        // Simple logic for BR numbers (assuming 10-11 digits mainly w/o country code, or 12-13 with)
        // If user types just DDD+Number (11999999999 -> 11 chars)
        // Let's assume input might have 55 or not.
        // User instruction: "55 + DDD + Numero" is hinted in previous prompt, but here validation says just digits.
        // Let's try to format assuming standard BR mobile: DDI DDD 9XXXX-XXXX

        let cleaned = phone.replace(/\D/g, '');
        // If starts with 55 and length > 11, treat as DDI included
        let ddi = "+55";
        let ddd = "";
        let number = "";

        if (cleaned.length > 11 && cleaned.startsWith('55')) {
            // 55 83 98888 8888 (13 chars)
            ddd = cleaned.substring(2, 4);
            number = cleaned.substring(4);
        } else if (cleaned.length >= 10) {
            // 83 98888 8888 (11 chars) or 83 8888 8888 (10 chars)
            ddd = cleaned.substring(0, 2);
            number = cleaned.substring(2);
            ddi = "+55"; // Force BR DDI for preview consistency if not typed
        } else {
            return phone;
        }

        // Format number part
        if (number.length === 9) {
            number = `${number.substring(0, 5)}-${number.substring(5)}`;
        } else if (number.length === 8) {
            number = `${number.substring(0, 4)}-${number.substring(4)}`;
        }

        return `${ddi} (${ddd}) ${number}`;
    };

    const handleTestWhatsapp = () => {
        if (!watchedWhatsapp) return;
        const link = `https://wa.me/${watchedWhatsapp}?text=Teste de configuração do cardápio`;
        window.open(link, '_blank');
    };

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const { data, error } = await supabase
                    .from("store_config")
                    .select("*")
                    .single();

                if (error) {
                    // Usually this implies no config, might need to insert one or just ignore
                    // For now, assume seed existed.
                    console.error("Error fetching config:", error);
                }

                if (data) {
                    setConfigId(data.id);
                    form.reset({
                        name: data.name,
                        whatsapp: data.whatsapp,
                        minimum_order: data.minimum_order,
                        logo_url: data.logo_url,
                        admin_email: data.admin_email,
                    });
                }
            } catch (error) {
                console.error("Erro ao carregar:", error);
                toast.error("Erro ao carregar configurações.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchConfig();
    }, [supabase, form]);

    const onSubmit = async (values: FormValues) => {
        try {
            if (!configId) {
                toast.error("Erro de ID da configuração.");
                return;
            }

            const { error } = await supabase
                .from("store_config")
                .update({
                    name: values.name,
                    whatsapp: values.whatsapp,
                    minimum_order: values.minimum_order,
                    logo_url: values.logo_url,
                })
                .eq("id", configId);

            if (error) throw error;

            toast.success("Configurações salvas com sucesso!");
            // Reset dirty state by resetting form with new values
            form.reset(values);
        } catch (error) {
            console.error("Erro ao salvar:", error);
            toast.error("Erro ao salvar. Tente novamente.");
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6 max-w-2xl mx-auto mt-8">
                <Skeleton className="h-10 w-48 mb-4" />
                <Skeleton className="h-[600px] w-full" />
            </div>
        );
    }



    return (
        <div className="max-w-2xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Configurações" }
            ]} />
            <h1 className="text-3xl font-bold tracking-tight mb-8">Configurações da Loja</h1>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Dados do Restaurante</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8">

                            {/* LOGO */}
                            <FormField
                                control={form.control}
                                name="logo_url"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Logo da Loja</FormLabel>
                                        <FormControl>
                                            <div className="flex flex-col gap-2">
                                                <ImageUpload
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    disabled={form.formState.isSubmitting}
                                                    className="w-[120px] h-[120px]"
                                                />
                                                <span className="text-xs text-muted-foreground">
                                                    Recomendado: imagem quadrada, mínimo 200x200px
                                                </span>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* NOME */}
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-baseline">
                                            <FormLabel>Nome da Loja</FormLabel>
                                            <span className="text-xs text-muted-foreground">
                                                {watchedName?.length || 0}/50
                                            </span>
                                        </div>
                                        <FormControl>
                                            <Input placeholder="Ex: Hamburgueria Top" {...field} maxLength={50} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* WHATSAPP */}
                            <FormField
                                control={form.control}
                                name="whatsapp"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>WhatsApp</FormLabel>
                                        <div className="flex gap-2">
                                            <FormControl>
                                                <Input placeholder="5583999999999" {...field} type="tel" />
                                            </FormControl>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleTestWhatsapp}
                                                disabled={!watchedWhatsapp || !form.formState.isValid}
                                            >
                                                Testar
                                            </Button>
                                        </div>
                                        {watchedWhatsapp && (
                                            <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                                <Smartphone className="w-4 h-4" />
                                                Preview: {formatPhonePreview(watchedWhatsapp)}
                                            </div>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* PEDIDO MINIMO */}
                            <FormField
                                control={form.control}
                                name="minimum_order"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Pedido Mínimo (R$)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" min="0" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            Deixe R$ 0,00 para não exigir pedido mínimo
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* EMAIL */}
                            <FormField
                                control={form.control}
                                name="admin_email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email do Administrador</FormLabel>
                                        <div className="relative">
                                            <FormControl>
                                                <Input {...field} readOnly className="bg-muted pl-10" />
                                            </FormControl>
                                            <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                                        </div>
                                        <FormDescription>
                                            Para alterar, entre em contato com o suporte
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                        </CardContent>
                    </Card>

                    <div className="flex flex-col gap-4">
                        {form.formState.isDirty && (
                            <div className="text-amber-600 text-sm font-medium text-center bg-amber-50 p-2 rounded-md border border-amber-200">
                                Você tem alterações não salvas
                            </div>
                        )}

                        <Button
                            type="submit"
                            size="lg"
                            className="w-full"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                "Salvar Configurações"
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
