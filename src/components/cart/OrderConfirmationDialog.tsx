"use client"

import { useEffect, useState } from "react"
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
    const { isPending, paymentMethod, whatsappNumber, dismiss } = useOrderConfirmationStore()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    const formattedPhone = whatsappNumber ? formatPhone(whatsappNumber) : ""

    const handleContact = () => {
        if (whatsappNumber) {
            openWhatsApp(whatsappNumber, "Olá! Acabei de fazer um pedido pelo cardápio digital.")
        }
        dismiss()
    }

    return (
        <Dialog open={isPending} onOpenChange={(open) => { if (!open) dismiss() }}>
            <DialogContent className="sm:max-w-md rounded-2xl">
                <DialogHeader className="items-center text-center space-y-4 pt-2">
                    {/* Success Icon */}
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 animate-in zoom-in-50 duration-300">
                        <CheckCircle2 className="h-9 w-9 text-green-600" />
                    </div>

                    <div className="space-y-2">
                        <DialogTitle className="text-xl font-bold text-center">
                            Pedido Enviado!
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground text-center">
                            Seu pedido foi enviado para o restaurante via WhatsApp.
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* PIX Payment Notice */}
                    {paymentMethod === "pix" && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <p className="text-sm font-medium text-amber-900">
                                Envie o comprovante do pagamento para o WhatsApp:
                            </p>
                            <p className="text-base font-bold text-amber-800">
                                {formattedPhone}
                            </p>
                        </div>
                    )}

                    {/* Contact Button */}
                    <Button
                        onClick={handleContact}
                        className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
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
