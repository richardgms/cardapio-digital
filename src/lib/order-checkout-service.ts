import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeCheckoutIntent, intentContent, type ItemIntent } from './checkout-intent'
import { priceOrderItem } from './order-pricing'
import { generateWhatsAppMessage } from './whatsapp'

class CheckoutError extends Error {}

const option = z.object({ id: z.string().uuid(), group_id: z.string().uuid(), name: z.string(), price: z.number(), is_available: z.boolean().nullable() })
const rule = z.object({ id: z.string().uuid(), group_id: z.string().uuid(), source_group_id: z.string().uuid(), size_option_id: z.string().uuid(), max_select: z.number().int() })
const group = z.object({ id: z.string().uuid(), product_id: z.string().uuid(), title: z.string(), is_required: z.boolean(),
    max_select: z.number().int(), pricing_mode: z.enum(['addon', 'replacement']), sort_order: z.number().int(), options: z.array(option), size_rules: z.array(rule) })
const product = z.object({ id: z.string().uuid(), store_id: z.string().uuid(), category_id: z.string().uuid().nullable(), name: z.string(),
    price: z.number(), promo_price: z.number().nullable(), is_available: z.boolean(), allows_half_half: z.boolean(), option_groups: z.array(group) })
const catalog = z.object({ products: z.array(product) })
const selectedOption = z.object({ group: z.string(), option: z.string(), price: z.number(), is_replacement: z.boolean().optional() })
const savedItem = z.object({ product_name: z.string(), quantity: z.number().int().positive(), unit_price: z.number(), item_total: z.number(),
    selected_options: z.array(selectedOption), observations: z.string().nullable(), is_half_half: z.boolean(),
    half_half_items: z.array(z.object({ product_name: z.string() })).nullable() })
const savedOrder = z.object({ id: z.string().uuid(), order_number: z.number().int().positive(), request_hash: z.string(), expected_item_count: z.number().int().positive(),
    status: z.string(), customer_name: z.string(), customer_phone: z.string(), delivery_type: z.enum(['delivery', 'pickup', 'table']),
    table_number: z.number().nullable(), delivery_zone_name: z.string().nullable(), delivery_address: z.string().nullable(), address_complement: z.string().nullable(),
    payment_method: z.enum(['pix', 'card', 'cash']), change_for: z.number().nullable(), subtotal: z.number(), delivery_fee: z.number(),
    discount_value: z.number().nullable(), coupon_code: z.string().nullable(), total: z.number(), order_items: z.array(savedItem) })
const rpcResult = z.object({ order_id: z.string().uuid(), order_number: z.number().int().positive(), replayed: z.boolean() })

export type CheckoutResult = { success: false; error: string } | {
    success: true; order_id: string; order_number: number; replayed: boolean;
    message: string; whatsappNumber: string; paymentMethod: 'pix' | 'card' | 'cash'
}

export async function priceIntentItems(db: SupabaseClient, storeId: string, items: ItemIntent[]) {
    const ids = [...new Set(items.flatMap(i => [i.product_id, ...(i.half_product_ids ?? [])]))].sort()
    const { data: state, error } = await db.rpc('rmenu_order_catalog_state', { p_store_id: storeId, p_product_ids: ids })
    if (error) throw new CheckoutError('Não foi possível conferir o cardápio. Tente novamente.')
    const parsed = catalog.safeParse(state)
    if (!parsed.success) throw new CheckoutError('Cardápio indisponível. Atualize a página.')
    try { return { state, items: items.map(i => priceOrderItem(i, parsed.data.products, storeId)) } }
    catch (error) { throw new CheckoutError(error instanceof Error ? error.message : 'Confira as opções dos itens.') }
}

