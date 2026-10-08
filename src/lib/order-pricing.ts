import type { Product, ProductOptionGroup, ProductOption, GroupSizeRule, SelectedOption } from '@/types/database'

export type PricingGroup = Pick<ProductOptionGroup, 'id' | 'product_id' | 'title' | 'is_required' | 'max_select' | 'pricing_mode' | 'sort_order'> & {
    options?: (Pick<ProductOption, 'id' | 'group_id' | 'name' | 'price'> & { is_available?: boolean | null })[]
    size_rules?: Pick<GroupSizeRule, 'id' | 'group_id' | 'source_group_id' | 'size_option_id' | 'max_select'>[]
}
export type PricingProduct = Pick<Product, 'id' | 'store_id' | 'name' | 'price' | 'promo_price' | 'is_available' | 'allows_half_half'> & {
    category_id: string | null
    option_groups?: PricingGroup[]
}
import type { ItemIntent, OptionChoice } from './checkout-intent'
import { getEffectiveMaxSelect } from './sizeRules'

export function moneyCents(value: unknown): number {
    const n = Number(value)
    const cents = Math.round(n * 100)
    if ((typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) || !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(cents)
        || Math.abs(n * 100 - cents) > 0.00001) throw new Error('Preço inválido no cardápio. Atualize os itens.')
    return cents
}

function activePrice(p: PricingProduct): number {
    const regular = moneyCents(p.price)
    if (p.promo_price !== null && p.promo_price !== undefined) {
        const promo = moneyCents(p.promo_price)
        if (promo > 0 && promo < regular) return promo
    }
    return regular
}

function groups(p: PricingProduct): PricingGroup[] {
    return [...p.option_groups ?? []].sort((a, b) =>
        Number(a.pricing_mode !== 'replacement') - Number(b.pricing_mode !== 'replacement')
        || a.sort_order - b.sort_order || a.id.localeCompare(b.id))
}

function priceProduct(p: PricingProduct, choices: OptionChoice[]) {
    const selected: Record<string, string[]> = {}
    for (const choice of choices) {
        const group = p.option_groups?.find(g => g.id === choice.group_id && g.product_id === p.id)
        const option = group?.options?.find(o => o.id === choice.option_id && o.group_id === group.id && o.is_available !== false)
        if (!group || !option) throw new Error(`Opção indisponível em ${p.name}. Edite o item.`)
        const ids = selected[group.id] ??= []
        if (ids.includes(option.id)) throw new Error('Uma opção foi selecionada mais de uma vez.')
        ids.push(option.id)
    }
    const ordered = groups(p)
    const replacements = ordered.filter(g => g.pricing_mode === 'replacement')
    let base = activePrice(p)
    let addons = 0
    const snapshot: SelectedOption[] = []
    for (const group of ordered) {
        const ids = selected[group.id] ?? []
        if (group.is_required && !ids.length) throw new Error(`Selecione ${group.title} em ${p.name}.`)
        const max = group.pricing_mode === 'replacement' ? 1 : getEffectiveMaxSelect(group, selected, replacements)
        if (!Number.isInteger(max) || max < 0 || (max > 0 && ids.length > max)) throw new Error(`Revise a quantidade de opções em ${group.title} (${p.name}).`)
        for (const id of ids) {
            const option = group.options!.find(o => o.id === id)!
            const cents = moneyCents(option.price)
            if (group.pricing_mode === 'replacement') base = cents
            else addons += cents
            snapshot.push({ group_id: group.id, option_id: option.id, group: group.title,
                option: option.name, price: cents / 100, is_replacement: group.pricing_mode === 'replacement' })
        }
    }
    if (!Number.isSafeInteger(base + addons)) throw new Error('Valor do item fora do limite.')
    return { cents: base + addons, options: snapshot }
}

// As escolhas do produto aberto são comuns aos sabores. Rótulos vêm do catálogo,
// nunca do payload; correspondências ambíguas/incompatíveis são recusadas.
function flavorChoices(anchor: PricingProduct, flavor: PricingProduct, choices: OptionChoice[]): OptionChoice[] {
    if (anchor.id === flavor.id) return choices
    return choices.map(choice => {
        const sourceGroup = anchor.option_groups!.find(g => g.id === choice.group_id)!
        const sourceOption = sourceGroup.options!.find(o => o.id === choice.option_id)!
        const matches = flavor.option_groups?.filter(g => g.title === sourceGroup.title && g.pricing_mode === sourceGroup.pricing_mode) ?? []
        const options = matches[0]?.options?.filter(o => o.name === sourceOption.name && o.is_available !== false) ?? []
        if (matches.length !== 1 || options.length !== 1) throw new Error(`A opção ${sourceOption.name} não é compatível com o sabor ${flavor.name}.`)
        return { group_id: matches[0].id, option_id: options[0].id }
    })
}

export function priceOrderItem(intent: ItemIntent, catalog: PricingProduct[], storeId: string) {
    const product = catalog.find(p => p.id === intent.product_id && p.store_id === storeId && p.is_available === true)
    if (!product) throw new Error('Produto indisponível. Atualize o carrinho.')
    const anchor = priceProduct(product, intent.selected_options)
    let priced = anchor
    let halves = null
    if (intent.half_product_ids) {
        if (!product.allows_half_half || !product.category_id) throw new Error('Produto não permite meio a meio.')
        halves = intent.half_product_ids.map(id => {
            const flavor = catalog.find(p => p.id === id && p.store_id === storeId && p.category_id === product.category_id && p.allows_half_half && p.is_available === true)
            if (!flavor) throw new Error('Sabor indisponível ou de outra categoria.')
            const configured = priceProduct(flavor, flavorChoices(product, flavor, intent.selected_options))
            return { product_id: flavor.id, product_name: flavor.name, selected_options: configured.options, cents: configured.cents }
        })
        const highest = halves[0].cents >= halves[1].cents ? halves[0] : halves[1]
        priced = { cents: highest.cents, options: highest.selected_options }
    }
    const cents = priced.cents * intent.quantity
    if (!Number.isSafeInteger(cents)) throw new Error('Valor do pedido fora do limite.')
    return { product_id: product.id, product_name: product.name, quantity: intent.quantity,
        unit_price: priced.cents / 100, item_total: cents / 100, selected_options: priced.options,
        observations: intent.observations, is_half_half: !!halves,
        half_half_items: halves?.map(({ cents: _cents, ...h }) => { void _cents; return h }) ?? null }
}
