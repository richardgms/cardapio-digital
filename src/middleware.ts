import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Domain configuration - update this when you buy your domain!
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000'

/**
 * Extracts subdomain from hostname
 * Example: nutribox.cardapiodigital.app -> 'nutribox'
 * Example: cardapiodigital.app -> null (root domain)
 * Example: localhost:3000 -> null
 * Example: nutribox.localhost:3000 -> 'nutribox' (for local testing)
 */
function getSubdomain(hostname: string): string | null {
    // Remove port if present
    const host = hostname.split(':')[0]

    // Local development: nutribox.localhost
    if (host.endsWith('.localhost') || host.endsWith('.local')) {
        const parts = host.split('.')
        if (parts.length >= 2) {
            return parts[0]
        }
        return null
    }

    // Production: nutribox.cardapiodigital.app
    const rootDomainWithoutPort = ROOT_DOMAIN.split(':')[0]
    if (host === rootDomainWithoutPort || host === `www.${rootDomainWithoutPort}`) {
        return null // Root domain, no subdomain
    }

    // Check if it's a subdomain
    if (host.endsWith(`.${rootDomainWithoutPort}`)) {
        const subdomain = host.replace(`.${rootDomainWithoutPort}`, '')
        // Ignore 'www' as subdomain
        if (subdomain === 'www') return null
        return subdomain
    }

    return null
}

export async function middleware(request: NextRequest) {
    const hostname = request.headers.get('host') || ''
    const subdomain = getSubdomain(hostname)

    // Clone headers and add subdomain
    const requestHeaders = new Headers(request.headers)
    if (subdomain) {
        requestHeaders.set('x-subdomain', subdomain)
    }

    let response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })

    // Also set subdomain as a cookie for client-side access
    if (subdomain) {
        response.cookies.set('subdomain', subdomain, {
            path: '/',
            sameSite: 'lax',
        })
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    })
                    response = NextResponse.next({
                        request: {
                            headers: requestHeaders,
                        },
                    })
                    // Re-apply subdomain cookie after response recreation
                    if (subdomain) {
                        response.cookies.set('subdomain', subdomain, { path: '/', sameSite: 'lax' })
                    }
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // Apenas proteger rotas /admin
    if (request.nextUrl.pathname.startsWith('/admin')) {
        // Permitir acesso ao login
        if (request.nextUrl.pathname === '/admin/login') {
            return response
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }

        // Proteger rota de Super Admin
        if (request.nextUrl.pathname.startsWith('/admin/super')) {
            const isSuperAdmin = user.email === 'richardgms001@gmail.com'

            if (!isSuperAdmin) {
                return NextResponse.redirect(new URL('/admin', request.url))
            }
        }
    }

    return response
}

export const config = {
    // Match all routes except static files and api
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}

