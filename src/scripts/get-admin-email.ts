import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function getEmail() {
    const { data, error } = await supabase
        .from('store_config')
        .select('admin_email')
        .single()

    if (error) {
        console.error('Error:', error)
    } else {
        console.log('ADMIN_EMAIL:', data?.admin_email)
    }
}

getEmail()
