"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

// ── Schema de validacao ──────────────────────────────────────────

const SelectedOptionSchema = z.object({
    group: z.string().min(1),
    option: z.string().min(1),
    price: z.coerce.number(),
})

const HalfHalfItemSchema = z.object({
    product_name: z.string().min(1),
    selected_options: z.array(SelectedOptionSchema),
})

const OrderItemSchema = z.object({
    product_id: z.string().uuid().nullable(),
    product_name: z.string().min(1).max(200),
    quantity: z.number().int().min(1).max(100),
    unit_price: z.coerce.number().min(0),
    selected_options: z.array(SelectedOptionSchema),
    observations: z.string().max(500).nullable().optional(),
    is_half_half: z.boolean().default(false),
    half_half_items: z.array(HalfHalfItemSchema).nullable().optional(),
    item_total: z.coerce.number().min(0),
})

const CreateOrderSchema = z.object({
    store_id: z.string().uuid(),
    customer_name: z.string().min(3).max(100),
    customer_phone: z.string().min(10).max(15),
    delivery_type: z.enum(["delivery", "pickup", "table"]),
    table_number: z.number().int().min(1).nullable().optional(),
    delivery_zone_id: z.string().uuid().nullable().optional(),
    delivery_zone_name: z.string().max(100).nullable().optional(),
    delivery_address: z.string().max(300).nullable().optional(),
    payment_method: z.enum(["pix", "card", "cash"]),
    change_for: z.coerce.number().min(0).nullable().optional(),
    subtotal: z.coerce.number().min(0),
    delivery_fee: z.coerce.number().min(0).default(0),
    discount_value: z.coerce.number().min(0).default(0),
    coupon_code: z.string().max(50).nullable().optional(),
    total: z.coerce.number().min(0),
    notes: z.string().max(500).nullable().optional(),
    items: z.array(OrderItemSchema).min(1),
}).refine(
    (data) => data.delivery_type !== "delivery" || (data.delivery_address && data.delivery_address.length > 0),
    { message: "Endereco obrigatorio para entrega", path: ["delivery_address"] }
).refine(
    (data) => data.delivery_type !== "table" || (data.table_number && data.table_number > 0),
    { message: "Numero da mesa obrigatorio", path: ["table_number"] }
)

// ── Tipo de retorno ──────────────────────────────────────────────

type CreateOrderResult =
    | { success: true; order_id: string; order_number: number }
    | { success: false; error: string }

// ── Server Action ────────────────────────────────────────────────

export async function createOrder(input: unknown): Promise<CreateOrderResult> {
    // 1. Validar input server-side
    const parsed = CreateOrderSchema.safeParse(input)
    if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        return {
            success: false,
            error: `Dados invalidos: ${firstIssue.path.join(".")} - ${firstIssue.message}`,
        }
    }

    const data = parsed.data

    try {
        const supabase = await createAdminClient()

        // 2. Verificar que a loja existe
        const { data: store, error: storeError } = await supabase
            .from("store_config")
            .select("id")
            .eq("id", data.store_id)
            .single()

        if (storeError || !store) {
            return { success: false, error: "Loja nao encontrada" }
        }

        // 3. Inserir pedido (order_number e gerado automaticamente pelo trigger)
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .insert({
                store_id: data.store_id,
                customer_name: data.customer_name.trim(),
                customer_phone: data.customer_phone.replace(/\D/g, ""),
                delivery_type: data.delivery_type,
                table_number: data.delivery_type === "table" ? data.table_number : null,
                delivery_zone_id: data.delivery_type === "delivery" ? data.delivery_zone_id : null,
                delivery_zone_name: data.delivery_type === "delivery" ? data.delivery_zone_name : null,
                delivery_address: data.delivery_type === "delivery" ? data.delivery_address?.trim() : null,
                payment_method: data.payment_method,
                change_for: data.payment_method === "cash" ? data.change_for : null,
                subtotal: data.subtotal,
                delivery_fee: data.delivery_fee,
                discount_value: data.discount_value || null,
                coupon_code: data.coupon_code?.toUpperCase() || null,
                total: data.total,
                notes: data.notes?.trim() || null,
            })
            .select("id, order_number")
            .single()

        if (orderError || !order) {
            console.error("Erro ao criar pedido:", orderError)
            const devDetail = process.env.NODE_ENV === 'development' && orderError?.message
                ? `: ${orderError.message}`
                : ''
            return { success: false, error: `Erro ao salvar pedido${devDetail}` }
        }

        // 4. Inserir itens do pedido
        const orderItems = data.items.map((item) => ({
            order_id: order.id,
            product_id: item.product_id,
            product_name: item.product_name.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            selected_options: item.selected_options,
            observations: item.observations?.trim() || null,
            is_half_half: item.is_half_half,
            half_half_items: item.half_half_items || null,
            item_total: item.item_total,
        }))

        const { error: itemsError } = await supabase
            .from("order_items")
            .insert(orderItems)

        if (itemsError) {
            console.error("Erro ao inserir itens:", itemsError)
            // Pedido ja foi criado — marcar como cancelado em vez de deixar inconsistente
            await supabase
                .from("orders")
                .update({ status: "cancelled", notes: "Erro ao inserir itens" })
                .eq("id", order.id)
            return { success: false, error: "Erro ao salvar itens do pedido" }
        }

        // 5. Registrar uso do cupom se foi aplicado
        if (data.coupon_code && data.discount_value > 0) {
            try {
                // Buscar o ID do cupom
                const { data: coupon } = await supabase
                    .from("coupons")
                    .select("id")
                    .eq("store_id", data.store_id)
                    .eq("code", data.coupon_code.toUpperCase())
                    .single()

                if (coupon) {
                    await supabase.from("coupon_usages").insert({
                        coupon_id: coupon.id,
                        order_id: order.id,
                        customer_phone: data.customer_phone.replace(/\D/g, ""),
                        discount_applied: data.discount_value,
                    })
                }
            } catch (couponError) {
                // Não falhar o pedido se houver erro ao registrar o cupom
                console.error("Erro ao registrar uso do cupom:", couponError)
            }
        }

        return {
            success: true,
            order_id: order.id,
            order_number: order.order_number,
        }
    } catch (err) {
        console.error("Erro inesperado ao criar pedido:", err)
        return { success: false, error: "Erro inesperado ao processar pedido" }
    }
}
