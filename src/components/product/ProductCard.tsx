import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Image from "next/image"
import type { Product } from "@/types/database"
import { cn } from "@/lib/utils"

interface ProductCardProps {
    product: Product
    onSelect: (product: Product) => void
    disabled?: boolean
    priority?: boolean
}

export function ProductCard({ product, onSelect, disabled = false, priority = false }: ProductCardProps) {
    const hasOptions = (product.option_groups?.length ?? 0) > 0 || product.allows_half_half
    const isAvailable = product.is_available

    const replacementGroup = product.option_groups?.find(g => g.pricing_mode === 'replacement')
    const minReplacementPrice = replacementGroup?.options?.length
        ? Math.min(...replacementGroup.options.filter(o => o.is_available !== false).map(o => o.price))
        : null

    const handleAddClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!disabled && isAvailable) {
            onSelect(product)
        }
    }

    return (
        <div
            className={cn(
                "flex items-center justify-between py-4 border-b border-border last:border-b-0 cursor-pointer transition-opacity",
                !isAvailable && "opacity-50 grayscale",
                disabled && "opacity-70 pointer-events-none"
            )}
            onClick={() => !disabled && isAvailable && onSelect(product)}
        >
            {/* Left side: Title and Price */}
            <div className="flex-1 pr-4">
                <h3 className="font-medium text-foreground text-base">{product.name}</h3>
                {product.description && (
                    <p className="text-muted-foreground text-sm mt-1 line-clamp-2">
                        {product.description}
                    </p>
                )}
                {(() => {
                    const formatCurrency = (val: number) =>
                        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

                    if (minReplacementPrice !== null) {
                        return (
                            <p className="text-foreground font-semibold mt-2">
                                {`A partir de ${formatCurrency(minReplacementPrice)}`}
                            </p>
                        )
                    }

                    const hasPromo = product.promo_price !== null && product.promo_price !== undefined && product.promo_price > 0 && product.promo_price < product.price

                    if (hasPromo) {
                        return (
                            <div className="flex items-baseline gap-2 mt-2">
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    {formatCurrency(product.promo_price!)}
                                </span>
                                <span className="line-through text-muted-foreground text-sm font-normal">
                                    {formatCurrency(product.price)}
                                </span>
                            </div>
                        )
                    }

                    return (
                        <p className="text-foreground font-semibold mt-2">
                            {formatCurrency(product.price)}
                        </p>
                    )
                })()}
                {!isAvailable && (
                    <span className="text-xs font-bold text-destructive mt-1 block">
                        Esgotado
                    </span>
                )}
            </div>

            {/* Right side: Image with Add button */}
            <div className="relative flex-shrink-0">
                <div className="relative h-24 w-24 rounded-lg overflow-hidden bg-muted">
                    {product.image_url ? (
                        <Image
                            src={product.image_url}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="96px"
                            priority={priority}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                            <span className="text-xs">Sem foto</span>
                        </div>
                    )}
                </div>

                {/* Add button positioned at bottom-right corner of image */}
                {!disabled && isAvailable && (
                    <Button
                        size="sm"
                        className="absolute bottom-1 right-1 h-7 w-7 p-0 rounded-full bg-background hover:bg-muted text-primary shadow-sm border border-border z-10"
                        onClick={handleAddClick}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
