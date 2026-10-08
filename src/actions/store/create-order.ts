"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { submitCheckout, type CheckoutResult } from "@/lib/order-checkout-service"

export async function createOrder(input: unknown): Promise<CheckoutResult> {
    try {
        return await submitCheckout(await createAdminClient(), input)
    } catch {
        return { success: false, error: "Não foi possível processar esta tentativa. Tente novamente." }
    }
}
