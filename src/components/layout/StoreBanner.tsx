'use client'

import { Clock } from 'lucide-react'
import { useStore } from '@/hooks/useStore'
import { getNextOpeningTime } from '@/lib/checkStoreOpen'
import { useMemo } from 'react'

export function StoreBanner() {
    const { store, isCurrentlyOpen, loading } = useStore()

    const nextOpening = useMemo(() => {
        if (isCurrentlyOpen || !store?.business_hours) return null
        return getNextOpeningTime(store.business_hours)
    }, [store, isCurrentlyOpen])

    if (loading || !store || isCurrentlyOpen) {
        return null
    }

    return (
        <div className="bg-destructive text-destructive-foreground text-center py-2 px-4 text-sm font-medium w-full flex items-center justify-center gap-2 shadow-md">
            <Clock className="h-4 w-4" />
            <span>
                {nextOpening ? `Fechado • Abrimos ${nextOpening.toLowerCase()}` : 'Estamos fechados no momento'}
            </span>
        </div>
    )
}
