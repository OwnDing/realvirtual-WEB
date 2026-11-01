// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, resolveSecrets, ConfigError } from '../src/config.mjs';
import { SignalRegistry, parsePlcType, coerceValue, fromSourceValue } from '../src/signals.mjs';
import { evaluateWrite } from '../src/write-policy.mjs';
import { linePoint, escapeTag, fluxString, buildFluxQuery, seriesFromCsv, parseCsv } from '../src/history.mjs';
import { keyMatches } from '../src/realtime-server.mjs';

const base = () => ({
  schemaVersion: 1,
  audit: { path: '/tmp/audit.jsonl' },
  source: { kind: 'opcua', endpointUrl: 'opc.tcp://plc.local:4840' },
  signals: [
    { name: 'Start', nodeId: 'ns=2;s=Start', type: 'PLCInputBool', writable: true },
    { name: 'Speed', nodeId: 'ns=2;s=Speed', type: 'PLCOutputFloat' },
    { name: 'Recipe', nodeId: 'ns=2;i=7', type: 'PLCInputInt', writable: true, min: 0, max: 20, dataType: 'Int16' },
    { name: 'Mode', nodeId: 'ns=2;s=Mode', type: 'PLCInputInt' },
  ],
});

test('a valid config normalizes defaults and keeps writes opt-in', () => {
  const c = validateConfig(base());
  assert.equal(c.listen.host, '127.0.0.1');
  assert.equal(c.websocketPath, '/ws');
  assert.equal(c.readOnly, false);
  assert.equal(c.signals.find((s) => s.name === 'Mode').writable, false);
  assert.equal(c.signals.find((s) => s.name === 'Speed').dataType, 'Double');
  assert.equal(c.history.enabled, false);
});

test('config rejects unsafe or ambiguous settings', () => {
  const cases = [
    (c) => { c.signals[1].writable = true; },                        // PLCOutput must not be writable
    (c) => { c.signals.push({ ...c.signals[0] }); },                   // duplicate name
    (c) => { c.signals[0].type = 'PLCInputString'; },
    (c) => { c.signals[0].min = 0; },                                 // min on Bool
    (c) => { c.signals[2].min = 30; },                                // min > max
    (c) => { c.signals[2].dataType = 'Double'; },                     // wrong data type for Int
    (c) => { c.signals[2].dataType = 'Int64'; },                      // 64-bit writable
    (c) => { c.source.securityMode = 'Sign'; },                       // mode without policy
    (c) => { c.source.identity = { type: 'username', username: 'u', passwordEnv: 'PW' }; }, // password over None
    (c) => { c.source.kind = 'modbus'; },
    (c) => { c.readonly = true; },                                    // typo of a safety key
    (c) => { c.signals[0].nodeId = 'Start'; },
    (c) => { c.history = { enabled: true, url: 'http://influx', org: 'o', bucket: 'b' }; }, // no tokenEnv
    (c) => { delete c.audit; },
  ];
  for (const change of cases) {
    const c = base();
    change(c);
    assert.throws(() => validateConfig(c), ConfigError, String(change));
  }
});

test('secrets come only from named environment variables', () => {
  const c = validateConfig({ ...base(), apiKeyEnv: 'GW_KEY', history: { enabled: true, url: 'http://influx:8086', org: 'o', bucket: 'signals', tokenEnv: 'GW_INFLUX' } });
  assert.throws(() => resolveSecrets(c, {}), /GW_KEY/);
  assert.deepEqual(resolveSecrets(c, { GW_KEY: 'k', GW_INFLUX: 't' }), { apiKey: 'k', opcuaPassword: null, influxToken: 't' });
});

test('PLC types, coercion and source conversion are exact', () => {
  assert.deepEqual(parsePlcType('PLCOutputFloat'), { direction: 'output', valueType: 'float' });
  assert.equal(parsePlcType('PLCInOutBool'), null);
  assert.equal(coerceValue('bool', 1), true);
  assert.equal(coerceValue('bool', '1'), undefined);
  assert.equal(coerceValue('int', 1.5), undefined);
  assert.equal(coerceValue('float', Number.NaN), undefined);
  assert.equal(fromSourceValue('int', [0, 7]), 7);
  assert.equal(fromSourceValue('bool', 2), true);
  assert.equal(fromSourceValue('float', 'x'), undefined);
});

