import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Minus, Plus, AlertCircle, X, Maximize2, ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"
import { useCartStore } from "@/stores/cartStore"
import { toast } from "sonner"
import type { Product, ProductOption } from "@/types/database"
import type { CartItemOption } from "@/types/cart"
import { HalfHalfSelector } from "./HalfHalfSelector"
import { cn } from "@/lib/utils"

interface ProductModalProps {
    product: Product | null
    open: boolean
    onClose: () => void
}

export function ProductModal({ product, open, onClose }: ProductModalProps) {
    const [quantity, setQuantity] = useState(1)
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({})
    const [observation, setObservation] = useState("")
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const [isImageOpen, setIsImageOpen] = useState(false)
    const [activeImageIndex, setActiveImageIndex] = useState(0)
    const [fullscreenIndex, setFullscreenIndex] = useState(0)
    const [halfHalfSelection, setHalfHalfSelection] = useState<{
        enabled: boolean
        firstHalf: Product | null
        secondHalf: Product | null
        finalPrice: number
    }>({
        enabled: false,
        firstHalf: null,
        secondHalf: null,
        finalPrice: 0
    })

    const carouselRef = useRef<HTMLDivElement>(null)
    const addItem = useCartStore(state => state.addItem)

    // Reset state when product changes or modal opens
    useEffect(() => {
        if (open && product) {
            setQuantity(1)
            setSelectedOptions({})
            setObservation("")
            setValidationErrors([])
            setIsImageOpen(false)
            setActiveImageIndex(0)
            setFullscreenIndex(0)
            setHalfHalfSelection({
                enabled: false,
                firstHalf: null,
                secondHalf: null,
                finalPrice: 0
            })
        }
    }, [open, product])

    if (!product) return null

    // Build the unified image list — gracefully handles legacy products with no additional_images
    const allImages: string[] = [
        product.image_url,
        ...(product.additional_images || [])
    ].filter((url): url is string => Boolean(url))

    const hasMultipleImages = allImages.length > 1

    // Track which slide is currently in view based on scroll position
    const handleCarouselScroll = () => {
        const el = carouselRef.current
        if (!el) return
        const index = Math.round(el.scrollLeft / el.offsetWidth)
        setActiveImageIndex(index)
    }

    const scrollToImage = (index: number) => {
        const el = carouselRef.current
        if (!el) return
        el.scrollTo({ left: index * el.offsetWidth, behavior: 'smooth' })
    }

    const handleOptionChange = (groupId: string, optionId: string, maxSelect: number, isRadio: boolean) => {
        if (validationErrors.includes(groupId)) {
            setValidationErrors(prev => prev.filter(id => id !== groupId))
        }

        setSelectedOptions(prev => {
            const current = prev[groupId] || []

            if (isRadio) {
                return { ...prev, [groupId]: [optionId] }
            }

            if (current.includes(optionId)) {
                return { ...prev, [groupId]: current.filter(id => id !== optionId) }
            }

            if (current.length < maxSelect) {
                return { ...prev, [groupId]: [...current, optionId] }
            }

            return prev
        })
    }

    const calculateTotal = () => {
        let total = halfHalfSelection.enabled && halfHalfSelection.finalPrice > 0
            ? halfHalfSelection.finalPrice
            : product.price

        product.option_groups?.forEach(group => {
            const selectedIds = selectedOptions[group.id] || []
            selectedIds.forEach(optionId => {
                const option = group.options?.find(o => o.id === optionId)
                if (option) {
                    total += option.price
                }
            })
        })

        return total * quantity
    }

    const handleAddToCart = () => {
        if (halfHalfSelection.enabled) {
            if (!halfHalfSelection.firstHalf || !halfHalfSelection.secondHalf) {
                toast.error("Selecione os dois sabores para meio a meio")
                return
            }
        }

        const errors: string[] = []
        if (!halfHalfSelection.enabled) {
            product.option_groups?.forEach(group => {
                const selections = selectedOptions[group.id] || []
                if (group.is_required && selections.length === 0) {
                    errors.push(group.id)
                }
            })
        }

        if (errors.length > 0) {
            setValidationErrors(errors)
            toast.error("Por favor, preencha as opções obrigatórias.")

            const firstErrorElement = document.getElementById(`group-${errors[0]}`)
            if (firstErrorElement) {
                firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            return
        }

        const cartOptions: CartItemOption[] = []
        product.option_groups?.forEach(group => {
            const selectedIds = selectedOptions[group.id] || []
            selectedIds.forEach(optionId => {
                const option = group.options?.find(o => o.id === optionId)
                if (option) {
                    cartOptions.push({
                        group_name: group.title,
                        option_name: option.name,
                        price: option.price
                    })
                }
            })
        })

        addItem({
            product: product,
            quantity,
            selected_options: cartOptions,
            observation,
            half_half: halfHalfSelection.enabled ? {
                enabled: true,
                first_half: halfHalfSelection.firstHalf?.name || "",
                second_half: halfHalfSelection.secondHalf?.name || "",
                final_price: halfHalfSelection.finalPrice
            } : undefined,
            item_total: calculateTotal()
        })

        toast.success("Adicionado ao carrinho!")
        onClose()
    }

    const handleHalfHalfChange = (selection: typeof halfHalfSelection) => {
        if (
            selection.enabled !== halfHalfSelection.enabled ||
            selection.firstHalf?.id !== halfHalfSelection.firstHalf?.id ||
            selection.secondHalf?.id !== halfHalfSelection.secondHalf?.id ||
            selection.finalPrice !== halfHalfSelection.finalPrice
        ) {
            setHalfHalfSelection(selection)
        }
    }

    const openFullscreen = (index: number) => {
        setFullscreenIndex(index)
        setIsImageOpen(true)
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl [&>button]:hidden">
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {/* Image Carousel */}
                    <div className="relative h-72 w-full bg-muted overflow-hidden">
                        {allImages.length > 0 ? (
                            <>
                                {/* Scroll-snap carousel track */}
                                <div
                                    ref={carouselRef}
                                    onScroll={handleCarouselScroll}
                                    className="flex h-full w-full overflow-x-auto snap-x snap-mandatory no-scrollbar"
                                    style={{ scrollSnapType: 'x mandatory' }}
                                >
                                    {allImages.map((url, idx) => (
                                        <div
                                            key={url + idx}
                                            className="relative h-full shrink-0 w-full snap-start"
                                            style={{ scrollSnapAlign: 'start' }}
                                        >
                                            <Image
                                                src={url}
                                                alt={`${product.name} — imagem ${idx + 1}`}
                                                fill
                                                className="object-cover"
                                                priority={idx === 0}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* 1/X indicator pill */}
                                {hasMultipleImages && (
                                    <div className="absolute left-4 top-4 z-10 flex items-center gap-1">
                                        <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                                            {activeImageIndex + 1} / {allImages.length}
                                        </span>
                                    </div>
                                )}

                                {/* Dot indicators at bottom */}
                                {hasMultipleImages && (
                                    <div className="absolute bottom-12 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                                        {allImages.map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => scrollToImage(idx)}
                                                className={cn(
                                                    "h-1.5 rounded-full transition-all duration-300",
                                                    idx === activeImageIndex
                                                        ? "w-4 bg-white"
                                                        : "w-1.5 bg-white/50"
                                                )}
                                                aria-label={`Ver imagem ${idx + 1}`}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Expand button */}
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="absolute right-4 bottom-4 z-10 h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
                                    onClick={() => openFullscreen(activeImageIndex)}
                                >
                                    <Maximize2 className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                Sem imagem
                            </div>
                        )}

                        {/* Close button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-4 z-10 h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Header Info */}
                        <div>
                            <DialogTitle className="text-xl font-bold">{product.name}</DialogTitle>
                            <DialogDescription className="mt-2 text-base">
                                {product.description}
                            </DialogDescription>
                            <p className="mt-2 font-semibold text-lg text-primary">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                            </p>
                        </div>

                        {/* Half Half Selector */}
                        {product.allows_half_half && product.category_id && (
                            <HalfHalfSelector
                                categoryId={product.category_id}
                                currentProduct={product}
                                onSelectionChange={handleHalfHalfChange}
                            />
                        )}

                        {/* Options Groups */}
                        {!halfHalfSelection.enabled && product.option_groups?.map(group => {
                            const hasError = validationErrors.includes(group.id)
                            return (
                                <div
                                    key={group.id}
                                    id={`group-${group.id}`}
                                    className={cn(
                                        "space-y-3 p-3 rounded-xl transition-all",
                                        hasError ? "bg-destructive/5 border border-destructive/20" : ""
                                    )}
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <Label className={cn("text-base font-semibold", hasError && "text-destructive")}>
                                                {group.title}
                                                {group.is_required && <span className="text-destructive ml-1">*</span>}
                                            </Label>
                                            <span className="text-xs text-muted-foreground">
                                                {group.max_select === 1 ? 'Escolha 1' : `Até ${group.max_select}`}
                                            </span>
                                        </div>
                                        {hasError && (
                                            <div className="flex items-center gap-1 text-xs text-destructive font-medium animate-in slide-in-from-left-2 fade-in">
                                                <AlertCircle className="h-3 w-3" />
                                                Campo obrigatório
                                            </div>
                                        )}
                                    </div>

                                    {group.max_select === 1 ? (
                                        <RadioGroup
                                            value={selectedOptions[group.id]?.[0]}
                                            onValueChange={(val) => handleOptionChange(group.id, val, 1, true)}
                                        >
                                            {group.options?.map(option => (
                                                <div key={option.id} className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-background">
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value={option.id} id={option.id} />
                                                        <Label htmlFor={option.id} className="font-normal cursor-pointer w-full">
                                                            {option.name}
                                                        </Label>
                                                    </div>
                                                    {option.price > 0 && (
                                                        <span className="text-sm text-muted-foreground">
                                                            + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.price)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </RadioGroup>
                                    ) : (
                                        <div className="space-y-2">
                                            {group.options?.map(option => (
                                                <div key={option.id} className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-background">
                                                    <div className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={option.id}
                                                            checked={selectedOptions[group.id]?.includes(option.id)}
                                                            onCheckedChange={() => handleOptionChange(group.id, option.id, group.max_select, false)}
                                                        />
                                                        <Label htmlFor={option.id} className="font-normal cursor-pointer w-full">
                                                            {option.name}
                                                        </Label>
                                                    </div>
                                                    {option.price > 0 && (
                                                        <span className="text-sm text-muted-foreground">
                                                            + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.price)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* Observation */}
                        <div className="space-y-2">
                            <Label htmlFor="observation">Observações</Label>
                            <Textarea
                                id="observation"
                                placeholder="Ex: Tirar a cebola, maionese à parte..."
                                value={observation}
                                onChange={(e) => setObservation(e.target.value)}
                                className="resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-background space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 border rounded-lg p-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            >
                                <Minus className="h-4 w-4" />
                            </Button>
                            <span className="font-semibold w-4 text-center">{quantity}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setQuantity(quantity + 1)}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-muted-foreground block">Total</span>
                            <span className="font-bold text-lg">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTotal())}
                            </span>
                        </div>
                    </div >
                    <Button className="w-full" size="lg" onClick={handleAddToCart}>
                        Adicionar ao Pedido
                    </Button>
                </div >
            </DialogContent>

            {/* Fullscreen Image Viewer — navigates through all images */}
            <Dialog open={isImageOpen} onOpenChange={setIsImageOpen}>
                <DialogContent className="max-w-[100vw] w-screen h-screen p-0 m-0 bg-black/95 border-none flex items-center justify-center focus:outline-none">
                    <DialogTitle className="sr-only">Visualização da imagem do produto</DialogTitle>
                    <DialogDescription className="sr-only">Imagem ampliada do produto {product.name}</DialogDescription>

                    {/* Image */}
                    <div className="relative w-full h-full flex items-center justify-center p-4">
                        <div className="relative w-[80vw] h-[80vw] max-w-[600px] max-h-[600px]">
                            {allImages[fullscreenIndex] && (
                                <Image
                                    src={allImages[fullscreenIndex]}
                                    alt={`${product.name} — imagem ${fullscreenIndex + 1}`}
                                    fill
                                    priority
                                    className="object-contain rounded-md"
                                />
                            )}
                        </div>
                    </div>

                    {/* Close */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-4 top-4 z-50 h-9 w-9 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
                        onClick={() => setIsImageOpen(false)}
                    >
                        <X className="h-5 w-5" />
                    </Button>

                    {/* Navigation arrows — only shown when multiple images */}
                    {hasMultipleImages && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 h-10 w-10 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white disabled:opacity-30"
                                disabled={fullscreenIndex === 0}
                                onClick={() => setFullscreenIndex(i => i - 1)}
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 h-10 w-10 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white disabled:opacity-30"
                                disabled={fullscreenIndex === allImages.length - 1}
                                onClick={() => setFullscreenIndex(i => i + 1)}
                            >
                                <ChevronRight className="h-6 w-6" />
                            </Button>

                            {/* Fullscreen counter pill */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
                                <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
                                    {fullscreenIndex + 1} / {allImages.length}
                                </span>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
