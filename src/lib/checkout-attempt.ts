import type { CartItem } from '@/types/cart'
import { normalizeCheckoutIntent, intentContent, type CheckoutIntent, type ItemIntent } from './checkout-intent'
import { safeStorage } from './safe-storage'

export function cartItemsToIntent(items: CartItem[]): ItemIntent[] {
    return items.map(item => ({ client_item_id: item.id, product_id: item.product.id, quantity: item.quantity,
        observations: item.observation?.trim() || null,
        selected_options: item.selected_options.map(o => {
            if (o.group_id && o.option_id) return { group_id: o.group_id, option_id: o.option_id }
            // Migração de carrinho legado: só resolve nomes no próprio produto
            // quando a correspondência é única. O servidor confere IDs atuais.
            const groups = item.product.option_groups?.filter(g => g.title === o.group_name) ?? []
            const options = groups.length === 1 ? groups[0].options?.filter(v => v.name === o.option_name) ?? [] : []
            if (groups.length !== 1 || options.length !== 1) throw new Error('Edite os itens do carrinho para atualizar as opções.')
            return { group_id: groups[0].id, option_id: options[0].id }
        }),
        half_product_ids: item.half_half?.enabled ? (() => {
            if (!item.half_half.first_half_id || !item.half_half.second_half_id) throw new Error('Edite o item meio a meio para selecionar os sabores novamente.')
            return [item.half_half.first_half_id, item.half_half.second_half_id] as [string, string]
        })() : null,
    }))
}

type Attempt = { intent: CheckoutIntent; completed: boolean }
const key = (storeId: string) => `rmenu-checkout-attempt:${storeId}`
export function readCheckoutAttempt(storeId: string): Attempt | null {
    try {
        const raw = safeStorage.getItem(key(storeId))
        if (!raw) return null
        const data = JSON.parse(raw)
        return { intent: normalizeCheckoutIntent(data.intent), completed: data.completed === true }
    } catch { return null }
}
export function writeCheckoutAttempt(intent: CheckoutIntent, completed = false): void {
    safeStorage.setItem(key(intent.store_id), JSON.stringify({ intent, completed }))
}
export function sameCartIntent(items: ItemIntent[], intent: CheckoutIntent): boolean {
    const shape = (list: ItemIntent[]) => list.map(i => ({ client_item_id: i.client_item_id, product_id: i.product_id,
        quantity: i.quantity, half_product_ids: i.half_product_ids, observations: i.observations,
        selected_options: [...i.selected_options].sort((a, b) => a.group_id.localeCompare(b.group_id) || a.option_id.localeCompare(b.option_id)) }))
    return JSON.stringify(shape(items)) === JSON.stringify(shape(intent.items))
}

export function recoverCheckoutIntent(input: unknown, previous: CheckoutIntent | null): CheckoutIntent {
    const current = normalizeCheckoutIntent(input)
    return previous && intentContent({ ...current, total: previous.total }) === intentContent(previous) ? previous : current
}

export function remainingCartAfterCommit(items: CartItem[], committed: CheckoutIntent): CartItem[] {
    return items.filter(item => {
        const original = committed.items.find(i => i.client_item_id === item.id)
        if (!original) return true
        try { return !sameCartIntent(cartItemsToIntent([item]), { ...committed, items: [original] }) }
        catch { return true }
    })
}
export async function prepareCheckoutAttempt(input: unknown): Promise<CheckoutIntent> {
    const intent = normalizeCheckoutIntent(input)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(intentContent(intent)))
    const bytes = new Uint8Array(digest).slice(0, 16)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    intent.idempotency_key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    writeCheckoutAttempt(intent)
    return intent
}
