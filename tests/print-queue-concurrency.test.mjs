import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { before, after, beforeEach, test } from 'node:test';
import { createOrderDatabase, readSql } from './order-database-fixture.mjs';
import { startNativePostgres, assertBlockedBy } from './native-postgres-fixture.mjs';

// SQL/migrações reais, duas sessões simultâneas e locks observados no servidor.
// Sem .env, Supabase, API externa, spooler ou impressora.
let cluster, fixture, a, b, deviceA, deviceB;
let hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const results = [];
const queryRow = async (client, sql, params = []) => (await client.query(sql, params)).rows[0];
const rpc = async (client, name, args) => (await queryRow(client,
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`, args)).result;
const enable = value => rpc(cluster.admin, 'rmenu_print_set_enabled', [fixture.storeA, fixture.storeA, value]);
const claim = (client, device = deviceA, hash = hashA) => rpc(client, 'rmenu_print_claim', [device, hash]);
const dispatch = (client, lease) => rpc(client, 'rmenu_print_begin_dispatch', [deviceA, hashA, lease.job.id, lease.job.lease_token]);
const finish = (client, lease) => rpc(client, 'rmenu_print_finish', [deviceA, hashA, lease.job.id, lease.job.lease_token, 'spooler_submitted']);
const getJob = order => queryRow(cluster.admin, "select * from public.print_jobs where order_id=$1 and purpose='initial'", [order.order_id]);
const atomic = async (client, value = fixture.payload()) => rpc(client, 'rmenu_create_order_atomic',
    [JSON.stringify(value), createHash('sha256').update(JSON.stringify(value)).digest('hex')]);

function check(name, fn) {
    test(name, { timeout: 20000 }, async () => {
        const result = { name, passed: false };
        results.push(result);
        await fn();
        result.passed = true;
    });
}

// A mantém a transação aberta enquanto B tenta a mesma operação concorrente.
// Não confunde Promise.all com concorrência comprovada: exige bloqueio real de B por A.
async function overlap(first, second) {
    let pending;
    await a.query('begin');
    try {
        const firstResult = await first(a);
        pending = second(b).then(value => ({ value }), error => ({ error }));
        await assertBlockedBy(cluster.admin, b, a);
        await a.query('commit');
        const outcome = await pending;
        if (outcome.error) throw outcome.error;
        return [firstResult, outcome.value];
    } finally {
        await a.query('rollback');
        if (pending) await pending;
    }
}

async function prepare() {
    await enable(true);
    const order = await fixture.call();
    const lease = await claim(a);
    assert.equal(lease.job.order_id, order.order_id);
    return { order, lease };
}

before(async () => {
    cluster = await startNativePostgres();
    fixture = await createOrderDatabase(cluster.db);
    await cluster.db.exec(readSql('../database/migrations/2026100802_persistent_print_queue.sql'));
    deviceA = await rpc(cluster.admin, 'rmenu_print_register_device', [fixture.storeA, fixture.storeA, 'PC fictício A', 'Fila fictícia 80', 80, hashA]);
    deviceB = await rpc(cluster.admin, 'rmenu_print_register_device', [fixture.storeA, fixture.storeA, 'PC fictício B', 'Fila fictícia 58', 58, hashB]);
    a = await cluster.connect('service_role');
    b = await cluster.connect('service_role');
});
beforeEach(async () => { await enable(false); });
after(async () => {
    if (!cluster) return;
    await cluster.stop();
    const report = { server_version: cluster.version, host: '127.0.0.1',
        independent_connections: 2, overlapping_sessions_verified_by: 'pg_blocking_pids',
        all_passed: results.length === 14 && results.every(x => x.passed), checks: results,
        server_stopped: true, production_database_accessed: false, physical_printing_performed: false };
    const reportPath = path.join(cluster.runDir, 'verification.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log('Evidência de concorrência: ' + reportPath);
});

check('sessões são processos PostgreSQL independentes, com papel service_role e loopback', async () => {
    const identities = await Promise.all([a, b].map(client => queryRow(client,
        "select pg_backend_pid() as pid,current_user as role,host(inet_server_addr()) as host")));
    assert.notEqual(identities[0].pid, identities[1].pid);
    assert.notEqual(identities[0].pid, cluster.admin.processID);
    for (const identity of identities) {
        assert.equal(identity.role, 'service_role');
        assert.equal(identity.host, '127.0.0.1');
    }
});

check('dois PCs disputam um único job; somente um recebe a reserva', async () => {
    await enable(true);
    assert.equal(await getJob(fixture.existing), undefined, 'Não deve enfileirar histórico.');
    const order = await fixture.call();
    const [first, second] = await overlap(client => claim(client), client => claim(client, deviceB, hashB));
    assert.equal(first.job.order_id, order.order_id);
    assert.equal(second.job, null);
    const job = await getJob(order);
    assert.equal(job.device_id, deviceA);
    assert.equal(job.state, 'leased');
    assert.equal(job.attempts, 1);
});

check('duas reservas concorrentes de dois jobs recebem pedidos diferentes', async () => {
    await enable(true);
    const one = await fixture.call(), two = await fixture.call();
    const [first, second] = await overlap(client => claim(client), client => claim(client, deviceB, hashB));
    assert.notEqual(first.job.id, second.job.id);
    assert.deepEqual(new Set([first.job.order_id, second.job.order_id]), new Set([one.order_id, two.order_id]));
    assert.equal(first.device.paper_width_mm, 80);
    assert.equal(second.device.paper_width_mm, 58);
});

check('checkout concorrente com a mesma chave cria um pedido, documento e job', async () => {
    await enable(true);
    const value = fixture.payload();
    const [first, second] = await overlap(async client => {
        const order = await atomic(client, value);
        assert.equal(await getJob(order), undefined, 'Job não aparece antes do commit.');
        const document = await queryRow(cluster.admin, 'select count(*)::int as n from order_documents where order_id=$1', [order.order_id]);
        assert.equal(document.n, 0);
        return order;
    }, client => atomic(client, value));
    assert.equal(first.order_id, second.order_id);
    for (const table of ['orders', 'order_documents']) {
        const column = table === 'orders' ? 'id' : 'order_id';
        assert.equal((await queryRow(cluster.admin, `select count(*)::int as n from ${table} where ${column}=$1`, [first.order_id])).n, 1);
    }
    assert.equal((await queryRow(cluster.admin, 'select count(*)::int as n from print_jobs where order_id=$1', [first.order_id])).n, 1);
});

check('checkouts distintos concorrentes mantêm números únicos e consecutivos', async () => {
    await enable(true);
    const [first, second] = await overlap(client => atomic(client), client => atomic(client));
    assert.notEqual(first.order_id, second.order_id);
    const numbers = (await cluster.admin.query('select order_number from orders where id=any($1::uuid[]) order by order_number', [[first.order_id, second.order_id]])).rows;
    assert.equal(numbers.length, 2);
    assert.equal(numbers[1].order_number, numbers[0].order_number + 1);
    assert.ok(await getJob(first));
    assert.ok(await getJob(second));
});

check('autorizações de dispatch simultâneas autorizam somente uma chamada', async () => {
    const { order, lease } = await prepare();
    const outcomes = await overlap(client => dispatch(client, lease), client => dispatch(client, lease));
    assert.deepEqual(outcomes, [true, false]);
    assert.equal((await getJob(order)).state, 'dispatching');
    assert.equal((await getJob(order)).attempts, 1);
});

check('recuperação da reserva vencida remove autoridade do token antigo concorrente', async () => {
    const { order, lease } = await prepare();
    await cluster.admin.query("update print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [lease.job.id]);
    const [recovered, oldAuthorization] = await overlap(client => claim(client, deviceB, hashB), client => dispatch(client, lease));
    assert.equal(recovered.job.id, lease.job.id);
    assert.notEqual(recovered.job.lease_token, lease.job.lease_token);
    assert.equal(oldAuthorization, false);
    assert.equal((await getJob(order)).attempts, 2);
    assert.equal(await rpc(b, 'rmenu_print_renew', [deviceA, hashA, lease.job.id, lease.job.lease_token]), false);
});

check('queda depois do dispatch vira incerto e nenhum dos PCs recupera para reenviar', async () => {
    const { order, lease } = await prepare();
    assert.equal(await dispatch(a, lease), true);
    await cluster.admin.query("update print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [lease.job.id]);
    const outcomes = await overlap(client => claim(client), client => claim(client, deviceB, hashB));
    assert.ok(outcomes.every(x => x.job === null));
    const job = await getJob(order);
    assert.equal(job.state, 'uncertain');
    assert.equal(job.attempts, 1);
    assert.equal(await dispatch(b, lease), false);
});

check('ACKs concorrentes são idempotentes; perda de resposta não cria outro job', async () => {
    const { order, lease } = await prepare();
    await dispatch(a, lease);
    assert.deepEqual(await overlap(client => finish(client, lease), client => finish(client, lease)), [true, true]);
    assert.equal((await getJob(order)).state, 'spooler_submitted');
    assert.equal((await claim(b, deviceB, hashB)).job, null);
    assert.equal((await queryRow(cluster.admin, 'select count(*)::int as n from print_jobs where order_id=$1', [order.order_id])).n, 1);
});

const cancelAsOwner = async (client, order) => {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [fixture.storeA]);
    assert.equal((await client.query("update orders set status='cancelled' where id=$1 returning id", [order.order_id])).rowCount, 1);
    return true;
};

check('cancelamento do dono ganha a disputa e bloqueia a autorização pendente', async () => {
    const { order, lease } = await prepare();
    assert.deepEqual(await overlap(client => cancelAsOwner(client, order), client => dispatch(client, lease)), [true, false]);
    assert.equal((await getJob(order)).state, 'cancelled');
});

check('cancelamento após autorização concorrente registra incerto e não libera retry', async () => {
    const { order, lease } = await prepare();
    await overlap(client => dispatch(client, lease), async client => {
        await client.query('begin');
        try { await cancelAsOwner(client, order); await client.query('commit'); return true; }
        finally { await client.query('rollback'); }
    });
    assert.equal((await getJob(order)).state, 'uncertain');
    assert.equal((await claim(b, deviceB, hashB)).job, null);
    assert.equal(await dispatch(a, lease), false);
});

check('desativação concorrente antes da autorização cancela o job', async () => {
    const { order, lease } = await prepare();
    const outcomes = await overlap(client => rpc(client, 'rmenu_print_set_enabled', [fixture.storeA, fixture.storeA, false]), client => dispatch(client, lease));
    assert.equal(outcomes[1], false);
    assert.equal((await getJob(order)).state, 'cancelled');
});

check('revogação concorrente impede dispatch com a credencial revogada', async () => {
    const { order, lease } = await prepare();
    const outcomes = await overlap(client => rpc(client, 'rmenu_print_revoke_device', [fixture.storeA, fixture.storeA, deviceA]),
        client => dispatch(client, lease).catch(error => error.code));
    assert.equal(outcomes[1], '42501');
    assert.equal((await getJob(order)).state, 'pending');
    // Restaura capacidade de testes com novo dispositivo, nunca desrevoga credencial.
    hashA = 'd'.repeat(64);
    deviceA = await rpc(cluster.admin, 'rmenu_print_register_device', [fixture.storeA, fixture.storeA, 'PC fictício substituto', 'Fila fictícia 80', 80, hashA]);
});

check('reimpressões concorrentes com a mesma chave geram uma única via auditada', async () => {
    await enable(true);
    const order = await fixture.call(), key = randomUUID();
    const args = [fixture.storeA, fixture.storeA, order.order_id, key, 'Ensaio fictício de idempotência'];
    const [first, second] = await overlap(client => rpc(client, 'rmenu_print_request_reprint', args), client => rpc(client, 'rmenu_print_request_reprint', args));
    assert.equal(first, second);
    const rows = (await cluster.admin.query("select requested_by,reason from print_jobs where order_id=$1 and purpose='reprint'", [order.order_id])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].requested_by, fixture.storeA);
    assert.equal(rows[0].reason, args[4]);
});
