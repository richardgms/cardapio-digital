'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { revalidatePath } from 'next/cache'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registra log de auditoria no DB sobre a ação de proxy
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
        console.error('Falha ao registrar log de auditoria [IGNORADO PARA NÃO TRAVAR O FLUXO]:', err)
    }
}

/**
 * Busca configurações de um lojista via proxy
 */
export async function fetchStoreConfigForProxy(storeId: string) {
    return withSuperAdmin(async (adminClient) => {
        const { data, error } = await adminClient
            .from('store_config')
            .select('*')
            .eq('id', storeId)
            .single()

        if (error) {
            console.error('[PROXY] Error fetching config:', error)
            throw new Error(`Erro ao buscar configurações via proxy: ${error.message}`)
        }

        return data
    })
}

/**
 * Atualiza configurações de um lojista via proxy
 */
export async function updateStoreConfigAsProxy(storeId: string, values: Record<string, unknown>) {
    return withSuperAdmin(async (adminClient, user) => {
        const { data, error } = await adminClient
            .from('store_config')
            .upsert({
                id: storeId,
                ...values,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
            .select()
            .single()

        if (error) {
            console.error('[PROXY] Error updating config:', error)
            throw new Error(`Erro ao atualizar configurações: ${error.message}`)
        }

        await recordAuditLog(adminClient, user.id, storeId, 'update', 'store_config', values)
        revalidatePath(`/admin/super/lojista/${storeId}/config`)
        revalidatePath(`/admin/config`) // Just in case, though usually won't affect the other's view directly

        return { success: true, config: data }
    })
}
