import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    console.log('--- DEBUGGING AUTH USERS API V2 ---')

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 1. Users
    const userData = users.map(u => ({
        id: u.id,
        email: u.email,
        confirmed_at: u.email_confirmed_at,
        metadata: u.user_metadata,
        last_sign_in: u.last_sign_in_at
    }))

    // 2. Store Config
    const { data: stores, error: storeError } = await supabaseAdmin
        .from('store_config')
        .select('*')
        .in('id', users.map(u => u.id))

    // 3. Triggers (Requires SQL exec via RPC or direct query if possible, but admin client is limited)
    // We can try to guess by listing functions or just assume standard triggers.
    // But we can check if there is a `public.users` table and if it's in sync.
    const { data: publicUsers, error: publicUserError } = await supabaseAdmin
        .from('users') // Assuming there is a public users table
        .select('*')
        .in('id', users.map(u => u.id))

    return NextResponse.json({
        users: userData,
        stores: stores || storeError,
        publicUsers: publicUsers || { error: publicUserError?.message || 'Table might not exist' }
    })
}
