import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { test } from 'node:test';
import service from '../src/lib/order-checkout-service.ts';
import checkout from '../src/lib/checkout-intent.ts';
const { submitCheckout } = service;
const { normalizeCheckoutIntent, intentContent } = checkout;
const store = randomUUID(); const product = randomUUID();
function input(overrides = {}) {
    return { store_id: store, idempotency_key: randomUUID(), customer_name: 'Cliente Teste', customer_phone: '11999999999',
        delivery_type: 'pickup', payment_method: 'pix', total: 14,
        items: [{ client_item_id: randomUUID(), product_id: product, quantity: 1 }], ...overrides };
}
function fixture(settings = {}) {
    const calls = []; let saved = settings.saved ?? null; let commits = 0;
    const state = { store: { id: store, is_open: true }, hours: [], products: [{ id: product, store_id: store, category_id: null,
        name: 'Produto real', price: 14, promo_price: null, is_available: true, allows_half_half: false, option_groups: [] }] };
    const db = {
        from(table) {
            calls.push({ table }); let projection; const filters = {};
            const q = {
                select(fields) { projection = fields; return q; },
                eq(field, value) { filters[field] = value; return q; },
                async maybeSingle() { assert.equal(table, 'orders'); return { data: saved ? { id: saved.id } : null, error: null }; },
                async single() {
                    if (table === 'store_config') return { data: { whatsapp: '11999990000', pix_key: 'teste@example.invalid' }, error: null };
                    assert.equal(table, 'orders'); assert.ok(projection.includes('order_items'));
                    assert.equal(filters.store_id, store); assert.equal(filters.idempotency_key, saved.idempotency_key);
                    assert.equal(filters.id, saved.id);
                    if (settings.readFailure) { settings.readFailure = false; return { data: null, error: { code: 'network' } }; }
                    const row = structuredClone(saved); if (settings.mutateReceipt) settings.mutateReceipt(row);
                    return { data: row, error: null };
                },
                insert() { throw new Error('O checkout não deve fazer INSERT separado.'); },
                update() { throw new Error('O checkout não deve fazer UPDATE compensatório.'); },
            };
            return q;
        },
        async rpc(name, args) {
            calls.push({ rpc: name, args });
            if (settings.throwNetwork) throw new Error('segredo-interno de rede');
            if (name === 'rmenu_order_catalog_state') return { data: state, error: settings.quoteError ? { code: 'PGRST202' } : null };
            assert.equal(name, 'rmenu_submit_order');
            if (settings.submitError) return { data: null, error: settings.submitError };
            if (saved && saved.request_hash !== args.p_request_hash) return { data: null, error: { code: '22023', message: 'Chave da tentativa já usada para outro conteúdo.' } };
            let replayed = true;
            if (!saved) {
                replayed = false; commits++;
                saved = { ...args.p_payload, id: randomUUID(), order_number: 1, status: 'pending', expected_item_count: args.p_payload.items.length,
                    request_hash: args.p_request_hash, subtotal: args.p_payload.items.reduce((s,i) => s+i.item_total,0),
                    discount_value: 0, delivery_fee: 0, delivery_zone_name: null, order_items: args.p_payload.items };
            }
            return { data: { order_id: saved.id, order_number: saved.order_number, replayed }, error: null };
        },
    };
    return { db, calls, state, get commits() { return commits; }, get saved() { return saved; } };
}
test('checkout calcula catálogo, ignora snapshots adulterados e escreve apenas pelo RPC protegido', async () => {
    const f = fixture(); const v = input(); v.items[0].unit_price = 0.01; v.items[0].item_total = 0.01; v.items[0].product_name = 'Adulterado'; v.discount_value = 999;
    const result = await submitCheckout(f.db,v); assert.equal(result.success,true);
    const submit = f.calls.find(c => c.rpc === 'rmenu_submit_order');
    assert.equal(submit.args.p_payload.items[0].unit_price,14);
    assert.equal(submit.args.p_payload.items[0].product_name,'Produto real');
    assert.equal(submit.args.p_catalog_state,f.state);
    assert.equal(submit.args.p_request_hash,createHash('sha256').update(intentContent(normalizeCheckoutIntent(v))).digest('hex'));
    assert.match(result.message,/Produto real/); assert.doesNotMatch(result.message,/Adulterado/);
    assert.equal(f.commits,1);
});
test('opção que não pertence ao produto é rejeitada antes de submeter', async () => {
    const f = fixture(); const v = input(); v.items[0].selected_options = [{ group_id: randomUUID(), option_id: randomUUID() }];
    assert.equal((await submitCheckout(f.db,v)).success,false);
    assert.equal(f.calls.some(c => c.rpc === 'rmenu_submit_order'),false);
});
test('produto de outra loja não pode ser precificado no checkout', async () => {
    const f = fixture(); f.state.products[0].store_id = randomUUID();
    assert.equal((await submitCheckout(f.db,input())).success,false); assert.equal(f.commits,0);
});
test('replay preserva pedido e dispensa leitura do catálogo atual', async () => {
    const f = fixture(); const v = input(); const first = await submitCheckout(f.db,v);
    f.state.products[0].is_available = false; f.calls.length = 0;
    const second = await submitCheckout(f.db,v);
    assert.equal(second.success,true); assert.equal(second.order_id,first.order_id); assert.equal(second.replayed,true);
    assert.equal(f.calls.some(c => c.rpc === 'rmenu_order_catalog_state'),false); assert.equal(f.commits,1);
});
test('falha ao ler comprovante após commit é recuperada pela mesma tentativa sem duplicar', async () => {
    const f = fixture({ readFailure: true }); const v = input();
    const failed = await submitCheckout(f.db,v); assert.equal(failed.success,false); assert.match(failed.error,/comprovante/);
    const recovered = await submitCheckout(f.db,v); assert.equal(recovered.success,true); assert.equal(recovered.replayed,true); assert.equal(f.commits,1);
});
test('mesma chave com alteração dos dados não retorna comprovante de outra intenção', async () => {
    const f = fixture(); const v = input(); await submitCheckout(f.db,v);
    const changed = await submitCheckout(f.db,{ ...v, customer_name: 'Outro cliente' });
    assert.equal(changed.success,false); assert.match(changed.error,/outro conteúdo/); assert.equal('message' in changed,false); assert.equal(f.commits,1);
});
test('função ausente ou falha de submissão interrompe sem fallback de escrita', async () => {
    for (const settings of [{ quoteError: true }, { submitError: { code: 'PGRST202', message: 'detalhe privado' } }]) {
        const f = fixture(settings); const r = await submitCheckout(f.db,input());
        assert.equal(r.success,false); assert.doesNotMatch(r.error,/detalhe privado/); assert.equal(f.commits,0);
    }
});
test('erro inesperado de conexão não expõe detalhes internos', async () => {
    const f = fixture({ throwNetwork: true }); const r = await submitCheckout(f.db,input());
    assert.equal(r.success,false); assert.doesNotMatch(r.error,/segredo-interno/);
});
test('comprovante com hash alterado ou itens incompletos não vira sucesso', async () => {
    for(const mutateReceipt of [r => { r.request_hash = 'a'.repeat(64); }, r => { r.expected_item_count = 2; }]) {
        const f = fixture({ mutateReceipt }); assert.equal((await submitCheckout(f.db,input())).success,false);
    }
});
test('mensagem usa complemento, bairro, valores e desconto registrados', async () => {
    const f = fixture({ mutateReceipt(r) { r.delivery_zone_name = 'Bairro salvo'; r.address_complement = 'Apto salvo';
        r.discount_value = 2; r.coupon_code = 'TESTE'; r.delivery_fee = 5; r.total = 17; r.customer_name = 'Nome registrado'; } });
    const r = await submitCheckout(f.db,input({ delivery_type: 'delivery', delivery_zone_id: randomUUID(), delivery_address: 'Rua A, 10', address_complement: 'Apto digitado' }));
    assert.equal(r.success,true); for(const text of ['Bairro salvo','Apto salvo','Nome registrado','Desconto (TESTE)','17,00']) assert.ok(r.message.includes(text));
    assert.doesNotMatch(r.message,/Apto digitado/);
});
test('dados inválidos não acessam o banco', async () => {
    const f = fixture(); assert.equal((await submitCheckout(f.db,input({ idempotency_key: 'invalido' }))).success,false); assert.equal(f.calls.length,0);
});