test('write policy accepts only writable PLCInput signals with valid values', () => {
  const registry = new SignalRegistry(validateConfig(base()).signals);
  const write = (name, value, readOnly = false) => evaluateWrite(registry, name, value, { readOnly });
  assert.deepEqual(write('Start', true).ok, true);
  assert.equal(write('Start', true, true).reason, 'read-only');
  assert.equal(write('Nope', 1).reason, 'unknown-signal');
  assert.equal(write('Speed', 5).reason, 'not-writable-direction');
  assert.equal(write('Mode', 1).reason, 'not-writable');
  assert.equal(write('Recipe', 1.5).reason, 'invalid-type');
  assert.equal(write('Recipe', 21).reason, 'out-of-range');
  assert.equal(write('Recipe', -1).reason, 'out-of-range');
  assert.equal(write('Recipe', 20).ok, true);
});

test('registry reports value and quality changes separately', () => {
  const registry = new SignalRegistry(validateConfig(base()).signals);
  const seen = [];
  registry.onChange((name, entry, info) => seen.push([name, entry.value, entry.quality, info.valueChanged]));
  registry.update('Speed', 0, 'good');            // first sample replaces the default
  registry.update('Speed', 0, 'good');            // no change
  registry.update('Speed', 2.5, 'good');
  registry.markAll('uncertain');
  assert.deepEqual(seen.slice(0, 2), [['Speed', 0, 'good', true], ['Speed', 2.5, 'good', true]]);
  assert.ok(seen.slice(2).every(([, , quality, changed]) => quality === 'uncertain' && changed === false));
});

test('line protocol and Flux text are escaped; CSV parsing tolerates annotations', () => {
  assert.equal(escapeTag('a b,c=d'), 'a\\ b\\,c\\=d');
  assert.equal(linePoint('Speed', 3, 1000), 'signal,name=Speed value=3.0 1000');
  assert.equal(linePoint('On', true, 1), 'signal,name=On value=1.0 1');
  assert.equal(linePoint('X', 1e21, 1), 'signal,name=X value=1e+21 1');
  assert.equal(linePoint('X', Number.NaN, 1), null);
  assert.equal(fluxString('a"b\\c'), '"a\\"b\\\\c"');
  const q = buildFluxQuery({ bucket: 'signals', names: ['A") |> drop(', 'B'], fromIso: '2026-01-01T00:00:00.000Z', toIso: '2026-01-02T00:00:00.000Z', everyMs: 60000 });
  assert.ok(q.includes('r.name == "A\\") |> drop("'));
  assert.ok(q.includes('aggregateWindow(every: 60000ms'));
  const csv = '#datatype,string,long,dateTime:RFC3339,double,string\n,result,table,_time,_value,name\n,_result,0,2026-01-01T00:00:01Z,1.5,A\n,_result,0,2026-01-01T00:00:00Z,1,A\r\n\r\n,result,table,_time,_value,name\n,_result,1,2026-01-01T00:00:00Z,7,"B"\n';
  assert.deepEqual(seriesFromCsv(csv, ['A', 'B']), [
    { signal: 'A', ts: [Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-01T00:00:01Z')], values: [1, 1.5] },
    { signal: 'B', ts: [Date.parse('2026-01-01T00:00:00Z')], values: [7] },
  ]);
  assert.deepEqual(parseCsv('a,"b,""c"""\n'), [['a', 'b,"c"']]);
});

test('API key comparison is exact', () => {
  assert.equal(keyMatches('secret', 'secret'), true);
  assert.equal(keyMatches('secre', 'secret'), false);
  assert.equal(keyMatches(undefined, 'secret'), false);
  assert.equal(keyMatches('x', null), false);
});

test('an unconfigured gateway (no source) is valid only without signals', () => {
  const idle = validateConfig({ schemaVersion: 1, audit: { path: '/tmp/a.jsonl' }, signals: [] });
  assert.equal(idle.source, null);
  assert.deepEqual(idle.signals, []);
  assert.throws(() => validateConfig({ ...base(), signals: [] }), ConfigError, 'a source without signals is a mistake');
  const noSource = base();
  delete noSource.source;
  assert.throws(() => validateConfig(noSource), ConfigError, 'signals without a source are a mistake');
});

test('the InfluxDB token may come from exactly one of tokenEnv or tokenFile', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'gw-secret-'));
  writeFileSync(join(dir, 'token'), 'from-file\n', { mode: 0o600 });
  const history = { enabled: true, url: 'http://influx:8086', org: 'o', bucket: 'signals' };
  const c = validateConfig({ ...base(), history: { ...history, tokenFile: join(dir, 'token') } });
  assert.equal(resolveSecrets(c, {}).influxToken, 'from-file');
  assert.throws(() => validateConfig({ ...base(), history: { ...history, tokenFile: join(dir, 'token'), tokenEnv: 'X' } }), ConfigError);
  assert.throws(() => validateConfig({ ...base(), history }), ConfigError);
  const missing = validateConfig({ ...base(), history: { ...history, tokenFile: join(dir, 'absent') } });
  assert.throws(() => resolveSecrets(missing, {}), ConfigError);
});
