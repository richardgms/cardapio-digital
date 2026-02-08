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
    is_available: boolean
    allows_half_half: boolean
    sort_order: number
    created_at: string

    // Joins
    category?: Category
    option_groups?: ProductOptionGroup[]
}

export interface ProductOptionGroup {
    id: string
    product_id: string
    title: string
    is_required: boolean
    max_select: number
    sort_order: number
    created_at: string // Note: SQL doesn't show created_at for this table in snippet, but usually has it. Checking snippet... snippet didn't show created_at for option_groups. I'll keep it optional or remove if strict. Snippet: "created_at TIMESTAMPTZ DEFAULT NOW()" is NOT present in snippet 5.1 for option_groups. It has sort_order. I will remove created_at to be safe or keep it if I suspect it exists. The snippet 5.1 shows created_at for products, categories, zones, config. NOT for option_groups or options. I will remove created_at from these types to match snippet.

    // Joins
    options?: ProductOption[]
}

export interface ProductOption {
    id: string
    group_id: string
    name: string
    price: number
    sort_order: number
    // created_at removed
}
