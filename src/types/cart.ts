import type { Product } from './database'

export interface CartItemOption {
    group_name: string
    option_name: string
    price: number
    is_replacement?: boolean
}

export interface CartItem {
    id: string
    product: Product
    quantity: number
    item_total: number
    observation?: string

    selected_options: CartItemOption[]

    half_half?: {
        enabled: boolean
        first_half: string
        second_half: string
        final_price: number
    }
}

export interface CartState {
    items: CartItem[]
}

export interface CartActions {
    addItem: (item: Omit<CartItem, 'id'>) => void
    removeItem: (id: string) => void
    updateQuantity: (id: string, quantity: number) => void
    clearCart: () => void
}
