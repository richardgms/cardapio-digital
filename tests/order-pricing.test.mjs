import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import checkout from '../src/lib/checkout-intent.ts';
import pricing from '../src/lib/order-pricing.ts';
const { normalizeCheckoutIntent, intentContent } = checkout;
const { moneyCents, priceOrderItem } = pricing;

const store = randomUUID();
const category = randomUUID();
function product(overrides = {}) {
    return { id: randomUUID(), store_id: store, category_id: category, name: 'Pizza',
        price: 14, promo_price: null, is_available: true, allows_half_half: true, option_groups: [], ...overrides };
}
function group(p, overrides = {}) {
    return { id: randomUUID(), product_id: p.id, title: 'Extras', pricing_mode: 'addon',
        max_select: 0, is_required: false, sort_order: 0, options: [], size_rules: [], ...overrides };
}
function option(g, overrides = {}) {
    return { id: randomUUID(), group_id: g.id, name: 'Queijo', price: 2, is_available: true, ...overrides };
}
function choice(g, o) { return { group_id: g.id, option_id: o.id }; }
function item(p, overrides = {}) {
    return { client_item_id: randomUUID(), product_id: p.id, quantity: 1,
        selected_options: [], half_product_ids: null, observations: null, ...overrides };
}
function intent(overrides = {}) {
    return { store_id: store, idempotency_key: randomUUID(), customer_name: 'Cliente Teste',
        customer_phone: '(11) 99999-9999', delivery_type: 'pickup', payment_method: 'pix',
        total: 14, items: [item(product())], ...overrides };
}

