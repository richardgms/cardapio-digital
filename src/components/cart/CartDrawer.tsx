"use client"

import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, AlertCircle, ArrowLeft, Bike, Store, Pencil, Minus, Plus, CreditCard, Banknote, X, CheckCircle2, UtensilsCrossed, TicketPercent, Tag } from "lucide-react"
import NextImage from "next/image"
import { useCartStore } from "@/stores/cartStore"
import { usePublicStore } from "@/hooks/usePublicStore"
import { useDeliveryZones } from "@/hooks/useDeliveryZones"
import { generateWhatsAppMessage, navigateToWhatsApp } from "@/lib/whatsapp"
import { setCheckoutLock } from "@/components/pwa/SwUpdateToast"
import { useOrderConfirmationStore } from "@/stores/orderConfirmationStore"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getCustomerData, saveCustomerData } from "@/lib/customer-cache"
import { formatPhone, cleanPhone, validatePhone, validateName } from "@/lib/validators"
import { createOrder } from "@/actions/store/create-order"
import { markOrderHandoff } from "@/actions/store/mark-order-handoff"
import { validateCoupon } from "@/actions/store/coupons"
import type { Coupon } from "@/types/database"

interface CartDrawerProps {
    open: boolean
    onClose: () => void
    onEditItem?: (item: any) => void
}

