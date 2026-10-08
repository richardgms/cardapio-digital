'use server'

import { createClient } from '@/lib/supabase/server'
import type { Coupon } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { priceIntentItems } from '@/lib/order-checkout-service'
import { CheckoutIntentSchema, type ItemIntent } from '@/lib/checkout-intent'
import { z } from 'zod'

export type PublicCoupon = Pick<Coupon, 'code' | 'discount_type' | 'discount_value' | 'max_discount_value' | 'min_order_value' | 'applies_to'>

export interface ValidateCouponResult {
    valid: boolean
    coupon?: PublicCoupon
    discountAmount: number
    message?: string
}

export interface ApplyCouponParams {
    code: string
    storeId: string
    subtotal: number
    deliveryType: 'delivery' | 'pickup' | 'table'
    customerPhone?: string
    items: ItemIntent[]
}

/**
 * Valida um cupom e calcula o desconto
 */
export async function validateCoupon(input: ApplyCouponParams): Promise<ValidateCouponResult> {
    const invalid = (message = 'Cupom não encontrado ou inválido'): ValidateCouponResult => ({ valid: false, discountAmount: 0, message })
    const parsed = z.object({ code: z.string().trim().min(1).max(50), storeId: z.string().uuid(),
        deliveryType: z.enum(['delivery','pickup','table']), customerPhone: z.string().max(30).optional(),
        items: CheckoutIntentSchema.shape.items }).safeParse(input)
    if (!parsed.success) return invalid('Confira os itens e o código do cupom.')
    const { code, storeId, deliveryType, items } = parsed.data
    const phone = parsed.data.customerPhone?.replace(/\D/g, '') ?? ''
    try {
        const supabase = await createAdminClient()
        const priced = await priceIntentItems(supabase, storeId, items)
        const subtotal = priced.items.reduce((sum, i) => sum + Math.round(i.item_total * 100), 0) / 100
        const { data: coupon, error } = await supabase.from('coupons')
            .select('code,discount_type,discount_value,max_discount_value,min_order_value,applies_to,valid_from,valid_until,usage_limit,usage_count')
            .eq('store_id', storeId).eq('code', code.toUpperCase()).eq('is_active', true).maybeSingle()
        if (error || !coupon) return invalid()
        const now = Date.now()
        if (now < new Date(coupon.valid_from).getTime()) return invalid('Este cupom ainda não está válido.')
        if (coupon.valid_until && now >= new Date(coupon.valid_until).getTime()) return invalid('Este cupom expirou.')
        if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) return invalid('Limite de uso atingido.')
        if (subtotal < (coupon.min_order_value ?? 0)) return invalid('O pedido não atingiu o mínimo deste cupom.')
        if ((coupon.applies_to === 'delivery' && deliveryType !== 'delivery') ||
            (coupon.applies_to === 'pickup' && deliveryType !== 'pickup')) return invalid('Cupom indisponível para esta forma de entrega.')
        if (coupon.discount_type === 'free_delivery' && deliveryType !== 'delivery') return invalid('Frete grátis exige entrega.')
        if (coupon.applies_to === 'first_purchase') {
            if (phone.length < 10 || phone.length > 15) return invalid('Informe seu telefone nos dados do pedido antes de aplicar este cupom.')
            const history = await supabase.from('orders').select('id').eq('store_id', storeId)
                .eq('customer_phone', phone).neq('status', 'cancelled').limit(1)
            if (history.error || history.data?.length) return invalid('Cupom indisponível para esta compra.')
        }
        let discount = coupon.discount_type === 'percentage' ? subtotal * coupon.discount_value / 100
            : coupon.discount_type === 'fixed' ? Math.min(subtotal, coupon.discount_value) : 0
        if (coupon.discount_type === 'percentage' && coupon.max_discount_value != null) discount = Math.min(discount, coupon.max_discount_value)
        discount = Math.min(subtotal, Math.round(discount * 100) / 100)
        if (!Number.isFinite(discount) || discount < 0) return invalid()
        const publicCoupon: PublicCoupon = { code: coupon.code, discount_type: coupon.discount_type,
            discount_value: coupon.discount_value, max_discount_value: coupon.max_discount_value,
            min_order_value: coupon.min_order_value ?? 0, applies_to: coupon.applies_to }
        return { valid: true, coupon: publicCoupon, discountAmount: discount, message: 'Cupom aplicado. Será conferido novamente ao finalizar.' }
    } catch { return invalid('Não foi possível conferir o cupom. Tente novamente.') }
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
