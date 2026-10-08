import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

// Não aceita URL, .env ou servidor externo: inicia somente um cluster novo local.
const runtime = createRequire(new URL('./postgres-runtime/package.json', import.meta.url));
const { Client } = runtime('pg');
const execute = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const localRoot = fileURLToPath(new URL('../printing/.local/', import.meta.url));

export async function startNativePostgres() {
    assert.equal(process.platform, 'win32', 'Este runtime portátil é para Windows x64.');
    assert.equal(process.arch, 'x64');
    const binaryRoot = path.join(path.dirname(runtime.resolve('@embedded-postgres/windows-x64')), '..', 'native', 'bin');
    const initdb = path.join(binaryRoot, 'initdb.exe');
    const postgres = path.join(binaryRoot, 'postgres.exe');
    const pgCtl = path.join(binaryRoot, 'pg_ctl.exe');
    fs.mkdirSync(localRoot, { recursive: true });
    const runDir = fs.mkdtempSync(path.join(localRoot, 'postgres-concurrency-'));
    const dataDir = path.join(runDir, 'data');
    const logPath = path.join(runDir, 'postgres.log');
    await execute(initdb, ['-D', dataDir, '-U', 'rmenu_fixture', '--auth=trust', '--encoding=UTF8', '--locale=C'], { windowsHide: true, timeout: 30000 });
    const reservation = net.createServer();
    await new Promise((resolve, reject) => {
        reservation.once('error', reject);
        reservation.listen(0, '127.0.0.1', resolve);
    });
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const log = fs.openSync(logPath, 'wx');
    const server = spawn(postgres, ['-D', dataDir, '-h', '127.0.0.1', '-p', String(port), '-c', 'max_connections=12', '-c', 'timezone=UTC'], { windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    let launchError;
    server.once('error', error => { launchError = error; });
    const clients = new Set();
    const connect = async (role = null) => {
        const client = new Client({ host: '127.0.0.1', port, user: 'rmenu_fixture', database: 'postgres', connectionTimeoutMillis: 1000 });
        try {
            await client.connect();
            clients.add(client);
            await client.query("set statement_timeout='10s'; set lock_timeout='8s'");
            if (role) {
                assert.equal(role, 'service_role');
                await client.query('set role service_role');
            }
            return client;
        } catch (error) {
            clients.delete(client);
            await client.end().catch(() => {});
            throw error;
        }
    };
    const stop = async () => {
        for (const client of clients) await client.end().catch(() => {});
        clients.clear();
        if (server.exitCode === null && !launchError) {
            await execute(pgCtl, ['-D', dataDir, 'stop', '-m', 'fast', '-w', '-t', '10'], { windowsHide: true, timeout: 15000 });
        }
    };
    try {
        const deadline = Date.now() + 15000;
        let admin;
        while (!admin && Date.now() < deadline) {
            if (launchError || server.exitCode !== null) throw launchError ?? new Error(`PostgreSQL não iniciou. Diagnóstico: ${logPath}`);
            try { admin = await connect(); } catch { await delay(100); }
        }
        assert.ok(admin, `PostgreSQL não ficou pronto. Diagnóstico: ${logPath}`);
        const identity = (await admin.query("select version(),host(inet_server_addr()) as address,pg_backend_pid() as pid,current_database() as database")).rows[0];
        assert.equal(identity.address, '127.0.0.1');
        assert.equal(identity.database, 'postgres');
        return { admin, connect, stop, runDir, version: identity.version, port,
            db: { query: (sql, params) => admin.query(sql, params), exec: sql => admin.query(sql) } };
    } catch (error) {
        await stop();
        throw error;
    }
}

export async function assertBlockedBy(observer, waiting, blocker) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        const result = await observer.query('select pg_blocking_pids($1) as blockers', [waiting.processID]);
        if (result.rows[0].blockers.includes(blocker.processID)) return;
        await delay(20);
    }
    assert.fail('Não houve sobreposição comprovada entre as duas sessões PostgreSQL.');
}
