import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StoreConfig, BusinessHour } from '@/types/database'
import { isStoreOpenNow } from '@/lib/checkStoreOpen'

export type StoreWithHours = StoreConfig & {
    business_hours?: BusinessHour[]
}

/**
 * Get subdomain from cookie (set by middleware)
 */
function getSubdomainFromCookie(): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|; )subdomain=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : null
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
            const subdomain = getSubdomainFromCookie()

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
            } else {
                // Fallback: get first store (for development/backwards compat)
                query = query.limit(1)
            }

            const { data, error } = await query.single()

            if (error) {
                console.error('Store not found:', error)
                throw new Error('Restaurante não encontrado')
            }

            setStore(data)
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
