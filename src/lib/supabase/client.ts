import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            // maxAge makes cookies persistent (not session-only).
            // This is required for PWA: when a magic link opens in the
            // system browser (Safari/Chrome), the PKCE code_verifier
            // cookie — set by the PWA context — must be readable there.
            // iOS 14.4+ and Android share persistent domain cookies between
            // the installed PWA and the system browser; session cookies are NOT shared.
            cookieOptions: {
                maxAge: 60 * 60, // 1 hour — matches magic link TTL
                sameSite: 'lax',
                path: '/',
            },
            global: {
                headers: {
                    'Cache-Control': 'no-store'
                }
            }
        }
    )
}
