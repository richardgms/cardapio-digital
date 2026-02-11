import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OrderConfirmationData {
    paymentMethod: 'pix' | 'card' | 'cash'
    whatsappNumber: string
}

interface OrderConfirmationState {
    isPending: boolean
    paymentMethod: 'pix' | 'card' | 'cash' | null
    whatsappNumber: string
    setPending: (data: OrderConfirmationData) => void
    dismiss: () => void
}

export const useOrderConfirmationStore = create<OrderConfirmationState>()(
    persist(
        (set) => ({
            isPending: false,
            paymentMethod: null,
            whatsappNumber: '',

            setPending: (data) => set({
                isPending: true,
                paymentMethod: data.paymentMethod,
                whatsappNumber: data.whatsappNumber,
            }),

            dismiss: () => set({
                isPending: false,
                paymentMethod: null,
                whatsappNumber: '',
            }),
        }),
        {
            name: 'order-confirmation',
        }
    )
)
