"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { Truck, ShoppingBag, UtensilsCrossed, Eye, Phone, MapPin, ReceiptText } from "lucide-react";
import type { Order, OrderItem, DeliveryType, PaymentMethod } from "@/types/database";
import { fetchOrdersAsProxy, fetchOrderItemsAsProxy } from "@/actions/admin/proxy-orders";

type PeriodFilter = "today" | "7days" | "30days" | "all";

const deliveryTypeMap: Record<DeliveryType, { icon: any; label: string }> = {
    delivery: { icon: Truck, label: "Delivery" },
    pickup: { icon: ShoppingBag, label: "Retirada" },
    table: { icon: UtensilsCrossed, label: "Mesa" },
};

const paymentMethodMap: Record<PaymentMethod, string> = {
    pix: "PIX",
    card: "Cartão",
    cash: "Dinheiro",
};

interface OrdersManagerProps {
    storeId?: string;
    isImpersonating?: boolean;
}

export function OrdersManager({ storeId, isImpersonating }: OrdersManagerProps) {
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
            let data;
            if (isImpersonating && storeId) {
                data = await fetchOrdersAsProxy(storeId, periodFilter);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                let query = supabase.from("orders").select("*").eq("store_id", user.id).order("created_at", { ascending: false });
                if (periodFilter !== "all") {
                    const now = new Date();
                    let start: Date;
                    if (periodFilter === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    else if (periodFilter === "7days") start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    else start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    query = query.gte("created_at", start.toISOString());
                }
                const { data: oData, error } = await query;
                if (error) throw error;
                data = oData;
            }
            setOrders(data || []);
        } catch (error) {
            console.error("Erro ao carregar pedidos:", error);
            toast.error("Erro ao carregar pedidos");
        } finally {
            setLoading(false);
        }
    }, [periodFilter, isImpersonating, storeId]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const filteredOrders = deliveryFilter === "all" ? orders : orders.filter(o => o.delivery_type === deliveryFilter);

    const formatCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formatOrderNumber = (n: number) => String(n).padStart(3, "0");

    const openOrderDetail = async (order: Order) => {
        setSelectedOrder({ ...order, items: [] });
        setLoadingItems(true);
        try {
            let items;
            if (isImpersonating && storeId) {
                items = await fetchOrderItemsAsProxy(storeId, order.id);
            } else {
                const { data, error } = await supabase.from("order_items").select("*").eq("order_id", order.id);
                if (error) throw error;
                items = data;
            }
            setSelectedOrder({ ...order, items: items || [] });
        } catch (error) {
            console.error("Erro ao carregar itens:", error);
            toast.error("Erro ao carregar itens");
        } finally {
            setLoadingItems(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-black">Histórico de Pedidos</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isImpersonating ? "Visualizando histórico como Super Admin." : "Todos os pedidos realizados na sua loja."}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                <Tabs value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
                    <TabsList className="bg-white border border-zinc-200">
                        <TabsTrigger value="today" className="data-[state=active]:bg-black data-[state=active]:text-white">Hoje</TabsTrigger>
                        <TabsTrigger value="7days" className="data-[state=active]:bg-black data-[state=active]:text-white">7d</TabsTrigger>
                        <TabsTrigger value="30days" className="data-[state=active]:bg-black data-[state=active]:text-white">30d</TabsTrigger>
                        <TabsTrigger value="all" className="data-[state=active]:bg-black data-[state=active]:text-white">Todos</TabsTrigger>
                    </TabsList>
                </Tabs>

                <Select value={deliveryFilter} onValueChange={(v) => setDeliveryFilter(v as DeliveryType | "all")}>
                    <SelectTrigger className="w-[180px] bg-white border-zinc-200">
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

            <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                        <tr>
                            <th className="px-6 py-4 font-bold text-black w-[80px]">#</th>
                            <th className="px-6 py-4 font-bold text-black">Cliente</th>
                            <th className="px-6 py-4 font-bold text-black">Tipo</th>
                            <th className="px-6 py-4 font-bold text-black">Total</th>
                            <th className="px-6 py-4 font-bold text-black">Data/Hora</th>
                            <th className="px-6 py-4 font-bold text-black text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => <tr key={i}><td colSpan={6} className="px-6 py-4"><Skeleton className="h-6 w-full bg-zinc-50" /></td></tr>)
                        ) : filteredOrders.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-20 text-center text-zinc-400 italic">Nenhum pedido encontrado no período.</td></tr>
                        ) : (
                            filteredOrders.map((order) => {
                                const dt = deliveryTypeMap[order.delivery_type];
                                return (
                                    <tr key={order.id} onClick={() => openOrderDetail(order)} className="hover:bg-zinc-50/50 cursor-pointer transition-colors group">
                                        <td className="px-6 py-4 font-mono font-bold text-zinc-400 group-hover:text-black">
                                            {formatOrderNumber(order.order_number)}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-black">
                                            {order.customer_name}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="flex items-center gap-2 text-zinc-500">
                                                <dt.icon className="h-4 w-4" /> {dt.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-black">
                                            {formatCurrency(order.total)}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-500 text-xs">
                                            {new Date(order.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button variant="ghost" size="icon" className="group-hover:bg-black group-hover:text-white transition-all rounded-full">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <Sheet open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
                <SheetContent className="sm:max-w-md bg-white border-l border-zinc-200 p-0">
                    {selectedOrder && (
                        <div className="flex flex-col h-full">
                            <div className="p-6 border-b border-zinc-100">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Detalhes do Pedido</span>
                                <h2 className="text-2xl font-black text-black flex items-center gap-2">
                                    <ReceiptText className="h-6 w-6" /> #{formatOrderNumber(selectedOrder.order_number)}
                                </h2>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Realizado em {new Date(selectedOrder.created_at).toLocaleString("pt-BR")}
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                <section className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-zinc-400">Dados do Cliente</h3>
                                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                                        <p className="font-bold text-black">{selectedOrder.customer_name}</p>
                                        <a href={`tel:${selectedOrder.customer_phone}`} className="flex items-center gap-2 text-sm text-zinc-500 mt-1 hover:text-black">
                                            <Phone className="h-3.5 w-3.5" /> {selectedOrder.customer_phone}
                                        </a>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-zinc-400">Entrega e Pagamento</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase">Tipo</p>
                                            <p className="font-bold text-black mt-1">{deliveryTypeMap[selectedOrder.delivery_type].label}</p>
                                        </div>
                                        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase">Pagamento</p>
                                            <p className="font-bold text-black mt-1">{paymentMethodMap[selectedOrder.payment_method]}</p>
                                        </div>
                                    </div>
                                    {selectedOrder.delivery_address && (
                                        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex items-start gap-3">
                                            <MapPin className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Endereço</p>
                                                <p className="text-sm font-medium text-black mt-1 leading-relaxed">{selectedOrder.delivery_address}</p>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-zinc-400">Itens do Pedido</h3>
                                    <div className="space-y-3">
                                        {loadingItems ? (
                                            [1, 2].map(i => <Skeleton key={i} className="h-14 w-full bg-zinc-50 rounded-xl" />)
                                        ) : selectedOrder.items.map((item) => (
                                            <div key={item.id} className="flex justify-between items-start gap-4 pb-3 border-b border-zinc-50 last:border-0">
                                                <div>
                                                    <p className="font-bold text-black">{item.quantity}x {item.product_name}</p>
                                                    {item.selected_options.map((opt, i) => (
                                                        <p key={i} className="text-[11px] text-zinc-500 font-medium">+ {opt.group}: {opt.option}</p>
                                                    ))}
                                                    {item.observations && <p className="text-[11px] italic text-zinc-400 mt-1">Obs: {item.observations}</p>}
                                                </div>
                                                <span className="text-sm font-bold text-black">{formatCurrency(item.item_total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            <div className="p-6 bg-zinc-50 border-t border-zinc-100 space-y-2">
                                <div className="flex justify-between text-zinc-500 text-sm">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(selectedOrder.subtotal)}</span>
                                </div>
                                {selectedOrder.delivery_fee > 0 && (
                                    <div className="flex justify-between text-zinc-500 text-sm">
                                        <span>Taxa de Entrega</span>
                                        <span>{formatCurrency(selectedOrder.delivery_fee)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-black font-black text-xl pt-2">
                                    <span>TOTAL</span>
                                    <span>{formatCurrency(selectedOrder.total)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
