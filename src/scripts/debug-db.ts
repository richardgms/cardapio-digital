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

async function debug() {
    console.log('--- DEBUGGING DB ---')

    // 1. List Categories
    const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')

    if (catError) console.error('Error fetching categories:', catError)
    else {
        console.log(`Found ${categories.length} categories:`)
        categories.forEach(c => console.log(`- [${c.id}] ${c.name}`))
    }

    // 2. List Products
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, category_id, is_available')

    if (prodError) console.error('Error fetching products:', prodError)
    else {
        console.log(`Found ${products.length} products:`)
        products.forEach(p => {
            const cat = categories?.find(c => c.id === p.category_id)
            console.log(`- [${p.id}] ${p.name} (Cat: ${cat ? cat.name : 'UNKNOWN'}) Available: ${p.is_available}`)
        })
    }
}

debug()
