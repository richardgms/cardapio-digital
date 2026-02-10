"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { Category, Product, ProductOptionGroup, ProductOption } from "@/types/database";

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
import { Trash2, Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/admin/Breadcrumb";

// --- Schema ---
const optionSchema = z.object({
    id: z.string().optional(), // For editing
    name: z.string().min(1, "Nome da opção é obrigatório"),
    price: z.coerce.number().min(0, "Preço inválido"),
});

const optionGroupSchema = z.object({
    id: z.string().optional(), // For editing
    title: z.string().min(1, "Nome do grupo é obrigatório"),
    is_required: z.boolean().default(false),
    max_select: z.coerce.number().min(1, "Mínimo 1"),
    options: z.array(optionSchema),
});

const formSchema = z.object({
    name: z.string().min(3, "Mínimo 3 caracteres"),
    description: z.string().optional(),
    price: z.coerce.number().min(0, "Preço inválido"),
    category_id: z.string().min(1, "Selecione uma categoria"),
    is_available: z.boolean().default(true),
    allows_half_half: z.boolean().default(false),
    image_url: z.string().nullable().optional(),
    option_groups: z.array(optionGroupSchema),
});

type FormValues = z.infer<typeof formSchema>;

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProductFormPage({ params }: PageProps) {
    // Unwrap params in Next.js 15
    const [unwrappedParams, setUnwrappedParams] = useState<{ id: string } | null>(null);

    const router = useRouter();
    const supabase = createClient();

    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Initial State Check
    useEffect(() => {
        params.then(setUnwrappedParams);
    }, [params]);

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
            option_groups: [],
        },
    });

    const { fields: groupFields, append: appendGroup, remove: removeGroup } = useFieldArray({
        control: form.control,
        name: "option_groups",
    });

    // Fetch Data
    useEffect(() => {
        if (!unwrappedParams) return;

        const fetchData = async () => {
            try {
                // 1. Fetch Categories
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return; // Should be handled by middleware

                const { data: catsData } = await supabase
                    .from("categories")
                    .select("*")
                    .eq('store_id', user.id) // FIX: Filter by store_id
                    .order("sort_order");
                setCategories(catsData || []);

                // 2. If Edit Mode, Fetch Product
                if (unwrappedParams.id !== "novo") {
                    // Fetch Product
                    const { data: product, error: prodError } = await supabase
                        .from("products")
                        .select("*")
                        .eq("id", unwrappedParams.id)
                        .single();

                    if (prodError) throw prodError;

                    // Fetch Option Groups & Options
                    const { data: groups, error: groupsError } = await supabase
                        .from("product_option_groups")
                        .select(`*, options:product_options(*)`)
                        .eq("product_id", unwrappedParams.id)
                        .order("sort_order");

                    if (groupsError) throw groupsError;

                    // Transform for Form
                    const formattedGroups = groups?.map(g => ({
                        id: g.id,
                        title: g.title,
                        is_required: g.is_required,
                        max_select: g.max_select,
                        options: g.options?.sort((a: any, b: any) => a.sort_order - b.sort_order).map((o: any) => ({
                            id: o.id,
                            name: o.name,
                            price: o.price
                        })) || []
                    })) || [];

                    form.reset({
                        name: product.name,
                        description: product.description || "",
                        price: product.price,
                        category_id: product.category_id,
                        is_available: product.is_available,
                        allows_half_half: product.allows_half_half,
                        image_url: product.image_url,
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
    }, [unwrappedParams, supabase, form]);

    const onSubmit = async (values: FormValues) => {
        if (!unwrappedParams) return;
        setIsSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // 1. Upsert Product
            const productData = {
                store_id: user.id, // Ensure ownership
                name: values.name,
                description: values.description,
                price: values.price,
                category_id: values.category_id,
                is_available: values.is_available,
                allows_half_half: values.allows_half_half,
                image_url: values.image_url,
            };

            let productId = unwrappedParams.id;

            if (productId === "novo") {
                // @ts-ignore
                const { data, error } = await supabase
                    .from("products")
                    .insert(productData)
                    .select()
                    .single();
                if (error) throw error;
                productId = data.id;
            } else {
                // @ts-ignore
                const { error } = await supabase
                    .from("products")
                    .update(productData)
                    .eq("id", productId);
                if (error) throw error;
            }

            // 2. Handle Option Groups & Options (Diff & Delete Strategy)

            // A. Fetch Existing Data to Determine Deletions
            // We need to fetch existing groups and options to know what to delete.
            // Using a join to get options for each group.
            const { data: existingGroups, error: fetchError } = await supabase
                .from("product_option_groups")
                .select("id, options:product_options(id)")
                .eq("product_id", productId);

            if (fetchError) throw fetchError;

            // B. Identify IDs in Form
            // Get all Group IDs present in the form submission
            const formGroupIds = new Set(values.option_groups?.map(g => g.id).filter(Boolean));
            // Get all Option IDs present in the form submission (across all groups)
            const formOptionIds = new Set(
                values.option_groups?.flatMap(g => g.options.map(o => o.id)).filter(Boolean)
            );

            // C. Determine Items to Delete
            // Groups to delete: present in DB but missing from Form
            const groupsToDelete = existingGroups?.filter(g => !formGroupIds.has(g.id)).map(g => g.id) || [];

            // Options to delete: present in DB but missing from Form
            // This covers options removed from a kept group AND options belonging to a removed group.
            const allExistingOptionIds = existingGroups?.flatMap(g => g.options?.map((o: any) => o.id)) || [];
            // @ts-ignore
            const optionsToDelete = allExistingOptionIds.filter((id: string) => !formOptionIds.has(id));

            // D. Execute Deletions
            // Delete options first to avoid FK constraints (though cascade might handle it, explicit is safer)
            if (optionsToDelete.length > 0) {
                const { error: delOptError } = await supabase
                    .from("product_options")
                    .delete()
                    .in("id", optionsToDelete);
                if (delOptError) throw delOptError;
            }

            // Delete groups next
            if (groupsToDelete.length > 0) {
                const { error: delGroupError } = await supabase
                    .from("product_option_groups")
                    .delete()
                    .in("id", groupsToDelete);
                if (delGroupError) throw delGroupError;
            }

            // E. Upsert Groups & Options
            if (values.option_groups) {
                for (const [gIndex, group] of values.option_groups.entries()) {
                    const groupData = {
                        product_id: productId,
                        title: group.title,
                        is_required: group.is_required,
                        max_select: group.max_select,
                        sort_order: gIndex,
                    };

                    let groupId = group.id;

                    // Upsert Group
                    if (groupId) {
                        // DEBUG: Log the group data being updated
                        console.log(`Updating group ${groupId}:`, groupData);

                        const { error: updateGroupError } = await supabase
                            .from("product_option_groups")
                            .update(groupData)
                            .eq("id", groupId);

                        if (updateGroupError) throw updateGroupError;
                    } else {
                        const { data: newGroup, error: insertGroupError } = await supabase
                            .from("product_option_groups")
                            .insert(groupData)
                            .select()
                            .single();
                        if (insertGroupError) throw insertGroupError;
                        groupId = newGroup?.id;
                    }

                    if (!groupId) continue;

                    // Upsert Options
                    if (group.options) {
                        for (const [oIndex, option] of group.options.entries()) {
                            const optionData = {
                                group_id: groupId,
                                name: option.name,
                                price: option.price,
                                sort_order: oIndex,
                            };

                            if (option.id) {
                                const { error: updateOptionError } = await supabase
                                    .from("product_options")
                                    .update(optionData)
                                    .eq("id", option.id);
                                if (updateOptionError) throw updateOptionError;
                            } else {
                                const { error: insertOptionError } = await supabase
                                    .from("product_options")
                                    .insert(optionData);
                                if (insertOptionError) throw insertOptionError;
                            }
                        }
                    }
                }
            }

            toast.success("Produto salvo com sucesso!");
            router.push("/admin/produtos");
            router.refresh();
        } catch (error) {
            console.error("Erro ao salvar:", JSON.stringify(error, null, 2));
            toast.error(`Erro ao salvar produto: ${(error as any).message || "Erro desconhecido"}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Nested Array Component (to avoid hook rules issues with recursion/nesting)
    const OptionsList = ({ nestIndex, control }: { nestIndex: number; control: Control<FormValues> }) => {
        const { fields, append, remove } = useFieldArray({
            control,
            name: `option_groups.${nestIndex}.options`,
        });

        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    {fields.map((item, k) => (
                        <div key={item.id} className="flex items-end gap-2">
                            <FormField
                                control={control}
                                name={`option_groups.${nestIndex}.options.${k}.name`}
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormControl>
                                            <Input placeholder="Nome da opção" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={control}
                                name={`option_groups.${nestIndex}.options.${k}.price`}
                                render={({ field }) => (
                                    <FormItem className="w-32">
                                        <FormControl>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-3 text-muted-foreground text-sm">R$ +</span>
                                                <Input type="number" className="pl-10 text-right" placeholder="0.00" {...field} />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(k)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: "", price: 0 })}
                >
                    <Plus className="mr-2 h-3 w-3" />
                    Adicionar Opção
                </Button>
            </div>
        );
    };

    if (isLoading || !unwrappedParams) {
        return <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-[500px] w-full" />
        </div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Produtos", href: "/admin/produtos" },
                { label: unwrappedParams.id === "novo" ? "Novo Produto" : "Editar Produto" }
            ]} />
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">
                    {unwrappedParams.id === "novo" ? "Novo Produto" : "Editar Produto"}
                </h1>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                    {/* Basic Info Card */}
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
                                        <FormLabel>Imagem do Produto</FormLabel>
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nome</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ex: X-Bacon" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="price"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Preço (R$)</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.01" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Ingredientes, detalhes..." {...field} />
                                        </FormControl>
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
                                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione uma categoria" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {categories.map((cat) => (
                                                    <SelectItem key={cat.id} value={cat.id}>
                                                        {cat.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Disponível</FormLabel>
                                    <FormDescription>
                                        Exibir este produto no cardápio
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <FormField
                                        control={form.control}
                                        name="is_available"
                                        render={({ field }) => (
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        )}
                                    />
                                </FormControl>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Permite Meio a Meio</FormLabel>
                                    <FormDescription>
                                        Cliente pode combinar com outro sabor (ex: pizzas)
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <FormField
                                        control={form.control}
                                        name="allows_half_half"
                                        render={({ field }) => (
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        )}
                                    />
                                </FormControl>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Option Groups */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Opções do Produto</h2>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => appendGroup({ title: "", is_required: false, max_select: 1, options: [] } as any)}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar Grupo
                            </Button>
                        </div>

                        {groupFields.map((field, index) => (
                            <Card key={field.id}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-base font-medium">
                                        Grupo de Opções #{index + 1}
                                    </CardTitle>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeGroup(index)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
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
                                            control={form.control}
                                            name={`option_groups.${index}.max_select`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Máximo de Seleções</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" min={1} {...field} />
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
                                                control={form.control}
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

                                    <div className="pl-4 border-l-2">
                                        <h4 className="text-sm font-medium mb-3">Opções</h4>
                                        <OptionsList nestIndex={index} control={form.control} />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" onClick={() => router.back()}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? "Salvando..." : "Salvar Produto"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
