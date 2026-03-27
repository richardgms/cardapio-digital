import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, Category, ProductOptionGroup, ProductOption } from '@/types/database'
import { getSubdomain } from '@/lib/subdomain'

interface UseProductsReturn {
    products: Product[]
    categories: Category[]
    loading: boolean
    error: string | null
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
                const subdomain = getSubdomain()

                if (!subdomain) {
                    // Root domain — nothing to load
                    setProducts([])
                    setCategories([])
                    return
                }

                const { data: storeData, error: storeError } = await supabase
                    .from('store_config')
                    .select('id')
                    .eq('subdomain', subdomain)
                    .single()

                if (storeError || !storeData) {
                    throw new Error('Restaurante não encontrado')
                }

                const storeId = storeData.id

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
                            options:product_options(*),
                            size_rules:group_size_rules!group_size_rules_group_id_fkey(*)
                        )
                    `)
                    .eq('store_id', storeId)
                    .eq('is_available', true)
                    .order('sort_order')

                if (productsError) throw productsError

                // Sort nested relations (Supabase doesn't always guarantee order of nested arrays)
                const sortedProducts = productsData.map(product => ({
                    ...product,
                    option_groups: product.option_groups?.sort((a: ProductOptionGroup, b: ProductOptionGroup) => {
                            const aIsReplacement = a.pricing_mode === 'replacement' ? -1 : 1
                            const bIsReplacement = b.pricing_mode === 'replacement' ? -1 : 1
                            if (aIsReplacement !== bIsReplacement) return aIsReplacement - bIsReplacement
                            return a.sort_order - b.sort_order
                        }).map((group: ProductOptionGroup) => ({
                        ...group,
                        options: group.options
                            ?.filter((o: ProductOption) => o.is_available !== false)
                            .sort((a: ProductOption, b: ProductOption) => {
                                const priceDiff = a.price - b.price
                                if (priceDiff !== 0) return priceDiff
                                return a.name.localeCompare(b.name, 'pt-BR')
                            })
                    }))
                }))

                setProducts(sortedProducts)

            } catch (err: any) {
                console.error('Erro ao carregar produtos:', err?.message, err?.code, err?.details, err?.hint)
                setError(err.message || 'Erro ao carregar cardápio')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    return { products, categories, loading, error }
}

