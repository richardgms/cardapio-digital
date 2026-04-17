import { create } from 'zustand'

interface OrderConfirmationData {
    paymentMethod: 'pix' | 'card' | 'cash'
    whatsappNumber: string
    message: string
}

interface OrderConfirmationState {
    isPending: boolean
    paymentMethod: 'pix' | 'card' | 'cash' | null
    whatsappNumber: string
    message: string
    setPending: (data: OrderConfirmationData) => void
    dismiss: () => void
}

export const useOrderConfirmationStore = create<OrderConfirmationState>()((set) => ({
    isPending: false,
    paymentMethod: null,
    whatsappNumber: '',
    message: '',

    setPending: (data) => set({
        isPending: true,
        paymentMethod: data.paymentMethod,
        whatsappNumber: data.whatsappNumber,
        message: data.message,
    }),

    dismiss: () => set({
        isPending: false,
        paymentMethod: null,
        whatsappNumber: '',
        message: '',
    }),
}))
