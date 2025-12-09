import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
    console.log('Starting seed...')

    // 1. Get or Create Category "Pizzas"
    let categoryId: string

    const { data: existingCategory } = await supabase
        .from('categories')
        .select('id')
        .eq('name', 'Pizzas')
        .single()

    if (existingCategory) {
        console.log('Category "Pizzas" already exists')
        categoryId = existingCategory.id
    } else {
        console.log('Creating category "Pizzas"...')
        const { data: newCategory, error } = await supabase
            .from('categories')
            .insert({ name: 'Pizzas', sort_order: 10 })
            .select('id')
            .single()

        if (error) {
            console.error('Error creating category:', error)
            return
        }
        categoryId = newCategory.id
    }

    // 2. Insert Pizzas
    const pizzas = [
        {
            name: 'Pizza Calabresa',
            description: 'Molho de tomate, mussarela, calabresa fatiada e cebola.',
            price: 45.00,
            category_id: categoryId,
            allows_half_half: true,
            is_available: true,
            image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80'
        },
        {
            name: 'Pizza Mussarela',
            description: 'Molho de tomate, muita mussarela e orégano.',
            price: 40.00,
            category_id: categoryId,
            allows_half_half: true,
            is_available: true,
            image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80'
        },
        {
            name: 'Pizza Portuguesa',
            description: 'Molho, mussarela, presunto, ovos, cebola e azeitona.',
            price: 50.00,
            category_id: categoryId,
            allows_half_half: true,
            is_available: true,
            image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80'
        }
    ]

    for (const pizza of pizzas) {
        const { error } = await supabase
            .from('products')
            .insert(pizza)

        if (error) {
            console.error(`Error inserting ${pizza.name}:`, error)
        } else {
            console.log(`Inserted ${pizza.name}`)
        }
    }

    console.log('Seed completed!')
}

seed()
