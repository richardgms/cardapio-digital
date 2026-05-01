import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { toast } from 'sonner'
import { getEffectiveMaxSelect } from '@/lib/sizeRules'
import { safeJSONStorageAdapter, safeStorage } from '@/lib/safe-storage'
import type { CartState, CartActions } from '@/types/cart'

export const useCartStore = create<CartState & CartActions>()(
    persist(
        (set) => ({
            items: [],

            addItem: (item) => set((state) => ({
                items: [...state.items, { ...item, id: crypto.randomUUID() }]
            })),

            removeItem: (id) => set((state) => ({
                items: state.items.filter((item) => item.id !== id)
            })),

            updateQuantity: (id, quantity) => set((state) => ({
                items: state.items.map((item) =>
                    item.id === id
                        ? { ...item, quantity, item_total: (item.item_total / item.quantity) * quantity }
                        : item
                )
            })),

            clearCart: () => set({ items: [] }),
        }),
        {
            name: 'cardapio-cart',
            version: 2,
            storage: createJSONStorage(() => safeJSONStorageAdapter),
            migrate: (persistedState: any, version: number) => {
                let state = persistedState as any

                // v0 → v1: remove items missing required options
                if (version < 1 && state && Array.isArray(state.items)) {
                    const sanitizedItems = state.items.filter((item: any) => {
                        if (item.half_half?.enabled) return true

                        const product = item.product
                        if (!product || !Array.isArray(product.option_groups)) return true

                        const requiredGroups = product.option_groups.filter((g: any) => g.is_required)

                        const hasAllRequired = requiredGroups.every((reqGroup: any) => {
                            return item.selected_options?.some((opt: any) => opt.group_name === reqGroup.title)
                        })

                        return hasAllRequired
                    })

                    state = { ...state, items: sanitizedItems }
                }

                // v1 → v2: truncate selections that exceed effectiveMaxSelect
                if (version < 2 && state && Array.isArray(state.items)) {
                    let truncated = false

                    const migratedItems = state.items.map((item: any) => {
                        if (item.half_half?.enabled) return item

                        const groups: any[] = item.product?.option_groups ?? []
                        const repGroups = groups.filter((g: any) => g.pricing_mode === 'replacement')

                        const selectedByGroupId: Record<string, string[]> = {}
                        for (const opt of (item.selected_options ?? [])) {
                            const group = groups.find((g: any) => g.title === opt.group_name)
                            if (!group?.id) continue
                            const option = group.options?.find((o: any) => o.name === opt.option_name)
                            if (!option?.id) continue
                            if (!selectedByGroupId[group.id]) selectedByGroupId[group.id] = []
                            selectedByGroupId[group.id].push(option.id)
                        }

                        let newSelectedOptions = item.selected_options ? [...item.selected_options] : []

                        for (const group of groups) {
                            if (group.pricing_mode === 'replacement') continue

                            const effectiveMax = getEffectiveMaxSelect(group, selectedByGroupId, repGroups)

                            let seen = 0
                            const filtered = newSelectedOptions.filter((opt: any) => {
                                if (opt.group_name !== group.title) return true
                                seen++
                                return effectiveMax <= 0 || seen <= effectiveMax
                            })

                            if (filtered.length < newSelectedOptions.length) {
                                truncated = true
                                newSelectedOptions = filtered
                            }
                        }

                        return { ...item, selected_options: newSelectedOptions }
                    })

                    if (truncated && typeof window !== 'undefined') {
                        sessionStorage.setItem('cart-truncated', '1')
                    }

                    state = { ...state, items: migratedItems }
                }

                // Strip dead fields persisted from older versions
                if (state) {
                    delete state.customer
                    delete state.delivery
                    delete state.payment
                }

                return state
            },
            // Only persist `items` — older versions stored customer/delivery/payment
            // that turned out to be dead state. Do not rehydrate them.
            partialize: (state) => ({ items: state.items }),
            onRehydrateStorage: () => (_state) => {
                if (typeof window !== 'undefined' && sessionStorage.getItem('cart-truncated') === '1') {
                    sessionStorage.removeItem('cart-truncated')
                    setTimeout(() => {
                        toast('Seu carrinho foi ajustado pois o cardápio foi atualizado.')
                    }, 0)
                }
            },
        }
    )
)
