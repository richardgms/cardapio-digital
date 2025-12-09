"use client"

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, AlertCircle, ArrowLeft, Bike, Store, Pencil, Minus, Plus } from "lucide-react"
import Image from "next/image"
import { useCartStore } from "@/stores/cartStore"
import { useStore } from "@/hooks/useStore"
import { useDeliveryZones } from "@/hooks/useDeliveryZones"
import { generateWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Since Input component might not exist in ui folder yet (I only created some), 
// I'll assume I need to use standard HTML input or create a simple wrapper if needed.
// But wait, I didn't create Input.tsx in the previous steps. 
// I should probably create it or use a standard input with tailwind classes.
// For now, I'll use standard input with tailwind classes to be safe and avoid "Module not found".

interface CartDrawerProps {
    open: boolean
    onClose: () => void
    onEditItem?: (item: any) => void
}

export function CartDrawer({ open, onClose, onEditItem }: CartDrawerProps) {
    const { items, removeItem, updateQuantity, clearCart } = useCartStore()
    const { store, isCurrentlyOpen } = useStore()
    const { zones } = useDeliveryZones()

    const [step, setStep] = useState<'cart' | 'checkout'>('cart')

    // Form State
    const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery')
    const [customerName, setCustomerName] = useState("")
    const [customerPhone, setCustomerPhone] = useState("")
    const [deliveryZoneId, setDeliveryZoneId] = useState("")
    const [address, setAddress] = useState("")
    const [complement, setComplement] = useState("")
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'cash'>('pix')
    const [changeFor, setChangeFor] = useState("")

    // Derived State
    const total = items.reduce((acc, item) => acc + item.item_total, 0)
    const selectedZone = zones.find(z => z.id === deliveryZoneId)
    const deliveryFee = deliveryType === 'delivery' && selectedZone ? selectedZone.price : 0
    const finalTotal = total + deliveryFee
    const minOrder = store?.minimum_order || 0
    const remainingForMinOrder = Math.max(0, minOrder - total)

    // Validation
    const isCartValid = total >= minOrder

    const isDeliveryValid = deliveryType === 'delivery'
        ? (deliveryZoneId !== "" && address.trim().length > 5)
        : true

    const isFormValid =
        customerName.trim().length > 2 &&
        customerPhone.trim().length > 8 &&
        isDeliveryValid &&
        (paymentMethod !== 'cash' || (paymentMethod === 'cash' && changeFor.trim().length > 0))

    // Reset step when opening/closing
    useEffect(() => {
        if (open) setStep('cart')
    }, [open])

    const handleCheckout = () => {
        if (!store?.whatsapp) {
            toast.error("Erro: Telefone da loja não configurado.")
            return
        }

        const message = generateWhatsAppMessage({
            customerName,
            customerPhone,
            deliveryType,
            deliveryZoneName: selectedZone?.name,
            deliveryAddress: address,
            deliveryComplement: complement,
            paymentMethod,
            changeFor,
            items,
            subtotal: total,
            deliveryFee,
            total: finalTotal
        })

        openWhatsApp(store.whatsapp, message)
        clearCart()
        onClose()
        toast.success("Pedido enviado para o WhatsApp!")
    }

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
                <SheetHeader className="p-6 border-b">
                    <div className="flex items-center gap-2">
                        {step === 'checkout' && (
                            <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8" onClick={() => setStep('cart')}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <SheetTitle>{step === 'cart' ? 'Seu Pedido' : 'Finalizar Pedido'}</SheetTitle>
                    </div>
                    <SheetDescription className="hidden">
                        {step === 'cart' ? 'Revise seus itens' : 'Preencha seus dados'}
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 overflow-y-auto p-6">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
                            <Store className="h-12 w-12 opacity-20" />
                            <p>Seu carrinho está vazio.</p>
                            <Button variant="outline" onClick={onClose}>Ver Cardápio</Button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {step === 'cart' ? (
                                /* STEP 1: CART ITEMS */
                                <div className="space-y-4">
                                    {items.map((item) => {
                                        const productName = item.product?.name || (item as any).product_name || "Produto Indisponível"
                                        const productImage = item.product?.image_url || (item as any).product_image

                                        return (
                                            <div key={item.id} className="flex gap-4 border-b pb-4 last:border-0">
                                                {/* Image & Edit Badge */}
                                                <div className="relative h-20 w-20 shrink-0 rounded-lg bg-muted overflow-hidden">
                                                    {productImage ? (
                                                        <Image
                                                            src={productImage}
                                                            alt={productName}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground text-center p-1">
                                                            Sem foto
                                                        </div>
                                                    )}
                                                    <button
                                                        className="absolute top-1 right-1 h-6 w-6 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-colors"
                                                        onClick={() => onEditItem?.(item)}
                                                    >
                                                        <Pencil className="h-3 w-3 text-foreground" />
                                                    </button>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start">
                                                            <h4 className="font-semibold text-sm line-clamp-2">{productName}</h4>
                                                            <p className="font-semibold text-sm whitespace-nowrap ml-2">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.item_total)}
                                                            </p>
                                                        </div>

                                                        {item.half_half?.enabled && (
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                ½ {item.half_half.first_half} + ½ {item.half_half.second_half}
                                                            </p>
                                                        )}

                                                        {item.selected_options && item.selected_options.length > 0 && (
                                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                                                + {item.selected_options.map(opt => opt.option_name).join(', ')}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between mt-2">
                                                        {/* Quantity Control */}
                                                        <div className="flex items-center bg-muted rounded-md h-8">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-l-md rounded-r-none hover:bg-muted-foreground/10"
                                                                onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                                                            >
                                                                <Minus className="h-3 w-3" />
                                                            </Button>
                                                            <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-r-md rounded-l-none hover:bg-muted-foreground/10"
                                                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                            </Button>
                                                        </div>

                                                        {/* Remove Button */}
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => removeItem(item.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {!isCartValid && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-amber-800 text-sm">
                                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                            <p>
                                                Faltam <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(remainingForMinOrder)}</strong> para o pedido mínimo de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(minOrder)}.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* STEP 2: CHECKOUT FORM */
                                <div className="space-y-6">
                                    {/* Delivery Type Toggle */}
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                                        <button
                                            className={cn(
                                                "flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                                                deliveryType === 'delivery' ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => setDeliveryType('delivery')}
                                        >
                                            <Bike className="h-4 w-4" />
                                            Entrega
                                        </button>
                                        <button
                                            className={cn(
                                                "flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                                                deliveryType === 'pickup' ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => setDeliveryType('pickup')}
                                        >
                                            <Store className="h-4 w-4" />
                                            Retirada
                                        </button>
                                    </div>

                                    {/* Personal Data */}
                                    <div className="space-y-3">
                                        <h3 className="font-semibold">Seus Dados</h3>
                                        <div className="space-y-1">
                                            <Label>Nome</Label>
                                            <Input placeholder="Como devemos te chamar?" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Telefone (WhatsApp)</Label>
                                            <Input placeholder="(00) 00000-0000" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                                        </div>
                                    </div>

                                    {/* Delivery Address (Conditional) */}
                                    {deliveryType === 'delivery' && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                            <h3 className="font-semibold">Endereço de Entrega</h3>
                                            <div className="space-y-1">
                                                <Label>Bairro / Região</Label>
                                                <Select value={deliveryZoneId} onValueChange={setDeliveryZoneId}>
                                                    <SelectTrigger><SelectValue placeholder="Selecione seu bairro" /></SelectTrigger>
                                                    <SelectContent>
                                                        {zones.map(zone => (
                                                            <SelectItem key={zone.id} value={zone.id}>
                                                                {zone.name} (+ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(zone.price)})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Endereço Completo</Label>
                                                <Input placeholder="Rua, Número" value={address} onChange={(e) => setAddress(e.target.value)} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Complemento (Opcional)</Label>
                                                <Input placeholder="Apto, Bloco, Ponto de referência..." value={complement} onChange={(e) => setComplement(e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Payment */}
                                    <div className="space-y-3">
                                        <h3 className="font-semibold">Pagamento</h3>
                                        <RadioGroup value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                                            <div className="flex items-center space-x-2"><RadioGroupItem value="pix" id="pix" /><Label htmlFor="pix">PIX</Label></div>
                                            <div className="flex items-center space-x-2"><RadioGroupItem value="card" id="card" /><Label htmlFor="card">Cartão na Entrega</Label></div>
                                            <div className="flex items-center space-x-2"><RadioGroupItem value="cash" id="cash" /><Label htmlFor="cash">Dinheiro</Label></div>
                                        </RadioGroup>
                                        {paymentMethod === 'cash' && (
                                            <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                                <Label>Troco para quanto?</Label>
                                                <Input placeholder="Ex: R$ 50,00" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                {/* Footer Summary */}
                {items.length > 0 && (
                    <SheetFooter className="p-6 border-t bg-muted/10 sm:justify-center">
                        <div className="w-full space-y-4">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</span>
                                </div>
                                {deliveryType === 'delivery' && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Taxa de Entrega</span>
                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                    <span>Total</span>
                                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(finalTotal)}</span>
                                </div>
                            </div>

                            {/* Store Closed Warning */}
                            {!isCurrentlyOpen && (
                                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 text-destructive text-sm font-medium">
                                    <Store className="h-4 w-4 shrink-0" />
                                    <p>A loja está fechada no momento. Não é possível realizar pedidos.</p>
                                </div>
                            )}

                            {step === 'cart' ? (
                                <Button
                                    className="w-full"
                                    size="lg"
                                    disabled={!isCartValid || !isCurrentlyOpen}
                                    onClick={() => setStep('checkout')}
                                >
                                    {isCurrentlyOpen ? 'Continuar para Dados' : 'Loja Fechada'}
                                </Button>
                            ) : (
                                <div className="space-y-2">
                                    <Button
                                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                                        size="lg"
                                        disabled={!isFormValid || !isCurrentlyOpen}
                                        onClick={handleCheckout}
                                    >
                                        Enviar Pedido no WhatsApp
                                    </Button>
                                    {!isFormValid && isCurrentlyOpen && (
                                        <p className="text-xs text-center text-destructive font-medium animate-pulse">
                                            Preencha todos os campos obrigatórios
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    )
}