export async function submitCheckout(db: SupabaseClient, input: unknown): Promise<CheckoutResult> {
    let intent
    try { intent = normalizeCheckoutIntent(input) }
    catch { return { success: false, error: 'Confira os dados do pedido e as opções dos itens.' } }
    const hash = createHash('sha256').update(intentContent(intent)).digest('hex')
    try {
        const { data: existing, error: lookupError } = await db.from('orders').select('id')
            .eq('store_id', intent.store_id).eq('idempotency_key', intent.idempotency_key).maybeSingle()
        if (lookupError) throw new CheckoutError('Não foi possível conferir esta tentativa. Tente novamente.')
        const { data: contact, error: contactError } = await db.from('store_config').select('whatsapp,pix_key').eq('id', intent.store_id).single()
        if (contactError || !contact) throw new CheckoutError('Não foi possível carregar a loja. Tente novamente.')
        const metadata = z.object({ whatsapp: z.string(), pix_key: z.string().nullable() }).parse(contact)
        if (!existing && metadata.whatsapp.replace(/\D/g, '').length < 10) throw new CheckoutError('Telefone da loja indisponível.')
        const quote = existing ? { state: null, items: [] } : await priceIntentItems(db, intent.store_id, intent.items)
        const { data: result, error: submitError } = await db.rpc('rmenu_submit_order', {
            p_payload: { ...intent, items: quote.items }, p_request_hash: hash, p_catalog_state: quote.state,
        })
        if (submitError) {
            // Mensagens 22023 são validações deliberadas destas funções. Outros
            // erros não expõem detalhes SQL, configuração ou dados particulares.
            const safe = submitError.code === '22023' && typeof submitError.message === 'string'
                ? submitError.message : 'Não foi possível concluir esta tentativa. Tente novamente com o mesmo pedido.'
            return { success: false, error: safe }
        }
        const committed = rpcResult.parse(result)
        const { data: row, error: readError } = await db.from('orders').select(`
            id,order_number,request_hash,expected_item_count,status,customer_name,customer_phone,delivery_type,table_number,
            delivery_zone_name,delivery_address,address_complement,payment_method,change_for,subtotal,delivery_fee,discount_value,coupon_code,total,
            order_items(product_name,quantity,unit_price,item_total,selected_options,observations,is_half_half,half_half_items)
        `).eq('id', committed.order_id).eq('store_id', intent.store_id).eq('idempotency_key', intent.idempotency_key).single()
        const receipt = savedOrder.safeParse(row)
        if (readError || !receipt.success || receipt.data.request_hash !== hash || receipt.data.status === 'cancelled'
            || receipt.data.expected_item_count !== receipt.data.order_items.length) {
            return { success: false, error: 'Não foi possível recuperar o comprovante. Repita esta tentativa para conferir o pedido registrado.' }
        }
        const order = receipt.data
        const message = generateWhatsAppMessage({
            customerName: order.customer_name, customerPhone: order.customer_phone, deliveryType: order.delivery_type,
            tableNumber: order.table_number?.toString(), deliveryZoneName: order.delivery_zone_name ?? undefined,
            deliveryAddress: order.delivery_address ?? undefined, deliveryComplement: order.address_complement ?? undefined,
            paymentMethod: order.payment_method, changeFor: order.change_for == null ? undefined : order.change_for.toFixed(2).replace('.', ','),
            pixKey: metadata.pix_key ?? undefined, subtotal: order.subtotal, deliveryFee: order.delivery_fee,
            discountValue: order.discount_value ?? 0, couponCode: order.coupon_code ?? undefined, total: order.total, orderNumber: order.order_number,
            items: order.order_items.map(i => ({ product: { name: i.product_name }, quantity: i.quantity, item_total: i.item_total,
                observation: i.observations ?? undefined, selected_options: i.selected_options.map(o => ({ option_name: o.option, is_replacement: o.is_replacement })),
                half_half: i.is_half_half && i.half_half_items?.length === 2
                    ? { enabled: true, first_half: i.half_half_items[0].product_name, second_half: i.half_half_items[1].product_name } : undefined })),
        })
        return { success: true, order_id: order.id, order_number: order.order_number, replayed: committed.replayed,
            message, whatsappNumber: metadata.whatsapp, paymentMethod: order.payment_method }
    } catch (error) {
        return { success: false, error: error instanceof CheckoutError
            ? error.message : 'Não foi possível concluir esta tentativa. Tente novamente.' }
    }
}
