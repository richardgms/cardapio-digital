'use server'

import { createClient } from '@/lib/supabase/server'
import type { Coupon } from '@/types/database'

export interface ValidateCouponResult {
    valid: boolean
    coupon?: Coupon
    discountAmount: number
    message?: string
}

export interface ApplyCouponParams {
    code: string
    storeId: string
    subtotal: number
    deliveryType: 'delivery' | 'pickup' | 'table'
    customerPhone?: string
    isFirstPurchase?: boolean
}

/**
 * Valida um cupom e calcula o desconto
 */
export async function validateCoupon({
    code,
    storeId,
    subtotal,
    deliveryType,
    customerPhone,
    isFirstPurchase = false
}: ApplyCouponParams): Promise<ValidateCouponResult> {
    const supabase = await createClient()

    // Buscar cupom pelo código e loja
    const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('store_id', storeId)
        .eq('code', code.trim().toUpperCase())
        .eq('is_active', true)
        .single()

    if (error || !coupon) {
        return { valid: false, discountAmount: 0, message: 'Cupom não encontrado ou inválido' }
    }

    // Verificar validade (data)
    const now = new Date()
    const validFrom = new Date(coupon.valid_from)
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null

    if (now < validFrom) {
        return { valid: false, discountAmount: 0, message: 'Este cupom ainda não está válido' }
    }

    if (validUntil && now > validUntil) {
        return { valid: false, discountAmount: 0, message: 'Este cupom expirou' }
    }

    // Verificar limite de uso
    if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
        return { valid: false, discountAmount: 0, message: 'Limite de uso deste cupom foi atingido' }
    }

    // Verificar valor mínimo do pedido
    if (subtotal < coupon.min_order_value) {
        return { 
            valid: false, 
            discountAmount: 0, 
            message: `Valor mínimo do pedido: R$ ${coupon.min_order_value.toFixed(2).replace('.', ',')}` 
        }
    }

    // Verificar aplicação por tipo de entrega
    if (coupon.applies_to !== 'all') {
        if (coupon.applies_to === 'delivery' && deliveryType !== 'delivery') {
            return { valid: false, discountAmount: 0, message: 'Cupom válido apenas para delivery' }
        }
        if (coupon.applies_to === 'pickup' && deliveryType !== 'pickup') {
            return { valid: false, discountAmount: 0, message: 'Cupom válido apenas para retirada' }
        }
        if (coupon.applies_to === 'first_purchase' && !isFirstPurchase) {
            return { valid: false, discountAmount: 0, message: 'Cupom válido apenas para primeira compra' }
        }
    }

    // Verificar se cliente já usou este cupom (para cupons de primeira compra ou uso único por cliente)
    if (customerPhone && (coupon.applies_to === 'first_purchase' || coupon.usage_limit === 1)) {
        const { data: existingUsage } = await supabase
            .from('coupon_usages')
            .select('id')
            .eq('coupon_id', coupon.id)
            .eq('customer_phone', customerPhone)
            .maybeSingle()

        if (existingUsage) {
            return { valid: false, discountAmount: 0, message: 'Você já utilizou este cupom' }
        }
    }

    // Calcular valor do desconto
    let discountAmount = 0

    if (coupon.discount_type === 'percentage') {
        discountAmount = subtotal * (coupon.discount_value / 100)
        // Aplicar limite máximo se existir
        if (coupon.max_discount_value && discountAmount > coupon.max_discount_value) {
            discountAmount = coupon.max_discount_value
        }
    } else if (coupon.discount_type === 'fixed') {
        discountAmount = coupon.discount_value
        // Garantir que desconto não seja maior que o subtotal
        if (discountAmount > subtotal) {
            discountAmount = subtotal
        }
    } else if (coupon.discount_type === 'free_delivery') {
        // Para frete grátis, o valor será aplicado na taxa de entrega
        discountAmount = 0 // Será tratado separadamente no checkout
    }

    return {
        valid: true,
        coupon,
        discountAmount: Math.round(discountAmount * 100) / 100, // Arredondar para 2 casas
        message: 'Cupom aplicado com sucesso!'
    }
}

/**
 * Busca cupons disponíveis para uma loja (para mostrar na página da loja)
 */
export async function fetchActiveCoupons(storeId: string): Promise<Pick<Coupon, 'code' | 'description' | 'discount_type' | 'discount_value'>[]> {
    const supabase = await createClient()

    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from('coupons')
        .select('code, description, discount_type, discount_value')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .lte('valid_from', now)
        .or(`valid_until.is.null,valid_until.gte.${now}`)
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error fetching active coupons:', error)
        return []
    }

    return data || []
}

/**
 * Formata o valor do desconto para exibição (função utilitária - não é server action)
 */
export async function formatDiscount(coupon: Coupon): Promise<string> {
    if (coupon.discount_type === 'percentage') {
        return `${coupon.discount_value}% OFF`
    } else if (coupon.discount_type === 'fixed') {
        return `R$ ${coupon.discount_value.toFixed(2).replace('.', ',')} OFF`
    } else if (coupon.discount_type === 'free_delivery') {
        return 'Frete Grátis'
    }
    return ''
}
