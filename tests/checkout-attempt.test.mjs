import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import attempts from '../src/lib/checkout-attempt.ts';
import checkout from '../src/lib/checkout-intent.ts';
import confirmation from '../src/stores/orderConfirmationStore.ts';
import hours from '../src/lib/checkStoreOpen.ts';
import { createStore } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';
const { cartItemsToIntent, prepareCheckoutAttempt, readCheckoutAttempt, writeCheckoutAttempt, recoverCheckoutIntent, sameCartIntent, remainingCartAfterCommit } = attempts;
const { normalizeCheckoutIntent } = checkout;
const { useOrderConfirmationStore } = confirmation;
function line() { return { id: randomUUID(), product: { id: randomUUID(), store_id: randomUUID(), name: 'Produto', option_groups: [] }, quantity: 1, item_total: 14, selected_options: [] }; }
function input(item, overrides = {}) {
    return { store_id: item.product.store_id, idempotency_key: randomUUID(), customer_name: 'Cliente Teste', customer_phone: '11999999999',
        delivery_type: 'pickup', payment_method: 'pix', total: 14, items: cartItemsToIntent([item]), ...overrides };
}
test('mesma intenção sempre produz mesma chave, inclusive sem registro no storage', async () => {
    const i = line(); const v = input(i); const a = await prepareCheckoutAttempt(v);
    const b = await prepareCheckoutAttempt({ ...v,idempotency_key: randomUUID() });
    assert.equal(a.idempotency_key,b.idempotency_key);
    assert.equal(readCheckoutAttempt(a.store_id).intent.idempotency_key,a.idempotency_key);
    assert.notEqual((await prepareCheckoutAttempt({ ...v,customer_name: 'Cliente diferente' })).idempotency_key,a.idempotency_key);
});
test('novo carrinho idêntico comercialmente recebe outra chave devido à nova linha', async () => {
    const i = line(); const a = await prepareCheckoutAttempt(input(i)); const b = await prepareCheckoutAttempt(input({ ...i,id: randomUUID() }));
    assert.notEqual(a.idempotency_key,b.idempotency_key);
});
test('timeout preserva total original da mesma intenção; alteração de dados não recupera outro pedido', () => {
    const i = line(); const previous = normalizeCheckoutIntent(input(i,{ coupon_code: 'TESTE',total: 12 }));
    assert.equal(recoverCheckoutIntent(input(i,{ coupon_code: 'TESTE',total: 14 }),previous),previous);
    assert.notEqual(recoverCheckoutIntent(input(i,{ coupon_code: 'TESTE',total: 14,customer_name: 'Outra pessoa' }),previous),previous);
    assert.equal(sameCartIntent(cartItemsToIntent([i]),previous),true);
    writeCheckoutAttempt(previous,true); assert.equal(readCheckoutAttempt(previous.store_id).completed,true);
});
test('limpeza após salvar conserva itens adicionados ou alterados durante a requisição', () => {
    const i = line(); const next = line(); const intent = normalizeCheckoutIntent(input(i));
    assert.deepEqual(remainingCartAfterCommit([i,next],intent),[next]);
    const changed = { ...i,quantity: 2,item_total: 28 };
    assert.deepEqual(remainingCartAfterCommit([changed,next],intent),[changed,next]);
});
test('carrinho legado resolve apenas nomes únicos; meio a meio precisa de IDs', () => {
    const i = line(); const g = { id: randomUUID(),title: 'Extras',options: [{ id: randomUUID(),name: 'Queijo' }] };
    i.product.option_groups = [g]; i.selected_options = [{ group_name: 'Extras',option_name: 'Queijo',price: 2 }];
    assert.deepEqual(cartItemsToIntent([i])[0].selected_options,[{ group_id: g.id,option_id: g.options[0].id }]);
    i.product.option_groups.push({ ...g,id: randomUUID() }); assert.throws(() => cartItemsToIntent([i]),/Edite/);
    i.selected_options = []; i.half_half = { enabled: true,first_half: 'A',second_half: 'B' }; assert.throws(() => cartItemsToIntent([i]),/sabores/);
});
test('aviso mantém comprovante, pedido e chave após reidratação sem depender do popup', async () => {
    const receipt = { paymentMethod: 'pix',whatsappNumber: '11999990000',message: 'Pedido registrado',orderId: randomUUID(),idempotencyKey: randomUUID() };
    useOrderConfirmationStore.getState().setPending(receipt);
    const fresh = createStore(persist(() => ({ isPending: false }),useOrderConfirmationStore.persist.getOptions()));
    assert.equal(fresh.getState().isPending,false);
    await fresh.persist.rehydrate();
    assert.equal(fresh.getState().isPending,true);
    assert.equal(fresh.getState().orderId,receipt.orderId);
    assert.equal(fresh.getState().idempotencyKey,receipt.idempotencyKey);
    assert.equal(fresh.getState().message,receipt.message);
    useOrderConfirmationStore.getState().dismiss(); assert.equal(useOrderConfirmationStore.getState().isPending,false);
});
test('horário compartilhado fecha no limite e usa São Paulo', () => {
    const bh = [{day_of_week:1,is_open:true,periods:[{open_time:'08:00:00',close_time:'18:00:00'}]}];
    assert.equal(hours.isStoreOpenNow(true,false,bh,new Date('2026-10-05T11:00:00Z')),true);
    assert.equal(hours.isStoreOpenNow(true,true,bh,new Date('2026-10-05T21:00:00Z')),false);
    bh[0].periods = [{open_time:'22:00:00',close_time:'02:00:00'}];
    assert.equal(hours.isStoreOpenNow(true,false,bh,new Date('2026-10-06T04:00:00Z')),true);
    assert.equal(hours.isStoreOpenNow(false,true,[],new Date()),true);
});
