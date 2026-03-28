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
import { Trash2, Plus, Pencil, Package } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

import { toggleProductAvailabilityAsProxy, deleteProductAsProxy } from "@/actions/admin/proxy-products";

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

    const supabase = createClient();

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
                                            <Link href={`${basePath}/produtos/${product.id}`}>
                                                <Button variant="ghost" size="icon">
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteId(product.id)}
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
                        <Button variant="destructive" onClick={confirmDelete} className="text-white font-bold">
                            Excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
