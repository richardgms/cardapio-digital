'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    TrendingUp,
    ShoppingBag,
    Truck,
    UtensilsCrossed,
    CreditCard,
    Banknote,
    QrCode,
    XCircle,
    Package,
} from 'lucide-react'
import type { DeliveryType, OrderStatus, PaymentMethod } from '@/types/database'

type Period = 'today' | '7days' | '30days' | 'all'

interface DailyData {
    date: string
    orders: number
    revenue: number
}

interface MetricsData {
    totalOrders: number
    totalRevenue: number
    avgTicket: number
    cancelledOrders: number
    byDeliveryType: { type: DeliveryType; count: number; revenue: number }[]
    byPaymentMethod: { method: PaymentMethod; count: number; revenue: number }[]
    topProducts: { name: string; qty: number; revenue: number }[]
    dailyData: DailyData[]
}

const PERIOD_LABELS: Record<Period, string> = {
    today: 'Hoje',
    '7days': '7 dias',
    '30days': '30 dias',
    all: 'Todos',
}

const DELIVERY_LABELS: Record<DeliveryType, string> = {
    delivery: 'Entrega',
    pickup: 'Retirada',
    table: 'Mesa',
}

const DELIVERY_ICONS: Record<DeliveryType, React.ReactNode> = {
    delivery: <Truck className="h-4 w-4" />,
    pickup: <ShoppingBag className="h-4 w-4" />,
    table: <UtensilsCrossed className="h-4 w-4" />,
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
    pix: 'Pix',
    card: 'Cartão',
    cash: 'Dinheiro',
}

