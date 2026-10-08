import { z } from 'zod';

const amount = z.number().finite().nonnegative().max(100_000_000)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Valor deve ter centavos inteiros');
const option = z.object({ group: z.string(), option: z.string(), price: amount, is_replacement: z.boolean().optional() });
const item = z.object({
    id: z.uuid(), order_id: z.uuid(), product_name: z.string().min(1), quantity: z.number().int().positive(),
    unit_price: amount, item_total: amount, selected_options: z.array(option), observations: z.string().nullable(),
    is_half_half: z.boolean(), half_half_items: z.array(z.object({ product_name: z.string().min(1), selected_options: z.array(option) })).nullable(),
});
const order = z.object({
    id: z.uuid(), store_id: z.uuid(), order_number: z.number().int().positive(), document_version: z.literal(1),
    expected_item_count: z.number().int().positive(), created_at: z.iso.datetime({ offset: true }),
    customer_name: z.string().min(1), customer_phone: z.string().min(1),
    delivery_type: z.enum(['delivery', 'pickup', 'table']), table_number: z.number().int().positive().nullable(),
    delivery_zone_name: z.string().nullable(), delivery_address: z.string().nullable(), address_complement: z.string().nullable(),
    payment_method: z.enum(['pix', 'card', 'cash']), change_for: amount.nullable(),
    subtotal: amount, delivery_fee: amount, discount_value: amount.nullable(), coupon_code: z.string().nullable(), total: amount,
    notes: z.string().nullable(),
});
const documentSchema = z.object({
    order_id: z.uuid(), store_id: z.uuid(), document_version: z.literal(1), schema_version: z.literal(1),
    sealed_at: z.iso.datetime({ offset: true }),
    snapshot: z.object({ schema_version: z.literal(1), document_version: z.literal(1), store_name: z.string().nullable(), order, items: z.array(item).min(1) }),
});

export type OrderReceiptDocument = z.infer<typeof documentSchema>;
const cents = (value: number) => Math.round(value * 100);

/** Consome exclusivamente order_documents: não completa a comanda com catálogo ou estado atual. */
export function parseOrderReceiptDocument(input: unknown): OrderReceiptDocument {
    const document = documentSchema.parse(input);
    const { order, items } = document.snapshot;
    if (document.order_id !== order.id || document.store_id !== order.store_id || items.some(item => item.order_id !== order.id)
        || new Set(items.map(item => item.id)).size !== items.length || items.length !== order.expected_item_count) {
        throw new Error('Documento não corresponde ao pedido completo');
    }
    if (items.some(item => cents(item.item_total) !== cents(item.unit_price) * item.quantity)
        || items.reduce((sum, item) => sum + cents(item.item_total), 0) !== cents(order.subtotal)
        || cents(order.subtotal) + cents(order.delivery_fee) - cents(order.discount_value ?? 0) !== cents(order.total)) {
        throw new Error('Valores do documento divergem');
    }
    if (order.delivery_type === 'delivery' && !order.delivery_address?.trim()
        || order.delivery_type === 'table' && !order.table_number
        || items.some(item => item.is_half_half && item.half_half_items?.length !== 2)) {
        throw new Error('Documento sem dados obrigatórios');
    }
    return document;
}

function plainText(value: string): string {
    // Não permitir ESC, controles do spooler, bidi invisível ou quebras injetadas nos campos.
    return value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function wrap(value: string, columns: number): string[] {
    const result: string[] = [];
    let current = '';
    for (const word of plainText(value).split(' ')) {
        if (!word) continue;
        const characters = Array.from(word);
        if (characters.length > columns) {
            if (current) { result.push(current); current = ''; }
            while (characters.length > columns) result.push(characters.splice(0, columns).join(''));
            current = characters.join('');
        } else if (Array.from(current).length + (current ? 1 : 0) + characters.length <= columns) {
            current += (current ? ' ' : '') + word;
        } else {
            result.push(current); current = word;
        }
    }
    if (current) result.push(current);
    return result;
}

/** Layout textual para o agente Windows. Não envia nada à impressora. */
export function renderOrderReceipt(input: unknown, columns: 32 | 42 = 42, fictitiousTest = false): string {
    if (columns !== 32 && columns !== 42) throw new Error('Largura de texto inválida');
    const { snapshot } = parseOrderReceiptDocument(input);
    const { order, items } = snapshot;
    const lines: string[] = [];
    const text = (value: string) => lines.push(...wrap(value, columns));
    const rule = () => lines.push('-'.repeat(columns));
    const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
    const priced = (label: string, value: number) => {
        const price = currency(value);
        const width = columns - Array.from(price).length - 1;
        const labels = wrap(label, width);
        lines.push(...labels.slice(0, -1));
        const last = labels.at(-1) ?? '';
        lines.push(last + ' '.repeat(columns - Array.from(last).length - Array.from(price).length) + price);
    };
    if (fictitiousTest) { text('TESTE FICTÍCIO - SEM PEDIDO REAL'); rule(); }
    text(snapshot.store_name ?? 'RMenu Digital');
    text('COMANDA - NÃO FISCAL');
    text(`Pedido #${String(order.order_number).padStart(3, '0')} | Versão ${order.document_version}`);
    text(new Date(order.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
    rule(); text(`Cliente: ${order.customer_name}`); text(`Telefone: ${order.customer_phone}`);
    const delivery = { delivery: 'Entrega', pickup: 'Retirada', table: 'Mesa' }[order.delivery_type];
    text(order.table_number ? `${delivery}: ${order.table_number}` : delivery);
    if (order.delivery_address) text(`Endereço: ${order.delivery_address}`);
    if (order.address_complement) text(`Complemento: ${order.address_complement}`);
    if (order.delivery_zone_name) text(`Bairro / Região: ${order.delivery_zone_name}`);
    rule();
    for (const item of items) {
        priced(`${item.quantity}x ${item.product_name}`, item.item_total);
        priced('Valor unitário', item.unit_price);
        for (const selected of item.selected_options) text(`${selected.group}: ${selected.option}${selected.price > 0 ? ` (${currency(selected.price)})` : ''}`);
        if (item.is_half_half) {
            for (const half of item.half_half_items ?? []) {
                text(`1/2 ${half.product_name}`);
                for (const selected of half.selected_options) text(`  ${selected.group}: ${selected.option}`);
            }
        }
        if (item.observations) text(`Obs. item: ${item.observations}`);
        rule();
    }
    if (order.notes) { text(`Obs. pedido: ${order.notes}`); rule(); }
    priced('Subtotal', order.subtotal); priced('Frete', order.delivery_fee);
    priced(order.coupon_code ? `Desconto (${order.coupon_code})` : 'Desconto', -(order.discount_value ?? 0));
    priced('TOTAL', order.total); rule();
    text(`Forma informada: ${{ pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' }[order.payment_method]}`);
    if (order.change_for !== null) priced('Troco para', order.change_for);
    text('Forma informada não confirma pagamento.');
    return lines.join('\n') + '\n';
}
