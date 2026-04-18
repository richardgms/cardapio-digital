'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Coupon } from '@/types/database'

export interface CouponFormData {
    code: string
    description?: string
    discount_type: 'percentage' | 'fixed' | 'free_delivery'
    discount_value: number
    min_order_value?: number
    max_discount_value?: number
    valid_from: string
    valid_until?: string
    usage_limit?: number
    is_active: boolean
    applies_to: 'all' | 'first_purchase' | 'delivery' | 'pickup'
}

/**
 * Busca todos os cupons da loja
 */
export async function fetchCoupons(): Promise<Coupon[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('store_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching coupons:', error)
        throw new Error('Erro ao buscar cupons')
    }

    return data || []
}

/**
 * Busca um cupom específico por ID
 */
export async function fetchCouponById(couponId: string): Promise<Coupon | null> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('id', couponId)
        .eq('store_id', user.id)
        .single()

    if (error) {
        if (error.code === 'PGRST116') return null
        console.error('Error fetching coupon:', error)
        throw new Error('Erro ao buscar cupom')
    }

    return data
}

/**
 * Cria um novo cupom
 */
export async function createCoupon(formData: CouponFormData): Promise<Coupon> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    // Validações
    if (!formData.code.trim()) throw new Error('Código do cupom é obrigatório')
    if (formData.discount_value < 0) throw new Error('Valor do desconto não pode ser negativo')
    if (formData.discount_type === 'percentage' && formData.discount_value > 100) {
        throw new Error('Desconto percentual não pode ser maior que 100%')
    }

    const couponData = {
        store_id: user.id,
        code: formData.code.trim().toUpperCase(),
        description: formData.description?.trim() || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        min_order_value: formData.min_order_value || 0,
        max_discount_value: formData.max_discount_value || null,
        valid_from: formData.valid_from,
        valid_until: formData.valid_until || null,
        usage_limit: formData.usage_limit || null,
        is_active: formData.is_active,
        applies_to: formData.applies_to,
    }

    const { data, error } = await supabase
        .from('coupons')
        .insert(couponData)
        .select()
        .single()

    if (error) {
        console.error('Error creating coupon:', error)
        if (error.code === '23505') {
            throw new Error('Já existe um cupom com este código')
        }
        throw new Error('Erro ao criar cupom')
    }

    revalidatePath('/admin/cupons')
    return data
}

/**
 * Atualiza um cupom existente
 */
export async function updateCoupon(
    couponId: string, 
    formData: CouponFormData
): Promise<Coupon> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    // Validações
    if (!formData.code.trim()) throw new Error('Código do cupom é obrigatório')
    if (formData.discount_value < 0) throw new Error('Valor do desconto não pode ser negativo')
    if (formData.discount_type === 'percentage' && formData.discount_value > 100) {
        throw new Error('Desconto percentual não pode ser maior que 100%')
    }

    const couponData = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description?.trim() || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        min_order_value: formData.min_order_value || 0,
        max_discount_value: formData.max_discount_value || null,
        valid_from: formData.valid_from,
        valid_until: formData.valid_until || null,
        usage_limit: formData.usage_limit || null,
        is_active: formData.is_active,
        applies_to: formData.applies_to,
    }

    const { data, error } = await supabase
        .from('coupons')
        .update(couponData)
        .eq('id', couponId)
        .eq('store_id', user.id)
        .select()
        .single()

    if (error) {
        console.error('Error updating coupon:', error)
        if (error.code === '23505') {
            throw new Error('Já existe um cupom com este código')
        }
        throw new Error('Erro ao atualizar cupom')
    }

    revalidatePath('/admin/cupons')
    return data
}

/**
 * Exclui um cupom
 */
export async function deleteCoupon(couponId: string): Promise<void> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', couponId)
        .eq('store_id', user.id)

    if (error) {
        console.error('Error deleting coupon:', error)
        throw new Error('Erro ao excluir cupom')
    }

    revalidatePath('/admin/cupons')
}

/**
 * Alterna o status ativo/inativo de um cupom
 */
export async function toggleCouponStatus(couponId: string, isActive: boolean): Promise<void> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { error } = await supabase
        .from('coupons')
        .update({ is_active: isActive })
        .eq('id', couponId)
        .eq('store_id', user.id)

    if (error) {
        console.error('Error toggling coupon status:', error)
        throw new Error('Erro ao alterar status do cupom')
    }

    revalidatePath('/admin/cupons')
}
