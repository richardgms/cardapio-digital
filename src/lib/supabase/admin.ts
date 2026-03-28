import { createClient } from '@supabase/supabase-js'

// Create a Supabase client with the SERVICE_ROLE key.
// Uses the raw supabase-js client (NOT the SSR wrapper) to avoid injecting
// the user's JWT into the Authorization header — which would cause PostgREST
// to apply RLS even when the service role key is present.
export function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}
