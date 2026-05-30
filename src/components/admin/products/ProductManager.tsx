"use client";

import { useState } from "react";
import { Product } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, Package, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

import { toggleProductAvailabilityAsProxy, deleteProductAsProxy, duplicateProductAsProxy } from "@/actions/admin/proxy-products";

// Extended type for Join
export interface ProductWithCategory extends Product {
    categories?: {
        name: string;
    };
}

interface ProductManagerProps {
    initialProducts: ProductWithCategory[];
    storeId: string;
    isImpersonating?: boolean;
    basePath: string;
}

export function ProductManager({ initialProducts, storeId, isImpersonating = false, basePath }: ProductManagerProps) {
    const [products, setProducts] = useState<ProductWithCategory[]>(initialProducts);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

    const supabase = createClient();

    // Duplicate Handler
    const handleDuplicate = async (product: ProductWithCategory) => {
        setDuplicatingId(product.id);
        const toastId = toast.loading("Duplicando produto...");

        try {
            if (isImpersonating) {
                // Duplicar via Proxy Action (Super Admin)
                const result = await duplicateProductAsProxy(storeId, product.id);
                
                if (result.success && result.duplicatedProduct) {
                    const newProdWithCat: ProductWithCategory = {
                        ...result.duplicatedProduct,
                        categories: product.categories
                    };
                    setProducts(prev => [newProdWithCat, ...prev]);
                    toast.success("Produto duplicado com sucesso!", { id: toastId });
                } else {
                    throw new Error("Falha ao duplicar produto");
                }
            } else {
                // Client-side execution (RLS)
                // 1. Buscar produto completo com grupos, opções e regras de tamanho
                const { data: fullProduct, error: fetchError } = await supabase
                    .from("products")
                    .select(`
                        *,
                        option_groups:product_option_groups(
                            *,
                            options:product_options(*),
                            size_rules:group_size_rules!group_size_rules_group_id_fkey(*)
                        )
                    `)
                    .eq("id", product.id)
                    .single();

                if (fetchError || !fullProduct) {
                    throw new Error(fetchError?.message || "Produto não encontrado");
                }

                // 2. Inserir novo produto
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Usuário não autenticado");

                const newProductData = {
                    store_id: user.id,
                    name: `${fullProduct.name} (Cópia)`,
                    description: fullProduct.description,
                    price: fullProduct.price,
                    category_id: fullProduct.category_id,
                    is_available: fullProduct.is_available,
                    allows_half_half: fullProduct.allows_half_half,
                    image_url: fullProduct.image_url,
                    additional_images: fullProduct.additional_images || [],
                    sort_order: fullProduct.sort_order,
                };

                const { data: newProduct, error: insertError } = await supabase
                    .from("products")
                    .insert(newProductData)
                    .select()
                    .single();

                if (insertError || !newProduct) throw insertError;

                const groupMap: Record<string, string> = {};
                const optionMap: Record<string, string> = {};

                // 3. Duplicar grupos de opções e opções
                if (fullProduct.option_groups && fullProduct.option_groups.length > 0) {
                    for (const group of fullProduct.option_groups) {
                        const { data: newGroup, error: groupInsertError } = await supabase
                            .from("product_option_groups")
                            .insert({
                                product_id: newProduct.id,
                                title: group.title,
                                is_required: group.is_required,
                                max_select: group.max_select,
                                pricing_mode: group.pricing_mode,
                                sort_order: group.sort_order
                            })
                            .select()
                            .single();

                        if (groupInsertError || !newGroup) throw groupInsertError;
                        groupMap[group.id] = newGroup.id;

                        if (group.options && group.options.length > 0) {
                            for (const option of group.options) {
                                const { data: newOption, error: optionInsertError } = await supabase
                                    .from("product_options")
                                    .insert({
                                        group_id: newGroup.id,
                                        name: option.name,
                                        price: option.price,
                                        sort_order: option.sort_order,
                                        is_available: option.is_available,
                                        image_url: option.image_url
                                    })
                                    .select()
                                    .single();

                                if (optionInsertError || !newOption) throw optionInsertError;
                                optionMap[option.id] = newOption.id;
                            }
                        }
                    }

                    // 4. Duplicar regras de tamanho
                    for (const group of fullProduct.option_groups) {
                        if (group.size_rules && group.size_rules.length > 0) {
                            for (const rule of group.size_rules) {
                                const newGroupId = groupMap[rule.group_id];
                                const newSourceGroupId = groupMap[rule.source_group_id];
                                const newSizeOptionId = optionMap[rule.size_option_id];

                                if (newGroupId && newSourceGroupId && newSizeOptionId) {
                                    const { error: ruleInsertError } = await supabase
                                        .from("group_size_rules")
                                        .insert({
                                            group_id: newGroupId,
                                            source_group_id: newSourceGroupId,
                                            size_option_id: newSizeOptionId,
                                            max_select: rule.max_select
                                        });

                                    if (ruleInsertError) throw ruleInsertError;
                                }
                            }
                        }
                    }
                }

                const newProdWithCat: ProductWithCategory = {
                    ...newProduct,
                    categories: product.categories
                };
                setProducts(prev => [newProdWithCat, ...prev]);
                toast.success("Produto duplicado com sucesso!", { id: toastId });
            }
        } catch (error: any) {
            console.error("Erro ao duplicar produto:", error);
            toast.error(error.message || "Erro ao duplicar produto", { id: toastId });
        } finally {
            setDuplicatingId(null);
        }
    };

    // Toggle Availability
    const toggleAvailability = async (product: ProductWithCategory) => {
        const previousProducts = [...products];
        const newStatus = !product.is_available;

        // Optimistic
        setProducts(products.map(p => p.id === product.id ? { ...p, is_available: newStatus } : p));

        try {
            if (isImpersonating) {
                // Via Proxy Action (Super Admin)
                await toggleProductAvailabilityAsProxy(storeId, product.id, newStatus);
            } else {
                // Client-side execution (RLS takes care of it)
                const { error } = await supabase
                    .from("products")
                    .update({ is_available: newStatus })
                    .eq("id", product.id);

                if (error) throw error;
            }
            toast.success(`Fazendo: Produto ${newStatus ? "disponível" : "indisponível"}`);
        } catch (error: any) {
            console.error("Erro ao atualizar status:", error);
            toast.error(error.message || "Erro ao atualizar status");
            setProducts(previousProducts);
        }
    };

    // Delete Handler
    const confirmDelete = async () => {
        if (!deleteId) return;

        const previousProducts = [...products];
        const idToDelete = deleteId;
        // Optimistic
        setProducts(products.filter(p => p.id !== idToDelete));
        setDeleteId(null);

        try {
            if (isImpersonating) {
                // Via Proxy Action (Super Admin)
                await deleteProductAsProxy(storeId, idToDelete);
            } else {
                const { error, data } = await supabase
                    .from("products")
                    .delete()
                    .eq("id", idToDelete)
                    .select("id");

                if (error) throw error;

                if (!data || data.length === 0) {
                    throw new Error("Permissão negada ou erro ao excluir (RLS)");
                }
            }

            toast.success("Produto excluído com sucesso!");
        } catch (error: any) {
            console.error("Erro ao excluir:", error);
            toast.error(error.message || "Erro ao excluir produto");
            setProducts(previousProducts);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
                <Link href={`${basePath}/produtos/novo`}>
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Produto
                    </Button>
                </Link>
            </div>

            <div className="border rounded-lg bg-card">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[80px]">Imagem</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Nome</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Categoria</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Preço</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Disponível</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                        Nenhum produto encontrado
                                    </td>
                                </tr>
                            ) : (
                                products.map((product) => (
                                    <tr key={product.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle">
                                            {product.image_url ? (
                                                <div className="relative h-12 w-12 overflow-hidden rounded-md border bg-muted">
                                                    <Image
                                                        src={product.image_url}
                                                        alt={product.name}
                                                        fill
                                                        className="object-cover"
                                                        sizes="48px"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center border">
                                                    <Package className="h-6 w-6 text-muted-foreground/50" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle font-medium">
                                            {product.name}
                                        </td>
                                        <td className="p-4 align-middle text-muted-foreground">
                                            {product.categories?.name || "Sem Categoria"}
                                        </td>
                                        <td className="p-4 align-middle">
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.price)}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <Switch
                                                checked={product.is_available}
                                                onCheckedChange={() => toggleAvailability(product)}
                                            />
                                        </td>
                                        <td className="p-4 align-middle text-right gap-2 flex justify-end items-center h-[80px]">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDuplicate(product)}
                                                disabled={duplicatingId !== null}
                                                title="Duplicar Produto"
                                            >
                                                {duplicatingId === product.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                ) : (
                                                    <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                                )}
                                            </Button>
                                            <Link href={`${basePath}/produtos/${product.id}`}>
                                                <Button variant="ghost" size="icon" disabled={duplicatingId !== null}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteId(product.id)}
                                                disabled={duplicatingId !== null}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Excluir Produto?</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-muted-foreground">
                        Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setDeleteId(null)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
