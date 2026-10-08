"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

const MarkHandoffSchema = z.object({
    order_id: z.string().uuid(),
    idempotency_key: z.string().uuid(),
    status: z.literal('whatsapp_opened'),
})

export async function markOrderHandoff(input: unknown): Promise<{ success: boolean }> {
    const parsed = MarkHandoffSchema.safeParse(input)
    if (!parsed.success) return { success: false }

    try {
        const supabase = await createAdminClient()
        // O UUID da tentativa pertence ao cliente que criou o pedido.
        // Este registro indica apenas navegação, sem confirmar conversa ou pagamento.
        const { data, error } = await supabase
            .from("orders")
            .update({ handoff_status: 'whatsapp_opened' })
            .eq("id", parsed.data.order_id)
            .eq("idempotency_key", parsed.data.idempotency_key)
            .neq("status", 'cancelled')
            .in("handoff_status", ['pending_handoff', 'whatsapp_opened'])
            .select("id")
            .maybeSingle()

        return { success: !error && data !== null }
    } catch {
        return { success: false }
    }
}
