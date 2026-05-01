import { safeStorage } from './safe-storage'

const CACHE_KEY = 'rmenu_customer_data'

export interface CustomerData {
    name: string
    phone: string
    address: string
    complement: string
    deliveryZoneId: string
}

const EMPTY: CustomerData = {
    name: '',
    phone: '',
    address: '',
    complement: '',
    deliveryZoneId: '',
}

export function getCustomerData(): CustomerData {
    const raw = safeStorage.getItem(CACHE_KEY)
    if (!raw) return EMPTY
    try {
        const parsed = JSON.parse(raw)
        return { ...EMPTY, ...parsed }
    } catch {
        return EMPTY
    }
}

export function saveCustomerData(data: Partial<CustomerData>): void {
    const current = getCustomerData()
    safeStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...data }))
}
