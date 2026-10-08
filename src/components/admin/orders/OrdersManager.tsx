"use client";

import { useState } from "react";
import { useOrdersFeed } from "@/hooks/useOrdersFeed";
import { PrintHistory } from "./PrintHistory";
import { ORDERS_PAGE_SIZE } from "@/lib/orders-period";
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
import { Truck, ShoppingBag, UtensilsCrossed, Eye, Phone, MapPin, ReceiptText, RefreshCw } from "lucide-react";
import type { DeliveryType, PaymentMethod, OrderStatus } from "@/types/database";

type PeriodFilter = "today" | "7days" | "30days" | "all";

const orderStatusMap: Record<OrderStatus, string> = {
    pending: "Registrado", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto", delivered: "Entregue", cancelled: "Cancelado",
};
const handoffStatusMap = {
    unknown: "Contato não verificado", pending_handoff: "Contato não verificado",
    whatsapp_opened: "WhatsApp aberto; envio não verificado", confirmed: "Confirmação legada de contato",
};

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

interface OrdersManagerProps {
    storeId?: string;
    isImpersonating?: boolean;
    reprintsEnabled?: boolean;
}

export function OrdersManager({ storeId, isImpersonating, reprintsEnabled = false }: OrdersManagerProps) {
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("today");
    const [deliveryFilter, setDeliveryFilter] = useState<DeliveryType | "all">("all");
    const [page, setPage] = useState(0);
    const { orders, total, loading, refreshing, lastSyncedAt, error, selectedOrder, loadingItems, detailError,
        refresh, openOrderDetail, closeOrderDetail, retryDetail } = useOrdersFeed({ storeId, isImpersonating, period: periodFilter, page, delivery: deliveryFilter });

    const filteredOrders = deliveryFilter === "all" ? orders : orders.filter(o => o.delivery_type === deliveryFilter);

    const formatCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formatOrderNumber = (n: number) => String(n).padStart(3, "0");

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Histórico de Pedidos</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isImpersonating ? "Visualizando histórico como Super Admin." : "Todos os pedidos realizados na sua loja."}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />Atualizar
                </Button>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
                {lastSyncedAt ? `Atualizado às ${lastSyncedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Carregando pedidos…"}
                {" · Atualização automática"}
            </p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap items-center gap-4 bg-muted/50 p-4 rounded-2xl border border-border">
                <Tabs value={periodFilter} onValueChange={(v) => { setPeriodFilter(v as PeriodFilter); setPage(0); }}>
                    <TabsList className="bg-background border border-border">
                        <TabsTrigger value="today" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Hoje</TabsTrigger>
                        <TabsTrigger value="7days" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">7d</TabsTrigger>
                        <TabsTrigger value="30days" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">30d</TabsTrigger>
                        <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Todos</TabsTrigger>
                    </TabsList>
                </Tabs>

                <Select value={deliveryFilter} onValueChange={(v) => { setDeliveryFilter(v as DeliveryType | "all"); setPage(0); }}>
                    <SelectTrigger className="w-[180px]">
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

            {/* Mobile: cards */}
            <div className="md:hidden border border-border rounded-2xl overflow-hidden bg-background shadow-sm divide-y divide-border">
                {loading ? (
                    [1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="p-4 space-y-2">
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                    ))
                ) : filteredOrders.length === 0 ? (
                    <p className="py-16 text-center text-muted-foreground italic text-sm">
                        Nenhum pedido encontrado no período.
                    </p>
                ) : (
                    filteredOrders.map((order) => {
                        const dt = deliveryTypeMap[order.delivery_type];
                        const DeliveryIcon = dt.icon;
                        return (
                            <button
                                key={order.id}
                                onClick={() => openOrderDetail(order)}
                                className="w-full text-left px-4 py-4 active:bg-muted transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                                            #{formatOrderNumber(order.order_number)}
                                        </span>
                                        <span className="font-bold text-foreground truncate">
                                            {order.customer_name}
                                        </span>
                                    </div>
                                    <span className="font-bold text-foreground shrink-0">
                                        {formatCurrency(order.total)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <DeliveryIcon className="h-3.5 w-3.5" />
                                        {dt.label}
                                    </span>
                                    <span>·</span>
                                    <span>{paymentMethodMap[order.payment_method]}</span>
                                    <span>·</span><span>{orderStatusMap[order.status]}</span>
                                    <span>·</span>
                                    <span>
                                        {new Date(order.created_at).toLocaleString("pt-BR", {
                                            timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
                                            hour: "2-digit", minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block border border-border rounded-2xl overflow-hidden bg-background shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b border-border">
                        <tr>
                            <th className="px-6 py-4 font-bold text-foreground w-[80px]">#</th>
                            <th className="px-6 py-4 font-bold text-foreground">Cliente</th>
                            <th className="px-6 py-4 font-bold text-foreground">Tipo / Status</th>
                            <th className="px-6 py-4 font-bold text-foreground">Total</th>
                            <th className="px-6 py-4 font-bold text-foreground">Data/Hora</th>
                            <th className="px-6 py-4 font-bold text-foreground text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => <tr key={i}><td colSpan={6} className="px-6 py-4"><Skeleton className="h-6 w-full bg-muted" /></td></tr>)
                        ) : filteredOrders.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-20 text-center text-muted-foreground italic">Nenhum pedido encontrado no período.</td></tr>
                        ) : (
                            filteredOrders.map((order) => {
                                const dt = deliveryTypeMap[order.delivery_type];
                                return (
                                    <tr key={order.id} onClick={() => openOrderDetail(order)} className="hover:bg-muted/50 cursor-pointer transition-colors group">
                                        <td className="px-6 py-4 font-mono font-bold text-muted-foreground group-hover:text-foreground">
                                            {formatOrderNumber(order.order_number)}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-foreground">
                                            {order.customer_name}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="flex items-center gap-2 text-muted-foreground">
                                                <dt.icon className="h-4 w-4" /> {dt.label}
                                            </span>
                                            <span className="mt-1 block text-xs text-muted-foreground">{orderStatusMap[order.status] ?? "Estado desconhecido"}</span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-foreground">
                                            {formatCurrency(order.total)}
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground text-xs">
                                            {new Date(order.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button aria-label={`Ver pedido ${formatOrderNumber(order.order_number)}`} variant="ghost" size="icon" className="group-hover:bg-primary group-hover:text-primary-foreground transition-all rounded-full">
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

            <div className="flex items-center justify-between gap-3 text-sm">
                <p className="text-muted-foreground">
                    Página {page + 1} de {Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE))} · {total} {total === 1 ? "pedido" : "pedidos"}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                    <Button variant="outline" size="sm" disabled={(page + 1) * ORDERS_PAGE_SIZE >= total || loading} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                </div>
            </div>

            <Sheet open={!!selectedOrder} onOpenChange={(o) => !o && closeOrderDetail()}>
                <SheetContent className="sm:max-w-md border-l border-border p-0 bg-background">
                    <SheetHeader className="sr-only">
                        <SheetTitle>Detalhes do pedido</SheetTitle>
                        <SheetDescription>Cliente, entrega, itens e estados do pedido registrado.</SheetDescription>
                    </SheetHeader>
                    {selectedOrder && (
                        <div className="flex flex-col h-full">
                            <div className="p-6 border-b border-border">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Detalhes do Pedido</span>
                                <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
                                    <ReceiptText className="h-6 w-6" /> #{formatOrderNumber(selectedOrder.order_number)}
                                </h2>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Realizado em {new Date(selectedOrder.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                <section className="rounded-2xl border border-border p-4 space-y-2 text-sm">
                                    <p><span className="font-semibold">Pedido: </span>{orderStatusMap[selectedOrder.status]}</p>
                                    <p><span className="font-semibold">WhatsApp: </span>{handoffStatusMap[selectedOrder.handoff_status ?? "unknown"]}</p>
                                    <p><span className="font-semibold">Pagamento: </span>não verificado pelo sistema</p>

                                </section>
                                <PrintHistory key={selectedOrder.id} jobs={selectedOrder.document?.jobs ?? []} storeId={selectedOrder.store_id} orderId={selectedOrder.id}
                                    allowReprint={reprintsEnabled && !isImpersonating && !!selectedOrder.document && selectedOrder.status !== "cancelled"} onChanged={retryDetail} />
                                {detailError && <div role="alert" className="text-sm text-destructive">
                                    <p>{detailError}</p><Button variant="outline" size="sm" onClick={retryDetail}>Tentar novamente</Button>
                                </div>}
                                <section className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-muted-foreground">Dados do Cliente</h3>
                                    <div className="bg-muted/50 p-4 rounded-2xl border border-border">
                                        <p className="font-bold text-foreground">{selectedOrder.customer_name}</p>
                                        <a href={`tel:${selectedOrder.customer_phone}`} className="flex items-center gap-2 text-sm text-muted-foreground mt-1 hover:text-foreground">
                                            <Phone className="h-3.5 w-3.5" /> {selectedOrder.customer_phone}
                                        </a>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-muted-foreground">Entrega e Pagamento</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-muted/50 p-4 rounded-2xl border border-border">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Tipo</p>
                                            <p className="font-bold text-foreground mt-1">{deliveryTypeMap[selectedOrder.delivery_type].label}</p>
                                        </div>
                                        <div className="bg-muted/50 p-4 rounded-2xl border border-border">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Forma informada</p>
                                            <p className="font-bold text-foreground mt-1">{paymentMethodMap[selectedOrder.payment_method]}</p>
                                        </div>
                                    </div>
                                    {selectedOrder.delivery_address && (
                                        <div className="bg-muted/50 p-4 rounded-2xl border border-border flex items-start gap-3">
                                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Endereço</p>
                                                <p className="text-sm font-medium text-foreground mt-1 leading-relaxed">{selectedOrder.delivery_address}</p>
                                                {selectedOrder.address_complement && (
                                                    <p className="text-sm text-foreground mt-1 leading-relaxed">
                                                        <span className="font-semibold">Complemento: </span>{selectedOrder.address_complement}
                                                    </p>
                                                )}
                                                {selectedOrder.delivery_zone_name && (
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        <span className="font-semibold">Bairro / Região: </span>{selectedOrder.delivery_zone_name}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-muted-foreground">Itens do Pedido</h3>
                                    <div className="space-y-3">
                                        {!loadingItems && !detailError && selectedOrder.items.length === 0 && <p className="text-sm text-destructive">Pedido sem itens registrados. Verifique antes de imprimir.</p>}
                                        {loadingItems ? (
                                            [1, 2].map(i => <Skeleton key={i} className="h-14 w-full bg-muted rounded-xl" />)
                                        ) : selectedOrder.items.map((item) => (
                                            <div key={item.id} className="flex justify-between items-start gap-4 pb-3 border-b border-border last:border-0">
                                                <div>
                                                    <p className="font-bold text-foreground">{item.quantity}x {item.product_name}</p>
                                                    {item.selected_options.map((opt, i) => (
                                                        <p key={i} className="text-[11px] text-muted-foreground font-medium">+ {opt.group}: {opt.option}</p>
                                                    ))}
                                                    {item.is_half_half && item.half_half_items?.map((half, i) => (
                                                        <div key={i} className="text-[11px] text-muted-foreground">
                                                            <p>1/2 {half.product_name}</p>
                                                            {half.selected_options.map((opt, j) => <p key={j}>+ {opt.group}: {opt.option}</p>)}
                                                        </div>
                                                    ))}
                                                    {item.observations && <p className="text-[11px] italic text-muted-foreground mt-1">Obs: {item.observations}</p>}
                                                </div>
                                                <span className="text-sm font-bold text-foreground">{formatCurrency(item.item_total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            <div className="p-6 bg-muted/50 border-t border-border space-y-2">
                                <div className="flex justify-between text-muted-foreground text-sm">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(selectedOrder.subtotal)}</span>
                                </div>
                                {selectedOrder.delivery_fee > 0 && (
                                    <div className="flex justify-between text-muted-foreground text-sm">
                                        <span>Taxa de Entrega</span>
                                        <span>{formatCurrency(selectedOrder.delivery_fee)}</span>
                                    </div>
                                )}
                                {(selectedOrder.discount_value ?? 0) > 0 && <div className="flex justify-between text-muted-foreground text-sm">
                                    <span>Desconto{selectedOrder.coupon_code ? ` (${selectedOrder.coupon_code})` : ""}</span>
                                    <span>-{formatCurrency(selectedOrder.discount_value ?? 0)}</span>
                                </div>}
                                {selectedOrder.notes && <p className="text-sm">Obs. pedido: {selectedOrder.notes}</p>}
                                {selectedOrder.change_for !== null && <p className="text-sm">Troco para: {formatCurrency(selectedOrder.change_for)}</p>}
                                {selectedOrder.table_number !== null && <p className="text-sm">Mesa: {selectedOrder.table_number}</p>}
                                <div className="flex justify-between text-foreground font-black text-xl pt-2">
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
