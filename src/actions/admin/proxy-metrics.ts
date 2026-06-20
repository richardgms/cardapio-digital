'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registra log de auditoria para acesso a dados sensíveis (Métricas)
 */
async function recordAuditLog(
    adminClient: SupabaseClient, 
    adminId: string, 
    storeId: string, 
    actionType: string, 
    entityName: string, 
    payload: Record<string, unknown>
) {
    try {
        await adminClient.from('admin_impersonation_logs').insert({
            admin_id: adminId,
            target_store_id: storeId,
            action_type: actionType,
            entity_name: entityName,
            payload: payload
        })
    } catch (err) {
        console.error('Falha ao registrar log de auditoria [IGNORADO]:', err)
    }
}

/**
 * Busca pedidos e itens de pedidos para métricas via proxy
 */
export async function fetchMetricsDataAsProxy(
    storeId: string,
    period: string,
    deliveryFilter: string
) {
    return withSuperAdmin(async (adminClient, user) => {
        let query = adminClient
            .from('orders')
            .select('id, status, delivery_type, payment_method, total, created_at')
            .eq('store_id', storeId)

        if (period !== 'all') {
            const now = new Date()
            const brasiliaOffset = -3 * 60
            const localOffset = now.getTimezoneOffset()
            const diff = (localOffset + brasiliaOffset) * 60 * 1000
            const brasilia = new Date(now.getTime() - diff)

            if (period === 'today') {
                brasilia.setHours(0, 0, 0, 0)
            } else if (period === '7days') {
                brasilia.setDate(brasilia.getDate() - 6)
                brasilia.setHours(0, 0, 0, 0)
            } else {
                // 30days
                brasilia.setDate(brasilia.getDate() - 29)
                brasilia.setHours(0, 0, 0, 0)
            }
            const periodStart = new Date(brasilia.getTime() + diff)
            query = query.gte('created_at', periodStart.toISOString())
        }

        if (deliveryFilter !== 'all') {
            query = query.eq('delivery_type', deliveryFilter)
        }

        const { data: orders, error: ordersError } = await query
            .order('created_at', { ascending: true })

        if (ordersError) throw ordersError

        const activeOrders = orders ? orders.filter(o => o.status !== 'cancelled') : []
        const activeOrderIds = activeOrders.map(o => o.id)

        let items: any[] = []
        if (activeOrderIds.length > 0) {
            const { data: itemsData, error: itemsError } = await adminClient
                .from('order_items')
                .select('product_name, quantity, item_total, order_id')
                .in('order_id', activeOrderIds)

            if (itemsError) throw itemsError
            items = itemsData || []
        }

        await recordAuditLog(adminClient, user.id, storeId, 'view_metrics', 'metrics', { period, deliveryFilter })

        return {
            orders: orders || [],
            items: items
        }
    })
}