export function CartDrawer({ open, onClose, onEditItem }: CartDrawerProps) {
    const { items, removeItem, updateQuantity, clearCart } = useCartStore()
    const { store, isCurrentlyOpen } = usePublicStore()
    const acceptPix = store?.accept_pix !== false
    const acceptCash = store?.accept_cash !== false
    const acceptCard = store?.accept_card !== false
    const { zones, loading: zonesLoading } = useDeliveryZones()
    const setPending = useOrderConfirmationStore(s => s.setPending)

    const [step, setStep] = useState<'cart' | 'details' | 'payment'>('cart')
    const [isSending, setIsSending] = useState(false)
    const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
        typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    )

    // Form State
    const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup' | 'table'>('delivery')
    const [customerName, setCustomerName] = useState("")
    const [customerPhone, setCustomerPhone] = useState("")
    const [deliveryZoneId, setDeliveryZoneId] = useState("")
    const [address, setAddress] = useState("")
    const [complement, setComplement] = useState("")
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'cash' | null>(null)
    const [changeFor, setChangeFor] = useState("")
    const [tableNumber, setTableNumber] = useState("")

    // Coupon State
    const [couponCode, setCouponCode] = useState("")
    const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
    const [discountValue, setDiscountValue] = useState(0)
    const [couponError, setCouponError] = useState("")
    const [isValidatingCoupon, setIsValidatingCoupon] = useState(false)

    // Touched state — errors only show after field is touched
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const markTouched = useCallback((field: string) => {
        setTouched(prev => ({ ...prev, [field]: true }))
    }, [])

    // Validation errors (real-time)
    const nameError = validateName(customerName)
    const phoneError = validatePhone(customerPhone)

    // Derived State
    const total = items.reduce((acc, item) => acc + item.item_total, 0)
    const selectedZone = zones.find(z => z.id === deliveryZoneId)
    const deliveryFee = deliveryType === 'delivery' && selectedZone ? selectedZone.price : 0
    
    // Calculate discount
    const calculateDiscount = () => {
        if (!appliedCoupon) return 0
        
        if (appliedCoupon.discount_type === 'free_delivery') {
            return deliveryFee
        }
        return discountValue
    }
    
    const currentDiscount = calculateDiscount()
    const finalTotal = total + deliveryFee - currentDiscount
    const minOrder = store?.minimum_order || 0
    const remainingForMinOrder = Math.max(0, minOrder - total)

    // Validation
    const isCartValid = total >= minOrder
    const noZonesAvailable = !zonesLoading && zones.length === 0
    const tableModeAvailable = !!store?.table_mode_enabled

    const isDeliveryValid = deliveryType === 'delivery'
        ? (deliveryZoneId !== "" && address.trim().length > 0)
        : deliveryType === 'table'
            ? (tableNumber.trim().length > 0 && parseInt(tableNumber, 10) > 0)
            : true

    const isDetailsValid = deliveryType === 'table'
        ? (!nameError && isDeliveryValid)
        : (!nameError && !phoneError && isDeliveryValid)

    const paymentError: string | null = (() => {
        if (!paymentMethod) return 'Selecione uma forma de pagamento'
        if (paymentMethod === 'cash') {
            if (!changeFor.trim()) return 'Informe o valor do troco'
            const change = parseChangeFor(changeFor)
            if (!Number.isFinite(change) || change <= 0) return 'Informe um valor de troco válido'
            if (change < finalTotal) {
                return `Troco precisa ser maior ou igual a ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(finalTotal)}`
            }
        }
        return null
    })()
    const isPaymentValid = paymentError === null

    // Load cached customer data on mount (personal data only)
    useEffect(() => {
        const cached = getCustomerData()
        if (cached.name) setCustomerName(cached.name)
        if (cached.phone) setCustomerPhone(formatPhone(cached.phone))
        if (cached.address) setAddress(cached.address)
        if (cached.complement) setComplement(cached.complement)
    }, [])

    // Apply cached zone ID only after zones load and only if the zone exists in this store
    // This prevents cross-store zone ID bleed that causes Select crashes
    useEffect(() => {
        if (zones.length > 0 && deliveryZoneId === "") {
            const cached = getCustomerData()
            if (cached.deliveryZoneId && zones.some(z => z.id === cached.deliveryZoneId)) {
                setDeliveryZoneId(cached.deliveryZoneId)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zones])

    // Reset step when opening/closing
    useEffect(() => {
        if (open) {
            setStep('cart')
            // Reset coupon when opening
            setCouponCode("")
            setAppliedCoupon(null)
            setDiscountValue(0)
            setCouponError("")
            // Nova sessão de checkout = nova idempotency key.
            setIdempotencyKey(typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
        }
    }, [open])

    // Bloqueia auto-reload do PWA enquanto o checkout está em andamento.
    // Sem isso, um update do SW pode disparar window.location.reload() e
    // limpar todos os campos `useState` que NÃO são persistidos.
    useEffect(() => {
        if (!open || items.length === 0) return
        setCheckoutLock(true)
        return () => setCheckoutLock(false)
    }, [open, items.length])

    // Se a loja não tem zonas configuradas, força retirada — caso contrário
    // o usuário fica preso no step de detalhes sem saber por quê.
    useEffect(() => {
        if (noZonesAvailable && deliveryType === 'delivery') {
            setDeliveryType('pickup')
        }
    }, [noZonesAvailable, deliveryType])

    function parseChangeFor(value: string): number {
        const cleaned = value.replace(/[R$\s]/g, '')
        if (cleaned.includes(',')) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
        }
        return parseFloat(cleaned) || 0
    }

    // Handle coupon application
    const handleApplyCoupon = async () => {
        if (!couponCode.trim() || !store?.id) return

        setIsValidatingCoupon(true)
        setCouponError("")

        try {
            const result = await validateCoupon({
                code: couponCode,
                storeId: store.id,
                subtotal: total,
                deliveryType,
                customerPhone: cleanPhone(customerPhone),
            })

            if (result.valid && result.coupon) {
                setAppliedCoupon(result.coupon)
                setDiscountValue(result.discountAmount)
                toast.success(result.message)
            } else {
                setCouponError(result.message || "Cupom inválido")
                setAppliedCoupon(null)
                setDiscountValue(0)
            }
        } catch (error) {
            setCouponError("Erro ao validar cupom")
        } finally {
            setIsValidatingCoupon(false)
        }
    }

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null)
        setDiscountValue(0)
        setCouponCode("")
        setCouponError("")
    }

    const handleCheckout = async () => {
        if (isSending) return

        if (!store?.whatsapp) {
            toast.error("Erro: Telefone da loja não configurado.")
            return
        }

        if (!paymentMethod) {
            toast.error("Selecione uma forma de pagamento")
            return
        }

        if (deliveryType === 'delivery' && !zones.some(z => z.id === deliveryZoneId)) {
            toast.error("Zona de entrega indisponível. Selecione outra região.")
            setDeliveryZoneId("")
            setStep('details')
            return
        }

        // CRÍTICO iOS Safari: abrir popup ANTES de qualquer await, pra preservar
        // o gesto do clique. Popups disparados depois de await são bloqueados.
        const popupRef = window.open('about:blank', '_blank')

        setIsSending(true)

        try {
            saveCustomerData({
                name: customerName,
                phone: cleanPhone(customerPhone),
                address,
                complement,
                deliveryZoneId,
            })

            // 1. Salvar pedido no banco via Server Action
            const orderResult = await createOrder({
                store_id: store.id,
                idempotency_key: idempotencyKey,
                customer_name: customerName,
                customer_phone: cleanPhone(customerPhone),
                delivery_type: deliveryType,
                table_number: deliveryType === 'table' ? parseInt(tableNumber) : null,
                delivery_zone_id: deliveryType === 'delivery' && deliveryZoneId ? deliveryZoneId : null,
                delivery_zone_name: deliveryType === 'delivery' && selectedZone ? selectedZone.name : null,
                delivery_address: deliveryType === 'delivery' ? address.trim() : null,
                payment_method: paymentMethod,
                change_for: paymentMethod === 'cash' && changeFor ? parseChangeFor(changeFor) : null,
                subtotal: total,
                delivery_fee: deliveryFee,
                discount_value: currentDiscount,
                coupon_code: appliedCoupon?.code || null,
                total: finalTotal,
                notes: null,
                items: items.map((item) => ({
                    product_id: item.product?.id || null,
                    product_name: item.product?.name || 'Produto',
                    quantity: item.quantity,
                    unit_price: item.half_half?.enabled ? item.half_half.final_price : (
                        item.selected_options.find(o => o.is_replacement)?.price ?? item.product?.price ?? 0
                    ),
                    selected_options: item.selected_options.map((o) => ({
                        group: o.group_name,
                        option: o.option_name,
                        price: o.price,
                        is_replacement: o.is_replacement ?? false,
                    })),
                    observations: item.observation || null,
                    is_half_half: item.half_half?.enabled || false,
                    half_half_items: item.half_half?.enabled ? [
                        { product_name: item.half_half.first_half, selected_options: [] },
                        { product_name: item.half_half.second_half, selected_options: [] },
                    ] : null,
                    item_total: item.item_total,
                })),
            })

            if (!orderResult.success) {
                popupRef?.close()
                toast.error(orderResult.error)
                return
            }

            const message = generateWhatsAppMessage({
                customerName,
                customerPhone: cleanPhone(customerPhone),
                deliveryType,
                deliveryZoneName: selectedZone?.name,
                deliveryAddress: address,
                deliveryComplement: complement,
                paymentMethod,
                changeFor,
                items,
                subtotal: total,
                deliveryFee,
                total: finalTotal,
                pixKey: store?.pix_key || undefined,
                tableNumber: deliveryType === 'table' ? tableNumber : undefined,
                orderNumber: orderResult.order_number,
            })

            const opened = navigateToWhatsApp(popupRef, store.whatsapp, message)

            // Sempre exibe o dialog de confirmação — serve como ack do pedido E
            // como fallback caso o popup tenha sido bloqueado (botão re-tenta
            // com gesto novo).
            setPending({
                paymentMethod: paymentMethod!,
                whatsappNumber: store.whatsapp,
                message,
            })

            if (!opened) {
                // Não limpa o carrinho: usuário precisa do dialog pra reabrir.
                toast.warning("Não conseguimos abrir o WhatsApp automaticamente. Use o botão no aviso para enviar seu pedido.", {
                    duration: 8000,
                })
                return
            }

            // Fire-and-forget: registra que o handoff aconteceu. Não bloqueia o usuário.
            markOrderHandoff({
                order_id: orderResult.order_id,
                status: 'whatsapp_opened',
            }).catch(() => undefined)

            clearCart()
            onClose()
        } catch {
            popupRef?.close()
            toast.error("Erro ao enviar pedido. Tente novamente.")
        } finally {
            setIsSending(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent
                className="w-full sm:max-w-md flex flex-col p-0 gap-0 [&>button]:hidden bg-background"
                onInteractOutside={(e) => {
                    // Não fechar quando o tap aterrissa em um portal do Radix
                    // (Select, Popover) ou no Toaster do sonner — em iOS Safari
                    // o target às vezes é o overlay do Sheet, então cobrimos
                    // múltiplos seletores.
                    const target = e.target as Element | null
                    if (
                        target?.closest?.(
                            '[data-radix-popper-content-wrapper], [data-radix-select-content], [data-radix-select-viewport], [data-sonner-toaster], [role="listbox"], [role="option"]'
                        )
                    ) {
                        e.preventDefault()
                    }
                }}
                onPointerDownOutside={(e) => {
                    const target = e.target as Element | null
                    if (
                        target?.closest?.(
                            '[data-radix-popper-content-wrapper], [data-radix-select-content], [data-radix-select-viewport], [data-sonner-toaster], [role="listbox"], [role="option"]'
                        )
                    ) {
                        e.preventDefault()
                    }
                }}
            >
                <SheetHeader className="p-6 border-b flex flex-row items-center justify-between space-y-0 text-left">
                    <div className="flex items-center gap-4">
                        {step !== 'cart' && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="-ml-3 h-8 w-8"
                                onClick={() => {
                                    if (step === 'payment') setStep('details')
                                    else if (step === 'details') setStep('cart')
                                }}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <SheetTitle className="text-lg">
                            {step === 'cart' && 'Seu Pedido'}
                            {step === 'details' && 'Seus Dados'}
                            {step === 'payment' && 'Pagamento'}
                        </SheetTitle>
                    </div>

                    <Button variant="ghost" size="icon" onClick={onClose} className="-mr-2 h-8 w-8 text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                    </Button>

                    <SheetDescription className="hidden">
                        {step === 'cart' && 'Revise seus itens'}
                        {step === 'details' && 'Preencha seus dados de entrega'}
                        {step === 'payment' && 'Escolha a forma de pagamento'}
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
                            {step === 'cart' && (
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
                                                        <NextImage
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
                                        <div className="bg-muted border border-border rounded-lg p-3 flex items-start gap-2 text-foreground text-sm font-medium">
                                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                            <p>
                                                Faltam <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(remainingForMinOrder)}</strong> para o pedido mínimo de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(minOrder)}.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 'details' && (
                                /* STEP 2: DETAILS FORM */
                                <div className="space-y-6">
                                    {noZonesAvailable && (
                                        <div className="bg-muted border border-border rounded-lg p-3 flex items-start gap-2 text-sm" role="status">
                                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                            <p>Esta loja não está fazendo entregas no momento. Selecione retirada{tableModeAvailable ? ' ou pedido na mesa' : ''}.</p>
                                        </div>
                                    )}
                                    {/* Delivery Type Toggle */}
                                    <div className={cn(
                                        "grid gap-2 p-1 bg-muted rounded-lg",
                                        (() => {
                                            const cols =
                                                (noZonesAvailable ? 0 : 1) /* delivery */ +
                                                1 /* pickup */ +
                                                (tableModeAvailable ? 1 : 0)
                                            return cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"
                                        })()
                                    )}>
                                        {!noZonesAvailable && (
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
                                        )}
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
                                        {store?.table_mode_enabled && (
                                            <button
                                                className={cn(
                                                    "flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                                                    deliveryType === 'table' ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                                )}
                                                onClick={() => setDeliveryType('table')}
                                            >
                                                <UtensilsCrossed className="h-4 w-4" />
                                                Na Mesa
                                            </button>
                                        )}
                                    </div>

                                    {/* Personal Data */}
                                    <div className="space-y-3">
                                        <h3 className="font-semibold">Seus Dados</h3>
                                        <div className="space-y-1">
                                            <Label>Nome</Label>
                                            <Input
                                                placeholder="Como devemos te chamar?"
                                                value={customerName}
                                                autoComplete="name"
                                                enterKeyHint="next"
                                                autoCapitalize="words"
                                                onChange={(e) => {
                                                    setCustomerName(e.target.value)
                                                    // Autofill iOS dispara onChange com valor completo sem blur.
                                                    if (!touched.name && e.target.value.trim().length >= 3) markTouched('name')
                                                }}
                                                onBlur={() => markTouched('name')}
                                                className={cn(
                                                    touched.name && nameError && "border-destructive focus-visible:ring-destructive",
                                                    touched.name && !nameError && customerName.length > 0 && "border-success focus-visible:ring-success"
                                                )}
                                            />
                                            {touched.name && nameError && (
                                                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                                                    <AlertCircle className="h-3 w-3" />
                                                    {nameError}
                                                </p>
                                            )}
                                            {touched.name && !nameError && customerName.length > 0 && (
                                                <p className="text-xs text-success flex items-center gap-1 mt-1">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Nome válido
                                                </p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Telefone (WhatsApp){deliveryType === 'table' && <span className="text-muted-foreground text-xs ml-1">(opcional)</span>}</Label>
                                            <Input
                                                placeholder="(11) 99999-9999"
                                                inputMode="tel"
                                                autoComplete="tel"
                                                enterKeyHint="next"
                                                value={customerPhone}
                                                onChange={(e) => {
                                                    const formatted = formatPhone(e.target.value)
                                                    setCustomerPhone(formatted)
                                                    if (!touched.phone && cleanPhone(formatted).length >= 10) markTouched('phone')
                                                }}
                                                onPaste={(e) => {
                                                    e.preventDefault()
                                                    const pasted = e.clipboardData.getData('text')
                                                    setCustomerPhone(formatPhone(pasted))
                                                    markTouched('phone')
                                                }}
                                                onBlur={() => markTouched('phone')}
                                                maxLength={15}
                                                className={cn(
                                                    deliveryType !== 'table' && touched.phone && phoneError && "border-destructive focus-visible:ring-destructive",
                                                    deliveryType !== 'table' && touched.phone && !phoneError && customerPhone.length > 0 && "border-success focus-visible:ring-success"
                                                )}
                                            />
                                            {deliveryType !== 'table' && touched.phone && phoneError && (
                                                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                                                    <AlertCircle className="h-3 w-3" />
                                                    {phoneError}
                                                </p>
                                            )}
                                            {deliveryType !== 'table' && touched.phone && !phoneError && customerPhone.length > 0 && (
                                                <p className="text-xs text-success flex items-center gap-1 mt-1">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Telefone válido
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Delivery Address (Conditional - only for delivery) */}
                                    {deliveryType === 'delivery' && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                            <h3 className="font-semibold">Endereço de Entrega</h3>
                                            <div className="space-y-1">
                                                <Label>Bairro / Região</Label>
                                                <Select
                                                    value={deliveryZoneId || undefined}
                                                    onValueChange={(v) => { setDeliveryZoneId(v); markTouched('zone') }}
                                                >
                                                    <SelectTrigger className={cn(
                                                        touched.zone && !deliveryZoneId && "border-destructive focus:ring-destructive"
                                                    )}>
                                                        <SelectValue placeholder="Selecione seu bairro" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {zones.map(zone => (
                                                            <SelectItem key={zone.id} value={zone.id}>
                                                                {zone.name} {zone.price > 0
                                                                    ? `(+ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(zone.price)})`
                                                                    : '(Grátis)'}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {touched.zone && !deliveryZoneId && (
                                                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Selecione seu bairro
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Endereço Completo</Label>
                                                <Input
                                                    placeholder="Rua, Número"
                                                    value={address}
                                                    autoComplete="street-address"
                                                    enterKeyHint="next"
                                                    onChange={(e) => setAddress(e.target.value)}
                                                    onBlur={() => markTouched('address')}
                                                    className={cn(
                                                        touched.address && address.trim().length === 0 && "border-destructive focus-visible:ring-destructive"
                                                    )}
                                                />
                                                {touched.address && address.trim().length === 0 && (
                                                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Informe seu endereço
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Complemento (Opcional)</Label>
                                                <Input
                                                    placeholder="Apto, Bloco, Ponto de referência..."
                                                    value={complement}
                                                    autoComplete="address-line2"
                                                    enterKeyHint="done"
                                                    onChange={(e) => setComplement(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Table Number (Conditional - only for table mode) */}
                                    {deliveryType === 'table' && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                            <h3 className="font-semibold">Pedido na Mesa</h3>
                                            <div className="space-y-1">
                                                <Label>Número da Mesa</Label>
                                                <Input
                                                    placeholder="Ex: 5"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    enterKeyHint="done"
                                                    value={tableNumber}
                                                    onChange={(e) => setTableNumber(e.target.value.replace(/\D/g, ''))}
                                                    maxLength={3}
                                                />
                                                {tableNumber.trim().length === 0 && (
                                                    <p className="text-xs text-muted-foreground">Informe o número da mesa onde você está.</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 'payment' && (
                                /* STEP 3: PAYMENT FORM */
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                    <div className="space-y-3">
                                        <h3 className="font-semibold">Como você vai pagar?</h3>
                                        <RadioGroup value={paymentMethod || ""} onValueChange={(v: any) => setPaymentMethod(v)}>
                                            {deliveryType !== 'delivery' && (
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Pagamento no caixa</p>
                                            )}
                                            
                                            {acceptPix && (
                                                <div className="flex items-center space-x-3 border p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setPaymentMethod('pix')}>
                                                    <RadioGroupItem value="pix" id="pix" />
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <NextImage src="/icons/pix.svg" alt="PIX" width={20} height={20} />
                                                        <Label htmlFor="pix" className="flex-1 cursor-pointer">PIX</Label>
                                                    </div>
                                                </div>
                                            )}

                                            {acceptCard && (
                                                <div className="flex items-center space-x-3 border p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setPaymentMethod('card')}>
                                                    <RadioGroupItem value="card" id="card" />
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                                                        <Label htmlFor="card" className="flex-1 cursor-pointer flex flex-col">
                                                            <span className="font-semibold text-sm">Cartão</span>
                                                            {deliveryType === 'delivery' && (
                                                                <span className="text-xs text-muted-foreground font-normal">
                                                                    Maquininha na entrega
                                                                </span>
                                                            )}
                                                        </Label>
                                                    </div>
                                                </div>
                                            )}

                                            {acceptCash && (
                                                <div className="flex items-center space-x-3 border p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setPaymentMethod('cash')}>
                                                    <RadioGroupItem value="cash" id="cash" />
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <Banknote className="h-5 w-5" />
                                                        <Label htmlFor="cash" className="flex-1 cursor-pointer">Dinheiro</Label>
                                                    </div>
                                                </div>
                                            )}

                                            {!acceptPix && !acceptCard && !acceptCash && (
                                                <p className="text-sm text-destructive font-medium">Nenhum método de pagamento disponível no momento.</p>
                                            )}
                                        </RadioGroup>

                                        {paymentMethod === 'cash' && (
                                            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 pt-2">
                                                <Label>Troco para quanto?</Label>
                                                <Input
                                                    placeholder="Ex: R$ 50,00"
                                                    inputMode="decimal"
                                                    enterKeyHint="done"
                                                    value={changeFor}
                                                    onChange={(e) => setChangeFor(e.target.value)}
                                                />
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
                            {/* Coupon Section */}
                            {step === 'cart' && (
                                <div className="space-y-2" aria-live="polite" aria-atomic="true">
                                    {appliedCoupon ? (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-3" role="status">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Tag className="h-4 w-4 text-green-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-green-800">
                                                            Cupom {appliedCoupon.code} aplicado
                                                        </p>
                                                        <p className="text-xs text-green-600">
                                                            {appliedCoupon.discount_type === 'free_delivery' 
                                                                ? 'Frete grátis' 
                                                                : `Desconto de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentDiscount)}`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleRemoveCoupon}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    Remover
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <TicketPercent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        placeholder="Digite o código do cupom"
                                                        value={couponCode}
                                                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                                                        className="pl-10"
                                                    />
                                                </div>
                                                <Button
                                                    onClick={handleApplyCoupon}
                                                    disabled={!couponCode.trim() || isValidatingCoupon}
                                                    variant="outline"
                                                >
                                                    {isValidatingCoupon ? "..." : "Aplicar"}
                                                </Button>
                                            </div>
                                            {couponError && (
                                                <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                                                    <AlertCircle className="h-3 w-3" />
                                                    {couponError}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</span>
                                </div>
                                {deliveryType === 'delivery' && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Taxa de Entrega</span>
                                        <span>
                                            {appliedCoupon?.discount_type === 'free_delivery' ? (
                                                <span className="line-through text-muted-foreground mr-2">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}
                                                </span>
                                            ) : null}
                                            <span className={appliedCoupon?.discount_type === 'free_delivery' ? 'text-green-600' : ''}>
                                                {appliedCoupon?.discount_type === 'free_delivery' 
                                                    ? 'Grátis' 
                                                    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {currentDiscount > 0 && appliedCoupon?.discount_type !== 'free_delivery' && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Desconto</span>
                                        <span>- {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentDiscount)}</span>
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

                            {step === 'cart' && (
                                <Button
                                    className="w-full"
                                    size="lg"
                                    disabled={!isCartValid || !isCurrentlyOpen}
                                    onClick={() => setStep('details')}
                                >
                                    {isCurrentlyOpen ? 'Continuar para Dados' : 'Loja Fechada'}
                                </Button>
                            )}

                            {step === 'details' && (
                                <div className="space-y-2">
                                    <div
                                        onClick={() => {
                                            setTouched({ name: true, phone: true, address: true, zone: true })
                                            if (isDetailsValid) setStep('payment')
                                        }}
                                    >
                                        <Button
                                            className="w-full"
                                            size="lg"
                                            disabled={!isDetailsValid || !isCurrentlyOpen}
                                        >
                                            Continuar para Pagamento
                                        </Button>
                                    </div>
                                    {!isDetailsValid && isCurrentlyOpen && (
                                        <p className="text-xs text-center text-destructive font-medium animate-pulse">
                                            Preencha todos os dados obrigatórios
                                        </p>
                                    )}
                                </div>
                            )}

                            {step === 'payment' && (
                                <div className="space-y-2">
                                    <Button
                                        className="w-full bg-whatsapp hover:bg-whatsapp/90 text-whatsapp-foreground"
                                        size="lg"
                                        disabled={!isPaymentValid || !isCurrentlyOpen || isSending}
                                        onClick={handleCheckout}
                                    >
                                        {isSending ? "Enviando..." : "Enviar Pedido no WhatsApp"}
                                    </Button>
                                    {!isPaymentValid && isCurrentlyOpen && paymentError && (
                                        <p className="text-xs text-center text-destructive font-medium animate-pulse" role="alert">
                                            {paymentError}
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
