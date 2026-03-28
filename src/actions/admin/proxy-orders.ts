'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { z } from 'zod'

/**
 * Registra log de auditoria para acesso a dados sensíveis (Pedidos)
 */
async function recordAuditLog(adminClient: any, adminId: string, storeId: string, actionType: string, entityName: string, payload: any) {
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
export async function fetchOrdersAsProxy(storeId: string, period: string) {
    return withSuperAdmin(async (adminClient, user) => {
        let query = adminClient
            .from('orders')
            .select('*')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })

        if (period !== 'all') {
            const now = new Date()
            let start: Date
            if (period === 'today') {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            } else if (period === '7days') {
                start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            } else {
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            }
            query = query.gte('created_at', start.toISOString())
        }

        const { data, error } = await query
        if (error) throw error

        await recordAuditLog(adminClient, user.id, storeId, 'view_list', 'orders', { period })
        return data || []
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
