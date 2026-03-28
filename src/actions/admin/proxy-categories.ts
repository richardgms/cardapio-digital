'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Schemas de validação para garantir integridade dos dados via proxy
 */
const CategorySchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório').max(100),
    sort_order: z.number().int().min(0).optional()
})

const ReorderSchema = z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int()
}))

/**
 * Registra log de auditoria no DB
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
 * Busca categorias de um lojista via proxy
 */
export async function fetchCategoriesForProxy(storeId: string) {
    return withSuperAdmin(async (adminClient) => {
        const { data, error } = await adminClient
            .from('categories')
            .select('*')
            .eq('store_id', storeId)
            .order('sort_order', { ascending: true })

        if (error) throw new Error(`Erro ao buscar categorias: ${error.message}`)
        return data || []
    })
}

/**
 * Salva ou atualiza uma categoria via proxy
 */
export async function saveCategoryAsProxy(storeId: string, categoryId: string | 'novo', name: string) {
    return withSuperAdmin(async (adminClient, user) => {
        // Validação de Input
        const validated = CategorySchema.parse({ name })

        if (categoryId === 'novo') {
            const { data, error } = await adminClient
                .from('categories')
                .insert({
                    store_id: storeId,
                    name: validated.name,
                    sort_order: 999 // Será reordenado pelo client ou vai pro final
                })
                .select()
                .single()

            if (error) throw error

            await recordAuditLog(adminClient, user.id, storeId, 'create', 'categories', { categoryId: data.id, name: validated.name })
            revalidatePath(`/admin/super/lojista/${storeId}/categorias`)
            return { success: true, id: data.id }
        } else {
            const { error } = await adminClient
                .from('categories')
                .update({ name: validated.name })
                .eq('id', categoryId)
                .eq('store_id', storeId)

            if (error) throw error

            await recordAuditLog(adminClient, user.id, storeId, 'update', 'categories', { categoryId, name: validated.name })
            revalidatePath(`/admin/super/lojista/${storeId}/categorias`)
            return { success: true }
        }
    })
}

/**
 * Exclui uma categoria via proxy
 */
export async function deleteCategoryAsProxy(storeId: string, categoryId: string) {
    return withSuperAdmin(async (adminClient, user) => {
        const { error } = await adminClient
            .from('categories')
            .delete()
            .eq('id', categoryId)
            .eq('store_id', storeId)

        if (error) throw error

        await recordAuditLog(adminClient, user.id, storeId, 'delete', 'categories', { categoryId })
        revalidatePath(`/admin/super/lojista/${storeId}/categorias`)
        return { success: true }
    })
}

/**
 * Reordena categorias via proxy (Batch Update)
 */
export async function reorderCategoriesAsProxy(storeId: string, categories: { id: string, sort_order: number }[]) {
    return withSuperAdmin(async (adminClient, user) => {
        const validated = ReorderSchema.parse(categories)

        // No Supabase, upsert com múltiplos campos funciona como batch update se o ID coincidir
        // Precisamos garantir que o store_id seja incluído para segurança extra no bypass
        const updates = validated.map(c => ({
            id: c.id,
            store_id: storeId,
            sort_order: c.sort_order
        }))

        const { error } = await adminClient
            .from('categories')
            .upsert(updates, { onConflict: 'id' })

        if (error) throw error

        await recordAuditLog(adminClient, user.id, storeId, 'reorder', 'categories', { count: categories.length })
        revalidatePath(`/admin/super/lojista/${storeId}/categorias`)
        return { success: true }
    })
}
