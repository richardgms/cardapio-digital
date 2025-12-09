import { useState, useEffect } from 'react'
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProducts } from "@/hooks/useProducts"
import type { Product } from "@/types/database"

interface HalfHalfSelectorProps {
    categoryId: string
    currentProduct: Product
    onSelectionChange: (selection: {
        enabled: boolean
        firstHalf: Product | null
        secondHalf: Product | null
        finalPrice: number
    }) => void
}

export function HalfHalfSelector({ categoryId, currentProduct, onSelectionChange }: HalfHalfSelectorProps) {
    const { products } = useProducts()
    const [enabled, setEnabled] = useState(false)
    const [firstHalfId, setFirstHalfId] = useState<string>(currentProduct.id)
    const [secondHalfId, setSecondHalfId] = useState<string>("")

    // Filter eligible products: same category AND allows_half_half
    const eligibleProducts = products.filter(p =>
        p.category_id === categoryId &&
        p.allows_half_half &&
        p.is_available
    )

    useEffect(() => {
        if (!enabled) {
            onSelectionChange({
                enabled: false,
                firstHalf: null,
                secondHalf: null,
                finalPrice: 0
            })
            return
        }

        const firstHalf = eligibleProducts.find(p => p.id === firstHalfId) || null
        const secondHalf = eligibleProducts.find(p => p.id === secondHalfId) || null

        // Calculate price: Max of the two halves
        let finalPrice = 0
        if (firstHalf && secondHalf) {
            finalPrice = Math.max(firstHalf.price, secondHalf.price)
        } else if (firstHalf) {
            finalPrice = firstHalf.price
        }

        onSelectionChange({
            enabled: true,
            firstHalf,
            secondHalf,
            finalPrice
        })
    }, [enabled, firstHalfId, secondHalfId, eligibleProducts, onSelectionChange])

    if (eligibleProducts.length < 2) return null

    return (
        <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-base font-semibold">Quero meio a meio</Label>
                    <p className="text-xs text-muted-foreground">
                        Escolha 2 sabores. Cobramos o valor do maior.
                    </p>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={setEnabled}
                />
            </div>

            {enabled && (
                <div className="grid gap-4 pt-2">
                    <div className="space-y-2">
                        <Label>1º Sabor</Label>
                        <Select value={firstHalfId} onValueChange={setFirstHalfId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o 1º sabor" />
                            </SelectTrigger>
                            <SelectContent>
                                {eligibleProducts.map(product => (
                                    <SelectItem key={product.id} value={product.id}>
                                        {product.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>2º Sabor</Label>
                        <Select value={secondHalfId} onValueChange={setSecondHalfId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o 2º sabor" />
                            </SelectTrigger>
                            <SelectContent>
                                {eligibleProducts.map(product => (
                                    <SelectItem key={product.id} value={product.id}>
                                        {product.name} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
        </div>
    )
}
