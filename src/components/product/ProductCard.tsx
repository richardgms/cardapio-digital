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
                <p className="text-foreground font-semibold mt-2">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                </p>
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
                        <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                            <span className="text-xs">Sem foto</span>
                        </div>
                    )}
                </div>

                {/* Add button positioned at bottom-right corner of image */}
                {!disabled && isAvailable && (
                    <Button
                        size="sm"
                        className="absolute bottom-1 right-1 h-7 w-7 p-0 rounded-full bg-white hover:bg-white/90 text-primary shadow-sm border border-gray-100 z-10"
                        onClick={handleAddClick}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
