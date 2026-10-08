import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import * as zod from 'zod';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

// Executa o código real com banco simulado. Não lê .env nem usa rede.
const orderId = '33333333-3333-4333-8333-333333333333';
const attemptKey = '44444444-4444-4444-8444-444444444444';
const otherKey = '55555555-5555-4555-8555-555555555555';

function loadModule(relativePath, createAdminClient) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const targetModule = { exports: {} };
    vm.runInNewContext(compiled, {
        module: targetModule,
        exports: targetModule.exports,
        Response,
        require(name) {
            if (name === '@/lib/supabase/admin') return { createAdminClient };
            if (name === 'zod') return zod;
            throw new Error(`Import inesperado: ${name}`);
        },
    }, { filename: relativePath });
    return targetModule.exports;
}

function setup({ status = 'pending', handoff = 'pending_handoff', error = null, missing = false, throws = false } = {}) {
    const state = {
        id: orderId,
        idempotency_key: attemptKey,
        status,
        handoff_status: handoff,
    };
    let calls = 0;
    let writes = 0;
    const createAdminClient = () => {
        calls++;
        if (throws) throw new Error('Banco indisponível');
        return {
            from(table) {
                assert.equal(table, 'orders');
                const filters = [];
                let payload;
                const query = {
                    update(value) { payload = value; return query; },
                    eq(column, value) { filters.push(row => row[column] === value); return query; },
                    neq(column, value) { filters.push(row => row[column] !== value); return query; },
                    in(column, values) { filters.push(row => values.includes(row[column])); return query; },
                    select(columns) { assert.equal(columns, 'id'); return query; },
                    async maybeSingle() {
                        if (error) return { data: null, error };
                        if (missing || !filters.every(filter => filter(state))) return { data: null, error: null };
                        assert.deepEqual(JSON.parse(JSON.stringify(payload)), { handoff_status: 'whatsapp_opened' });
                        Object.assign(state, payload);
                        writes++;
                        return { data: { id: state.id }, error: null };
                    },
                };
                return query;
            },
        };
    };
    const { markOrderHandoff } = loadModule('src/actions/store/mark-order-handoff.ts', createAdminClient);
    return { markOrderHandoff, state, calls: () => calls, writes: () => writes };
}

function input(overrides = {}) {
    return { order_id: orderId, idempotency_key: attemptKey, status: 'whatsapp_opened', ...overrides };
}

test('rejeita confirmação pública antes de acessar o banco', async () => {
    const context = setup();
    assert.equal((await context.markOrderHandoff(input({ status: 'confirmed' }))).success, false);
    assert.equal(context.calls(), 0);
});

test('exige identificador válido e chave UUID da tentativa', async () => {
    const context = setup();
    for (const payload of [null, {}, input({ order_id: 'inválido' }), input({ idempotency_key: undefined }), input({ idempotency_key: 'curta' })]) {
        assert.equal((await context.markOrderHandoff(payload)).success, false);
    }
    assert.equal(context.calls(), 0);
});

test('registra abertura somente no pedido correspondente à tentativa', async () => {
    const context = setup();
    assert.equal((await context.markOrderHandoff(input())).success, true);
    assert.equal(context.state.handoff_status, 'whatsapp_opened');
    assert.equal(context.state.status, 'pending');
    assert.equal(context.writes(), 1);
});

test('outra chave não altera o pedido', async () => {
    const context = setup();
    assert.equal((await context.markOrderHandoff(input({ idempotency_key: otherKey }))).success, false);
    assert.equal(context.writes(), 0);
});

test('outro ID não altera o pedido', async () => {
    const context = setup();
    assert.equal((await context.markOrderHandoff(input({ order_id: otherKey }))).success, false);
    assert.equal(context.writes(), 0);
});

test('pedido inexistente não retorna sucesso', async () => {
    const context = setup({ missing: true });
    assert.equal((await context.markOrderHandoff(input())).success, false);
});

test('pedido cancelado não recebe sinal de abertura', async () => {
    const context = setup({ status: 'cancelled' });
    assert.equal((await context.markOrderHandoff(input())).success, false);
    assert.equal(context.writes(), 0);
});

test('abertura atrasada não sobrescreve confirmação existente', async () => {
    const context = setup({ handoff: 'confirmed' });
    assert.equal((await context.markOrderHandoff(input())).success, false);
    assert.equal(context.state.handoff_status, 'confirmed');
    assert.equal(context.writes(), 0);
});

test('repetir abertura preserva estado operacional', async () => {
    const context = setup({ handoff: 'whatsapp_opened', status: 'preparing' });
    assert.equal((await context.markOrderHandoff(input())).success, true);
    assert.equal(context.state.status, 'preparing');
});

test('erro retornado pelo Supabase não vira sucesso', async () => {
    const context = setup({ error: { message: 'Falha de escrita' } });
    assert.equal((await context.markOrderHandoff(input())).success, false);
    assert.equal(context.writes(), 0);
});

test('exceção na conexão não vira sucesso', async () => {
    const context = setup({ throws: true });
    assert.equal((await context.markOrderHandoff(input())).success, false);
});

for (const route of ['debug-user-v2', 'debug-otp']) {
    test(`${route}: retorna 404 sem acesso administrativo ou efeitos externos`, async () => {
        const { GET } = loadModule(`src/app/api/${route}/route.ts`, () => {
            assert.fail('Endpoint de diagnóstico acessou o banco');
        });
        const response = await GET(new Request(`http://localhost/api/${route}?email=teste@example.invalid`));
        assert.equal(response.status, 404);
        assert.equal(await response.text(), '');
        assert.equal(response.headers.get('cache-control'), 'no-store');
    });
}
