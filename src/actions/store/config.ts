'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { StoreConfig } from '@/types/database'

/**
 * Ensures that a store_config record exists for the current authenticated user.
 * If not, it creates one using the admin client (bypassing RLS).
 * This fixes issues where users might be orphaned without a config row.
 */
export async function ensureStoreConfig() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error("Usuário não autenticado")
    }

    const adminClient = await createAdminClient()

    // Check if exists using admin client (to be sure)
    const { data: existing, error: fetchError } = await adminClient
        .from('store_config')
        .select('*')
        .eq('id', user.id)
        .single()

    if (existing) {
        return { success: true, config: existing }
    }

    // If not exists, create it
    console.log(`Creating missing store_config for user ${user.id}...`)

    // Default data structure
    const newConfig = {
        id: user.id,
        name: "Minha Loja",
        whatsapp: "",
        admin_email: user.email || "",
        is_open: false,
        minimum_order: 0,
        subdomain: null, // User needs to set this via admin or it's set by super admin
        updated_at: new Date().toISOString()
    }

    const { data: created, error: createError } = await adminClient
        .from('store_config')
        .insert(newConfig)
        .select()
        .single()

    if (createError) {
        console.error("Error creating store_config:", createError)
        throw new Error(`Erro ao criar configuração da loja: ${createError.message}`)
    }

    return { success: true, config: created }
}
