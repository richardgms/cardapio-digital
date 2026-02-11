"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { StoreConfig } from "@/types/database";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ensureStoreConfig } from "@/actions/store/config";
import NextImage from "next/image";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Lock, Smartphone, AlertCircle, UtensilsCrossed } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const formSchema = z.object({
    name: z.string().min(3, "Mínimo 3 caracteres").max(50, "Máximo 50 caracteres"),
    whatsapp: z.string()
        .min(10, "Mínimo 10 dígitos (DDD + Número)")
        .max(13, "Máximo 13 dígitos")
        .regex(/^\d+$/, "Apenas números"),
    minimum_order: z.coerce.number().min(0, "Valor não pode ser negativo"),
    logo_url: z.string().nullable().optional(),
    admin_email: z.union([z.string().email(), z.literal("")]).optional(), // Readonly
    subdomain: z.string()
        .min(3, "Mínimo 3 caracteres")
        .max(30, "Máximo 30 caracteres")
        .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens")
        .optional(),
    pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "random"]).optional().nullable(),
    pix_key: z.string().optional().nullable(),
    table_mode_enabled: z.boolean().optional(),
    table_count: z.coerce.number().min(1, "Mínimo 1 mesa").max(200, "Máximo 200 mesas").optional(),
}).superRefine((data, ctx) => {
    if (!data.pix_key) return; // If empty, basic string check passes (optional). 
    // If user selected a type but no key? 
    if (data.pix_key_type && !data.pix_key) {
        // Maybe allow saving without key if they clear it?
        // But if they typed something... 
        return;
    }

    if (data.pix_key_type === 'email') {
        const emailSchema = z.string().email();
        const result = emailSchema.safeParse(data.pix_key);
        if (!result.success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Email inválido",
                path: ["pix_key"],
            });
        }
    }

    if (data.pix_key_type === 'random') {
        // Random key usually is UUID (36 chars) or just long alphanumeric string.
        // Let's enforce min length of 20 to be safe for "Chave Aleatória".
        if (data.pix_key.length < 20) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Chave aleatória parece muito curta (mínimo 20 caracteres)",
                path: ["pix_key"],
            });
        }
    }

    if (data.pix_key_type === 'cpf') {
        // Basic length check (formatted or unformatted)
        const clean = data.pix_key.replace(/\D/g, '');
        if (clean.length !== 11) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "CPF deve ter 11 dígitos",
                path: ["pix_key"],
            });
        }
    }

    if (data.pix_key_type === 'cnpj') {
        const clean = data.pix_key.replace(/\D/g, '');
        if (clean.length !== 14) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "CNPJ deve ter 14 dígitos",
                path: ["pix_key"],
            });
        }
    }

    if (data.pix_key_type === 'phone') {
        const clean = data.pix_key.replace(/\D/g, '');
        // 10 or 11 digits
        if (clean.length < 10 || clean.length > 11) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Telefone inválido (10 ou 11 dígitos)",
                path: ["pix_key"],
            });
        }
    }
});

type FormValues = z.infer<typeof formSchema>;

