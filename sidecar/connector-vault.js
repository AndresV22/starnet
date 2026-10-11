'use strict';

const crypto = require('node:crypto');
const { writeFileDurable } = require('./durable-write.js');

const FORMAT = 'starnet.connector-vault.v1';
const AAD = Buffer.from(FORMAT);
const UNAVAILABLE = 'Connector credentials are locked. Restart StarNet with the original OS account and an unlocked credential store.';
// Why the saved sign-ins could not be opened. Each one names what the user can actually do about it:
// a restart only helps when the OS store itself was unreachable; the other two need START FRESH.
const LOCK_REASONS = ['key-unavailable', 'key-mismatch', 'unreadable'];
function lockMessage(reason, keyError = '') {
  const why = String(keyError || '').trim().slice(0, 240);
  if (reason === 'key-unavailable') return 'Saved connector sign-ins are locked: StarNet could not open this computer\'s credential store.' +
    (why ? ' Reason: ' + why + '.' : '') + ' They are safe and unchanged. Unlock or repair the credential store and restart StarNet, or START FRESH to sign in again.';
  if (reason === 'key-mismatch') return 'Saved connector sign-ins are locked: they were sealed with a key this OS account no longer has (its credential-store entry was reset, or this is a different account). START FRESH to sign in again. The old files are kept, not deleted.';
  return 'Saved connector sign-ins are locked: the saved file is damaged or from a newer StarNet. START FRESH to sign in again. The old files are kept, not deleted.';
}
function lockError(reason) { return Object.assign(new Error(UNAVAILABLE), { lockReason: LOCK_REASONS.includes(reason) ? reason : 'unreadable' }); }
function validState(value) {
  const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
  return object(value) && value.version === 2 && Array.isArray(value.configs) &&
    object(value.oauth) && object(value.oauth.byId) && object(value.oauth.clients);
}

// The desktop shell supplies a stable, OS-keychain-backed key. Never create a
// plaintext key beside the ciphertext, and never treat a missing key as empty data:
// ciphertext without its key stays locked and untouched. When the desktop expected a
// key (required) but the OS store was unreachable, a store with NO sealed data runs
// unencrypted instead of refusing every sign-in (`fallback` says so, truthfully), the
// same rule as the credits token: better a token on disk than a token nobody has.
// The next launch with a working store seals it (migrate).
function makeConnectorVault({ fs, path, keyHex = '', required = false, writeDurable = writeFileDurable }) {
  if (keyHex && !/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error(UNAVAILABLE);
  const key = keyHex ? Buffer.from(keyHex, 'hex') : null;
  let locked = false;
  let lockReason = '';
  function decode(value) {
    if (value && typeof value.format === 'string' && value.format.startsWith('starnet.connector-vault.') && value.format !== FORMAT) throw lockError('unreadable');
    if (!value || value.format !== FORMAT) return value;
    if (!key) throw lockError('key-unavailable');
    try {
      if (!/^[a-f0-9]{24}$/.test(value.iv || '') || !/^[a-f0-9]{32}$/.test(value.tag || '') ||
          typeof value.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new Error();
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'hex'));
      cipher.setAAD(AAD);
      cipher.setAuthTag(Buffer.from(value.tag, 'hex'));
      const plain = JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString('utf8'));
      if (!validState(plain)) throw new Error();
      return plain;
    } catch (_) { throw lockError('key-mismatch'); }
  }
  function encode(value) {
    if (!validState(value)) throw new Error('Invalid connector state; saved credentials were preserved');
    if (!key) return value;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(AAD);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { format: FORMAT, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') };
  }
  function readOne(file) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return { absent: true }; throw lockError('unreadable'); }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return { corrupt: true }; }
    // Every supported current/legacy format is an object. JSON null is present
    // data, never proof of an absent store: boot migration would otherwise seal
    // an empty state over this file AND its last-good encrypted backup.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw lockError('unreadable');
    return { value: decode(parsed), encrypted: parsed && parsed.format === FORMAT };
  }
  function load(file) {
    if (locked) throw lockError(lockReason);
    try {
      const main = readOne(file);
      if (!main.absent && !main.corrupt) return main.value;
      const bak = readOne(file + '.bak');
      if (!bak.absent && !bak.corrupt) return bak.value;
      if (main.absent && bak.absent) return undefined;
      throw lockError('unreadable');
    } catch (e) { locked = true; lockReason = (e && e.lockReason) || 'unreadable'; throw lockError(lockReason); }
  }
  function readVerified(file, value) {
    const got = readOne(file);
    if (got.absent || got.corrupt || key && !got.encrypted || JSON.stringify(got.value) !== JSON.stringify(value)) throw new Error(UNAVAILABLE);
  }
  function write(file, value, { removal = false } = {}) {
    if (locked) throw new Error(UNAVAILABLE);
    // Read before writing: a wrong/missing key must never overwrite the last copy.
    const previous = load(file);
    const data = JSON.stringify(encode(value));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!removal && previous !== undefined) {
      writeDurable({ fs, path }, file + '.bak', JSON.stringify(encode(previous)));
      readVerified(file + '.bak', previous);
    }
    writeDurable({ fs, path }, file, data);
    readVerified(file, value);
    // First write and explicit removal must both have a verified recovery copy.
    if (removal || previous === undefined) {
      writeDurable({ fs, path }, file + '.bak', JSON.stringify(encode(value)));
      readVerified(file + '.bak', value);
    }
    return true;
  }
  function migrate(file, value, legacyFiles = []) {
    if (!key) return false;
    // Seal BOTH copies and verify before removing any old credential file.
    write(file, value, { removal: true });
    for (const legacy of legacyFiles) {
      for (const target of [legacy, legacy + '.bak']) {
        try { fs.unlinkSync(target); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Connector credential migration could not remove a legacy copy'); }
      }
    }
    return true;
  }
  // START FRESH: the user's explicit exit from a store that cannot be opened. Every copy (main, backup,
  // legacy) is MOVED into a dated unreadable-* folder beside it, never deleted, and only once all of them
  // are aside is a new empty store written (sealed when a key exists). A failed move leaves the vault locked.
  function startFresh(file, legacyFiles = [], { stamp = '' } = {}) {
    const empty = { version: 2, configs: [], oauth: { byId: {}, clients: {} } };
    const label = String(stamp || '').replace(/[^0-9A-Za-z-]/g, '-').slice(0, 40) || 'unknown';
    const dir = path.join(path.dirname(file), 'unreadable-' + label);
    const sources = [file, ...legacyFiles].flatMap(f => [f, f + '.bak']).filter(src => fs.existsSync(src));
    for (const src of sources) {
      if (fs.existsSync(path.join(dir, path.basename(src)))) throw new Error('START FRESH could not keep ' + path.basename(src) + ' aside; nothing was changed');
    }
    const moved = [];
    if (sources.length) fs.mkdirSync(dir, { recursive: true });
    for (const src of sources) {
      fs.renameSync(src, path.join(dir, path.basename(src)));
      moved.push(path.basename(src));
    }
    locked = false; lockReason = '';
    write(file, empty, { removal: true });
    return { movedTo: moved.length ? dir : '', moved, state: empty };
  }
  return { load, write, migrate, startFresh,
    get protected() { return !!key && !locked; }, get locked() { return locked; },
    get lockReason() { return locked ? lockReason : ''; },
    // The desktop expected an OS-keychain key and did not get one: whatever is saved is NOT encrypted.
    get fallback() { return !!required && !key; } };
}

module.exports = { makeConnectorVault, FORMAT, UNAVAILABLE, LOCK_REASONS, lockMessage };
