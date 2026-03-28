"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Control, useWatch, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { Category } from "@/types/database";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Trash2, Plus, GripVertical, SlidersHorizontal, Package } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { SizeRulesModal } from "@/components/admin/SizeRulesModal";
import { ReorderGroupsModal } from "@/components/admin/ReorderGroupsModal";
import { saveProductAsProxy } from "@/actions/admin/proxy-products";

// --- Schema ---
const optionSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Nome da opção é obrigatório"),
    price: z.coerce.number().min(0, "Preço inválido"),
    is_available: z.boolean().default(true),
});

const optionGroupSchema = z.object({
    id: z.string().optional(),
    title: z.string().min(1, "Nome do grupo é obrigatório"),
    is_required: z.boolean().default(false),
    max_select: z.coerce.number().min(0, "Mínimo 0"),
    pricing_mode: z.enum(['addon', 'replacement']).default('addon'),
    options: z.array(optionSchema),
});

const MAX_ADDITIONAL_IMAGES = 4;

const formSchema = z.object({
    name: z.string().min(3, "Mínimo 3 caracteres"),
    description: z.string().optional(),
    price: z.coerce.number().min(0, "Preço inválido"),
    category_id: z.string().min(1, "Selecione uma categoria"),
    is_available: z.boolean().default(true),
    allows_half_half: z.boolean().default(false),
    image_url: z.string().nullable().optional(),
    additional_images: z.array(z.string()).max(MAX_ADDITIONAL_IMAGES).optional(),
    option_groups: z.array(optionGroupSchema),
});

type FormValues = z.infer<typeof formSchema>;

// --- Sub-components ---

const OptionItemSwitch = ({ control, nestIndex, k }: { control: Control<FormValues>, nestIndex: number, k: number }) => {
    const [openAlert, setOpenAlert] = useState(false);
    const optionName = useWatch({ control, name: `option_groups.${nestIndex}.options.${k}.name` });

    return (
        <FormField
            control={control}
            name={`option_groups.${nestIndex}.options.${k}.is_available`}
            render={({ field }) => (
                <FormItem className="flex items-center shrink-0 space-y-0">
                    <FormControl>
                        <div className="flex items-center">
                            <Switch
                                checked={field.value}
                                onCheckedChange={(checked) => {
                                    if (!checked) {
                                        setOpenAlert(true);
                                    } else {
                                        field.onChange(true);
                                    }
                                }}
                            />
                            <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Desativar Opção?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tem certeza que deseja marcar a opção "{optionName || 'sem nome'}" como indisponível? Ela não aparecerá mais no cardápio para os clientes.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => {
                                            field.onChange(false);
                                            setOpenAlert(false);
                                        }}>Confirmar</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </FormControl>
                </FormItem>
            )}
        />
    );
};

