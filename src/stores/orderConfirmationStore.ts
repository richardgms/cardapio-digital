import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeJSONStorageAdapter } from '@/lib/safe-storage'

interface OrderConfirmationData {
    paymentMethod: 'pix' | 'card' | 'cash'
    whatsappNumber: string
    message: string
    orderId: string
    idempotencyKey: string
}

interface OrderConfirmationState {
    isPending: boolean
    paymentMethod: 'pix' | 'card' | 'cash' | null
    whatsappNumber: string
    message: string
    orderId: string
    idempotencyKey: string
    setPending: (data: OrderConfirmationData) => void
    dismiss: () => void
}

export const useOrderConfirmationStore = create<OrderConfirmationState>()(persist((set) => ({
    isPending: false,
    paymentMethod: null,
    whatsappNumber: '',
    message: '',
    orderId: '',
    idempotencyKey: '',

    setPending: (data) => set({
        isPending: true,
        paymentMethod: data.paymentMethod,
        whatsappNumber: data.whatsappNumber,
        message: data.message,
        orderId: data.orderId,
        idempotencyKey: data.idempotencyKey,
    }),

    dismiss: () => set({
        isPending: false,
        paymentMethod: null,
        whatsappNumber: '',
        message: '',
        orderId: '',
        idempotencyKey: '',
    }),
}), { name: 'rmenu-order-confirmation', storage: createJSONStorage(() => safeJSONStorageAdapter), skipHydration: true,
    partialize: ({ isPending, paymentMethod, whatsappNumber, message, orderId, idempotencyKey }) =>
        ({ isPending, paymentMethod, whatsappNumber, message, orderId, idempotencyKey }) }))
