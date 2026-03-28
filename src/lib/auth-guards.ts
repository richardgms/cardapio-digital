import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Validates if the current session belongs to a Super Admin.
 * Baseado na regra do middleware: email === 'richardgms001@gmail.com'
 */
export async function validateSuperAdmin() {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error('Não autorizado: Sessão inválida')
    }

    const isSuperAdmin = user.email === 'richardgms001@gmail.com'

    if (!isSuperAdmin) {
        throw new Error('Não autorizado: Acesso restrito a Super Admins')
    }

    return user
}

/**
 * Type-safe wrapper for Super Admin actions that use the Service Role client.
 */
export async function withSuperAdmin<T>(
    action: (adminClient: SupabaseClient, user: User) => Promise<T>
): Promise<T> {
    const user = await validateSuperAdmin()
    const adminClient = createAdminClient()
    
    return action(adminClient, user)
}
