'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { StoreBanner } from '@/components/layout/StoreBanner'
import { CategoryNav } from '@/components/layout/CategoryNav'
import { useProducts } from '@/hooks/useProducts'
import { usePublicStore } from '@/hooks/usePublicStore'
import { useDeliveryZones } from '@/hooks/useDeliveryZones'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductCard } from '@/components/product/ProductCard'
import { ProductModal } from '@/components/product/ProductModal'
import { SearchDialog } from '@/components/layout/SearchDialog'
import { CartDrawer } from '@/components/cart/CartDrawer'
import { CartSummaryFooter } from '@/components/cart/CartSummaryFooter'
import { useCartStore } from '@/stores/cartStore'
import type { Product } from '@/types/database'
import { AlertCircle } from 'lucide-react'
import { LandingPage } from '@/components/layout/LandingPage'

export default function HomePage() {
    const { categories, products, loading: loadingProducts, error: errorProducts } = useProducts()
    const { store, isCurrentlyOpen, loading: loadingStore, error: errorStore } = usePublicStore()
    const { zones, loading: loadingZones } = useDeliveryZones()
    // const cartItems = useCartStore((state) => state.items) // Not needed for layout logic anymore

    const [activeCategory, setActiveCategory] = useState<string | null>(null)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [isCartOpen, setIsCartOpen] = useState(false)
    const [isSearchOpen, setIsSearchOpen] = useState(false)

    // Set default active category
    useEffect(() => {
        if (!activeCategory && categories.length > 0) {
            setActiveCategory(categories[0].id)
        }
    }, [categories, activeCategory])

    // Scroll Spy Logic
    useEffect(() => {
        const handleScroll = () => {
            const headerOffset = 250 // Offset to trigger change before section hits absolute top
            const scrollPosition = window.scrollY + headerOffset

            let currentId = null

            for (const category of categories) {
                const element = document.getElementById(category.id)
                if (element) {
                    // Check if scroll reached this element
                    if (scrollPosition >= element.offsetTop) {
                        currentId = category.id
                    }
                }
            }

            if (currentId && currentId !== activeCategory) {
                setActiveCategory(currentId)
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [categories, activeCategory])

    const handleCategorySelect = (id: string) => {
        setActiveCategory(id)
        const element = document.getElementById(id)
        if (element) {
            // Aumentando o offset para garantir que o título não fique escondido sob o cabeçalho
            const headerOffset = 180
            const elementPosition = element.getBoundingClientRect().top
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            })
        }
    }

    const handleCartClick = () => {
        setIsCartOpen(true)
    }

    const handleSearchClick = () => {
        setIsSearchOpen(true)
    }

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product)
    }

    // Logic: If no store is loaded and no error (and not loading), it means we are on ROOT DOMAIN
    if (!store && !loadingStore && !errorStore) {
        return <LandingPage />
    }

    const isLoading = loadingStore || loadingProducts || loadingZones
    const hasError = errorStore || errorProducts

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 pb-20">
                <div className="h-16 bg-white shadow-sm mb-4" />
                <div className="w-full px-4 space-y-4">
                    <Skeleton className="h-10 w-full rounded-full" />
                    <div className="grid gap-4">
                        <Skeleton className="h-40 w-full rounded-xl" />
                        <Skeleton className="h-40 w-full rounded-xl" />
                        <Skeleton className="h-40 w-full rounded-xl" />
                        <Skeleton className="h-40 w-full rounded-xl" />
                    </div>
                </div>
            </div>
        )
    }

    if (hasError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
                <h2 className="text-lg font-semibold mb-2">Ops! Algo deu errado.</h2>
                <p>{errorStore || errorProducts || "Não foi possível carregar o cardápio."}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
                >
                    Tentar Novamente
                </button>
            </div>
        )
    }

    if (!categories || categories.length === 0) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center text-muted-foreground bg-gray-50">
                <div className="bg-white p-8 rounded-full shadow-sm mb-4">
                    <AlertCircle className="h-10 w-10 text-gray-400" />
                </div>
                <h2 className="text-lg font-semibold mb-1 text-gray-900">Nenhum produto cadastrado</h2>
                <p className="max-w-[250px]">O cardápio desta loja ainda não possui itens visíveis.</p>
            </div>
        )
    }

    // Logic for banner visibility
    const showBanner = !loadingStore && store && (!store.is_open || (store.auto_schedule_enabled && !isCurrentlyOpen));

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Wrapper Sticky: Makes Header, Banner, and Nav behave as one fixed block */}
            <div className="sticky top-0 z-40 w-full bg-gray-50">
                <div className="bg-white w-full max-w-screen-lg mx-auto border-x border-b border-gray-200">
                    <Header onCartClick={handleCartClick} onSearchClick={handleSearchClick} />

                    {/* Banner handles its own display logic internally but matches this condition */}
                    {showBanner && <StoreBanner />}

                    <CategoryNav
                        categories={categories}
                        activeId={activeCategory}
                        onSelect={handleCategorySelect}
                    />
                </div>
            </div>

            <main className="w-full px-4 py-6 space-y-8 max-w-screen-lg mx-auto bg-white border-x border-gray-200 min-h-screen flex flex-col">
                <div className="flex-1 space-y-8">
                    {categories.map((category) => {
                        const categoryProducts = products.filter(p => p.category_id === category.id)

                        if (categoryProducts.length === 0) return null

                        return (
                            <section
                                key={category.id}
                                id={category.id}
                                // Increase scroll margin when banner is visible to prevent cut-off
                                className={showBanner ? "scroll-mt-64" : "scroll-mt-48"}
                            >
                                <h2 className="text-xl font-bold mb-4 text-gray-800">{category.name}</h2>
                                <div className="grid gap-4">
                                    {categoryProducts.map((product, index) => (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                            onSelect={handleProductSelect}
                                            disabled={!store?.is_open}
                                            priority={index < 4}
                                        />
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </div>

                <CartSummaryFooter onCartClick={handleCartClick} />
            </main>

            <ProductModal
                product={selectedProduct}
                open={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
            />

            <SearchDialog
                open={isSearchOpen}
                onOpenChange={setIsSearchOpen}
                products={products}
                onProductSelect={handleProductSelect}
            />

            <CartDrawer
                open={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                onEditItem={(item) => {
                    if (item.product) {
                        setSelectedProduct(item.product)
                        setIsCartOpen(false) // Close cart to focus on modal
                    }
                }}
            />
        </div>
    )
}
