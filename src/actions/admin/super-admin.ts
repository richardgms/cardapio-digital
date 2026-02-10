'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/utils/roles'
import { revalidatePath } from 'next/cache'

/**
 * Checks if the current user is authorized as a Super Admin.
 * Throws an error if not authorized.
 */
async function checkSuperAdminAuth() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !isSuperAdmin(user.email)) {
        throw new Error('Unauthorized: Super Admin access required')
    }
}

// --- User Management ---

export async function getUsers() {
    await checkSuperAdminAuth()
    const adminClient = await createAdminClient()

    // List users using the admin client
    const { data: { users }, error } = await adminClient.auth.admin.listUsers()

    if (error) {
        console.error('Error fetching users:', error)
        throw new Error('Failed to fetch users')
    }

    return users
}

export async function deleteUser(userId: string) {
    await checkSuperAdminAuth()
    const adminClient = await createAdminClient()

    // 1. Delete associated store config first (Cascade)
    // We use the same ID because we set store_config.id = user.id
    const { error: storeError } = await adminClient
        .from('store_config')
        .delete()
        .eq('id', userId)

    if (storeError) {
        console.error('Error deleting store config:', storeError)
        // We might want to throw or continue depending on strictness. 
        // Let's continue but log it, so we at least remove the user.
    }

    // 2. Delete the user from Auth
    const { error } = await adminClient.auth.admin.deleteUser(userId)

    if (error) {
        console.error('Error deleting user:', error)
        throw new Error('Failed to delete user')
    }

    revalidatePath('/admin/super')
}

export async function toggleUserBan(userId: string, banDuration?: string) {
    await checkSuperAdminAuth()
    const adminClient = await createAdminClient()

    const banDurationMs = banDuration ? undefined : 'none'; // 'none' to unban, undefined (default) to ban? No, strict logic needed.
    // Supabase generic ban: update usage metadata or verify logic.
    // For simplicity, we can delete for now as requested, or just delete.
    // Let's implement delete first as requested in plan.
    // If ban is needed, we usually update `banned_until`.

    // The user requested "delete or deactivate".
    // Let's stick to delete for now as it's cleaner in Auth Admin API.
}

// --- Restaurant Management ---

export async function getRestaurants() {
    await checkSuperAdminAuth()
    const supabase = await createClient()

    const { data: restaurants, error } = await supabase
        .from('store_config')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching restaurants:', error)
        throw new Error('Failed to fetch restaurants')
    }

    return restaurants
}

export async function deleteRestaurant(id: string) {
    await checkSuperAdminAuth()
    const supabase = await createClient()

    const { error } = await supabase
        .from('store_config')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting restaurant:', error)
        throw new Error('Failed to delete restaurant')
    }

    revalidatePath('/admin/super')
}

// ... existing imports
import { z } from 'zod'

const createUserSchema = z.object({
    email: z.string().email(),
    restaurantName: z.string().min(3, "Nome do restaurante deve ter pelo menos 3 caracteres"),
    whatsapp: z.string().min(10, "WhatsApp deve ter pelo menos 10 caracteres"),
    subdomain: z.string().min(3, "Subdomínio deve ter pelo menos 3 caracteres").max(30).regex(/^[a-z0-9-]+$/, "Subdomínio pode conter apenas letras minúsculas, números e hífens")
})

export async function createUser(data: z.infer<typeof createUserSchema>) {
    await checkSuperAdminAuth()

    const result = createUserSchema.safeParse(data)
    if (!result.success) {
        throw new Error(result.error.issues[0].message)
    }

    const { email, restaurantName, whatsapp, subdomain } = result.data
    const adminClient = await createAdminClient()

    // Check if subdomain is already taken
    const supabaseCheck = await createAdminClient()
    const { data: existingStore } = await supabaseCheck
        .from('store_config')
        .select('id')
        .eq('subdomain', subdomain)
        .single()

    if (existingStore) {
        throw new Error('Este subdomínio já está em uso. Escolha outro.')
    }

    // 1. Create User via Auth (Magic Link / OTP support)
    const { data: userAuth, error: authError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true
    })

    if (authError) {
        console.error('Error creating user auth:', authError)
        throw new Error(authError.message)
    }

    if (!userAuth.user) {
        throw new Error("Erro inesperado: Usuário não foi criado.")
    }

    // 2. Create Store Config (Compensating Transaction)
    // If this fails, we MUST delete the userAuth to avoid valid email with no store permission
    const supabase = await createAdminClient() // Reuse client? using same service role

    const { error: storeError } = await supabase
        .from('store_config')
        .insert({
            id: userAuth.user.id, // Link Store ID to User ID for 1:1 relationship
            name: restaurantName,
            subdomain: subdomain, // For multi-tenant routing
            whatsapp: whatsapp,
            admin_email: email,
            is_open: false, // Default closed
            auto_schedule_enabled: false,
            updated_at: new Date().toISOString()
        })

    if (storeError) {
        console.error('Error creating store, rolling back user:', storeError)
        // ROLLBACK: Delete the user we just created
        await adminClient.auth.admin.deleteUser(userAuth.user.id)
        throw new Error(`Erro ao criar restaurante: ${storeError.message}. Usuário removido.`)
    }

    revalidatePath('/admin/super')
    return { success: true, user: userAuth.user }
}

export async function toggleRestaurantStatus(id: string, isOpen: boolean) {
    await checkSuperAdminAuth()
    const supabase = await createClient()

    const { error } = await supabase
        .from('store_config')
        .update({ is_open: isOpen })
        .eq('id', id)

    if (error) {
        console.error('Error updating restaurant status:', error)
        throw new Error('Failed to update restaurant status')
    }

    revalidatePath('/admin/super')
}

const updateRestaurantSchema = z.object({
    id: z.string(),
    subdomain: z.string().min(3, "Subdomínio deve ter pelo menos 3 caracteres").max(30, "Máximo 30 caracteres").regex(/^[a-z0-9-]+$/, "Subdomínio pode conter apenas letras minúsculas, números e hífens"),
    name: z.string().min(3, "Nome do restaurante deve ter pelo menos 3 caracteres"),
})

export async function updateRestaurant(data: z.infer<typeof updateRestaurantSchema>) {
    await checkSuperAdminAuth()

    const result = updateRestaurantSchema.safeParse(data)
    if (!result.success) {
        throw new Error(result.error.issues[0].message)
    }

    const { id, subdomain, name } = result.data
    const supabase = await createAdminClient()

    // Check if subdomain is already taken by ANOTHER store
    const { data: existingStore, error: checkError } = await supabase
        .from('store_config')
        .select('id')
        .eq('subdomain', subdomain)
        .neq('id', id) // Exclude current store
        .single()

    if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking subdomain:', checkError)
        throw new Error('Erro ao verificar disponibilidade do subdomínio')
    }

    if (existingStore) {
        throw new Error('Este subdomínio já está em uso por outro restaurante.')
    }

    const { error } = await supabase
        .from('store_config')
        .update({
            name,
            subdomain,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)

    if (error) {
        console.error('Error updating restaurant:', error)
        throw new Error('Falha ao atualizar restaurante')
    }

    revalidatePath('/admin/super')
    return { success: true }
}