const PAYMENT_ICONS: Record<PaymentMethod, React.ReactNode> = {
    pix: <QrCode className="h-4 w-4" />,
    card: <CreditCard className="h-4 w-4" />,
    cash: <Banknote className="h-4 w-4" />,
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getPeriodStart(period: Period): Date {
    const now = new Date()
    const brasiliaOffset = -3 * 60
    const localOffset = now.getTimezoneOffset()
    const diff = (localOffset + brasiliaOffset) * 60 * 1000
    const brasilia = new Date(now.getTime() - diff)

    if (period === 'today') {
        brasilia.setHours(0, 0, 0, 0)
        return new Date(brasilia.getTime() + diff)
    }
    if (period === '7days') {
        brasilia.setDate(brasilia.getDate() - 6)
        brasilia.setHours(0, 0, 0, 0)
        return new Date(brasilia.getTime() + diff)
    }
    // 30days
    brasilia.setDate(brasilia.getDate() - 29)
    brasilia.setHours(0, 0, 0, 0)
    return new Date(brasilia.getTime() + diff)
}

function getDayLabel(dateStr: string, period: Period): string {
    const date = new Date(dateStr)
    if (period === 'today') return date.getHours().toString().padStart(2, '0') + 'h'
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`
}

export function MetricsManager() {
    const [period, setPeriod] = useState<Period>('7days')
    const [deliveryFilter, setDeliveryFilter] = useState<DeliveryType | 'all'>('all')
    const [metrics, setMetrics] = useState<MetricsData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchMetrics() {
            setLoading(true)
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                let query = supabase
                    .from('orders')
                    .select('id, status, delivery_type, payment_method, total, created_at')
                    .eq('store_id', user.id)

                if (period !== 'all') {
                    const periodStart = getPeriodStart(period)
                    query = query.gte('created_at', periodStart.toISOString())
                }

                if (deliveryFilter !== 'all') {
                    query = query.eq('delivery_type', deliveryFilter)
                }

                // Fetch orders
                const { data: orders } = await query
                    .order('created_at', { ascending: true })

                if (!orders || orders.length === 0) {
                    setMetrics({
                        totalOrders: 0,
                        totalRevenue: 0,
                        avgTicket: 0,
                        cancelledOrders: 0,
                        byDeliveryType: [],
                        byPaymentMethod: [],
                        topProducts: [],
                        dailyData: [],
                    })
                    return
                }

                const activeOrders = orders.filter(o => o.status !== 'cancelled')
                const cancelledOrders = orders.filter(o => o.status === 'cancelled').length

                // Fetch order items for active orders
                const activeOrderIds = activeOrders.map(o => o.id)
                const { data: items } = activeOrderIds.length > 0
                    ? await supabase
                        .from('order_items')
                        .select('product_name, quantity, item_total, order_id')
                        .in('order_id', activeOrderIds)
                    : { data: [] }

                // KPIs
                const totalRevenue = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0)
                const totalOrders = activeOrders.length
                const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0

                // By delivery type
                const deliveryMap = new Map<DeliveryType, { count: number; revenue: number }>()
                for (const o of activeOrders) {
                    const key = o.delivery_type as DeliveryType
                    const prev = deliveryMap.get(key) || { count: 0, revenue: 0 }
                    deliveryMap.set(key, { count: prev.count + 1, revenue: prev.revenue + (o.total || 0) })
                }
                const byDeliveryType = Array.from(deliveryMap.entries())
                    .map(([type, v]) => ({ type, ...v }))
                    .sort((a, b) => b.count - a.count)

                // By payment method
                const paymentMap = new Map<PaymentMethod, { count: number; revenue: number }>()
                for (const o of activeOrders) {
                    const key = o.payment_method as PaymentMethod
                    const prev = paymentMap.get(key) || { count: 0, revenue: 0 }
                    paymentMap.set(key, { count: prev.count + 1, revenue: prev.revenue + (o.total || 0) })
                }
                const byPaymentMethod = Array.from(paymentMap.entries())
                    .map(([method, v]) => ({ method, ...v }))
                    .sort((a, b) => b.count - a.count)

                // Top products
                const productMap = new Map<string, { qty: number; revenue: number }>()
                for (const item of (items || [])) {
                    const prev = productMap.get(item.product_name) || { qty: 0, revenue: 0 }
                    productMap.set(item.product_name, {
                        qty: prev.qty + (item.quantity || 0),
                        revenue: prev.revenue + (item.item_total || 0),
                    })
                }
                const topProducts = Array.from(productMap.entries())
                    .map(([name, v]) => ({ name, ...v }))
                    .sort((a, b) => b.qty - a.qty)
                    .slice(0, 8)

                // Daily data
                const dayMap = new Map<string, { orders: number; revenue: number }>()
                for (const o of activeOrders) {
                    const date = new Date(o.created_at)
                    const key = date.toISOString().split('T')[0]
                    const prev = dayMap.get(key) || { orders: 0, revenue: 0 }
                    dayMap.set(key, { orders: prev.orders + 1, revenue: prev.revenue + (o.total || 0) })
                }

                // Fill missing days
                const days = period === '7days' ? 7 : period === '30days' ? 30 : 1
                const dailyData: DailyData[] = []
                for (let i = days - 1; i >= 0; i--) {
                    const d = new Date()
                    d.setDate(d.getDate() - i)
                    const key = d.toISOString().split('T')[0]
                    const v = dayMap.get(key) || { orders: 0, revenue: 0 }
                    dailyData.push({ date: key, orders: v.orders, revenue: v.revenue })
                }

                setMetrics({
                    totalOrders,
                    totalRevenue,
                    avgTicket,
                    cancelledOrders,
                    byDeliveryType,
                    byPaymentMethod,
                    topProducts,
                    dailyData,
                })
            } finally {
                setLoading(false)
            }
        }

        fetchMetrics()
    }, [period, deliveryFilter])

    return (
        <div className="space-y-6">
            {/* Filtros unificados */}
            <div className="flex flex-wrap items-center gap-4 bg-muted/50 p-4 rounded-2xl border border-border">
                <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                    <TabsList className="bg-background border border-border">
                        <TabsTrigger value="today" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Hoje</TabsTrigger>
                        <TabsTrigger value="7days" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">7d</TabsTrigger>
                        <TabsTrigger value="30days" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">30d</TabsTrigger>
                        <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Todos</TabsTrigger>
                    </TabsList>
                </Tabs>

                <Select value={deliveryFilter} onValueChange={(v) => setDeliveryFilter(v as DeliveryType | "all")}>
                    <SelectTrigger className="w-[180px] bg-background border border-border">
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

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="Pedidos"
                    icon={<ShoppingBag className="h-4 w-4 text-muted-foreground" />}
                    value={loading ? null : metrics?.totalOrders ?? 0}
                    sub="pedidos no período"
                />
                <KpiCard
                    title="Faturamento"
                    icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                    value={loading ? null : metrics ? formatCurrency(metrics.totalRevenue) : 'R$ 0,00'}
                    sub="total do período"
                />
                <KpiCard
                    title="Ticket Médio"
                    icon={<Package className="h-4 w-4 text-muted-foreground" />}
                    value={loading ? null : metrics ? formatCurrency(metrics.avgTicket) : 'R$ 0,00'}
                    sub="por pedido"
                />
                <KpiCard
                    title="Cancelamentos"
                    icon={<XCircle className="h-4 w-4 text-red-500" />}
                    value={loading ? null : metrics?.cancelledOrders ?? 0}
                    sub="pedidos cancelados"
                />
            </div>

            {/* Daily chart (skip for 'today' and 'all') */}
            {period !== 'today' && period !== 'all' && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Pedidos por dia
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-28 w-full" />
                        ) : (
                            <DailyChart data={metrics?.dailyData ?? []} period={period} />
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Distributions */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Delivery type */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Tipo de entrega
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <>
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-3/4" />
                            </>
                        ) : metrics && metrics.byDeliveryType.length > 0 ? (
                            metrics.byDeliveryType.map(item => {
                                const total = metrics.totalOrders
                                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
                                return (
                                    <DistributionBar
                                        key={item.type}
                                        icon={DELIVERY_ICONS[item.type]}
                                        label={DELIVERY_LABELS[item.type]}
                                        count={item.count}
                                        pct={pct}
                                        sub={formatCurrency(item.revenue)}
                                    />
                                )
                            })
                        ) : (
                            <EmptyState />
                        )}
                    </CardContent>
                </Card>

                {/* Payment method */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Forma de pagamento
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <>
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-3/4" />
                            </>
                        ) : metrics && metrics.byPaymentMethod.length > 0 ? (
                            metrics.byPaymentMethod.map(item => {
                                const total = metrics.totalOrders
                                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
                                return (
                                    <DistributionBar
                                        key={item.method}
                                        icon={PAYMENT_ICONS[item.method]}
                                        label={PAYMENT_LABELS[item.method]}
                                        count={item.count}
                                        pct={pct}
                                        sub={formatCurrency(item.revenue)}
                                    />
                                )
                            })
                        ) : (
                            <EmptyState />
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Top products */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Produtos mais vendidos
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
                        </div>
                    ) : metrics && metrics.topProducts.length > 0 ? (
                        <div className="space-y-2">
                            {metrics.topProducts.map((product, idx) => {
                                const maxQty = metrics.topProducts[0].qty
                                const pct = maxQty > 0 ? Math.round((product.qty / maxQty) * 100) : 0
                                return (
                                    <div key={product.name} className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-sm font-medium truncate">{product.name}</span>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    <span className="text-xs text-muted-foreground">{product.qty}x</span>
                                                    <span className="text-xs font-medium">{formatCurrency(product.revenue)}</span>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full">
                                                <div
                                                    className="h-1.5 bg-primary rounded-full transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <EmptyState />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function KpiCard({
    title,
    icon,
    value,
    sub,
}: {
    title: string
    icon: React.ReactNode
    value: string | number | null
    sub: string
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                {value === null ? (
                    <Skeleton className="h-7 w-24" />
                ) : (
                    <div className="text-2xl font-bold">{value}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
        </Card>
    )
}

function DistributionBar({
    icon,
    label,
    count,
    pct,
    sub,
}: {
    icon: React.ReactNode
    label: string
    count: number
    pct: number
    sub: string
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                    {icon}
                    <span>{label}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{count} pedido{count !== 1 ? 's' : ''}</span>
                    <span className="font-medium w-8 text-right">{pct}%</span>
                </div>
            </div>
            <div className="h-2 bg-muted rounded-full">
                <div
                    className="h-2 bg-primary rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <p className="text-xs text-muted-foreground text-right">{sub}</p>
        </div>
    )
}

function DailyChart({ data, period }: { data: DailyData[]; period: Period }) {
    if (data.length === 0) return <EmptyState />

    const maxOrders = Math.max(...data.map(d => d.orders), 1)
    const showEvery = period === '30days' ? 5 : 1

    return (
        <div className="space-y-1">
            <div className="flex items-end gap-1 h-24">
                {data.map((day, idx) => {
                    const height = Math.max((day.orders / maxOrders) * 88, day.orders > 0 ? 4 : 0)
                    return (
                        <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                            {/* Tooltip */}
                            {day.orders > 0 && (
                                <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                                    <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                        {day.orders} pedido{day.orders !== 1 ? 's' : ''}<br />
                                        {formatCurrency(day.revenue)}
                                    </div>
                                    <div className="border-4 border-transparent border-t-gray-900 -mt-px" />
                                </div>
                            )}
                            <div
                                className="w-full rounded-t transition-all bg-primary/80 hover:bg-primary"
                                style={{ height: `${height}px` }}
                            />
                        </div>
                    )
                })}
            </div>
            <div className="flex gap-1">
                {data.map((day, idx) => (
                    <div key={day.date} className="flex-1 text-center">
                        {idx % showEvery === 0 && (
                            <span className="text-xs text-muted-foreground">
                                {getDayLabel(day.date, period)}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function EmptyState() {
    return (
        <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum pedido no período selecionado.
        </p>
    )
}
