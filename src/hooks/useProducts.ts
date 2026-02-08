import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, Category } from '@/types/database'

interface UseProductsReturn {
    products: Product[]
    categories: Category[]
    loading: boolean
    error: string | null
}

/**
 * Get subdomain from cookie (set by middleware)
 */
function getSubdomainFromCookie(): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|; )subdomain=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : null
}

export function useProducts(): UseProductsReturn {
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchData() {
            try {
                const supabase = createClient()
                const subdomain = getSubdomainFromCookie()

                // First, get the store_id from subdomain if available
                let storeId: string | null = null

                if (subdomain) {
                    const { data: storeData, error: storeError } = await supabase
                        .from('store_config')
                        .select('id')
                        .eq('subdomain', subdomain)
                        .single()

                    if (storeError) {
                        console.error('Store not found for subdomain:', subdomain)
                        throw new Error('Restaurante não encontrado')
                    }
                    storeId = storeData.id
                } else {
                    // Fallback: get the first store (for development/backwards compat)
                    const { data: storeData } = await supabase
                        .from('store_config')
                        .select('id')
                        .limit(1)
                        .single()

                    storeId = storeData?.id || null
                }

                if (!storeId) {
                    throw new Error('Nenhum restaurante configurado')
                }

                // Buscar categorias da loja
                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('categories')
                    .select('*')
                    .eq('store_id', storeId)
                    .order('sort_order')

                if (categoriesError) throw categoriesError
                setCategories(categoriesData)

                // Buscar produtos da loja com relacionamentos
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select(`
                        *,
                        category:categories(*),
                        option_groups:product_option_groups(
                            *,
                            options:product_options(*)
                        )
                    `)
                    .eq('store_id', storeId)
                    .eq('is_available', true)
                    .order('sort_order')

                if (productsError) throw productsError
                setProducts(productsData)

            } catch (err: any) {
                console.error('Erro ao carregar produtos:', err)
                setError(err.message || 'Erro ao carregar cardápio')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    return { products, categories, loading, error }
}

