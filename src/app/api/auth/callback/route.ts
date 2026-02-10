import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = requestUrl.searchParams.get('next') ?? '/admin'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            return NextResponse.redirect(`${requestUrl.origin}${next}`)
        }

        // Log the error for debugging
        console.error('[Auth Callback] Error exchanging code:', error.message)
        return NextResponse.redirect(
            `${requestUrl.origin}/admin/login?error=auth&message=${encodeURIComponent(error.message)}`
        )
    }

    // Return the user to an error page with instructions
    console.error('[Auth Callback] No code parameter found in URL')
    return NextResponse.redirect(`${requestUrl.origin}/admin/login?error=auth&message=${encodeURIComponent('No code provided')}`)
}
