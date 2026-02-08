import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DeliveryZone } from '@/types/database'

/**
 * Get subdomain from cookie (set by middleware)
 */
function getSubdomainFromCookie(): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|; )subdomain=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : null
}

export function useDeliveryZones() {
    const [zones, setZones] = useState<DeliveryZone[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchZones() {
            try {
                const supabase = createClient()
                const subdomain = getSubdomainFromCookie()

                // Get store_id from subdomain
                let storeId: string | null = null

                if (subdomain) {
                    const { data: storeData } = await supabase
                        .from('store_config')
                        .select('id')
                        .eq('subdomain', subdomain)
                        .single()
                    storeId = storeData?.id || null
                } else {
                    // Fallback: first store
                    const { data: storeData } = await supabase
                        .from('store_config')
                        .select('id')
                        .limit(1)
                        .single()
                    storeId = storeData?.id || null
                }

                if (!storeId) {
                    throw new Error('Store not found')
                }

                const { data, error } = await supabase
                    .from('delivery_zones')
                    .select('*')
                    .eq('store_id', storeId)
                    .eq('is_active', true)
                    .order('name')

                if (error) throw error
                setZones(data)
            } catch (err) {
                console.error('Erro ao carregar zonas:', err)
                setError('Erro ao carregar zonas de entrega')
            } finally {
                setLoading(false)
            }
        }

        fetchZones()
    }, [])

    return { zones, loading, error }
}

