import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, Category } from '@/types/database'

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

                // Buscar categorias
                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('categories')
                    .select('*')
                    .order('sort_order')

                if (categoriesError) throw categoriesError
                setCategories(categoriesData)

                // Buscar produtos com relacionamentos
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
                    .eq('is_available', true)
                    .order('sort_order')

                if (productsError) throw productsError
                setProducts(productsData)

            } catch (err) {
                console.error('Erro ao carregar produtos:', JSON.stringify(err, null, 2))
                setError('Erro ao carregar cardápio')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    return { products, categories, loading, error }
}
