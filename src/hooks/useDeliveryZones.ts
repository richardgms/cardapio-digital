import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DeliveryZone } from '@/types/database'
import { getSubdomain } from '@/lib/subdomain'

export function useDeliveryZones() {
    const [zones, setZones] = useState<DeliveryZone[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchZones() {
            try {
                const supabase = createClient()
                const subdomain = getSubdomain()

                if (!subdomain) {
                    setZones([])
                    return
                }

                const { data: storeData } = await supabase
                    .from('store_config')
                    .select('id')
                    .eq('subdomain', subdomain)
                    .single()

                const storeId = storeData?.id
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