const OptionsList = ({ nestIndex, control, pricingMode }: { nestIndex: number; control: Control<FormValues>; pricingMode: 'addon' | 'replacement' }) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `option_groups.${nestIndex}.options`,
    });

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                {fields.map((item, k) => (
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 sm:p-0 border sm:border-transparent rounded-lg sm:rounded-none bg-muted/10 sm:bg-transparent">
                        <FormField
                            control={control}
                            name={`option_groups.${nestIndex}.options.${k}.name`}
                            render={({ field }) => (
                                <FormItem className="w-full sm:flex-1">
                                    <FormControl>
                                        <Input placeholder="Nome da opção" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="flex items-start gap-3 justify-between sm:justify-start w-full sm:w-auto">
                            <FormField
                                control={control}
                                name={`option_groups.${nestIndex}.options.${k}.price`}
                                render={({ field }) => (
                                    <FormItem className="flex-1 sm:w-32">
                                        <FormControl>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-3 text-muted-foreground text-sm">
                                                    {pricingMode === 'replacement' ? 'R$' : 'R$ +'}
                                                </span>
                                                <Input type="number" className="pl-10 text-right" placeholder="0.00" {...field} />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex items-center gap-2 shrink-0 h-10">
                                <OptionItemSwitch control={control} nestIndex={nestIndex} k={k} />
                                <Button type="button" variant="ghost" size="icon" onClick={() => remove(k)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ name: "", price: 0, is_available: true })}
            >
                <Plus className="mr-2 h-3 w-3" />
                Adicionar Opção
            </Button>
        </div>
    );
};

interface ReplacementGroupForModal {
    id: string
    title: string
    options: Array<{ id: string; name: string; is_available?: boolean }>
}

interface GroupCardProps {
    index: number;
    control: Control<FormValues>;
    form: UseFormReturn<FormValues>;
    onRemove: () => void;
    replacementGroups: ReplacementGroupForModal[];
}

const GroupCard = ({ index, control, form, onRemove, replacementGroups }: GroupCardProps) => {
    const currentPricingMode = useWatch({ control, name: `option_groups.${index}.pricing_mode` }) ?? 'addon';
    const groupDbId = useWatch({ control, name: `option_groups.${index}.id` })
    const groupTitle = useWatch({ control, name: `option_groups.${index}.title` })
    const groupMaxSelect = useWatch({ control, name: `option_groups.${index}.max_select` })
    const [openSizeRules, setOpenSizeRules] = useState(false)

    const showSizeRulesButton =
        currentPricingMode === 'addon' &&
        !!groupDbId &&
        replacementGroups.some(g => g.options.length > 0)

    return (
        <>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">
                    Grupo de Opções #{index + 1}
                </CardTitle>
                <div className="flex items-center gap-2">
                    {showSizeRulesButton && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setOpenSizeRules(true)}>
                            <SlidersHorizontal className="h-4 w-4 mr-1" />
                            Regras por tamanho
                        </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={control}
                        name={`option_groups.${index}.title`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Título do Grupo</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Borda, Tamanho, Adicionais" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name={`option_groups.${index}.max_select`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Máximo de Seleções <span className="text-xs text-muted-foreground font-normal">(0 = ilimitado)</span></FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={0}
                                        {...field}
                                        disabled={currentPricingMode === 'replacement'}
                                        className={currentPricingMode === 'replacement' ? 'opacity-50' : ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                        <FormLabel className="text-base">Obrigatório</FormLabel>
                    </div>
                    <FormControl>
                        <FormField
                            control={control}
                            name={`option_groups.${index}.is_required`}
                            render={({ field }) => (
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            )}
                        />
                    </FormControl>
                </div>

                <FormField
                    control={control}
                    name={`option_groups.${index}.pricing_mode`}
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Tipo de Preço</FormLabel>
                                    <FormDescription>
                                        {currentPricingMode === 'replacement'
                                            ? 'Cada opção define o preço total (ex: tamanhos P/M/G)'
                                            : 'Cada opção soma ao preço base do produto'
                                        }
                                    </FormDescription>
                                </div>
                                <Select
                                    value={field.value}
                                    onValueChange={(val) => {
                                        field.onChange(val)
                                        if (val === 'replacement') {
                                            form.setValue(`option_groups.${index}.max_select`, 1)
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-36">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="addon">Adicional</SelectItem>
                                        <SelectItem value="replacement">Tamanho</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="pl-4 border-l-2">
                    <h4 className="text-sm font-medium mb-3">Opções</h4>
                    <OptionsList nestIndex={index} control={control} pricingMode={currentPricingMode} />
                </div>
            </CardContent>
        </Card>
        {showSizeRulesButton && groupDbId && (
            <SizeRulesModal
                open={openSizeRules}
                onOpenChange={setOpenSizeRules}
                group={{ id: groupDbId, title: groupTitle || "", max_select: groupMaxSelect ?? 1 }}
                replacementGroups={replacementGroups}
            />
        )}
        </>
    );
};

const PriceField = ({ control }: { control: Control<FormValues> }) => {
    const groups = useWatch({ control, name: 'option_groups' });
    const hasReplacement = groups?.some((g: any) => g.pricing_mode === 'replacement') ?? false;

    return (
        <FormField
            control={control}
            name="price"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Preço Base (R$)</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="0.01"
                            {...field}
                            disabled={hasReplacement}
                            className={hasReplacement ? 'opacity-50' : ''}
                        />
                    </FormControl>
                    {hasReplacement && (
                        <FormDescription className="text-muted-foreground">
                            Ignorado — o preço é definido pelas opções de tamanho
                        </FormDescription>
                    )}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
};

// --- Exported Component ---

interface ProductFormProps {
    productId: string;
    isImpersonating?: boolean;
    storeId?: string;
}

export function ProductForm({ productId, isImpersonating = false, storeId }: ProductFormProps) {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
    const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
    const [reorderGroupsOpen, setReorderGroupsOpen] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            name: "",
            description: "",
            price: 0,
            category_id: "",
            is_available: true,
            allows_half_half: false,
            image_url: null,
            additional_images: [],
            option_groups: [],
        },
    });

    const { fields: groupFields, append: appendGroup, remove: removeGroup } = useFieldArray({
        control: form.control,
        name: "option_groups",
    });

    const watchedGroups = form.watch("option_groups");
    const replacementGroupsForModal: ReplacementGroupForModal[] = (watchedGroups ?? [])
        .filter((g: any) => g.pricing_mode === 'replacement' && g.id)
        .map((g: any) => ({
            id: g.id as string,
            title: g.title || "",
            options: (g.options || [])
                .filter((o: any) => o.id)
                .map((o: any) => ({ id: o.id as string, name: o.name || "", is_available: o.is_available })),
        }));

    const handleGroupsReordered = (newOrderedIds: string[]) => {
        const currentGroups = form.getValues("option_groups");
        const reordered = newOrderedIds
            .map(id => currentGroups.find((g: any) => g.id === id))
            .filter(Boolean) as typeof currentGroups;
        const unsaved = currentGroups.filter((g: any) => !g.id);
        form.setValue("option_groups", [...reordered, ...unsaved]);
    };

    const handleRemoveGroup = async (index: number) => {
        const group = form.getValues(`option_groups.${index}`);
        if (group.pricing_mode !== 'replacement' || !group.id) {
            removeGroup(index);
            return;
        }
        const { count, error } = await supabase
            .from("group_size_rules")
            .select("*", { count: "exact", head: true })
            .eq("source_group_id", group.id);
        if (!error && count && count > 0) {
            setPendingDeleteIndex(index);
            setDeleteAlertOpen(true);
        } else {
            removeGroup(index);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                let currentStoreId = storeId;
                
                if (!currentStoreId) {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;
                    currentStoreId = user.id;
                }

                const { data: catsData } = await supabase
                    .from("categories")
                    .select("*")
                    .eq('store_id', currentStoreId)
                    .order("sort_order");
                setCategories(catsData || []);

                if (productId !== "novo") {
                    const { data: product, error: prodError } = await supabase
                        .from("products")
                        .select("*")
                        .eq("id", productId)
                        .single();

                    if (prodError) throw prodError;

                    const { data: groups, error: groupsError } = await supabase
                        .from("product_option_groups")
                        .select(`*, options:product_options(*)`)
                        .eq("product_id", productId)
                        .order("sort_order");

                    if (groupsError) throw groupsError;

                    const formattedGroups = (groups?.map(g => ({
                        id: g.id,
                        title: g.title,
                        is_required: g.is_required,
                        max_select: g.max_select,
                        pricing_mode: (g.pricing_mode ?? 'addon') as 'addon' | 'replacement',
                        options: g.options?.sort((a: any, b: any) => a.sort_order - b.sort_order).map((o: any) => ({
                            id: o.id,
                            name: o.name,
                            price: o.price,
                            is_available: o.is_available ?? true
                        })) || []
                    })) || []).sort((a, b) => {
                        const aR = a.pricing_mode === 'replacement' ? -1 : 1
                        const bR = b.pricing_mode === 'replacement' ? -1 : 1
                        return aR - bR
                    });

                    form.reset({
                        name: product.name,
                        description: product.description || "",
                        price: product.price,
                        category_id: product.category_id,
                        is_available: product.is_available,
                        allows_half_half: product.allows_half_half,
                        image_url: product.image_url,
                        additional_images: (product.additional_images || []).filter(Boolean),
                        option_groups: formattedGroups,
                    });
                }
            } catch (error) {
                console.error("Erro ao carregar dados:", error);
                toast.error("Erro ao carregar dados do produto");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [productId, supabase, form, storeId]);

    const onSubmit = async (values: FormValues) => {
        setIsSaving(true);
        // DIAGNÓSTICO TEMPORÁRIO — remover após identificar o bug
        const debugInfo = values.option_groups.flatMap((g: any) =>
            (g.options || []).map((o: any) => `${o.name}=${o.is_available}`)
        ).join(' | ');
        toast.info(`[DEBUG] ${debugInfo}`, { duration: 10000 });
        try {
            if (isImpersonating && storeId) {
                // Modo simulador (Super Admin)
                const result = await saveProductAsProxy(storeId, productId, values);
                if ((result as any)._debug) {
                    toast.info(`[DB após save] ${(result as any)._debug}`, { duration: 15000 });
                }
            } else {
                // Modo lojista (RLS)
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Usuário não autenticado");

                const productData = {
                    store_id: user.id,
                    name: values.name,
                    description: values.description,
                    price: values.price,
                    category_id: values.category_id,
                    is_available: values.is_available,
                    allows_half_half: values.allows_half_half,
                    image_url: values.image_url,
                    additional_images: (values.additional_images || []).filter(Boolean),
                };

                let targetId = productId;
                if (targetId === "novo") {
                    const { data, error } = await supabase
                        .from("products")
                        .insert(productData)
                        .select()
                        .single();
                    if (error) throw error;
                    targetId = data.id;
                } else {
                    const { error } = await supabase
                        .from("products")
                        .update(productData)
                        .eq("id", targetId);
                    if (error) throw error;
                }

                // Sincronizar grupos e opções via Supabase client (RLS)
                const { data: rawGroups, error: fetchError } = await supabase
                    .from("product_option_groups")
                    .select("id, options:product_options(id)")
                    .eq("product_id", targetId);

                if (fetchError) throw fetchError;

                const existingGroups = (rawGroups || []) as { id: string, options: { id: string }[] }[];

                const formGroupIds = new Set(values.option_groups?.map((g: any) => g.id).filter(Boolean));
                const formOptionIds = new Set(
                    values.option_groups?.flatMap((g: any) => g.options.map((o: any) => o.id)).filter(Boolean)
                );

                const groupsToDelete = existingGroups.filter(g => !formGroupIds.has(g.id)).map(g => g.id);
                const allExistingOptionIds = existingGroups.flatMap(g => g.options?.map(o => o.id) || []);
                const optionsToDelete = (allExistingOptionIds as string[]).filter((id: string) => !formOptionIds.has(id));

                if (optionsToDelete.length > 0) {
                    await supabase.from("product_options").delete().in("id", optionsToDelete);
                }

                if (groupsToDelete.length > 0) {
                    await supabase.from("product_option_groups").delete().in("id", groupsToDelete);
                }

                if (values.option_groups) {
                    for (const [gIndex, group] of (values.option_groups as any[]).entries()) {
                        const groupData = {
                            product_id: targetId,
                            title: group.title,
                            is_required: group.is_required,
                            max_select: group.pricing_mode === 'replacement' ? 1 : group.max_select,
                            pricing_mode: group.pricing_mode,
                            sort_order: gIndex,
                        };

                        let groupId = group.id;

                        if (groupId) {
                            const { error: ugError } = await supabase.from("product_option_groups").update(groupData).eq("id", groupId);
                            if (ugError) throw ugError;
                        } else {
                            const { data: newGroup, error: igError } = await supabase
                                .from("product_option_groups")
                                .insert(groupData)
                                .select()
                                .single();
                            if (igError) throw igError;
                            groupId = newGroup?.id;
                        }

                        if (!groupId) continue;

                        if (group.options) {
                            const sortedOptions = [...group.options].sort((a: any, b: any) => {
                                const priceDiff = (a.price || 0) - (b.price || 0);
                                if (priceDiff !== 0) return priceDiff;
                                return a.name.localeCompare(b.name, 'pt-BR');
                            });

                            for (const [oIndex, option] of sortedOptions.entries()) {
                                const optionData = {
                                    group_id: groupId,
                                    name: option.name,
                                    price: option.price,
                                    sort_order: oIndex,
                                    is_available: option.is_available !== false,
                                };

                                if (option.id) {
                                    const { error: uoError } = await supabase.from("product_options").update(optionData).eq("id", option.id);
                                    if (uoError) throw uoError;
                                } else {
                                    const { error: ioError } = await supabase.from("product_options").insert(optionData);
                                    if (ioError) throw ioError;
                                }
                            }
                        }
                    }
                }
            }

            toast.success("Produto salvo com sucesso!");
            if (isImpersonating) {
                router.push(`/admin/super/lojista/${storeId}/produtos`);
            } else {
                router.push("/admin/produtos");
            }
            router.refresh();
        } catch (error: any) {
            console.error("Erro ao salvar:", error);
            toast.error(`Erro ao salvar produto: ${error.message || "Erro desconhecido"}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-[500px] w-full" />
        </div>;
    }

    return (
        <>
        <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir grupo com regras ativas?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Este grupo possui regras de tamanho configuradas. Excluir irá apagar todas as regras associadas. Deseja continuar?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPendingDeleteIndex(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => {
                            if (pendingDeleteIndex !== null) removeGroup(pendingDeleteIndex);
                            setPendingDeleteIndex(null);
                            setDeleteAlertOpen(false);
                        }}
                    >
                        Excluir mesmo assim
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="space-y-6 max-w-4xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: isImpersonating ? "Dashboard (Super)" : "Dashboard", href: isImpersonating ? "/admin/super" : "/admin" },
                { label: isImpersonating ? "Simulador" : "Produtos", href: isImpersonating ? `/admin/super/lojista/${storeId}/produtos` : "/admin/produtos" },
                { label: productId === "novo" ? "Novo Produto" : "Editar Produto" }
            ]} />
            
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">
                    {productId === "novo" ? "Novo Produto" : "Editar Produto"}
                </h1>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Informações Básicas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="image_url"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Imagem Principal</FormLabel>
                                        <FormControl>
                                            <ImageUpload
                                                value={field.value}
                                                onChange={field.onChange}
                                                disabled={isSaving}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="additional_images"
                                render={({ field }) => {
                                    const images = field.value || [];
                                    const canAddMore = images.length < MAX_ADDITIONAL_IMAGES;
                                    return (
                                        <FormItem>
                                            <FormLabel>Galeria <span className="text-xs font-normal text-muted-foreground">(Máx {MAX_ADDITIONAL_IMAGES})</span></FormLabel>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {images.map((url, i) => (
                                                    <ImageUpload key={i} value={url} onChange={(val) => {
                                                        const next = [...images];
                                                        if (val) next[i] = val; else next.splice(i, 1);
                                                        field.onChange(next);
                                                    }} compact />
                                                ))}
                                                {canAddMore && <Button type="button" variant="outline" className="h-24 border-dashed" onClick={() => field.onChange([...images, null])}>+</Button>}
                                            </div>
                                        </FormItem>
                                    );
                                }}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nome</FormLabel>
                                            <Input placeholder="Ex: X-Bacon" {...field} />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <PriceField control={form.control} />
                            </div>

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição</FormLabel>
                                        <Textarea placeholder="Detalhes do produto..." {...field} />
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="category_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Categoria</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                            <SelectContent>
                                                {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel>Disponível</FormLabel>
                                    <FormDescription>Exibir no cardápio</FormDescription>
                                </div>
                                <FormField control={form.control} name="is_available" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Opções</h2>
                            <Button type="button" variant="outline" size="sm" onClick={() => appendGroup({ title: "", is_required: false, max_select: 1, pricing_mode: 'addon', options: [] })}>
                                <Plus className="mr-2 h-4 w-4" /> Novo Grupo
                            </Button>
                        </div>
                        {groupFields.map((f, i) => <GroupCard key={f.id} index={i} control={form.control} form={form} onRemove={() => handleRemoveGroup(i)} replacementGroups={replacementGroupsForModal} />)}
                    </div>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
                        <Button type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar"}</Button>
                    </div>
                </form>
            </Form>
        </div>
        </>
    );
}
