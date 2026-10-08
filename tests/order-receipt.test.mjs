import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
const fixture = JSON.parse(fs.readFileSync(new URL('../printing/fixtures/receipt-test-v1.json', import.meta.url), 'utf8'));
import { test } from 'node:test';
import receipt from '../src/lib/order-receipt.ts';

export function fictitiousDocument() {
    return structuredClone(fixture);
}

for (const columns of [32,42]) test(`recibo fictício completo respeita ${columns} colunas e preserva acentos/valores`,()=> {
    const text=receipt.renderOrderReceipt(fictitiousDocument(),columns,true);
    assert.ok(text.split('\n').every(line=>Array.from(line).length<=columns));
    for (const field of ['TESTE FICTÍCIO','NÃO FISCAL','CLIENTE FICTÍCIO','Complemento:','portão azul','São José','Obs. item:','FICTICIO','R$ 32,00','Troco para','R$ 50,00','não confirma pagamento','07/10/2026']) assert.ok(text.replace(/\n/g,' ').includes(field),field);
});
test('snapshot não usa preços ou nomes atuais do catálogo; controles/injeção são removidos',()=> {
    const document=fictitiousDocument();
    document.snapshot.items[0].product_name='A'.repeat(100)+'\x1b\x00\r\nB';
    document.snapshot.order.customer_name='José\u202eCLIENTE';
    const text=receipt.renderOrderReceipt(document,32);
    assert.ok(text.split('\n').every(line=>Array.from(line).length<=32));
    assert.ok(!/[\x00\x1b\r\u202e]/u.test(text));
    assert.ok(text.includes('José CLIENTE'));
});
test('documento rejeita dados incompletos, outra loja, versões desconhecidas, valores e IDs duplicados',()=> {
    for (const edit of [d=>d.snapshot.items.pop(),d=>d.store_id=randomUUID(),d=>d.document_version=2,
        d=>d.snapshot.order.total=999,d=>d.snapshot.items[0].unit_price=Infinity,d=>d.snapshot.items[0].unit_price=0.001,
        d=>d.snapshot.items[0].order_id=randomUUID(),d=>d.snapshot.order.delivery_address=null,
        d=>{d.snapshot.items.push(structuredClone(d.snapshot.items[0]));d.snapshot.order.expected_item_count=2;}]) {
        const document=fictitiousDocument();edit(document);assert.throws(()=>receipt.renderOrderReceipt(document));
    }
});
test('meio a meio exige dois sabores e imprime opções de cada metade',()=> {
    const document=fictitiousDocument();
    document.snapshot.items[0].is_half_half=true;
    assert.throws(()=>receipt.renderOrderReceipt(document));
    document.snapshot.items[0].half_half_items=[{product_name:'Calabresa',selected_options:[{group:'Borda',option:'Catupiry',price:0}]},{product_name:'Muçarela',selected_options:[]}];
    const text=receipt.renderOrderReceipt(document);
    assert.ok(text.includes('1/2 Calabresa'));assert.ok(text.includes('1/2 Muçarela'));assert.ok(text.includes('Borda: Catupiry'));
});
