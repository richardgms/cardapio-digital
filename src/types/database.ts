export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface StoreConfig {
    id: string
    name: string
    whatsapp: string
    address: string | null
    is_open: boolean
    admin_email: string
    minimum_order: number
    logo_url: string | null
    cover_url: string | null
    created_at: string
    updated_at: string
    auto_schedule_enabled: boolean
    subdomain: string | null
    pix_key: string | null
    pix_key_type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' | null
    table_mode_available: boolean
    table_mode_enabled: boolean
    table_count: number
}

export interface BusinessHour {
    id: string
    store_config_id: string
    day_of_week: number // 0=Domingo, ... 6=Sábado
    is_open: boolean
    periods?: BusinessHourPeriod[]
}

export interface BusinessHourPeriod {
    id: string
    business_hour_id: string
    open_time: string // "HH:MM:SS" or "HH:MM"
    close_time: string
    sort_order: number
}

export interface Category {
    id: string
    store_id: string // Linked to store_config.id (auth.uid for owner)
    name: string
    sort_order: number
    created_at: string
}

export interface DeliveryZone {
    id: string
    store_id: string // Linked to store_config.id
    name: string
    price: number
    is_active: boolean
    created_at: string
}

export interface Product {
    id: string
    store_id: string // Linked to store_config.id
    category_id: string
    name: string
    description: string | null
    price: number
    image_url: string | null
    additional_images?: string[] | null
    is_available: boolean
    allows_half_half: boolean
    sort_order: number
    created_at: string

    // Joins
    category?: Category
    option_groups?: ProductOptionGroup[]
}

export interface GroupSizeRule {
    id: string
    group_id: string        // grupo addon que receberá o limite (ex: Proteínas)
    source_group_id: string // grupo replacement dono do tamanho (ex: Tamanho)
    size_option_id: string  // opção de tamanho que ativa a regra (ex: G)
    max_select: number      // limite quando este tamanho está selecionado
    created_at: string
}

export interface ProductOptionGroup {
    id: string
    product_id: string
    title: string
    is_required: boolean
    max_select: number      // fallback para tamanhos sem regra específica
    pricing_mode: 'addon' | 'replacement'
    sort_order: number
    created_at: string

    // Joins
    options?: ProductOption[]
    size_rules?: GroupSizeRule[]
}

export interface ProductOption {
    id: string
    group_id: string
    name: string
    price: number
    sort_order: number
    is_available?: boolean
}

// ── Orders ───────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type DeliveryType = 'delivery' | 'pickup' | 'table'
export type PaymentMethod = 'pix' | 'card' | 'cash'

export interface SelectedOption {
    group: string
    option: string
    price: number
}

export interface HalfHalfItem {
    product_name: string
    selected_options: SelectedOption[]
}

export interface Order {
    id: string
    store_id: string
    order_number: number
    customer_name: string
    customer_phone: string
    delivery_type: DeliveryType
    table_number: number | null
    delivery_zone_id: string | null
    delivery_zone_name: string | null
    delivery_address: string | null
    payment_method: PaymentMethod
    change_for: number | null
    subtotal: number
    delivery_fee: number
    total: number
    status: OrderStatus
    notes: string | null
    created_at: string
    updated_at: string

    // Joins
    items?: OrderItem[]
}

export interface OrderItem {
    id: string
    order_id: string
    product_id: string | null
    product_name: string
    quantity: number
    unit_price: number
    selected_options: SelectedOption[]
    observations: string | null
    is_half_half: boolean
    half_half_items: HalfHalfItem[] | null
    item_total: number
    created_at: string
}
