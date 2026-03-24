import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StoreConfig, BusinessHour } from '@/types/database'
import { isStoreOpenNow } from '@/lib/checkStoreOpen'

export type StoreWithHours = StoreConfig & {
    business_hours?: BusinessHour[]
}

/**
 * Get subdomain directly from window.location.hostname.
 * More reliable than reading the cookie, which may not be available
 * on the first render cycle (before the browser applies Set-Cookie).
 */
function getSubdomainFromHostname(): string | null {
    if (typeof window === 'undefined') return null

    const hostname = window.location.hostname
    const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost').split(':')[0]

    // Local development: nutribox.localhost
    if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        const parts = hostname.split('.')
        return parts.length >= 2 ? parts[0] : null
    }

    // Production: nutribox.rmenu.com.br
    if (hostname === rootDomain || hostname === `www.${rootDomain}`) return null

    if (hostname.endsWith(`.${rootDomain}`)) {
        const subdomain = hostname.replace(`.${rootDomain}`, '')
        return subdomain === 'www' ? null : subdomain
    }

    return null
}

/**
 * Hook for PUBLIC menu pages - fetches store by subdomain (no auth required)
 */
export function usePublicStore() {
    const [store, setStore] = useState<StoreWithHours | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Derived state
    const isCurrentlyOpen = useMemo(() => {
        if (!store) return false;
        return isStoreOpenNow(
            store.auto_schedule_enabled,
            store.is_open,
            store.business_hours || []
        );
    }, [store]);

    const fetchStore = async () => {
        try {
            setLoading(true)
            const supabase = createClient()
            const subdomain = getSubdomainFromHostname()

            let query = supabase
                .from('store_config')
                .select(`
                    *,
                    business_hours (
                        *,
                        periods:business_hour_periods (*)
                    )
                `)

            if (subdomain) {
                // Fetch by subdomain
                query = query.eq('subdomain', subdomain)

                const { data, error } = await query.single()

                if (error) {
                    console.error('Store not found:', error)
                    // If subdomain exists but store doesn't, we throw error
                    throw new Error('Restaurante não encontrado')
                }

                setStore(data)
            } else {
                // Root domain -> No store loaded
                // This allows the page to render the Landing Page instead
                setStore(null)
            }
        } catch (err: any) {
            console.error('Erro ao carregar loja:', err)
            setError(err.message || 'Erro ao carregar dados da loja')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStore()
    }, [])

    return { store, loading, error, fetchStore, setStore, isCurrentlyOpen }
}
