'use server'

import { ORDER_DETAIL_WITH_PRINTING } from '@/lib/print-job-status';

import { withSuperAdmin } from '@/lib/auth-guards'
import { SupabaseClient } from '@supabase/supabase-js'
import type { DeliveryType } from '@/types/database'
import { ordersPageRange, ordersPeriodStart, type OrdersPeriod } from '@/lib/orders-period'

/**
 * Registra log de auditoria para acesso a dados sensíveis (Pedidos)
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
 * Busca pedidos de um lojista via proxy com filtros
 */
export async function fetchOrdersAsProxy(storeId: string, period: OrdersPeriod, page = 0, delivery: DeliveryType | 'all' = 'all') {
    return withSuperAdmin(async (adminClient, user) => {
        const [from, to] = ordersPageRange(page)
        let query = adminClient.from('orders').select('*', { count: 'exact' }).eq('store_id', storeId)
            .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
        if (!['all','delivery','pickup','table'].includes(delivery)) throw new Error('Tipo inválido')
        if (delivery !== 'all') query = query.eq('delivery_type', delivery)
        const start = ordersPeriodStart(period)
        if (start) query = query.gte('created_at', start)
        const { data, count, error } = await query
        if (error) throw error
        await recordAuditLog(adminClient, user.id, storeId, 'view_list', 'orders', { period, page, delivery })
        return { orders: data || [], total: count ?? 0 }
    })
}

/** Cabeçalho e itens na mesma leitura; autorização e loja aplicadas antes de retornar. */
export async function fetchOrderDetailAsProxy(storeId: string, orderId: string) {
    return withSuperAdmin(async (adminClient, user) => {
        const { data, error } = await adminClient.from('orders').select(ORDER_DETAIL_WITH_PRINTING)
            .eq('store_id', storeId).eq('id', orderId).single()
        if (error || !data) throw new Error('Pedido não encontrado ou acesso negado.')
        await recordAuditLog(adminClient, user.id, storeId, 'view_detail', 'orders', { orderId })
        return data
    })
}

/**
 * Busca itens de um pedido específico via proxy
 */
export async function fetchOrderItemsAsProxy(storeId: string, orderId: string) {
    return withSuperAdmin(async (adminClient, user) => {
        // Validação adicional: Garantir que o pedido pertence à loja
        const { data: order, error: orderError } = await adminClient
            .from('orders')
            .select('id')
            .eq('id', orderId)
            .eq('store_id', storeId)
            .single()

        if (orderError || !order) throw new Error("Pedido não encontrado ou acesso negado.")

        const { data, error } = await adminClient
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)

        if (error) throw error

        await recordAuditLog(adminClient, user.id, storeId, 'view_detail', 'orders', { orderId })
        return data || []
    })
}
