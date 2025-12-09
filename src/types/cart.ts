import type { Product } from './database'

export interface CartItemOption {
    group_name: string
    option_name: string
    price: number
}

export interface CartItem {
    id: string
    product: Product
    quantity: number
    item_total: number
    observation?: string

    // Opções selecionadas
    selected_options: CartItemOption[]

    // Meio a meio
    half_half?: {
        enabled: boolean
        first_half: string // Nome do primeiro sabor
        second_half: string // Nome do segundo sabor
        final_price: number
    }
}

export interface CustomerData {
    name: string
    phone: string
    address: string
    complement?: string
    reference?: string
}

export interface DeliveryData {
    type: 'delivery' | 'pickup'
    zone_id: string | null
    zone_name: string
    zone_price: number
}

export interface PaymentData {
    method: 'pix' | 'card' | 'cash'
    cash_change?: number | null
}

export interface CartState {
    items: CartItem[]
    customer: CustomerData
    delivery: DeliveryData
    payment: PaymentData
}

export interface CartActions {
    addItem: (item: Omit<CartItem, 'id'>) => void
    removeItem: (id: string) => void
    updateQuantity: (id: string, quantity: number) => void
    setCustomer: (customer: Partial<CustomerData>) => void
    setDelivery: (delivery: DeliveryData) => void
    setPayment: (payment: PaymentData) => void
    clearCart: () => void
    getSubtotal: () => number
    getTotal: () => number
}
