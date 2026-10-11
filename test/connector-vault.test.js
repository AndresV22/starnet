'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { makeConnectorVault, FORMAT, lockMessage } = require('../sidecar/connector-vault.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-vault-'));
const file = path.join(root, 'state.json');
const legacy = path.join(root, 'oauth.json');
const keyHex = 'a1'.repeat(32);
const state = { version: 2, configs: [{ id: 'gmail' }], oauth: { byId: { gmail: { accessToken: 'ACCESS_CANARY', refreshToken: 'REFRESH_CANARY' } }, clients: {} } };
const make = extra => makeConnectorVault({ fs, path, keyHex, ...extra });
try {
  fs.writeFileSync(file, JSON.stringify(state));
  fs.writeFileSync(file + '.bak', JSON.stringify(state));
  fs.writeFileSync(legacy, JSON.stringify(state.oauth));
  fs.writeFileSync(legacy + '.bak', JSON.stringify(state.oauth));
  const broken = make({ writeDurable() { throw Error('disk full'); } });
  assert.throws(() => broken.migrate(file, state, [legacy]));
  assert.equal(JSON.parse(fs.readFileSync(legacy)).byId.gmail.refreshToken, 'REFRESH_CANARY');
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), state, 'failed migration preserves original main and legacy files');
  const vault = make();
  vault.migrate(file, state, [legacy]);
  assert.ok(!fs.existsSync(legacy) && !fs.existsSync(legacy + '.bak'));
  for (const f of [file, file + '.bak']) {
    const raw = fs.readFileSync(f, 'utf8');
    assert.equal(JSON.parse(raw).format, FORMAT);
    assert.ok(!raw.includes('CANARY') && !raw.includes(keyHex));
  }
  assert.deepEqual(make().load(file), state, 'same key opens after restart');
  const sanitize = require('../sidecar/station-recovery.js')._internals.sanitizeManagedJson;
  assert.throws(() => sanitize('connectors/state.json', fs.readFileSync(file)), /unlocked OS credential store/, 'portable backup cannot silently discard encrypted connector settings');
  const portable = sanitize('connectors/state.json', fs.readFileSync(file), { readConnectorState: () => make().load(file) });
  const portableState = JSON.parse(portable.data.toString());
  assert.equal(portableState.configs.length, state.configs.length, 'portable export keeps connector inventory');
  assert.deepEqual(portableState.oauth, { byId: {}, clients: {} }, 'portable export excludes decrypted OAuth credentials');
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => vault.write(file, {}), /Invalid connector state/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  for (const [supplied, reason] of [['', 'key-unavailable'], ['b2'.repeat(32), 'key-mismatch']]) {
    for (const required of [false, true]) {
      const missing = make({ keyHex: supplied, required });
      assert.throws(() => missing.load(file), /locked/);
      assert.equal(missing.lockReason, reason, 'the lock names why: ' + reason);
      assert.throws(() => missing.write(file, {}), /locked/);
      assert.equal(fs.readFileSync(file, 'utf8'), before, 'wrong or absent key cannot overwrite ciphertext');
    }
  }
  assert.match(lockMessage('key-unavailable', 'Platform secure storage failure: denied'), /locked.*Reason: Platform secure storage failure: denied\..*START FRESH/, 'the shell reason reaches the message');
  assert.match(lockMessage('key-mismatch'), /no longer has.*START FRESH/);
  const tampered = JSON.parse(before); tampered.tag = '00'.repeat(16);
  fs.writeFileSync(file, JSON.stringify(tampered));
  { const v = make(); assert.throws(() => v.load(file), /locked/, 'authentication failure is not an empty store or silent rollback'); assert.equal(v.lockReason, 'key-mismatch'); }
  fs.writeFileSync(file, '{');
  assert.deepEqual(make().load(file), state, 'torn JSON recovers encrypted backup');
  fs.writeFileSync(file, before);
  for (const invalid of [null, [], false, 0, 'unexpected']) {
    const bytes = JSON.stringify(invalid);
    fs.writeFileSync(file, bytes);
    const backup = fs.readFileSync(file + '.bak', 'utf8');
    const invalidVault = make();
    assert.throws(() => invalidVault.load(file), /locked/, 'present non-object state cannot authorize empty migration');
    assert.throws(() => invalidVault.migrate(file, state, [legacy]), /locked/);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'invalid authority is preserved');
    assert.equal(fs.readFileSync(file + '.bak', 'utf8'), backup, 'last-good backup is preserved');
  }
  fs.writeFileSync(file, before);
  const lockedFs = Object.create(fs);
  lockedFs.readFileSync = (target, ...args) => { if (target === file) throw Object.assign(Error('busy'), { code: 'EACCES' }); return fs.readFileSync(target, ...args); };
  assert.throws(() => make({ fs: lockedFs }).load(file), /locked/, 'unreadable main cannot roll back to backup');
  const clean = { version: 2, configs: [], oauth: { byId: {}, clients: {} } };
  vault.write(file, clean, { removal: true });
  assert.deepEqual(make().load(file), clean);
  fs.unlinkSync(file);
  assert.deepEqual(make().load(file), clean, 'removal also purges recovery copy');
  // Desktop expected a key but the OS store was unreachable, and NOTHING is sealed yet: work unencrypted,
  // say so (fallback), and seal it on the next launch that has the key (2026-10-11 user report: every sign-in
  // was refused on a fresh install).
  const fresh = path.join(root, 'new.json');
  const required = make({ keyHex: '', required: true });
  assert.equal(required.load(fresh), undefined, 'no saved data is honestly empty, not locked');
  assert.equal(required.fallback, true, 'missing desktop key is reported as an unencrypted fallback');
  assert.equal(required.protected, false);
  required.write(fresh, state);
  assert.deepEqual(JSON.parse(fs.readFileSync(fresh, 'utf8')), state, 'fallback store is plaintext JSON (and reported as such)');
  assert.equal(make({ required: true }).fallback, false, 'a real key is never a fallback');
  make().migrate(fresh, make().load(fresh), []);
  assert.equal(JSON.parse(fs.readFileSync(fresh, 'utf8')).format, FORMAT, 'the next keyed launch seals the fallback store');
  assert.ok(!fs.readFileSync(fresh + '.bak', 'utf8').includes('CANARY'), 'and its backup');
  const sealedAgain = make({ keyHex: '', required: true });
  assert.throws(() => sealedAgain.load(fresh), /locked/, 'once sealed, a missing key locks again instead of writing plaintext over it');
  assert.equal(sealedAgain.lockReason, 'key-unavailable');

  // START FRESH: every copy moves aside (never deleted), a new empty store is written, the lock clears.
  const legacyFresh = path.join(root, 'legacy.json');
  fs.writeFileSync(legacyFresh, '{"connectors":[]}');
  const sealedBytes = fs.readFileSync(fresh, 'utf8');
  const wrong = make({ keyHex: 'c3'.repeat(32) });
  assert.throws(() => wrong.load(fresh), /locked/);
  const out = wrong.startFresh(fresh, [legacyFresh], { stamp: '2026-10-11T12:00:00.000Z' });
  assert.deepEqual(out.moved.sort(), ['legacy.json', 'new.json', 'new.json.bak']);
  assert.equal(fs.readFileSync(path.join(out.movedTo, 'new.json'), 'utf8'), sealedBytes, 'the unreadable store is kept byte-for-byte');
  assert.ok(!fs.existsSync(legacyFresh), 'legacy copies moved too');
  assert.equal(wrong.locked, false);
  assert.deepEqual(make({ keyHex: 'c3'.repeat(32) }).load(fresh), { version: 2, configs: [], oauth: { byId: {}, clients: {} } }, 'new store opens with the current key after restart');
  assert.equal(JSON.parse(fs.readFileSync(fresh + '.bak', 'utf8')).format, FORMAT, 'new store has a sealed recovery copy');
  const clash = make({ keyHex: 'd4'.repeat(32) });
  assert.throws(() => clash.load(fresh), /locked/);
  fs.mkdirSync(path.join(root, 'unreadable-same'), { recursive: true });
  fs.writeFileSync(path.join(root, 'unreadable-same', 'new.json'), 'older');
  const clashBytes = fs.readFileSync(fresh, 'utf8');
  assert.throws(() => clash.startFresh(fresh, [], { stamp: 'same' }), /could not keep/);
  assert.equal(fs.readFileSync(fresh, 'utf8'), clashBytes, 'a blocked move changes nothing');
  assert.equal(clash.locked, true, 'and the vault stays locked');
  // START FRESH must remain locked and preserve the old copies through partial filesystem failures.
  function failedReset(label, inject) {
    const f = path.join(root, label + '.json');
    make().write(f, state);
    const originals = [f, f + '.bak'].map(p => [p, fs.readFileSync(p, 'utf8')]);
    const extra = inject(f);
    const v = make({ keyHex: 'e5'.repeat(32), ...extra });
    assert.throws(() => v.load(f), /locked/);
    assert.throws(() => v.startFresh(f, [], { stamp: label }), /failed|disk full|busy/);
    assert.equal(v.locked, true, label + ': failed reset stays locked');
    for (const [p, bytes] of originals) assert.equal(fs.readFileSync(p, 'utf8'), bytes, label + ': original restored');
    assert.deepEqual(make().load(f), state, label + ': original account can recover after restart');
  }
  failedReset('second-move', f => {
    const brokenFs = Object.create(fs);
    brokenFs.unlinkSync = target => { if (target === f + '.bak') throw Error('busy'); return fs.unlinkSync(target); };
    return { fs: brokenFs };
  });
  failedReset('copy-readback', f => {
    const corruptFs = Object.create(fs);
    corruptFs.copyFileSync = (from, to, flags) => {
      fs.copyFileSync(from, to, flags);
      if (to.includes('unreadable-copy-readback')) fs.writeFileSync(to, 'corrupt copy');
    };
    return { fs: corruptFs };
  });
  failedReset('new-write', f => ({ writeDurable(io, target, data) {
    if (target === f + '.bak') throw Error('disk full');
    fs.writeFileSync(target, data);
  } }));
  const stuckFile = path.join(root, 'rollback-blocked.json');
  make().write(stuckFile, state);
  const stuckBytes = fs.readFileSync(stuckFile, 'utf8');
  const stuckFs = Object.create(fs);
  stuckFs.copyFileSync = (from, to, flags) => { if (from.includes('unreadable-rollback-blocked')) throw Error('restore busy'); return fs.copyFileSync(from, to, flags); };
  const stuck = make({ keyHex: 'e5'.repeat(32), fs: stuckFs, writeDurable(io, target, data) {
    if (target === stuckFile) throw Error('disk full');
    fs.writeFileSync(target, data);
  } });
  assert.throws(() => stuck.load(stuckFile), /locked/);
  assert.throws(() => stuck.startFresh(stuckFile, [], { stamp: 'rollback-blocked' }), /did not fully restore/);
  assert.equal(fs.readFileSync(path.join(root, 'unreadable-rollback-blocked', 'rollback-blocked.json'), 'utf8'), stuckBytes, 'failed rollback preserves the original in recovery');
  assert.throws(() => make().load(stuckFile), /locked/, 'failed rollback stays locked across restart');
  assert.throws(() => stuck.startFresh(stuckFile, [], { stamp: 'retry' }), /incomplete from a previous attempt/, 'retry cannot sweep an unfinished recovery aside');
  // A process may terminate after parking both copies. The persisted marker prevents an empty-store boot.
  const interrupted = path.join(root, 'interrupted.json');
  fs.writeFileSync(interrupted + '.reset-pending', JSON.stringify({ movedTo: path.join(root, 'unreadable-interrupted') }));
  const restarted = make();
  assert.throws(() => restarted.load(interrupted), /locked/, 'unfinished recovery never looks like a new empty store');
  assert.equal(restarted.lockReason, 'unreadable');
  console.log('connector-vault: PASS (AES-GCM, restart, tampering, missing/wrong key + reasons, migration failure, recovery, removal, labelled fallback, START FRESH)');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
