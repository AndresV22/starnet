'use strict';
/* Connector credential storage when the desktop shell has no OS-keychain key (2026-10-11 user report: Higgsfield
   "connector credentials locked" with no way out). Real sidecar, hermetic workspace:
   1. fresh install, no key  -> NOT locked: labelled unencrypted fallback, the shell's reason shown, saves work;
   2. next launch WITH a key -> the fallback store is sealed;
   3. key changed under it   -> locked with reason key-mismatch + canStartFresh; sign-in refused; START FRESH
      keeps the old files aside byte-for-byte, writes a new sealed store, and the lock is gone after restart;
   4. Settings' connector reset of a locked store also starts fresh instead of failing forever. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const { FORMAT } = require('../sidecar/connector-vault.js');

(async () => {
  const K1 = 'ab'.repeat(32), K2 = 'cd'.repeat(32);
  const REASON = 'the system credential store is locked or refused access (Platform secure storage failure: test)';
  const app = SidecarFixture.create({ env: { STARNET_DESKTOP_SHELL: '1', STARNET_CONNECTOR_KEY_ERROR: REASON }, timeoutMs: 30000 });
  const file = path.join(app.workspace, 'connectors/state.json');
  const storage = async () => (await app.json('GET', '/api/connectors')).body.credentialStorage;
  try {
    await app.start();
    let s = await storage();
    assert.equal(s.error, null, 'a fresh install without a key is not "locked"');
    assert.equal(s.fallback, true);
    assert.equal(s.encrypted, false, 'never claims encryption it does not have');
    assert.match(s.notice, /WITHOUT encryption/);
    assert.ok(s.notice.includes(REASON) && s.keyError === REASON, 'the shell reason reaches the panel');
    const saved = await app.json('POST', '/api/connectors', { id: 'audit-fixture', transport: 'http', url: 'http://127.0.0.1:1/mcp', enabled: false });
    assert.equal(saved.status, 200, 'saving a connector works in fallback: ' + JSON.stringify(saved.body));
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).configs.some(c => c.id === 'audit-fixture'), 'fallback store is plaintext and holds the save');
    await app.stop();

    await app.start({ STARNET_CONNECTOR_ENCRYPTION_KEY: K1, STARNET_CONNECTOR_KEY_ERROR: '' });
    s = await storage();
    assert.equal(s.encrypted, true);
    assert.equal(s.fallback, false);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).format, FORMAT, 'the first keyed launch seals the fallback store');
    assert.ok((await app.json('GET', '/api/connectors')).body.connectors.some(c => c.id === 'audit-fixture'), 'and keeps the connector');
    await app.stop();

    await app.start({ STARNET_CONNECTOR_ENCRYPTION_KEY: K2, STARNET_CONNECTOR_KEY_ERROR: '' });
    s = await storage();
    assert.match(s.error, /locked/);
    assert.equal(s.reason, 'key-mismatch');
    assert.equal(s.canStartFresh, true);
    assert.match(s.error, /START FRESH/, 'the message names the exit');
    const sealed = fs.readFileSync(file, 'utf8');
    const refused = await app.json('POST', '/api/connectors/oauth/start', { id: 'higgsfield' });
    assert.equal(refused.status, 503);
    assert.equal(refused.body.code, 'connector_storage_locked');
    assert.equal((await app.json('POST', '/api/connectors/storage/start-fresh', {})).status, 400, 'START FRESH needs explicit confirmation');
    const fresh = await app.json('POST', '/api/connectors/storage/start-fresh', { confirm: true });
    assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
    assert.ok(fresh.body.moved.includes('state.json'));
    assert.equal(fs.readFileSync(path.join(fresh.body.movedTo, 'state.json'), 'utf8'), sealed, 'the unreadable store is kept byte-for-byte');
    assert.equal(fresh.body.credentialStorage.error, null);
    assert.equal(fresh.body.credentialStorage.encrypted, true);
    assert.equal((await app.json('POST', '/api/connectors/storage/start-fresh', { confirm: true })).status, 409, 'nothing to start fresh from once unlocked');
    await app.stop();
    await app.start({ STARNET_CONNECTOR_ENCRYPTION_KEY: K2, STARNET_CONNECTOR_KEY_ERROR: '' });
    s = await storage();
    assert.equal(s.error, null, 'the new store opens after restart');
    assert.equal(s.encrypted, true);
    await app.stop();

    await app.start({ STARNET_CONNECTOR_ENCRYPTION_KEY: K1, STARNET_CONNECTOR_KEY_ERROR: '' });
    assert.equal((await storage()).reason, 'key-mismatch');
    const reset = await app.json('POST', '/api/config/reset', { section: 'connectors' });
    assert.equal(reset.status, 200, 'Settings reset of a locked store starts fresh: ' + JSON.stringify(reset.body));
    assert.equal((await storage()).error, null);
    console.log('connector-storage-start-fresh.http: PASS (fresh-install fallback + reason, seal on keyed launch, key-mismatch lock, confirmed START FRESH keeps old files, restart, Settings reset exit)');
  } finally { await app.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
