import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import activation from '../src/lib/print-activation.ts';

const { isPrintActivationReadyForStore } = activation;
const require = createRequire(import.meta.url);
const pilot = '099cb335-23df-4aca-b13e-3fee1e31fde9';
const other = '3e7ff658-c39c-4b84-9db8-4c745a0ec510';
const enabled = {
    RMENU_PRINT_AGENT_ENABLED: '1', RMENU_PRINT_ACTIVATION_READY: '1',
    RMENU_PRINT_ACTIVATION_STORE_IDS: pilot,
};

test('rollout authorizes only listed authenticated store IDs', () => {
    assert.equal(isPrintActivationReadyForStore(pilot, enabled), true);
    assert.equal(isPrintActivationReadyForStore(other, enabled), false);
    assert.equal(isPrintActivationReadyForStore(null, enabled), false);
    assert.equal(isPrintActivationReadyForStore('teste1', enabled), false);
    assert.equal(isPrintActivationReadyForStore(other, { ...enabled, RMENU_PRINT_ACTIVATION_STORE_IDS: ` ${pilot}, ${other} ` }), true);
});

test('missing, malformed or wildcard lists cannot release all stores', () => {
    for (const list of [undefined, '', ' ', '*', `${pilot},`, `${pilot},invalid`]) {
        assert.equal(isPrintActivationReadyForStore(pilot, { ...enabled, RMENU_PRINT_ACTIVATION_STORE_IDS: list }), false);
    }
    for (const flag of ['RMENU_PRINT_AGENT_ENABLED', 'RMENU_PRINT_ACTIVATION_READY']) {
        assert.equal(isPrintActivationReadyForStore(pilot, { ...enabled, [flag]: '0' }), false);
    }
});

function actionsFor(owner, environment = enabled) {
    const calls = [];
    const source = fs.readFileSync(new URL('../src/actions/admin/printing.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const actionModule = { exports: {} };
    const client = {
        auth: { getUser: async () => ({ data: { user: owner ? { id: owner } : null }, error: null }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: owner ? { id: owner } : null }) }) }) }),
    };
    const admin = { rpc: (name, parameters) => {
        calls.push({ name, parameters });
        return { abortSignal: async () => ({ data: name === 'rmenu_print_request_reprint' ? other : true, error: null }) };
    } };
    vm.runInNewContext(compiled, {
        module: actionModule, exports: actionModule.exports, AbortSignal, process: { env: environment },
        require: name => {
            if (name === '@/lib/supabase/server') return { createClient: async () => client };
            if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin };
            if (name === '@/lib/print-device-service') return { registerPrintDevice: async () => ({ ok: false }) };
            if (name === '@/lib/print-activation') return { isPrintActivationReadyForStore: id => isPrintActivationReadyForStore(id, environment) };
            return require(name);
        },
    });
    return { actions: actionModule.exports, calls };
}

test('server rejects activation by an unlisted owner before any write RPC', async () => {
    const { actions, calls } = actionsFor(other);
    const result = await actions.setPrintEnabled({ store_id: other, enabled: true, calibration_confirmed: true });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
});

test('server rejects forged pilot identity and unauthenticated activation', async () => {
    for (const owner of [other, null]) {
        const { actions, calls } = actionsFor(owner);
        assert.equal((await actions.setPrintEnabled({ store_id: pilot, enabled: true, calibration_confirmed: true })).ok, false);
        assert.equal(calls.length, 0);
    }
});

test('pilot activation requires calibration and writes only its authenticated store', async () => {
    const { actions, calls } = actionsFor(pilot);
    assert.equal((await actions.setPrintEnabled({ store_id: pilot, enabled: true, calibration_confirmed: false })).ok, false);
    assert.equal(calls.length, 0);
    assert.equal((await actions.setPrintEnabled({ store_id: pilot, enabled: true, calibration_confirmed: true })).ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'rmenu_print_set_enabled');
    assert.equal(calls[0].parameters.p_store, pilot);
    assert.equal(calls[0].parameters.p_actor, pilot);
});

test('an owner can disable its printing even when rollout is blocked', async () => {
    const { actions, calls } = actionsFor(other, {});
    assert.equal((await actions.setPrintEnabled({ store_id: other, enabled: false, calibration_confirmed: false })).ok, true);
    assert.equal(calls[0].parameters.p_enabled, false);
    assert.equal(calls[0].parameters.p_store, other);
});

test('reprint uses the same authenticated store barrier as activation', async () => {
    for (const owner of [other, null]) {
        const { actions, calls } = actionsFor(owner);
        assert.equal((await actions.requestOrderReprint({ store_id: owner ?? pilot, order_id: other, request_key: pilot, reason: 'Teste fictício' })).ok, false);
        assert.equal(calls.length, 0);
    }
    const { actions, calls } = actionsFor(pilot);
    assert.equal((await actions.requestOrderReprint({ store_id: pilot, order_id: other, request_key: pilot, reason: 'Teste fictício' })).ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].parameters.p_store, pilot);
});