export default function ConfigPage() {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(true);
    const [configId, setConfigId] = useState<string | null>(null);
    const [tableModeAvailable, setTableModeAvailable] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            name: "",
            whatsapp: "",
            minimum_order: 0,
            logo_url: null,
            admin_email: "",
            subdomain: "",
            pix_key_type: null,
            pix_key: "",
            table_mode_enabled: false,
            table_count: 10,
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

    const formatPixKey = (value: string, type: string | null | undefined) => {
        if (!value) return "";

        // Remove non-alphanumeric chars for clean processing
        // But for email, we need @ and .
        // For Random, we need hyphens etc.
        // So cleaning depends on type.

        if (type === 'cpf') {
            const clean = value.replace(/\D/g, '').slice(0, 11);
            return clean
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})/, '$1-$2')
                .replace(/(-\d{2})\d+?$/, '$1');
        }

        if (type === 'cnpj') {
            const clean = value.replace(/\D/g, '').slice(0, 14);
            return clean
                .replace(/^(\d{2})(\d)/, '$1.$2')
                .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d)/, '.$1/$2')
                .replace(/(\d{4})(\d)/, '$1-$2')
                .replace(/(-\d{2})\d+?$/, '$1');
        }

        if (type === 'phone') {
            const clean = value.replace(/\D/g, '').slice(0, 11);
            // (11) 99999-9999
            if (clean.length > 10) {
                return clean
                    .replace(/^(\d{2})(\d)/, '($1) $2')
                    .replace(/(\d{5})(\d)/, '$1-$2')
                    .replace(/(-\d{4})\d+?$/, '$1');
            }
            // (11) 9999-9999
            return clean
                .replace(/^(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2')
                .replace(/(-\d{4})\d+?$/, '$1');
        }

        return value;
    };

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                // 1. Get User first
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError || !user) {
                    console.error("Auth error:", authError);
                    return;
                }

                console.log("[ConfigPage] User:", user.id, user.email);

                // 2. Fetch Config for THIS user
                const { data, error } = await supabase
                    .from("store_config")
                    .select("*")
                    .eq('id', user.id)
                    .maybeSingle();

                if (error) {
                    console.error("Error fetching config:", error);
                }

                if (data) {
                    setConfigId(data.id);
                    // Use admin_email from data, or fallback to auth email
                    let email = data.admin_email || user.email || "";

                    form.reset({
                        name: data.name,
                        whatsapp: data.whatsapp,
                        minimum_order: data.minimum_order,
                        logo_url: data.logo_url,
                        admin_email: email,
                        subdomain: data.subdomain || "",
                        pix_key: data.pix_key || "",
                        pix_key_type: data.pix_key_type || null,
                        table_mode_enabled: data.table_mode_enabled || false,
                        table_count: data.table_count || 10,
                    });
                    setTableModeAvailable(data.table_mode_available || false);
                } else {
                    // New Store Setup
                    setConfigId(user.id);
                    form.setValue("admin_email", user.email || "");
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
            let targetId = configId;
            if (!targetId) {
                try {
                    const result = await ensureStoreConfig();
                    if (result.success && result.config) {
                        targetId = result.config.id;
                        setConfigId(targetId);
                    }
                } catch (err) {
                    console.error("Error ensuring config:", err);
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) targetId = user.id;
                }
            }

            if (!targetId) {
                toast.error("Erro: Usuário não identificado.");
                return;
            }

            // Ensure admin_email is present for INSERT
            let targetEmail = values.admin_email;
            if (!targetEmail) {
                const { data: { user } } = await supabase.auth.getUser();
                targetEmail = user?.email || "";
            }

            if (!targetEmail) {
                toast.error("Erro: Email do administrador é obrigatório.");
                return;
            }

            const { error } = await supabase
                .from("store_config")
                .upsert({
                    id: targetId,
                    name: values.name,
                    whatsapp: values.whatsapp,
                    minimum_order: values.minimum_order,
                    logo_url: values.logo_url,
                    admin_email: targetEmail,
                    subdomain: values.subdomain,
                    pix_key: values.pix_key,
                    pix_key_type: values.pix_key_type,
                    table_mode_enabled: values.table_mode_enabled || false,
                    table_count: values.table_count || 10,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' })

            if (error) throw error;

            toast.success("Configurações salvas com sucesso!");
            form.reset({
                ...values,
                admin_email: targetEmail // Update form with used email
            });
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
                                                <div className="relative">
                                                    <span className="absolute left-3 top-2.5 text-muted-foreground select-none">
                                                        +55
                                                    </span>
                                                    <Input
                                                        placeholder="(83) 9 9999-9999"
                                                        {...field}
                                                        className="pl-12"
                                                        value={(() => {
                                                            // Format value for display: (XX) 9 XXXX-XXXX
                                                            // We assume field.value might be raw 5583999999999 or just 83...
                                                            let v = field.value || "";
                                                            v = v.replace(/\D/g, "");

                                                            // Remove leading 55 if present (we enforce it visually)
                                                            if (v.startsWith("55") && v.length > 11) {
                                                                v = v.substring(2);
                                                            }

                                                            // Apply constraints
                                                            v = v.slice(0, 11); // Max 11 digits (DDD + 9 digits)

                                                            // Format
                                                            if (v.length > 7) {
                                                                return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
                                                            } else if (v.length > 3) {
                                                                return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;
                                                            } else if (v.length > 2) {
                                                                return `(${v.slice(0, 2)}) ${v.slice(2)}`;
                                                            } else if (v.length > 0) {
                                                                return `(${v}`;
                                                            }
                                                            return "";
                                                        })()}
                                                        onChange={(e) => {
                                                            // Clean input to just numbers
                                                            let raw = e.target.value.replace(/\D/g, "");

                                                            // If user pastes with +55, remove it
                                                            if (raw.startsWith("55") && raw.length > 11) {
                                                                raw = raw.substring(2);
                                                            }

                                                            // Limit to 11 digits (DDD + 9 + 8 digits)
                                                            raw = raw.slice(0, 11);

                                                            // Store as standard 55 + raw in the form state?
                                                            // The backend expects full number or just digits?
                                                            // Schema says: min 10 digs.
                                                            // Let's store WITH 55 to be safe and consistent with previous logic
                                                            // that assumed "55" might be there.

                                                            // Wait, if I store "5583999999999" then my display logic above needs to handle it.
                                                            // YES, the display logic above `v.startsWith("55")` handles it.

                                                            if (raw.length > 0) {
                                                                field.onChange(`55${raw}`);
                                                            } else {
                                                                field.onChange("");
                                                            }
                                                        }}
                                                    />
                                                </div>
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
                                        <FormDescription>
                                            Digite apenas o DDD e o número (ex: 83 9 9999-9999)
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* SUBDOMINIO */}
                            <FormField
                                control={form.control}
                                name="subdomain"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Link da Loja (Subdomínio)</FormLabel>
                                        <div className="relative">
                                            <FormControl>
                                                <Input
                                                    value={field.value ? `https://${field.value}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rmenu.com'}` : ''}
                                                    readOnly
                                                    className="bg-muted pl-10"
                                                />
                                            </FormControl>
                                            <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                                        </div>
                                        <FormDescription>
                                            Para alterar o endereço da sua loja, entre em contato com o suporte.
                                        </FormDescription>
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

                    {/* PAGAMENTO (PIX) */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle>Pagamento (PIX)</CardTitle>
                            <NextImage
                                src="/icons/pix.svg"
                                alt="PIX"
                                width={24}
                                height={24}
                                className="opacity-80"
                            />
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <FormField
                                    control={form.control}
                                    name="pix_key_type"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tipo de Chave</FormLabel>
                                            <Select
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    // Optional: Clear or reformat key when type changes
                                                    const currentKey = form.getValues("pix_key");
                                                    if (currentKey) {
                                                        form.setValue("pix_key", formatPixKey(currentKey, value));
                                                    }
                                                }}
                                                defaultValue={field.value || undefined}
                                                value={field.value || undefined}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione o tipo" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="cpf">CPF</SelectItem>
                                                    <SelectItem value="cnpj">CNPJ</SelectItem>
                                                    <SelectItem value="email">E-mail</SelectItem>
                                                    <SelectItem value="phone">Telefone</SelectItem>
                                                    <SelectItem value="random">Chave Aleatória</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="pix_key"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Chave PIX</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder="Sua chave PIX aqui"
                                                    value={field.value || ""}
                                                    onChange={(e) => {
                                                        const type = form.getValues("pix_key_type");
                                                        const formatted = formatPixKey(e.target.value, type);
                                                        field.onChange(formatted);
                                                    }}
                                                    maxLength={
                                                        form.getValues("pix_key_type") === 'cpf' ? 14 :
                                                            form.getValues("pix_key_type") === 'cnpj' ? 18 :
                                                                form.getValues("pix_key_type") === 'phone' ? 15 : undefined
                                                    }
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Esta chave será enviada para o cliente no WhatsApp.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* MODO MESA */}
                    {tableModeAvailable && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="flex items-center gap-2">
                                    <UtensilsCrossed className="h-5 w-5" />
                                    Modo Mesa
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="table_mode_enabled"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base">Ativar Modo Mesa</FormLabel>
                                                <FormDescription>
                                                    Permite que clientes façam pedidos diretamente da mesa.
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                {form.watch('table_mode_enabled') && (
                                    <FormField
                                        control={form.control}
                                        name="table_count"
                                        render={({ field }) => (
                                            <FormItem className="animate-in fade-in slide-in-from-top-2">
                                                <FormLabel>Quantidade de Mesas</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="1" max="200" {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    Número total de mesas do seu restaurante.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex flex-col gap-4">
                        {/* Summary of Errors */}
                        {Object.keys(form.formState.errors).length > 0 && (
                            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-sm text-destructive space-y-2">
                                <div className="flex items-center gap-2 font-medium">
                                    <AlertCircle className="h-4 w-4" />
                                    <p>Não foi possível salvar. Verifique os erros abaixo:</p>
                                </div>
                                <ul className="list-disc pl-5 space-y-1">
                                    {Object.entries(form.formState.errors).map(([key, error]) => (
                                        <li key={key}>
                                            {key === 'name' && <strong>Nome da Loja: </strong>}
                                            {key === 'whatsapp' && <strong>WhatsApp: </strong>}
                                            {key === 'minimum_order' && <strong>Pedido Mínimo: </strong>}
                                            {key === 'subdomain' && <strong>Link da Loja: </strong>}
                                            {key === 'pix_key' && <strong>Chave PIX: </strong>}
                                            {key === 'pix_key_type' && <strong>Tipo de Chave PIX: </strong>}
                                            {(error as any)?.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

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
