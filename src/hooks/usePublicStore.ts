import { useEffect, useState, useMemo } from 'react'
import { getPublicStoreBySubdomain } from '@/actions/store/get-store-by-subdomain'
import type { PublicStoreWithHours } from '@/lib/public-store'
import { isStoreOpenNow } from '@/lib/checkStoreOpen'
import { getSubdomain } from '@/lib/subdomain'

export type StoreWithHours = PublicStoreWithHours

/**
 * Hook for PUBLIC menu pages - fetches store by subdomain (no auth required)
 */
export function usePublicStore() {
    const [store, setStore] = useState<StoreWithHours | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [clock, setClock] = useState(() => Date.now())
    useEffect(() => {
        const update = () => setClock(Date.now())
        const timer = window.setInterval(update, 30000)
        window.addEventListener('focus', update)
        return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
    }, [])

    // Derived state
    const isCurrentlyOpen = useMemo(() => {
        if (!store) return false;
        return isStoreOpenNow(
            store.auto_schedule_enabled,
            store.is_open,
            store.business_hours || [], new Date(clock)
        );
    }, [store, clock]);

    const fetchStore = async () => {
        try {
            setLoading(true)
            const subdomain = getSubdomain()
            setError(null)
            if (subdomain) {
                const data = await getPublicStoreBySubdomain(subdomain)
                if (!data) throw new Error('Restaurante não encontrado')
                setStore(data)
            } else {
                setStore(null)
            }
        } catch (err) {
            setStore(null)
            console.error('Erro ao carregar loja:', err)
            setError(err instanceof Error ? err.message : 'Erro ao carregar dados da loja')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStore()
    }, [])

    return { store, loading, error, fetchStore, setStore, isCurrentlyOpen }
}
