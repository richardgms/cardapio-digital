"use client";

import { useEffect, useState } from "react";
import {
    fetchCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus,
    type CouponFormData,
} from "@/actions/admin/coupons";
import type { Coupon } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
    Plus,
    Pencil,
    Trash2,
    TicketPercent,
    Calendar,
    Users,
    Tag,
    Copy,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function CouponManager() {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState<CouponFormData>({
        code: "",
        description: "",
        discount_type: "percentage",
        discount_value: 10,
        min_order_value: 0,
        max_discount_value: undefined,
        valid_from: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        valid_until: "",
        usage_limit: undefined,
        is_active: true,
        applies_to: "all",
    });

    useEffect(() => {
        loadCoupons();
    }, []);

    async function loadCoupons() {
        try {
            setLoading(true);
            const data = await fetchCoupons();
            setCoupons(data);
        } catch (error) {
            toast.error("Erro ao carregar cupons");
        } finally {
            setLoading(false);
        }
    }

    function resetForm() {
        setFormData({
            code: "",
            description: "",
            discount_type: "percentage",
            discount_value: 10,
            min_order_value: 0,
            max_discount_value: undefined,
            valid_from: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
            valid_until: "",
            usage_limit: undefined,
            is_active: true,
            applies_to: "all",
        });
        setEditingCoupon(null);
    }

    function handleEdit(coupon: Coupon) {
        setEditingCoupon(coupon);
        setFormData({
            code: coupon.code,
            description: coupon.description || "",
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            min_order_value: coupon.min_order_value,
            max_discount_value: coupon.max_discount_value || undefined,
            valid_from: format(new Date(coupon.valid_from), "yyyy-MM-dd'T'HH:mm"),
            valid_until: coupon.valid_until
                ? format(new Date(coupon.valid_until), "yyyy-MM-dd'T'HH:mm")
                : "",
            usage_limit: coupon.usage_limit || undefined,
            is_active: coupon.is_active,
            applies_to: coupon.applies_to,
        });
        setIsDialogOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingCoupon) {
                await updateCoupon(editingCoupon.id, formData);
                toast.success("Cupom atualizado com sucesso!");
            } else {
                await createCoupon(formData);
                toast.success("Cupom criado com sucesso!");
            }
            setIsDialogOpen(false);
            resetForm();
            loadCoupons();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erro ao salvar cupom");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleDelete(couponId: string) {
        if (!confirm("Tem certeza que deseja excluir este cupom?")) return;

        try {
            await deleteCoupon(couponId);
            toast.success("Cupom excluído com sucesso!");
            loadCoupons();
        } catch (error) {
            toast.error("Erro ao excluir cupom");
        }
    }

    async function handleToggleStatus(coupon: Coupon) {
        try {
            await toggleCouponStatus(coupon.id, !coupon.is_active);
            toast.success(`Cupom ${coupon.is_active ? "desativado" : "ativado"} com sucesso!`);
            loadCoupons();
        } catch (error) {
            toast.error("Erro ao alterar status do cupom");
        }
    }

    function copyCode(code: string) {
        navigator.clipboard.writeText(code);
        toast.success("Código copiado!");
    }

    function formatDiscount(coupon: Coupon): string {
        if (coupon.discount_type === "percentage") {
            return `${coupon.discount_value}% OFF`;
        } else if (coupon.discount_type === "fixed") {
            return `R$ ${coupon.discount_value.toFixed(2).replace(".", ",")} OFF`;
        } else if (coupon.discount_type === "free_delivery") {
            return "Frete Grátis";
        }
        return "";
    }

    function getStatusBadge(coupon: Coupon) {
        const now = new Date();
        const validFrom = new Date(coupon.valid_from);
        const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;

        if (!coupon.is_active) {
            return <Badge variant="secondary">Inativo</Badge>;
        }
        if (now < validFrom) {
            return <Badge variant="outline">Agendado</Badge>;
        }
        if (validUntil && now > validUntil) {
            return <Badge variant="destructive">Expirado</Badge>;
        }
        if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
            return <Badge variant="destructive">Esgotado</Badge>;
        }
        return <Badge variant="default">Ativo</Badge>;
    }

    function formatAppliesTo(appliesTo: string): string {
        const map: Record<string, string> = {
            all: "Todos os pedidos",
            first_purchase: "Primeira compra",
            delivery: "Apenas Delivery",
            pickup: "Apenas Retirada",
        };
        return map[appliesTo] || appliesTo;
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-48" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <TicketPercent className="h-5 w-5" />
                            Cupons de Desconto
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Crie e gerencie cupons para seus clientes
                        </p>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                                <Plus className="h-4 w-4 mr-2" />
                                Novo Cupom
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingCoupon ? "Editar Cupom" : "Criar Novo Cupom"}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="code">Código do Cupom *</Label>
                                        <Input
                                            id="code"
                                            value={formData.code}
                                            onChange={(e) =>
                                                setFormData({ ...formData, code: e.target.value.toUpperCase() })
                                            }
                                            placeholder="EX: PROMO10"
                                            required
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Código que o cliente digitará no checkout
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Descrição</Label>
                                        <Input
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) =>
                                                setFormData({ ...formData, description: e.target.value })
                                            }
                                            placeholder="Ex: 10% de desconto na primeira compra"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="discount_type">Tipo de Desconto *</Label>
                                        <Select
                                            value={formData.discount_type}
                                            onValueChange={(value) =>
                                                setFormData({ ...formData, discount_type: value as CouponFormData['discount_type'] })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="percentage">Percentual (%)</SelectItem>
                                                <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                                                <SelectItem value="free_delivery">Frete Grátis</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="discount_value">
                                            {formData.discount_type === "percentage" ? "Percentual" : 
                                             formData.discount_type === "fixed" ? "Valor (R$)" : "Valor do Frete"} *
                                        </Label>
                                        <Input
                                            id="discount_value"
                                            type="number"
                                            min="0"
                                            step={formData.discount_type === "percentage" ? "1" : "0.01"}
                                            max={formData.discount_type === "percentage" ? "100" : undefined}
                                            value={formData.discount_value}
                                            onChange={(e) =>
                                                setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })
                                            }
                                            required
                                        />
                                    </div>
                                </div>

                                {formData.discount_type === "percentage" && (
                                    <div className="space-y-2">
                                        <Label htmlFor="max_discount_value">Desconto Máximo (R$)</Label>
                                        <Input
                                            id="max_discount_value"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.max_discount_value || ""}
                                            onChange={(e) =>
                                                setFormData({ ...formData, max_discount_value: e.target.value ? parseFloat(e.target.value) : undefined })
                                            }
                                            placeholder="Ex: 50.00"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Limite máximo de desconto para cupons percentuais
                                        </p>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="min_order_value">Valor Mínimo do Pedido (R$)</Label>
                                        <Input
                                            id="min_order_value"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.min_order_value || ""}
                                            onChange={(e) =>
                                                setFormData({ ...formData, min_order_value: parseFloat(e.target.value) || 0 })
                                            }
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="usage_limit">Limite de Usos</Label>
                                        <Input
                                            id="usage_limit"
                                            type="number"
                                            min="1"
                                            value={formData.usage_limit || ""}
                                            onChange={(e) =>
                                                setFormData({ ...formData, usage_limit: e.target.value ? parseInt(e.target.value) : undefined })
                                            }
                                            placeholder="Ilimitado"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Deixe em branco para uso ilimitado
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="valid_from">Válido de *</Label>
                                        <Input
                                            id="valid_from"
                                            type="datetime-local"
                                            value={formData.valid_from}
                                            onChange={(e) =>
                                                setFormData({ ...formData, valid_from: e.target.value })
                                            }
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="valid_until">Válido até</Label>
                                        <Input
                                            id="valid_until"
                                            type="datetime-local"
                                            value={formData.valid_until || ""}
                                            onChange={(e) =>
                                                setFormData({ ...formData, valid_until: e.target.value || undefined })
                                            }
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Deixe em branco para não expirar
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="applies_to">Aplicável em *</Label>
                                    <Select
                                        value={formData.applies_to}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, applies_to: value as CouponFormData['applies_to'] })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os pedidos</SelectItem>
                                            <SelectItem value="first_purchase">Primeira compra</SelectItem>
                                            <SelectItem value="delivery">Apenas Delivery</SelectItem>
                                            <SelectItem value="pickup">Apenas Retirada</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="is_active"
                                        checked={formData.is_active}
                                        onCheckedChange={(checked) =>
                                            setFormData({ ...formData, is_active: checked })
                                        }
                                    />
                                    <Label htmlFor="is_active">Cupom ativo</Label>
                                </div>

                                <div className="flex justify-end gap-2 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsDialogOpen(false)}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting
                                            ? "Salvando..."
                                            : editingCoupon
                                            ? "Atualizar"
                                            : "Criar Cupom"}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    {coupons.length === 0 ? (
                        <div className="text-center py-12">
                            <TicketPercent className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium">Nenhum cupom criado</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Crie seu primeiro cupom de desconto para atrair mais clientes
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Desconto</TableHead>
                                    <TableHead>Aplicável em</TableHead>
                                    <TableHead>Usos</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {coupons.map((coupon) => (
                                    <TableRow key={coupon.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                                                    {coupon.code}
                                                </code>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => copyCode(coupon.code)}
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            </div>
                                            {coupon.description && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {coupon.description}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{formatDiscount(coupon)}</div>
                                            {coupon.min_order_value > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    Mín: R$ {coupon.min_order_value.toFixed(2)}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {formatAppliesTo(coupon.applies_to)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {coupon.usage_count} usado{coupon.usage_count !== 1 ? 's' : ''}
                                                {coupon.usage_limit !== null && (
                                                    <span className="text-muted-foreground">
                                                        {" "}/ {coupon.usage_limit}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(coupon)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Switch
                                                    checked={coupon.is_active}
                                                    onCheckedChange={() => handleToggleStatus(coupon)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEdit(coupon)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(coupon.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
