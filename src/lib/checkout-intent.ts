import { z } from 'zod'

const choice = z.object({ group_id: z.string().uuid(), option_id: z.string().uuid() })
const money = z.number().finite().nonnegative().refine(v => Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Valor inválido')

export const CheckoutIntentSchema = z.object({
    store_id: z.string().uuid(),
    idempotency_key: z.string().uuid(),
    customer_name: z.string().trim().min(3).max(100),
    customer_phone: z.string().max(30).default('').transform(v => v.replace(/\D/g, '')),
    delivery_type: z.enum(['delivery', 'pickup', 'table']),
    table_number: z.number().int().positive().nullable().default(null),
    delivery_zone_id: z.string().uuid().nullable().default(null),
    delivery_address: z.string().trim().max(300).nullable().default(null),
    address_complement: z.string().trim().max(300).nullable().default(null),
    payment_method: z.enum(['pix', 'card', 'cash']),
    change_for: money.nullable().default(null),
    coupon_code: z.string().trim().max(50).nullable().default(null),
    total: money,
    notes: z.string().trim().max(500).nullable().default(null),
    items: z.array(z.object({
        client_item_id: z.string().min(1).max(64),
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        selected_options: z.array(choice).max(100).default([]),
        half_product_ids: z.tuple([z.string().uuid(), z.string().uuid()]).nullable().default(null),
        observations: z.string().trim().max(500).nullable().default(null),
    })).min(1).max(100),
}).superRefine((v, ctx) => {
    if (v.customer_phone.length > 15 || ((v.delivery_type !== 'table' || v.customer_phone.length > 0) && v.customer_phone.length < 10)) {
        ctx.addIssue({ code: 'custom', path: ['customer_phone'], message: 'Telefone inválido' })
    }
    if (v.delivery_type === 'delivery' && (!v.delivery_zone_id || !v.delivery_address)) {
        ctx.addIssue({ code: 'custom', path: ['delivery_address'], message: 'Endereço e região obrigatórios' })
    }
    if (v.delivery_type === 'table' && !v.table_number) {
        ctx.addIssue({ code: 'custom', path: ['table_number'], message: 'Mesa obrigatória' })
    }
})

export type CheckoutIntent = z.infer<typeof CheckoutIntentSchema>
export type ItemIntent = CheckoutIntent['items'][number]
export type OptionChoice = ItemIntent['selected_options'][number]

// Contrato único para browser, hash do servidor e replay. A chave não é conteúdo.
export function normalizeCheckoutIntent(input: unknown): CheckoutIntent {
    const v = CheckoutIntentSchema.parse(input)
    return {
        ...v,
        store_id: v.store_id.toLowerCase(), idempotency_key: v.idempotency_key.toLowerCase(),
        table_number: v.delivery_type === 'table' ? v.table_number : null,
        delivery_zone_id: v.delivery_type === 'delivery' ? v.delivery_zone_id?.toLowerCase() ?? null : null,
        delivery_address: v.delivery_type === 'delivery' ? v.delivery_address : null,
        address_complement: v.delivery_type === 'delivery' ? v.address_complement || null : null,
        change_for: v.payment_method === 'cash' ? v.change_for || null : null,
        coupon_code: v.coupon_code?.toUpperCase() || null,
        total: Math.round(v.total * 100) / 100,
        notes: v.notes || null,
        items: v.items.map(item => ({
            ...item, product_id: item.product_id.toLowerCase(), observations: item.observations || null,
            half_product_ids: item.half_product_ids
                ? [item.half_product_ids[0].toLowerCase(), item.half_product_ids[1].toLowerCase()]
                : null,
            selected_options: item.selected_options.map(o => ({ group_id: o.group_id.toLowerCase(), option_id: o.option_id.toLowerCase() }))
                .sort((a, b) => a.group_id.localeCompare(b.group_id) || a.option_id.localeCompare(b.option_id)),
        })),
    }
}

export function intentContent(intent: CheckoutIntent): string {
    const { idempotency_key: _key, ...content } = intent
    void _key
    return JSON.stringify(content)
}
