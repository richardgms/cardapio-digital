import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

const { data, error } = await supabase.rpc('exec_sql', {
    sql: `SELECT column_name, data_type, udt_name
          FROM information_schema.columns
          WHERE table_name = 'orders'
          AND column_name IN ('subtotal','total','delivery_fee','change_for','table_number')
          ORDER BY column_name`
})

if (error) {
    // fallback: fetch one real order and inspect
    const { data: sample } = await supabase
        .from('orders')
        .select('subtotal, total, delivery_fee, change_for, table_number')
        .limit(3)
    console.log('Amostra de pedidos reais:', JSON.stringify(sample, null, 2))
} else {
    console.log('Schema:', JSON.stringify(data, null, 2))
}
