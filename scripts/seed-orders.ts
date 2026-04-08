import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Produtos simulados (preços inteiros — schema integer no DB) ───────────────
const PRODUCTS = [
    { name: 'X-Burguer Clássico', price: 29 },
    { name: 'X-Bacon Duplo', price: 39 },
    { name: 'X-Frango Crispy', price: 32 },
    { name: 'Combo X-Burguer + Fritas', price: 43 },
    { name: 'Combo X-Bacon + Fritas + Refri', price: 52 },
    { name: 'Fritas Grandes', price: 15 },
    { name: 'Fritas com Cheddar', price: 20 },
    { name: 'Onion Rings', price: 17 },
    { name: 'Milk Shake Chocolate', price: 22 },
    { name: 'Milk Shake Morango', price: 22 },
    { name: 'Refrigerante Lata', price: 7 },
    { name: 'Suco Natural de Laranja', price: 11 },
    { name: 'Nuggets 10 unidades', price: 25 },
    { name: 'Cachorro Quente Especial', price: 22 },
    { name: 'Temaki Salmão', price: 35 },
]

const CUSTOMER_NAMES = [
    'Ana Lima', 'Bruno Costa', 'Carla Souza', 'Diego Ferreira', 'Eduarda Rocha',
    'Felipe Mendes', 'Gabriela Nunes', 'Henrique Alves', 'Isabela Cardoso', 'João Pedro Silva',
    'Kamila Ramos', 'Lucas Martins', 'Marina Oliveira', 'Nathan Ribeiro', 'Olivia Santos',
    'Paulo Andrade', 'Quésia Tavares', 'Rafael Gomes', 'Sabrina Lopes', 'Thiago Peixoto',
]

const DELIVERY_TYPES = ['delivery', 'pickup', 'table'] as const
const PAYMENT_METHODS = ['pix', 'card', 'cash'] as const
const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const

type DeliveryType = typeof DELIVERY_TYPES[number]
type PaymentMethod = typeof PAYMENT_METHODS[number]
type OrderStatus = typeof STATUSES[number]

// ── Helpers ───────────────────────────────────────────────────────────────────
function rnd<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
}

function rndInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function rndPhone() {
    return `119${rndInt(10000000, 99999999)}`
}

/** Retorna uma data aleatória nos últimos `days` dias, distribuída com pico no fim de semana */
function rndDate(days: number): Date {
    const now = new Date()
    // pico de pedidos: sexta/sábado/domingo — peso maior
    const daysAgo = Math.floor(Math.pow(Math.random(), 0.7) * days)
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    // horário realista: 11h–23h
    d.setHours(rndInt(11, 22), rndInt(0, 59), rndInt(0, 59), 0)
    return d
}

function weightedStatus(): OrderStatus {
    const r = Math.random()
    if (r < 0.55) return 'delivered'
    if (r < 0.70) return 'confirmed'
    if (r < 0.80) return 'preparing'
    if (r < 0.88) return 'ready'
    if (r < 0.93) return 'pending'
    return 'cancelled'
}

function weightedDelivery(): DeliveryType {
    const r = Math.random()
    if (r < 0.55) return 'delivery'
    if (r < 0.80) return 'pickup'
    return 'table'
}

function weightedPayment(): PaymentMethod {
    const r = Math.random()
    if (r < 0.60) return 'pix'
    if (r < 0.85) return 'card'
    return 'cash'
}

