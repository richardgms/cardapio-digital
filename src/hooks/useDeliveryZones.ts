import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DeliveryZone } from '@/types/database'

export function useDeliveryZones() {
    const [zones, setZones] = useState<DeliveryZone[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchZones() {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from('delivery_zones')
                    .select('*')
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
