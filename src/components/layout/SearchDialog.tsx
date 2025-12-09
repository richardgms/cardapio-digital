'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X, ShoppingBag, ArrowLeft } from "lucide-react"
import type { Product } from "@/types/database"
import { ProductCard } from "@/components/product/ProductCard"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SearchDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    products: Product[]
    onProductSelect: (product: Product) => void
}

export function SearchDialog({ open, onOpenChange, products, onProductSelect }: SearchDialogProps) {
    const [query, setQuery] = useState("")
    const [debouncedQuery, setDebouncedQuery] = useState("")

    // Debounce logic
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query)
        }, 300)

        return () => clearTimeout(timer)
    }, [query])

    // Reset query when dialog opens/closes
    useEffect(() => {
        if (!open) {
            setQuery("")
            setDebouncedQuery("")
        }
    }, [open])

    const filteredProducts = useMemo(() => {
        if (!debouncedQuery.trim()) return []

        const lowerQuery = debouncedQuery.toLowerCase()
        return products.filter(product => {
            const matchName = product.name.toLowerCase().includes(lowerQuery)
            const matchDesc = product.description?.toLowerCase().includes(lowerQuery)
            return matchName || matchDesc
        })
    }, [debouncedQuery, products])

    const handleClear = () => {
        setQuery("")
        setDebouncedQuery("")
    }

    const handleSelect = (product: Product) => {
        onProductSelect(product)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md p-0 gap-0 sm:max-w-lg overflow-hidden h-[100dvh] sm:h-[80vh] flex flex-col [&>button]:hidden">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle className="sr-only">Buscar produtos</DialogTitle>
                    <DialogDescription className="sr-only">
                        Digite para buscar produtos no cardápio
                    </DialogDescription>
                    <div className="relative flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => onOpenChange(false)}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="relative flex-1">
                            <Input
                                placeholder="Buscar produtos..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="pr-10"
                                autoFocus
                                inputMode="search"
                                enterKeyHint="search"
                            />
                            {query && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={handleClear}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    {!debouncedQuery ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 mt-10">
                            <Search className="h-12 w-12 mb-4 opacity-20" />
                            <p>Digite o nome de um produto<br />para começar a buscar.</p>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4 mt-10">
                            <ShoppingBag className="h-12 w-12 mb-4 opacity-20" />
                            <p>Nenhum produto encontrado para<br />"{debouncedQuery}"</p>
                        </div>
                    ) : (
                        <div className="grid gap-2 p-4 pr-5">
                            {filteredProducts.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    onSelect={handleSelect}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
