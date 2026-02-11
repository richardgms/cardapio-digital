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
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return EMPTY
        const parsed = JSON.parse(raw)
        return { ...EMPTY, ...parsed }
    } catch {
        return EMPTY
    }
}

export function saveCustomerData(data: Partial<CustomerData>): void {
    try {
        const current = getCustomerData()
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...data }))
    } catch {
        // localStorage indisponível (ex: privado no Safari)
    }
}
