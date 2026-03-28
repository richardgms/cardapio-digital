"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Truck, ShoppingBag, UtensilsCrossed, Eye, Phone } from "lucide-react";
import type { Order, OrderItem, DeliveryType, PaymentMethod } from "@/types/database";

type PeriodFilter = "today" | "7days" | "30days" | "all";

const deliveryTypeMap: Record<DeliveryType, { icon: typeof Truck; label: string }> = {
    delivery: { icon: Truck, label: "Delivery" },
    pickup: { icon: ShoppingBag, label: "Retirada" },
    table: { icon: UtensilsCrossed, label: "Mesa" },
};

const paymentMethodMap: Record<PaymentMethod, string> = {
    pix: "PIX",
    card: "Cartão",
    cash: "Dinheiro",
};

export default function PedidosPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<(Order & { items: OrderItem[] }) | null>(null);
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("today");
    const [deliveryFilter, setDeliveryFilter] = useState<DeliveryType | "all">("all");
    const [loadingItems, setLoadingItems] = useState(false);

    const supabase = createClient();

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            let query = supabase
                .from("orders")
                .select("*")
                .eq("store_id", user.id)
                .order("created_at", { ascending: false });

            // Filtro de periodo na query (usa indice store_id + created_at)
            if (periodFilter !== "all") {
                const now = new Date();
                let start: Date;
                if (periodFilter === "today") {
                    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                } else if (periodFilter === "7days") {
                    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                } else {
                    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                }
                query = query.gte("created_at", start.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;
            setOrders(data || []);
        } catch (error) {
            console.error("Erro ao carregar pedidos:", error);
            toast.error("Erro ao carregar pedidos");
        } finally {
            setLoading(false);
        }
    }, [periodFilter]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Filtragem client-side por tipo de entrega
    const filteredOrders = deliveryFilter === "all"
        ? orders
        : orders.filter((o) => o.delivery_type === deliveryFilter);

    const formatCurrency = (cents: number) =>
        (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const formatOrderNumber = (n: number) => String(n).padStart(3, "0");

    const selectedDelivery = selectedOrder
        ? deliveryTypeMap[selectedOrder.delivery_type]
        : null;

    const openOrderDetail = async (order: Order) => {
        setSelectedOrder({ ...order, items: [] });
        setLoadingItems(true);
        try {
            const { data, error } = await supabase
                .from("order_items")
                .select("*")
                .eq("order_id", order.id);
            if (error) throw error;
            setSelectedOrder({ ...order, items: data || [] });
        } catch (error) {
            console.error("Erro ao carregar itens:", error);
            toast.error("Erro ao carregar itens do pedido");
        } finally {
            setLoadingItems(false);
        }
    };

    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Pedidos" },
            ]} />

            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <Tabs
                    value={periodFilter}
                    onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}
                >
                    <TabsList>
                        <TabsTrigger value="today">Hoje</TabsTrigger>
                        <TabsTrigger value="7days">7 dias</TabsTrigger>
                        <TabsTrigger value="30days">30 dias</TabsTrigger>
                        <TabsTrigger value="all">Todos</TabsTrigger>
                    </TabsList>
                </Tabs>

                <Select
                    value={deliveryFilter}
                    onValueChange={(v) => setDeliveryFilter(v as DeliveryType | "all")}
                >
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Tipo de entrega" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="pickup">Retirada</SelectItem>
                        <SelectItem value="table">Mesa</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {!loading && (
                <p className="text-sm text-muted-foreground">
                    {filteredOrders.length} {filteredOrders.length === 1 ? "pedido" : "pedidos"}
                </p>
            )}

            <div className="border rounded-lg">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[60px]">#</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Cliente</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Tipo</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Pagamento</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Total</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Data</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right w-[60px]">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        <td className="p-4"><Skeleton className="h-4 w-8" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                                        <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                                        <td className="p-4"><Skeleton className="h-8 w-8 ml-auto" /></td>
                                    </tr>
                                ))
                            ) : filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-4 text-center text-muted-foreground">
                                        Nenhum pedido encontrado
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map((order) => {
                                    const dt = deliveryTypeMap[order.delivery_type];
                                    const DeliveryIcon = dt.icon;
                                    return (
                                        <tr
                                            key={order.id}
                                            className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                                            onClick={() => openOrderDetail(order)}
                                            onKeyDown={(e) => { if (e.key === "Enter") openOrderDetail(order); }}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Ver detalhes do pedido ${formatOrderNumber(order.order_number)}`}
                                        >
                                            <td className="p-4 align-middle font-mono text-muted-foreground">
                                                {formatOrderNumber(order.order_number)}
                                            </td>
                                            <td className="p-4 align-middle font-medium">
                                                {order.customer_name}
                                            </td>
                                            <td className="p-4 align-middle">
                                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                                    <DeliveryIcon className="h-4 w-4" />
                                                    {dt.label}
                                                    {order.delivery_type === "table" && order.table_number && ` ${order.table_number}`}
                                                </span>
                                            </td>
                                            <td className="p-4 align-middle text-muted-foreground">
                                                {paymentMethodMap[order.payment_method]}
                                            </td>
                                            <td className="p-4 align-middle font-medium">
                                                {formatCurrency(order.total)}
                                            </td>
                                            <td className="p-4 align-middle text-muted-foreground">
                                                {new Date(order.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                            </td>
                                            <td className="p-4 align-middle text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Ver pedido ${order.order_number}`}
                                                    onClick={(e) => { e.stopPropagation(); openOrderDetail(order); }}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sheet de detalhe do pedido */}
            <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <SheetContent className="overflow-y-auto sm:max-w-md">
                    {selectedOrder && selectedDelivery && (
                        <>
                            <SheetHeader>
                                <SheetTitle>
                                    Pedido #{formatOrderNumber(selectedOrder.order_number)}
                                </SheetTitle>
                                <SheetDescription>
                                    {new Date(selectedOrder.created_at).toLocaleString("pt-BR", {
                                        day: "2-digit", month: "2-digit", year: "numeric",
                                        hour: "2-digit", minute: "2-digit",
                                    })}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="mt-6 space-y-6">
                                {/* Cliente */}
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-muted-foreground">Cliente</h3>
                                    <p className="font-medium">{selectedOrder.customer_name}</p>
                                    <a
                                        href={`tel:${selectedOrder.customer_phone}`}
                                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                                    >
                                        <Phone className="h-3.5 w-3.5" />
                                        {selectedOrder.customer_phone}
                                    </a>
                                </div>

                                <Separator />

                                {/* Entrega */}
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-muted-foreground">Entrega</h3>
                                    <p className="flex items-center gap-1.5 font-medium">
                                        <selectedDelivery.icon className="h-4 w-4" />
                                        {selectedDelivery.label}
                                        {selectedOrder.delivery_type === "table" && selectedOrder.table_number && ` ${selectedOrder.table_number}`}
                                    </p>
                                    {selectedOrder.delivery_type === "delivery" && selectedOrder.delivery_address && (
                                        <p className="text-sm text-muted-foreground">{selectedOrder.delivery_address}</p>
                                    )}
                                    {selectedOrder.delivery_zone_name && (
                                        <p className="text-sm text-muted-foreground">Zona: {selectedOrder.delivery_zone_name}</p>
                                    )}
                                </div>

                                <Separator />

                                {/* Pagamento */}
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-muted-foreground">Pagamento</h3>
                                    <p className="font-medium">{paymentMethodMap[selectedOrder.payment_method]}</p>
                                    {selectedOrder.payment_method === "cash" && selectedOrder.change_for && (
                                        <p className="text-sm text-muted-foreground">
                                            Troco para: {formatCurrency(selectedOrder.change_for)}
                                        </p>
                                    )}
                                </div>

                                <Separator />

                                {/* Itens */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Itens</h3>
                                    {loadingItems ? (
                                        <div className="space-y-2">
                                            {Array.from({ length: 3 }).map((_, i) => (
                                                <Skeleton key={i} className="h-12 w-full" />
                                            ))}
                                        </div>
                                    ) : selectedOrder.items.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedOrder.items.map((item) => (
                                                <div key={item.id} className="space-y-1">
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <p className="font-medium">
                                                                {item.quantity}x {item.product_name}
                                                            </p>
                                                            {item.is_half_half && item.half_half_items && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    Meio a meio: {item.half_half_items.map(h => h.product_name).join(" / ")}
                                                                </p>
                                                            )}
                                                            {item.selected_options.length > 0 && (
                                                                <div className="mt-0.5">
                                                                    {item.selected_options.map((opt, i) => (
                                                                        <p key={i} className="text-xs text-muted-foreground">
                                                                            {opt.group}: {opt.option}
                                                                            {opt.price > 0 && ` (+${formatCurrency(opt.price)})`}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {item.observations && (
                                                                <p className="text-xs italic text-muted-foreground mt-0.5">
                                                                    Obs: {item.observations}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="text-sm font-medium whitespace-nowrap ml-4">
                                                            {formatCurrency(item.item_total)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <Separator />

                                {/* Resumo de valores */}
                                <div className="space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>{formatCurrency(selectedOrder.subtotal)}</span>
                                    </div>
                                    {selectedOrder.delivery_fee > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Taxa de entrega</span>
                                            <span>{formatCurrency(selectedOrder.delivery_fee)}</span>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex justify-between font-bold text-base">
                                        <span>Total</span>
                                        <span>{formatCurrency(selectedOrder.total)}</span>
                                    </div>
                                </div>

                                {/* Observacoes gerais */}
                                {selectedOrder.notes && (
                                    <>
                                        <Separator />
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-medium text-muted-foreground">Observações</h3>
                                            <p className="text-sm">{selectedOrder.notes}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
