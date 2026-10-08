"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchOrdersAsProxy, fetchOrderDetailAsProxy } from '@/actions/admin/proxy-orders';
import { createLatestLoader, createReconciler, type LatestLoader, type RefreshController } from '@/lib/orders-refresh';
import { ordersPageRange, ordersPeriodStart, type OrdersPeriod } from '@/lib/orders-period';
import type { Order, OrderItem, DeliveryType } from '@/types/database';

import { ORDER_DETAIL_WITH_PRINTING, type PrintJobView } from '@/lib/print-job-status';
type OrderDetail = Order & { items: OrderItem[]; document: { jobs: PrintJobView[] } | null };
type DetailRequest = { id: string; foreground: boolean };

export function useOrdersFeed({ storeId, isImpersonating, period, page, delivery }: {
    storeId?: string; isImpersonating?: boolean; period: OrdersPeriod; page: number; delivery: DeliveryType | 'all';
}) {
    const supabase = useMemo(() => createClient(), []);
    const scope = JSON.stringify([storeId, !!isImpersonating, period, page, delivery]);
    const [loadedScope, setLoadedScope] = useState<string | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
    const [loadingItems, setLoadingItems] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const selectedId = useRef<string | null>(null);
    const refreshController = useRef<RefreshController | null>(null);
    const detailController = useRef<LatestLoader<DetailRequest> | null>(null);

    useEffect(() => {
        let disposed = false;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let channelStore: string | null = null;
        let lastAuthId: string | null | undefined;
        const resolveStore = async () => {
            if (isImpersonating) {
                if (!storeId) throw new Error('Loja ausente');
                return storeId;
            }
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) throw new Error('Sessão indisponível');
            if (lastAuthId === undefined) lastAuthId = user.id;
            return user.id;
        };
        const details = createLatestLoader<DetailRequest, OrderDetail>({
            async load({ id }) {
                const owner = await resolveStore();
                if (isImpersonating) return await fetchOrderDetailAsProxy(owner, id) as OrderDetail;
                const { data, error } = await supabase.from('orders').select(ORDER_DETAIL_WITH_PRINTING).eq('store_id', owner).eq('id', id).single();
                if (error) throw error;
                return data as OrderDetail;
            },
            start({ foreground }) { if (foreground) setLoadingItems(true); },
            result(value, { id }) {
                if (selectedId.current !== id) return;
                value.items.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
                setSelectedOrder(value); setDetailError(null);
            },
            error() { setDetailError('Não foi possível atualizar os detalhes. Tente novamente.'); },
            finish() { setLoadingItems(false); },
        });
        const reconcile = createReconciler<{ orders: Order[]; total: number }>({
            async load() {
                const owner = await resolveStore();
                if (disposed) throw new Error('Leitura encerrada');
                if (channelStore !== owner) {
                    if (channel) void supabase.removeChannel(channel);
                    channelStore = owner;
                    channel = supabase.channel(`orders-${crypto.randomUUID()}`).on('postgres_changes', {
                        event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${owner}`,
                    }, () => { void reconcile.refresh(); }).subscribe(status => {
                        if (status === 'SUBSCRIBED') void reconcile.refresh();
                    });
                }
                if (isImpersonating) return await fetchOrdersAsProxy(owner, period, page, delivery);
                const [from, to] = ordersPageRange(page);
                let query = supabase.from('orders').select('*', { count: 'exact' }).eq('store_id', owner)
                    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
                if (delivery !== 'all') query = query.eq('delivery_type', delivery);
                const start = ordersPeriodStart(period);
                if (start) query = query.gte('created_at', start);
                const { data, count, error } = await query;
                if (error) throw error;
                return { orders: data ?? [], total: count ?? 0 };
            },
            result(value) {
                setOrders(value.orders); setTotal(value.total); setError(null); setLoading(false);
                setLoadedScope(scope); setLastSyncedAt(new Date());
                // Reconciliar cabeçalho/status do detalhe aberto, mesmo fora desta página.
                if (selectedId.current) void details.load({ id: selectedId.current, foreground: false });
            },
            error() { setError('Não foi possível atualizar os pedidos. Os dados podem estar desatualizados.'); setLoading(false); setLoadedScope(scope); },
            busy: setRefreshing,
        });
        refreshController.current = reconcile;
        detailController.current = details;
        const refreshVisible = () => { if (document.visibilityState !== 'hidden') void reconcile.refresh(); };
        const interval = window.setInterval(refreshVisible, 15_000);
        window.addEventListener('online', refreshVisible);
        window.addEventListener('focus', refreshVisible);
        document.addEventListener('visibilitychange', refreshVisible);
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            const nextAuthId = session?.user.id ?? null;
            if (event === 'INITIAL_SESSION') { lastAuthId = nextAuthId; return; }
            if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' && lastAuthId !== nextAuthId) {
                lastAuthId = nextAuthId;
                details.invalidate(); selectedId.current = null; setSelectedOrder(null); setOrders([]);
                setTotal(0); setLastSyncedAt(null); setLoadingItems(false);
                // Não aguardar getUser dentro do callback de Auth.
                queueMicrotask(() => { if (!disposed) void reconcile.refresh(); });
            }
        });
        queueMicrotask(() => {
            if (disposed) return;
            selectedId.current = null; setSelectedOrder(null); setDetailError(null); setLoadingItems(false);
            setOrders([]); setTotal(0); setLoading(true); setLastSyncedAt(null); setError(null);
            void reconcile.refresh();
        });
        return () => {
            disposed = true; reconcile.dispose(); details.dispose();
            window.clearInterval(interval);
            window.removeEventListener('online', refreshVisible);
            window.removeEventListener('focus', refreshVisible);
            document.removeEventListener('visibilitychange', refreshVisible);
            authListener.subscription.unsubscribe();
            if (channel) void supabase.removeChannel(channel);
            if (refreshController.current === reconcile) refreshController.current = null;
            if (detailController.current === details) detailController.current = null;
        };
    }, [supabase, scope, storeId, isImpersonating, period, page, delivery]);

    const refresh = useCallback(() => { void refreshController.current?.refresh(); }, []);
    const openOrderDetail = useCallback((order: Order) => {
        selectedId.current = order.id; setSelectedOrder({ ...order, items: [], document: null }); setDetailError(null);
        void detailController.current?.load({ id: order.id, foreground: true });
    }, []);
    const closeOrderDetail = useCallback(() => {
        detailController.current?.invalidate(); selectedId.current = null;
        setSelectedOrder(null); setDetailError(null); setLoadingItems(false);
    }, []);
    const retryDetail = useCallback(() => {
        if (selectedId.current) void detailController.current?.load({ id: selectedId.current, foreground: true });
    }, []);
    const current = loadedScope === scope;
    return { orders: current ? orders : [], total: current ? total : 0, loading: !current || loading, refreshing,
        lastSyncedAt: current ? lastSyncedAt : null, error: current ? error : null,
        selectedOrder: current ? selectedOrder : null, loadingItems, detailError,
        refresh, openOrderDetail, closeOrderDetail, retryDetail };
}