/** Arredonda para inteiro (change_for é integer no DB) */
function toInt(n: number) {
    return Math.round(n)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🔍 Buscando store_id para richardgms001@gmail.com...')

    const { data: store, error: storeErr } = await supabase
        .from('store_config')
        .select('id, name')
        .eq('admin_email', 'richardgms001@gmail.com')
        .single()

    if (storeErr || !store) {
        console.error('❌ Loja não encontrada:', storeErr?.message)
        process.exit(1)
    }

    console.log(`✅ Loja encontrada: "${store.name}" (${store.id})`)

    // Limpar pedidos seed anteriores (últimos 65 dias) para evitar duplicatas
    console.log('🗑️  Limpando pedidos seed anteriores...')
    const cutoff = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString()
    const { data: deleted } = await supabase
        .from('orders')
        .delete()
        .eq('store_id', store.id)
        .gte('created_at', cutoff)
        .select('id')
    console.log(`   ${deleted?.length ?? 0} pedidos anteriores removidos.`)

    const TOTAL_ORDERS = 180 // ~3 por dia em 60 dias
    const DAYS = 60

    console.log(`\n📦 Gerando ${TOTAL_ORDERS} pedidos nos últimos ${DAYS} dias...`)

    let inserted = 0
    let failed = 0

    for (let i = 0; i < TOTAL_ORDERS; i++) {
        const deliveryType = weightedDelivery()
        const paymentMethod = weightedPayment()
        const status = weightedStatus()
        const createdAt = rndDate(DAYS)

        // Gera 1–4 itens por pedido
        const itemCount = rndInt(1, 4)
        const orderItems: { product: typeof PRODUCTS[number]; qty: number }[] = []
        const usedProducts = new Set<number>()

        for (let j = 0; j < itemCount; j++) {
            let idx: number
            do { idx = rndInt(0, PRODUCTS.length - 1) } while (usedProducts.has(idx))
            usedProducts.add(idx)
            orderItems.push({ product: PRODUCTS[idx], qty: rndInt(1, 3) })
        }

        const subtotal = Math.round(orderItems.reduce((s, i) => s + i.product.price * i.qty, 0))
        const deliveryFee = deliveryType === 'delivery' ? rnd([5, 6, 7, 8, 10]) : 0
        const total = subtotal + deliveryFee

        // Insert order
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .insert({
                store_id: store.id,
                customer_name: rnd(CUSTOMER_NAMES),
                customer_phone: rndPhone(),
                delivery_type: deliveryType,
                table_number: deliveryType === 'table' ? rndInt(1, 12) : null,
                delivery_address: deliveryType === 'delivery'
                    ? `Rua ${rnd(['das Flores', 'Principal', 'da Saudade', 'Nova', 'do Comércio'])}, ${rndInt(1, 999)}`
                    : null,
                delivery_zone_id: null,
                delivery_zone_name: deliveryType === 'delivery' ? rnd(['Centro', 'Bairro Norte', 'Vila Nova', 'Jardim']) : null,
                payment_method: paymentMethod,
                change_for: paymentMethod === 'cash' ? toInt(Math.ceil(total / 10) * 10) + rnd([0, 10, 20]) : null,
                subtotal,
                delivery_fee: deliveryFee,
                total,
                status,
                notes: Math.random() < 0.2 ? rnd(['Sem cebola', 'Capricha no molho', 'Sem picles', 'Bem passado']) : null,
                created_at: createdAt.toISOString(),
                updated_at: createdAt.toISOString(),
            })
            .select('id')
            .single()

        if (orderErr || !order) {
            failed++
            if (failed <= 3) console.error(`  ⚠️  Erro no pedido ${i + 1}:`, orderErr?.message)
            continue
        }

        // Insert order items
        const itemsToInsert = orderItems.map(({ product, qty }) => ({
            order_id: order.id,
            product_id: null,
            product_name: product.name,
            quantity: qty,
            unit_price: product.price,
            selected_options: [],
            observations: null,
            is_half_half: false,
            half_half_items: null,
            item_total: product.price * qty,
        }))

        const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert)
        if (itemsErr) {
            failed++
            if (failed <= 3) console.error(`  ⚠️  Erro nos itens do pedido ${i + 1}:`, itemsErr.message)
            continue
        }

        inserted++
        if (inserted % 30 === 0) console.log(`  → ${inserted}/${TOTAL_ORDERS} inseridos...`)
    }

    console.log(`\n✅ Concluído: ${inserted} pedidos inseridos, ${failed} falhas.`)
}

main().catch(err => {
    console.error('Erro fatal:', err)
    process.exit(1)
})