test('preço promocional válido, quantidade e centavos exatos', () => {
    const p = product({ price: 14.90, promo_price: 12.35 });
    const priced = priceOrderItem(item(p, { quantity: 3 }), [p], store);
    assert.equal(priced.unit_price, 12.35);
    assert.equal(priced.item_total, 37.05);
    for (const promo of [null, 0, 14.90, 20]) {
        assert.equal(priceOrderItem(item(p), [{ ...p, promo_price: promo }], store).unit_price, 14.90);
    }
});
test('valores não finitos, negativos, fracionários e coerções perigosas são rejeitados', () => {
    for (const n of [NaN, Infinity, -1, 1.001, null, undefined, true, false, '', ' ', {}, [], Number.MAX_SAFE_INTEGER]) {
        assert.throws(() => moneyCents(n));
    }
    assert.equal(moneyCents('14.90'), 1490);
    assert.equal(moneyCents(0.29), 29);
});
test('substituição troca base; adicional entra no preço unitário e no snapshot', () => {
    const p = product({ promo_price: 10 });
    const size = group(p, { title: 'Tamanho', pricing_mode: 'replacement', is_required: true });
    const large = option(size, { name: 'Grande', price: 20 }); size.options = [large];
    const extra = group(p); const cheese = option(extra); extra.options = [cheese];
    p.option_groups = [extra, size];
    const result = priceOrderItem(item(p, { quantity: 2, selected_options: [choice(extra, cheese), choice(size, large)] }), [p], store);
    assert.equal(result.unit_price, 22);
    assert.equal(result.item_total, 44);
    assert.equal(result.selected_options[0].is_replacement, true);
    assert.equal(result.selected_options[1].option_id, cheese.id);
    assert.equal(result.selected_options[1].price, 2);
});
test('múltiplas substituições respeitam ordem estável de grupos', () => {
    const p = product(); const a = group(p, { pricing_mode: 'replacement', sort_order: 0 });
    const b = group(p, { pricing_mode: 'replacement', sort_order: 1 });
    const x = option(a, { price: 20 }); const y = option(b, { price: 30 });
    a.options = [x]; b.options = [y]; p.option_groups = [b, a];
    assert.equal(priceOrderItem(item(p, { selected_options: [choice(b, y), choice(a, x)] }), [p], store).unit_price, 30);
});
test('grupo obrigatório, opção desativada e opção duplicada são bloqueados', () => {
    const p = product(); const g = group(p, { is_required: true }); const o = option(g); g.options = [o]; p.option_groups = [g];
    assert.throws(() => priceOrderItem(item(p), [p], store), /Selecione/);
    assert.throws(() => priceOrderItem(item(p, { selected_options: [choice(g, o), choice(g, o)] }), [p], store), /mais de uma/);
    o.is_available = false;
    assert.throws(() => priceOrderItem(item(p, { selected_options: [choice(g, o)] }), [p], store), /indisponível/);
});
test('produto/opção de outra loja ou de outro grupo não são aceitos', () => {
    const p = product(); const g = group(p); const o = option(g); g.options = [o]; p.option_groups = [g];
    assert.throws(() => priceOrderItem(item(p), [{ ...p, store_id: randomUUID() }], store));
    assert.throws(() => priceOrderItem(item(p), [{ ...p, is_available: false }], store));
    assert.throws(() => priceOrderItem(item(p, { selected_options: [{ group_id: randomUUID(), option_id: o.id }] }), [p], store));
    o.group_id = randomUUID();
    assert.throws(() => priceOrderItem(item(p, { selected_options: [choice(g, o)] }), [p], store));
});
test('limite de adicionais é aplicado; zero preserva seleção ilimitada', () => {
    const p = product(); const g = group(p, { max_select: 1 }); const a = option(g); const b = option(g);
    g.options = [a, b]; p.option_groups = [g];
    const i = item(p, { selected_options: [choice(g, a), choice(g, b)] });
    assert.throws(() => priceOrderItem(i, [p], store), /quantidade/);
    g.max_select = 0;
    assert.equal(priceOrderItem(i, [p], store).unit_price, 18);
});
test('regra de tamanho só usa a opção pertencente ao grupo de origem', () => {
    const p = product(); const size = group(p, { pricing_mode: 'replacement' }); const large = option(size, { price: 20 });
    const extras = group(p, { max_select: 2 }); const a = option(extras); const b = option(extras);
    size.options = [large]; extras.options = [a, b]; p.option_groups = [size, extras];
    const i = item(p, { selected_options: [choice(size, large), choice(extras, a), choice(extras, b)] });
    extras.size_rules = [{ group_id: extras.id, source_group_id: randomUUID(), size_option_id: large.id, max_select: 1 }];
    assert.equal(priceOrderItem(i, [p], store).unit_price, 24);
    extras.size_rules[0].source_group_id = size.id;
    assert.throws(() => priceOrderItem(i, [p], store), /quantidade/);
});
test('meio a meio cobra maior sabor configurado e conserva IDs dos dois', () => {
    const a = product({ price: 14, promo_price: 10 }); const b = product({ name: 'Calabresa', price: 18 });
    const ga = group(a); const gb = group(b); const oa = option(ga); const ob = option(gb, { price: 3 });
    ga.options = [oa]; gb.options = [ob]; a.option_groups = [ga]; b.option_groups = [gb];
    const result = priceOrderItem(item(a, { quantity: 2, half_product_ids: [a.id, b.id], selected_options: [choice(ga, oa)] }), [a, b], store);
    assert.equal(result.unit_price, 21); assert.equal(result.item_total, 42);
    assert.equal(result.selected_options[0].option_id, ob.id);
    assert.deepEqual(result.half_half_items.map(h => h.product_id), [a.id, b.id]);
});
test('meio a meio exige compatibilidade, disponibilidade, categoria e regras dos dois sabores', () => {
    const a = product(); const b = product();
    const i = item(a, { half_product_ids: [a.id, b.id] });
    for (const bad of [{ store_id: randomUUID() }, { category_id: randomUUID() }, { is_available: false }, { allows_half_half: false }]) {
        assert.throws(() => priceOrderItem(i, [a, { ...b, ...bad }], store));
    }
    b.option_groups = [group(b, { is_required: true })];
    assert.throws(() => priceOrderItem(i, [a, b], store), /Selecione/);
    const ga = group(a); const oa = option(ga); ga.options = [oa]; a.option_groups = [ga];
    assert.throws(() => priceOrderItem({ ...i, selected_options: [choice(ga, oa)] }, [a, b], store), /compatív/);
});
test('normalização remove preços e nomes enviados pelo cliente e preserva complemento', () => {
    const value = intent({ delivery_type: 'delivery', delivery_zone_id: randomUUID(),
        delivery_address: ' Rua A, 10 ', address_complement: ' Apto 12 ', coupon_code: ' teste ',
        subtotal: 0.01, discount: 999 });
    value.items[0].item_total = 0.01; value.items[0].product_name = 'Nome adulterado';
    const normalized = normalizeCheckoutIntent(value);
    assert.equal(normalized.customer_phone, '11999999999');
    assert.equal(normalized.address_complement, 'Apto 12');
    assert.equal(normalized.coupon_code, 'TESTE');
    assert.equal(normalized.delivery_address, 'Rua A, 10');
    assert.equal('subtotal' in normalized, false); assert.equal('item_total' in normalized.items[0], false);
});
test('hash de intenção ignora chave de tentativa e ordem de opções; diferencia conteúdo e nova linha', () => {
    const a = { group_id: randomUUID(), option_id: randomUUID() }; const b = { group_id: randomUUID(), option_id: randomUUID() };
    const value = intent(); value.items[0].selected_options = [a, b];
    const baseline = intentContent(normalizeCheckoutIntent(value));
    assert.equal(intentContent(normalizeCheckoutIntent({ ...value, idempotency_key: randomUUID(), items: [{ ...value.items[0], selected_options: [b, a] }] })), baseline);
    for (const edit of [{ quantity: 2 }, { observations: 'Sem cebola' }, { client_item_id: randomUUID() }]) {
        assert.notEqual(intentContent(normalizeCheckoutIntent({ ...value, items: [{ ...value.items[0], ...edit }] })), baseline);
    }
});
test('limites de entrada e campos obrigatórios impedem pedido inválido', () => {
    for (const total of [NaN, Infinity, -1, 1.001]) assert.throws(() => normalizeCheckoutIntent(intent({ total })));
    for (const quantity of [0, -1, 101, 1.5]) {
        const v = intent(); v.items[0].quantity = quantity; assert.throws(() => normalizeCheckoutIntent(v));
    }
    assert.throws(() => normalizeCheckoutIntent(intent({ delivery_type: 'delivery' })));
    assert.throws(() => normalizeCheckoutIntent(intent({ delivery_type: 'table', table_number: 1, customer_phone: '1' })));
    assert.equal(normalizeCheckoutIntent(intent({ delivery_type: 'table', table_number: 1, customer_phone: '' })).customer_phone, '');
});
