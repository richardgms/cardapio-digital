"use client"

import { useEffect, useSyncExternalStore } from "react"
import { markOrderHandoff } from "@/actions/store/mark-order-handoff"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle2, MessageCircle } from "lucide-react"
import { useOrderConfirmationStore } from "@/stores/orderConfirmationStore"
import { openWhatsApp } from "@/lib/whatsapp"
import { formatPhone } from "@/lib/validators"

export function OrderConfirmationDialog() {
    const { isPending, paymentMethod, whatsappNumber, message, orderId, idempotencyKey, dismiss } = useOrderConfirmationStore()
    const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false)

    useEffect(() => {
        void useOrderConfirmationStore.persist.rehydrate()
    }, [])

    if (!mounted) return null

    const formattedPhone = whatsappNumber ? formatPhone(whatsappNumber) : ""

    const handleContact = () => {
        let opened = false
        try { opened = !!whatsappNumber && openWhatsApp(whatsappNumber, message) } catch { /* manter aviso para repetir */ }
        if (!opened) { toast.error('Não foi possível abrir o WhatsApp. Tente novamente.'); return }
        if (orderId && idempotencyKey) {
            void markOrderHandoff({ order_id: orderId, idempotency_key: idempotencyKey, status: 'whatsapp_opened' }).catch(() => undefined)
        }
        dismiss()
    }

    return (
        <Dialog open={isPending} onOpenChange={(open) => { if (!open) dismiss() }}>
            <DialogContent className="sm:max-w-md rounded-2xl">
                <DialogHeader className="items-center text-center space-y-4 pt-2">
                    {/* Success Icon */}
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 animate-in zoom-in-50 duration-300">
                        <CheckCircle2 className="h-9 w-9 text-success" />
                    </div>

                    <div className="space-y-2">
                        <DialogTitle className="text-xl font-bold text-center">
                            Pedido registrado!
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground text-center">
                            Seu pedido foi registrado na loja. Envie a mensagem no WhatsApp para conversar com o restaurante.
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* PIX Payment Notice */}
                    {paymentMethod === "pix" && (
                        <div className="bg-muted border border-border rounded-lg p-4 text-center space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <p className="text-sm font-medium text-foreground opacity-80">
                                Envie o comprovante do pagamento para o WhatsApp:
                            </p>
                            <p className="text-base font-bold text-foreground">
                                {formattedPhone}
                            </p>
                        </div>
                    )}

                    {/* Contact Button */}
                    <Button
                        onClick={handleContact}
                        className="w-full bg-whatsapp hover:bg-whatsapp/90 text-whatsapp-foreground gap-2"
                        size="lg"
                    >
                        <MessageCircle className="h-5 w-5" />
                        Entrar em contato com o restaurante
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
