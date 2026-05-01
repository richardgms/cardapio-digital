"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

const MarkHandoffSchema = z.object({
    order_id: z.string().uuid(),
    status: z.enum(['whatsapp_opened', 'confirmed']),
})

export async function markOrderHandoff(input: unknown): Promise<{ success: boolean }> {
    const parsed = MarkHandoffSchema.safeParse(input)
    if (!parsed.success) return { success: false }

    try {
        const supabase = await createAdminClient()
        await supabase
            .from("orders")
            .update({ handoff_status: parsed.data.status })
            .eq("id", parsed.data.order_id)
        return { success: true }
    } catch {
        return { success: false }
    }
}
