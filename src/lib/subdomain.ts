/**
 * Reads the current subdomain directly from window.location.hostname.
 *
 * This is the canonical way to detect the subdomain on the client side.
 * Reading from the cookie set by the middleware is unreliable on the first
 * page visit because the Set-Cookie header may not yet be applied to
 * document.cookie when the first useEffect runs.
 *
 * Returns null on the root domain or during SSR.
 */
export function getSubdomain(): string | null {
    if (typeof window === 'undefined') return null

    const hostname = window.location.hostname
    const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost').split(':')[0]

    // Local development: nutribox.localhost
    if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        const parts = hostname.split('.')
        return parts.length >= 2 ? parts[0] : null
    }

    // Root domain or www — no subdomain
    if (hostname === rootDomain || hostname === `www.${rootDomain}`) return null

    // Production subdomain: nutribox.rmenu.com.br
    if (hostname.endsWith(`.${rootDomain}`)) {
        const sub = hostname.replace(`.${rootDomain}`, '')
        return sub === 'www' ? null : sub
    }

    return null
}
