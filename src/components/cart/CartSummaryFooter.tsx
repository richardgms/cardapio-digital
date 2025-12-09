"use client"

import { useCartStore } from "@/stores/cartStore"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

interface CartSummaryFooterProps {
    onCartClick: () => void
}

export function CartSummaryFooter({ onCartClick }: CartSummaryFooterProps) {
    const items = useCartStore((state) => state.items)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    if (items.length === 0) return null

    const total = items.reduce((acc, item) => acc + item.item_total, 0)

    return (
        <div className="sticky bottom-0 -mx-4 px-4 py-4 bg-white border-t border-gray-200 z-50">
            <div className="flex items-center justify-between w-full">
                <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Subtotal</span>
                    <div className="flex items-baseline gap-1">
                        <span className="font-bold text-lg text-foreground">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            / {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                    </div>
                </div>
                <Button
                    onClick={onCartClick}
                    className="bg-black hover:bg-neutral-800 text-white px-6 font-semibold"
                >
                    Ver carrinho
                </Button>
            </div>
        </div>
    )
}
