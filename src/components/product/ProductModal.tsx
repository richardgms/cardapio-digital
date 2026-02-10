import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Minus, Plus, AlertCircle, X, Maximize2 } from "lucide-react"
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

    const addItem = useCartStore(state => state.addItem)

    // Reset state when product changes or modal opens
    useEffect(() => {
        if (open && product) {
            setQuantity(1)
            setSelectedOptions({})
            setObservation("")
            setValidationErrors([])
            setIsImageOpen(false)
            setHalfHalfSelection({
                enabled: false,
                firstHalf: null,
                secondHalf: null,
                finalPrice: 0
            })
        }
    }, [open, product])

    if (!product) return null

    console.log("ProductModal render:", {
        productName: product.name,
        optionGroups: product.option_groups
    })

    const handleOptionChange = (groupId: string, optionId: string, maxSelect: number, isRadio: boolean) => {
        // Clear error for this group if it exists
        if (validationErrors.includes(groupId)) {
            setValidationErrors(prev => prev.filter(id => id !== groupId))
        }

        setSelectedOptions(prev => {
            const current = prev[groupId] || []

            if (isRadio) {
                return { ...prev, [groupId]: [optionId] }
            }

            // Checkbox logic
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

        // Add options price
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
        // Validation for Half Half
        if (halfHalfSelection.enabled) {
            if (!halfHalfSelection.firstHalf || !halfHalfSelection.secondHalf) {
                toast.error("Selecione os dois sabores para meio a meio")
                return
            }
        }

        // Validate required options
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

            // Scroll to the first error
            const firstErrorElement = document.getElementById(`group-${errors[0]}`)
            if (firstErrorElement) {
                firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            return
        }

        // Prepare cart item options
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
        // Avoid infinite loop: only update if changed
        if (
            selection.enabled !== halfHalfSelection.enabled ||
            selection.firstHalf?.id !== halfHalfSelection.firstHalf?.id ||
            selection.secondHalf?.id !== halfHalfSelection.secondHalf?.id ||
            selection.finalPrice !== halfHalfSelection.finalPrice
        ) {
            setHalfHalfSelection(selection)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl [&>button]:hidden">
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {/* Header Image */}
                    <div className="relative h-72 w-full bg-muted">
                        {product.image_url ? (
                            <>
                                <Image
                                    src={product.image_url}
                                    alt={product.name}
                                    fill
                                    className="object-cover"
                                />
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="absolute right-4 bottom-4 z-10 h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
                                    onClick={() => setIsImageOpen(true)}
                                >
                                    <Maximize2 className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                Sem imagem
                            </div>
                        )}

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

            <Dialog open={isImageOpen} onOpenChange={setIsImageOpen}>
                <DialogContent className="max-w-[100vw] w-screen h-screen p-0 m-0 bg-black/95 border-none flex items-center justify-center focus:outline-none">
                    <DialogTitle className="sr-only">Visualização da imagem do produto</DialogTitle>
                    <DialogDescription className="sr-only">Imagem ampliada do produto {product.name}</DialogDescription>

                    <div className="relative w-full h-full flex items-center justify-center p-4">
                        <div className="relative w-[80vw] h-[80vw] max-w-[500px] max-h-[500px]">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2 z-50 h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
                                onClick={() => setIsImageOpen(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                            {product.image_url && (
                                <Image
                                    src={product.image_url}
                                    alt={product.name}
                                    fill
                                    priority
                                    className="object-contain rounded-md"
                                />
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
