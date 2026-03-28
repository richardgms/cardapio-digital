"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { StoreConfig } from "@/types/database";
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
import { Loader2, Lock, AlertCircle, UtensilsCrossed } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateStoreConfigAsProxy } from "@/actions/admin/proxy-config";

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
    if (!data.pix_key) return;
    
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
        if (data.pix_key.length < 20) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Chave aleatória parece muito curta (mínimo 20 caracteres)",
                path: ["pix_key"],
            });
        }
    }

    if (data.pix_key_type === 'cpf') {
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

interface ConfigManagerProps {
    initialData: StoreConfig;
    storeId: string;
    isImpersonating?: boolean;
    tableModeAvailable: boolean;
}

export function ConfigManager({ initialData, storeId, isImpersonating = false, tableModeAvailable }: ConfigManagerProps) {
    const supabase = createClient();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            name: initialData.name || "",
            whatsapp: initialData.whatsapp || "",
            minimum_order: initialData.minimum_order || 0,
            logo_url: initialData.logo_url,
            admin_email: initialData.admin_email || "",
            subdomain: initialData.subdomain || "",
            pix_key_type: initialData.pix_key_type as any || null,
            pix_key: initialData.pix_key || "",
            table_mode_enabled: initialData.table_mode_enabled || false,
            table_count: initialData.table_count || 10,
        },
    });

    const watchedName = useWatch({ control: form.control, name: "name" });
    const watchedWhatsapp = useWatch({ control: form.control, name: "whatsapp" });

    const formatPixKey = (value: string, type: string | null | undefined) => {
        if (!value) return "";

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
            if (clean.length > 10) {
                return clean
                    .replace(/^(\d{2})(\d)/, '($1) $2')
                    .replace(/(\d{5})(\d)/, '$1-$2')
                    .replace(/(-\d{4})\d+?$/, '$1');
            }
            return clean
                .replace(/^(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2')
                .replace(/(-\d{4})\d+?$/, '$1');
        }

        return value;
    };

    const handleTestWhatsapp = () => {
        if (!watchedWhatsapp) return;
        const link = `https://wa.me/${watchedWhatsapp}?text=Teste de configuração do cardápio`;
        window.open(link, '_blank');
    };

    const onSubmit = async (values: FormValues) => {
        try {
            if (isImpersonating) {
                await updateStoreConfigAsProxy(storeId, values);
            } else {
                const { error } = await supabase
                    .from("store_config")
                    .upsert({
                        id: storeId,
                        ...values,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' })

                if (error) throw error;
            }

            toast.success("Configurações salvas com sucesso!");
            form.reset(values);
        } catch (error) {
            console.error("Erro ao salvar:", error);
            toast.error("Erro ao salvar. Tente novamente.");
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Dados do Restaurante</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">

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
                                                        let v = field.value || "";
                                                        v = v.replace(/\D/g, "");
                                                        if (v.startsWith("55") && v.length > 11) {
                                                            v = v.substring(2);
                                                        }
                                                        v = v.slice(0, 11);
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
                                                        let raw = e.target.value.replace(/\D/g, "");
                                                        if (raw.startsWith("55") && raw.length > 11) {
                                                            raw = raw.substring(2);
                                                        }
                                                        raw = raw.slice(0, 11);
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
                    {Object.keys(form.formState.errors).length > 0 && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-sm text-destructive space-y-2">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                <p>Não foi possível salvar. Verifique os erros abaixo:</p>
                            </div>
                            <ul className="list-disc pl-5 space-y-1">
                                {Object.entries(form.formState.errors).map(([key, error]) => (
                                    <li key={key}>
                                        {(error as any)?.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {form.formState.isDirty && (
                        <div className="text-foreground text-sm font-medium text-center bg-accent/30 p-2 rounded-md border border-border">
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
    );
}
