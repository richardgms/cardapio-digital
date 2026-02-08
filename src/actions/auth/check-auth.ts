'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type CheckAuthResult = {
    authorized: boolean
    error?: string
}

export async function checkEmailAuthorized(email: string): Promise<CheckAuthResult> {
    try {
        // 1. Super Admin Bypass
        if (email === 'richardgms001@gmail.com') {
            return { authorized: true }
        }

        const supabase = await createAdminClient()

        // 2. Check Store Config
        const { data: config, error } = await supabase
            .from('store_config')
            .select('admin_email')
            .eq('admin_email', email)
            .single()

        if (error || !config) {
            // Log error internally if needed, but don't expose details
            console.error('Auth check failed:', error)
            return { authorized: false, error: 'Email não autorizado.' }
        }

        if (config.admin_email !== email) {
            return { authorized: false, error: 'Email não autorizado.' }
        }

        return { authorized: true }
    } catch (err) {
        console.error('Unexpected auth check error:', err)
        return { authorized: false, error: 'Erro ao verificar autorização.' }
    }
}
