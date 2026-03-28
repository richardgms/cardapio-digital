'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Schemas de validação
 */
const ZoneSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório').max(100),
    price: z.number().min(0, 'Preço deve ser positivo'),
    is_active: z.boolean().optional()
})

/**
 * Registra log de auditoria
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
 * Busca zonas de um lojista via proxy
 */
export async function fetchZonesForProxy(storeId: string) {
    return withSuperAdmin(async (adminClient) => {
        const { data, error } = await adminClient
            .from('delivery_zones')
            .select('*')
            .eq('store_id', storeId)
            .order('name', { ascending: true })

        if (error) throw new Error(`Erro ao buscar zonas: ${error.message}`)
        return data || []
    })
}

/**
 * Salva ou atualiza uma zona de entrega via proxy
 */
export async function saveZoneAsProxy(storeId: string, zoneId: string | 'novo', data: { name: string, price: number }) {
    return withSuperAdmin(async (adminClient, user) => {
        const validated = ZoneSchema.parse(data)

        if (zoneId === 'novo') {
            const { data: newZone, error } = await adminClient
                .from('delivery_zones')
                .insert({
                    store_id: storeId,
                    name: validated.name,
                    price: validated.price,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw error

            await recordAuditLog(adminClient, user.id, storeId, 'create', 'delivery_zones', { zoneId: newZone.id, ...validated })
            revalidatePath(`/admin/super/lojista/${storeId}/zonas`)
            return { success: true, id: newZone.id }
        } else {
            const { error } = await adminClient
                .from('delivery_zones')
                .update({
                    name: validated.name,
                    price: validated.price
                })
                .eq('id', zoneId)
                .eq('store_id', storeId)

            if (error) throw error

            await recordAuditLog(adminClient, user.id, storeId, 'update', 'delivery_zones', { zoneId, ...validated })
            revalidatePath(`/admin/super/lojista/${storeId}/zonas`)
            return { success: true }
        }
    })
}

/**
 * Alterna o status (ativo/inativo) de uma zona via proxy
 */
export async function toggleZoneStatusAsProxy(storeId: string, zoneId: string, isActive: boolean) {
    return withSuperAdmin(async (adminClient, user) => {
        const { error } = await adminClient
            .from('delivery_zones')
            .update({ is_active: isActive })
            .eq('id', zoneId)
            .eq('store_id', storeId)

        if (error) throw error

        await recordAuditLog(adminClient, user.id, storeId, 'toggle', 'delivery_zones', { zoneId, isActive })
        revalidatePath(`/admin/super/lojista/${storeId}/zonas`)
        return { success: true }
    })
}

/**
 * Exclui uma zona via proxy
 */
export async function deleteZoneAsProxy(storeId: string, zoneId: string) {
    return withSuperAdmin(async (adminClient, user) => {
        const { error } = await adminClient
            .from('delivery_zones')
            .delete()
            .eq('id', zoneId)
            .eq('store_id', storeId)

        if (error) throw error

        await recordAuditLog(adminClient, user.id, storeId, 'delete', 'delivery_zones', { zoneId })
        revalidatePath(`/admin/super/lojista/${storeId}/zonas`)
        return { success: true }
    })
}
