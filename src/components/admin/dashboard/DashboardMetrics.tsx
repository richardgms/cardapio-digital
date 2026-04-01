'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { ShoppingBag, TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react'

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const chartConfig: ChartConfig = {
    esta: { label: 'Esta semana', color: 'var(--primary)' },
    anterior: { label: 'Semana anterior', color: 'var(--border)' },
}

interface DailyComparison {
    dia: string
    esta: number
    anterior: number
}

interface MetricsData {
    todayOrders: number
    todayRevenue: number
    topProduct: { name: string; qty: number } | null
    weekTotal: number
    prevWeekTotal: number
    chartData: DailyComparison[]
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function startOfDayBrasilia(daysAgo = 0): Date {
    const now = new Date()
    const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    brasilia.setDate(brasilia.getDate() - daysAgo)
    brasilia.setHours(0, 0, 0, 0)
    // Convert back to UTC
    const offset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getTime()
    return new Date(brasilia.getTime() + offset)
}

export function DashboardMetrics() {
    const [data, setData] = useState<MetricsData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetch() {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const todayStart = startOfDayBrasilia(0)
                const weekStart = startOfDayBrasilia(6)
                const prevWeekStart = startOfDayBrasilia(13)

                // Fetch last 14 days of orders
                const { data: orders } = await supabase
                    .from('orders')
                    .select('id, total, created_at, status')
                    .eq('store_id', user.id)
                    .neq('status', 'cancelled')
                    .gte('created_at', prevWeekStart.toISOString())
                    .order('created_at', { ascending: true })

                if (!orders) return

                // Split: today / this week (last 7d) / prev week (8-14d)
                const todayOrders = orders.filter(o => new Date(o.created_at) >= todayStart)
                const weekOrders = orders.filter(o => new Date(o.created_at) >= weekStart)
                const prevWeekOrders = orders.filter(o => {
                    const d = new Date(o.created_at)
                    return d >= prevWeekStart && d < weekStart
                })

                const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0)
                const weekTotal = weekOrders.length
                const prevWeekTotal = prevWeekOrders.length

                // Chart data: last 7 days vs 7 days before
                const chartData: DailyComparison[] = []
                for (let i = 6; i >= 0; i--) {
                    const dayStart = startOfDayBrasilia(i)
                    const dayEnd = startOfDayBrasilia(i - 1)
                    const prevDayStart = startOfDayBrasilia(i + 7)
                    const prevDayEnd = startOfDayBrasilia(i + 6)

                    const esta = orders.filter(o => {
                        const d = new Date(o.created_at)
                        return d >= dayStart && d < dayEnd
                    }).length

                    const anterior = orders.filter(o => {
                        const d = new Date(o.created_at)
                        return d >= prevDayStart && d < prevDayEnd
                    }).length

                    const dayOfWeek = new Date(dayStart).getDay()
                    chartData.push({ dia: DAYS_PT[dayOfWeek], esta, anterior })
                }

                // Top product this week
                const weekOrderIds = weekOrders.map(o => o.id)
                let topProduct: { name: string; qty: number } | null = null

                if (weekOrderIds.length > 0) {
                    const { data: items } = await supabase
                        .from('order_items')
                        .select('product_name, quantity')
                        .in('order_id', weekOrderIds)

                    if (items && items.length > 0) {
                        const productMap = new Map<string, number>()
                        for (const item of items) {
                            productMap.set(
                                item.product_name,
                                (productMap.get(item.product_name) || 0) + (item.quantity || 0)
                            )
                        }
                        const sorted = Array.from(productMap.entries()).sort((a, b) => b[1] - a[1])
                        if (sorted.length > 0) topProduct = { name: sorted[0][0], qty: sorted[0][1] }
                    }
                }

                setData({
                    todayOrders: todayOrders.length,
                    todayRevenue,
                    topProduct,
                    weekTotal,
                    prevWeekTotal,
                    chartData,
                })
            } finally {
                setLoading(false)
            }
        }

        fetch()
    }, [])

    const weekDiff = data ? data.weekTotal - data.prevWeekTotal : 0
    const weekPct = data && data.prevWeekTotal > 0
        ? Math.round((weekDiff / data.prevWeekTotal) * 100)
        : null

    return (
        <div className="space-y-4">
            {/* Row: hoje + top produto */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Pedidos de hoje */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-7 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{data?.todayOrders ?? 0}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatCurrency(data?.todayRevenue ?? 0)} em faturamento
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Produto mais vendido */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Mais Vendido esta Semana</CardTitle>
                        <Trophy className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-7 w-32" />
                        ) : data?.topProduct ? (
                            <>
                                <div className="text-lg font-bold truncate">{data.topProduct.name}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {data.topProduct.qty} unidades vendidas
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Nenhum pedido na semana</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Comparativo da semana */}
            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Comparativo Semanal</CardTitle>
                        {!loading && data && (
                            <TrendBadge prev={data.prevWeekTotal} pct={weekPct} />
                        )}
                    </div>
                    {!loading && data && (
                        <p className="text-xs text-muted-foreground">
                            {data.weekTotal} pedidos esta semana · {data.prevWeekTotal} na semana anterior
                        </p>
                    )}
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-40 w-full" />
                    ) : (
                        <ChartContainer config={chartConfig} className="h-40 w-full">
                            <BarChart data={data?.chartData ?? []} barCategoryGap="25%">
                                <XAxis
                                    dataKey="dia"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11 }}
                                />
                                <YAxis hide allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="anterior" fill="var(--color-anterior)" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="esta" fill="var(--color-esta)" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function TrendBadge({
    prev,
    pct,
}: {
    prev: number
    pct: number | null
}) {
    if (pct === null || prev === 0) {
        return <Badge variant="secondary" className="gap-1"><Minus className="h-3 w-3" />Sem dados</Badge>
    }
    if (pct > 0) {
        return (
            <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
                <TrendingUp className="h-3 w-3" />+{pct}%
            </Badge>
        )
    }
    if (pct < 0) {
        return (
            <Badge className="gap-1 bg-red-100 text-red-700 hover:bg-red-100">
                <TrendingDown className="h-3 w-3" />{pct}%
            </Badge>
        )
    }
    return <Badge variant="secondary" className="gap-1"><Minus className="h-3 w-3" />Estável</Badge>
}
