'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Search } from 'lucide-react'
import { usePublicStore } from '@/hooks/usePublicStore'
import { useCartStore } from '@/stores/cartStore'
import { Skeleton } from '@/components/ui/skeleton'

interface HeaderProps {
    onCartClick: () => void
    onSearchClick: () => void
}

export function Header({ onCartClick, onSearchClick }: HeaderProps) {
    const { store, loading } = usePublicStore()
    const items = useCartStore((state) => state.items)

    const cartItemCount = items.length
    const isOpen = store?.is_open ?? false

    return (
        <header className="w-full bg-white">
            <div className="flex items-center justify-between px-4 py-3 w-full">
                <div className="flex items-center gap-2">
                    {loading ? (
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-8 rounded-lg" />
                            <Skeleton className="h-6 w-32" />
                        </div>
                    ) : (
                        <>
                            {store?.logo_url ? (
                                <img
                                    src={store.logo_url}
                                    alt={store.name}
                                    className="h-8 w-8 rounded-lg object-cover"
                                />
                            ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                                    {store?.name?.charAt(0) || 'S'}
                                </div>
                            )}
                            <h1 className="text-lg font-semibold text-foreground text-balance truncate max-w-[180px]">
                                {store?.name || 'Loja'}
                            </h1>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {loading ? (
                        <Skeleton className="h-6 w-16" />
                    ) : (
                        <Badge
                            variant={isOpen ? 'default' : 'secondary'}
                            className={`${isOpen
                                ? 'bg-green-100 text-green-800 hover:bg-green-100 hover:text-green-800 border-green-200'
                                : 'bg-red-100 text-red-800 hover:bg-red-100 hover:text-red-800 border-red-200'
                                }`}
                        >
                            {isOpen ? 'Aberto' : 'Fechado'}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 hover:bg-accent"
                        onClick={onSearchClick}
                    >
                        <Search className="h-5 w-5 text-foreground" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="relative h-10 w-10 hover:bg-accent"
                        onClick={onCartClick}
                    >
                        <ShoppingCart className="h-5 w-5 text-foreground" />
                        {cartItemCount > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white">
                                {cartItemCount > 99 ? '99+' : cartItemCount}
                            </span>
                        )}
                    </Button>
                </div>
            </div>
        </header>
    )
}
