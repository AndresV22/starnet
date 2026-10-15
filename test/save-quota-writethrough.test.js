/* node test/save-quota-writethrough.test.js — #121: station edits silently reverted after a reload.

   The whole save lives under ONE browser-storage key ('starnet.save'). Past the browser's per-site cap (WebView2 /
   WebKit, ~5 MB; weeks of session history get there) Save.write throws and returns null. persist() only queued the
   station file when that write succeeded, so BOTH copies froze at the first failure: the refit stayed visible, the
   cache and agent.save.json kept the old station, and every restart reverted it.

   Real modules, fake storage edges: the shipped Save, CloudSaveCore and CloudSave, the shipped persist/watch block
   (sliced from app.js exactly as station-autosave.test.js does), the shipped resumableSave/startCreation guards, and
   the shipped durable SaveStore (sidecar/savestore.js) over an in-memory fs. localStorage enforces a per-origin
   quota the way WebKit/WebView2 do: setItem throws once the origin's total would pass it.

   Scenarios: S1 clean stale cache, S2 dirty stale cache (the macOS report's cache carried _saveDirty:true), each:
   small station saves → history grows past the quota → the Commander refits the room → the page reloads.
   C1 control: an offline-only edit in the cache still wins over an older durable copy (no regression).
   G guards: re-entry and startCreation never read the stale/removed cache after the cache failed.
   B boot: a stale CLEAN cache plus a newer station file the cache cannot hold resumes the station file in memory. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const M = require('../frontend/app/worldmodel.js');

function memfs() {
  const files = new Map();
  const enoent = p => Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' });
  return {
    readFileSync(p) { if (!files.has(p)) throw enoent(p); return files.get(p); },
    writeFileSync(p, d) { files.set(p, String(d)); },
    renameSync(a, b) { if (!files.has(a)) throw enoent(a); files.set(b, files.get(a)); files.delete(a); },
    mkdirSync() {}
  };
}
function makeStore() {
  // no `require` in the context: savestore's fail-open note falls back to console.warn (hermetic, nothing on disk)
  const ctx = vm.createContext({ module: { exports: {} }, console: { warn() {}, log() {} }, Buffer });
  vm.runInContext(src('sidecar/savestore.js'), ctx);
  return ctx.module.exports.makeSaveStore({ fs: memfs(), pathMod: path.posix, root: '/ws', clock: { now: () => Date.now() } });
}
// per-origin quota: total chars across every key (WebKit counts the whole origin; Chromium too)
function quotaStorage(limitRef) {
  const m = new Map();
  const used = (k, v) => { let n = 0; for (const [kk, vv] of m) if (kk !== k) n += kk.length + vv.length; return n + k.length + v.length; };
  return {
    _map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      v = String(v);
      if (limitRef.limit && used(k, v) > limitRef.limit) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, v);
    },
    removeItem: k => { m.delete(k); },
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] || null
  };
}
function makeFetch(store, gate) {
  return async (url, opts = {}) => {
    const u = String(url), method = (opts.method || 'GET').toUpperCase();
    if (gate && gate.down) throw new Error('sidecar unreachable');
    if (method === 'POST' && u.startsWith('/api/save')) {
      const body = JSON.parse(opts.body);
      const result = store.save('agent', body, { compareRevision: true });
      return { ok: true, status: 200, json: async () => result };
    }
    if (method === 'GET' && u.startsWith('/api/save?')) return { ok: true, status: 200, json: async () => ({ save: store.load('agent') || null }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
function pageContext(localStorage, fetch, extra) {
  const c = vm.createContext(Object.assign({
    console: { warn() {}, info() {}, log() {} }, queueMicrotask, setTimeout, clearTimeout, AbortController, crypto: nodeCrypto,
    localStorage, fetch, JSON
  }, extra || {}));
  vm.runInContext(src('frontend/app/save.js'), c);
  vm.runInContext(src('frontend/app/cloudsavecore.js'), c);
  vm.runInContext(src('frontend/app/cloudsave.js'), c);
  return c;
}
const app = src('frontend/app/app.js');
const start = app.indexOf('  let unsubscribeStationSave = null;');
const end = app.indexOf('  /* ---------- connect screen', start);
A.ok(start > 0 && end > start, 'the shipped persist/watch block is found in app.js');
const tick = () => new Promise(r => setTimeout(r, 0));
const floorOf = (doc, room) => doc && doc.station && doc.station.rooms && doc.station.rooms[room] && doc.station.rooms[room].floorStyle;
const cachedFloor = (ls, room) => floorOf(JSON.parse(ls.getItem('starnet.save') || 'null'), room);

function livePage(localStorage, fetch, station, ws) {
  const notices = [];
  const c = pageContext(localStorage, fetch, {
    station, agent: { id: 'agent', name: 'NOVA' }, agents: new Map(), liveAgents: () => [],
    Harness: { totals: () => ({}) }, Workstreams: { serialize: () => ws.slice }, rosterPushFailed: false, pushRoster() {},
    StationUI: { flashSave() {}, notify: (...a) => notices.push(a) }
  });
  vm.runInContext(app.slice(start, end), c);
  vm.runInContext('watchStationSave()', c);
  return { c, notices };
}
async function reloadPage(localStorage, fetch) {
  const c = pageContext(localStorage, fetch);
  const doc = await vm.runInContext('CloudSave.reconcile(Save.load())', c);
  return { c, doc, revision: vm.runInContext('CloudSave.revision()', c) };
}
// the shipped re-entry source of truth, evaluated inside a page context
// (a build without resumableSave re-enters straight from the cache: model exactly that, so the behaviour is still judged)
const resumableSrc = A.fnBody(app, '  function resumableSave()') || 'function resumableSave() { return { doc: Save.has() ? Save.load() : null, memory: false }; }';
const startCreationSrc = A.fnBody(app, '  function startCreation()');
A.ok(app.indexOf('  function resumableSave()') > 0 && resumableSrc.length < 2000, 'resumableSave() is sliced from app.js');
A.ok(startCreationSrc.length > 50 && startCreationSrc.length < 2000, 'startCreation() is sliced from app.js');
function reentrySave(c) {
  vm.runInContext(resumableSrc, c);
  return vm.runInContext('resumableSave()', c);
}

async function scenario(label, opts) {
  const store = makeStore();
  const limitRef = { limit: 0 };
  const ls = quotaStorage(limitRef);
  const fetch = makeFetch(store);
  const station = M.create();
  const room = station.spawnRoomId();
  const ws = { slice: { workstreams: [{ id: 'general', history: [{ role: 'user', content: 'hello' }] }], activeId: 'general', generalId: 'general' } };
  const page = livePage(ls, fetch, station, ws);

  station.setFloor(room, 'amber'); await tick();
  await vm.runInContext('CloudSave.flush({ force: true })', page.c);
  const used = Array.from(ls._map).reduce((n, [k, v]) => n + k.length + v.length, 0);
  limitRef.limit = used + 4000;                                          // the origin is now near its quota
  if (opts.dirtyCache) {                                                  // the macOS report: the cached save carries _saveDirty:true
    const d = JSON.parse(ls.getItem('starnet.save')); d._saveDirty = true; ls._map.set('starnet.save', JSON.stringify(d));
  }
  // weeks of history push the save past the quota, then the refit lands
  ws.slice = { workstreams: [{ id: 'general', history: [{ role: 'user', content: 'x'.repeat(20000) }] }], activeId: 'general', generalId: 'general' };
  station.setFloor(room, 'verdant'); await tick();
  const writeFailed = page.notices.some(n => n[3] && n[3].key === 'save-failed');
  A.ok(station.serialize().rooms[room].floorStyle === 'verdant' && writeFailed && cachedFloor(ls, room) === 'amber',
    label + ' precondition: live room shows verdant, the cache write failed, the cache still holds amber');
  // G1: before the station file confirms, a re-entry must not read the stale cache
  const early = reentrySave(page.c);
  A.ok(early.memory === true && floorOf(early.doc, room) === 'verdant', label + ' G1: re-entry resumes the in-memory station, never the stale cache (got ' + floorOf(early.doc, room) + ')');

  await vm.runInContext('CloudSave.flush({ force: true })', page.c);
  const durable = store.load('agent');
  A.eq(floorOf(durable, room), 'verdant', label + ' A1: the station file receives the live refit despite the cache failure');
  A.eq(ls.getItem('starnet.save'), null, label + ' A1b: once the station file confirms it, the superseded cache entry is removed');
  const late = reentrySave(page.c);
  A.ok(late.memory === true && floorOf(late.doc, room) === 'verdant', label + ' G2: after the cache entry is removed, re-entry still resumes the station (never creation)');

  const reload = await reloadPage(ls, fetch);
  A.eq(floorOf(reload.doc, room), 'verdant', label + ' A2: the reload resumes the live refit, not the stale cache');
  A.ok(!!(reload.doc && reload.doc.agent && !reload.doc.__saveUnknown && !reload.doc.__futureSave), label + ' A3: the reload never falls to onboarding or the save-unreachable screen');
  const durableRev = Number((store.load('agent') || {})._saveRevision) || 0;
  A.eq(reload.revision, durableRev, label + ' A4: the resumed page carries the station file revision (its next autosave cannot conflict or clobber)');
  const reloadedReentry = reentrySave(reload.c);
  A.ok(reloadedReentry.memory === true && floorOf(reloadedReentry.doc, room) === 'verdant', label + ' G3: after a station-file resume, re-entry resumes it from memory');
  return { store, ls, fetch, room };
}

async function controlOfflineEdit() {
  // C1: an edit made while the sidecar was down lives only in the cache; it must still win at boot (no regression).
  const store = makeStore();
  const ls = quotaStorage({ limit: 0 });
  const gate = { down: false };
  const fetch = makeFetch(store, gate);
  const station = M.create();
  const room = station.spawnRoomId();
  const ws = { slice: { workstreams: [{ id: 'general', history: [] }], activeId: 'general', generalId: 'general' } };
  const page = livePage(ls, fetch, station, ws);
  station.setFloor(room, 'amber'); await tick();
  await vm.runInContext('CloudSave.flush({ force: true })', page.c);
  gate.down = true;
  station.setFloor(room, 'teal'); await tick();
  await vm.runInContext('CloudSave.flush({ force: true })', page.c);
  gate.down = false;
  A.eq(cachedFloor(ls, room), 'teal', 'C1: an offline edit that fit in the cache is never removed from it');
  A.eq(reentrySave(page.c).memory, false, 'C1: with a healthy cache, re-entry reads the cache as before');
  const { doc } = await reloadPage(ls, fetch);
  A.eq(floorOf(doc, room), 'teal', 'C1 control: an offline-only cache edit still wins over an older durable copy');
}

async function bootFromStationFile() {
  // B: the station file holds a NEWER station than the clean cache, and the cache cannot take it (e.g. the page died
  // before it could drop its stale cache). The boot path alone is judged: the newer station is seeded straight into
  // the durable store, the way another window or the unload beacon lands it.
  const store = makeStore();
  const limitRef = { limit: 0 };
  const ls = quotaStorage(limitRef);
  const fetch = makeFetch(store);
  const station = M.create();
  const room = station.spawnRoomId();
  const ws = { slice: { workstreams: [{ id: 'general', history: [] }], activeId: 'general', generalId: 'general' } };
  const page = livePage(ls, fetch, station, ws);
  station.setFloor(room, 'amber'); await tick();
  await vm.runInContext('CloudSave.flush({ force: true })', page.c);
  const staleRaw = ls.getItem('starnet.save');
  A.eq(JSON.parse(staleRaw)._saveDirty, false, 'B precondition: the cached amber save is clean (acknowledged)');
  const newer = JSON.parse(staleRaw);
  newer.station.rooms[room].floorStyle = 'verdant';
  newer.workstreams = [{ id: 'general', history: [{ role: 'user', content: 'y'.repeat(20000) }] }];
  newer.updatedAt = Number(newer.updatedAt) + 1000;
  A.ok(store.save('agent', newer, { compareRevision: true }).ok, 'B precondition: the station file holds the newer verdant station');
  limitRef.limit = Array.from(ls._map).reduce((n, [k, v]) => n + k.length + v.length, 0) + 4000;   // the cache cannot take it
  const reload = await reloadPage(ls, fetch);
  A.eq(floorOf(reload.doc, room), 'verdant', 'B1: a station file the cache cannot hold is resumed from memory, not the stale clean cache');
  A.eq(ls.getItem('starnet.save'), null, 'B2: the superseded clean cache entry is dropped so the next boot cannot resume it');
  A.eq(reload.revision, Number(store.load('agent')._saveRevision), 'B3: the in-memory resume carries the station file revision');

  // a station-file resume is never replaced by a brand-new creation
  const calls = { reentry: 0, show: 0 };
  Object.assign(reload.c, { reentry: () => { calls.reentry++; }, SFX: { boot() {}, open() {} }, show: () => { calls.show++; }, initConnect() {}, resumingSaved: null });
  vm.runInContext(resumableSrc + '\n' + startCreationSrc, reload.c);
  vm.runInContext('startCreation()', reload.c);
  A.eq(calls, { reentry: 1, show: 0 }, 'B4: startCreation after a station-file resume re-enters the station instead of opening creation');

  // once the cache has room again, the cache is the source again (same page, same CloudSave)
  limitRef.limit = 0;
  Object.assign(reload.c, { station: M.deserialize(reload.doc.station), agent: reload.doc.agent, agents: new Map(), liveAgents: () => [],
    Harness: { totals: () => ({}) }, Workstreams: { serialize: () => ({ workstreams: reload.doc.workstreams, activeId: 'general', generalId: 'general' }) },
    rosterPushFailed: false, pushRoster() {}, StationUI: { flashSave() {}, notify() {} } });
  vm.runInContext(app.slice(start, end), reload.c);
  A.eq(vm.runInContext('persist()', reload.c), true, 'B5: a later save that fits is written to the cache');
  A.eq(cachedFloor(ls, room), 'verdant', 'B5: the cache holds the newest station again');
  A.eq(reentrySave(reload.c).memory, false, 'B5: with the newest save cached, re-entry reads the cache again');
}

(async () => {
  await scenario('S1 clean stale cache', { dirtyCache: false });
  await scenario('S2 dirty stale cache', { dirtyCache: true });
  await controlOfflineEdit();
  await bootFromStationFile();
  A.report('save-quota-writethrough');
})().catch(e => { console.log('FAIL: unhandled ' + (e && e.stack || e)); process.exit(1); });
