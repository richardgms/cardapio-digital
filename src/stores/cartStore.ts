import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartState, CartActions } from '@/types/cart'

export const useCartStore = create<CartState & CartActions>()(
    persist(
        (set, get) => ({
            items: [],
            customer: {
                name: '',
                phone: '',
                address: '',
                complement: '',
                reference: '',
            },
            delivery: {
                type: 'delivery',
                zone_id: null,
                zone_name: '',
                zone_price: 0,
            },
            payment: {
                method: 'pix',
                cash_change: null,
            },

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

            setCustomer: (customer) => set((state) => ({
                customer: { ...state.customer, ...customer }
            })),

            setDelivery: (delivery) => set({ delivery }),

            setPayment: (payment) => set({ payment }),

            clearCart: () => set({
                items: [],
                customer: { name: '', phone: '', address: '', complement: '', reference: '' },
                delivery: { type: 'delivery', zone_id: null, zone_name: '', zone_price: 0 },
                payment: { method: 'pix', cash_change: null },
            }),

            getSubtotal: () => get().items.reduce((acc, item) => acc + item.item_total, 0),

            getTotal: () => get().getSubtotal() + get().delivery.zone_price,
        }),
        {
            name: 'cardapio-cart',
        }
    )
)
