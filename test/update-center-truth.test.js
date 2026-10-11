/* node test/update-center-truth.test.js — the Update Center never says "no update" while the station knows of one.
   Reproduces the 0.13.1 → 0.13.2 report through the REAL updates.js in a vm: a launch finds the update (one toast),
   the app restarts inside the 6h interval, and the next launch must re-arm it at once — not show "No update is
   pending" until the interval runs out. Also locks: opening the window checks (unless AUTO-CHECK is off or this
   launch already checked), the idle copy only states what is known, and the dock carries a NEW chip while armed. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const UpdateCore = require('../frontend/app/updatecore.js');

const source = fs.readFileSync(path.join(__dirname, '../frontend/app/updates.js'), 'utf8') + '\n;globalThis.__Updates = Updates;';
const tick = () => new Promise(r => setImmediate(r));

function launch(store, opts) {
  const o = opts || {};
  const checks = [];
  const toasts = [];
  const badge = { textContent: '', style: { display: 'none' } };
  const invoke = async cmd => {
    if (cmd === 'starnet_update_status') return { desktop: true, currentVersion: o.current || '0.13.1', pending: null };
    if (cmd === 'starnet_update_check') {
      checks.push(Date.now());
      const v = o.latest || '0.13.2';
      return v === (o.current || '0.13.1')
        ? { available: false, checkedAt: Date.now() }
        : { available: true, checkedAt: Date.now(), update: { version: v, body: '' } };
    }
    return {};
  };
  const context = {
    UpdateCore,
    window: { __TAURI__: { core: { invoke, Channel: class {} } }, open() {} },
    document: { getElementById: id => (id === 'up-badge' ? badge : null) },
    localStorage: {
      get length() { return store.size; }, key(i) { return Array.from(store.keys())[i] || null; },
      getItem(k) { return store.has(k) ? store.get(k) : null; }, setItem(k, v) { store.set(k, String(v)); }
    },
    console,
    setTimeout: () => 1, clearTimeout: () => {},
    Date, JSON, Promise, Math, String, Number, Object, Array, RegExp, Error
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'updates.js' });
  const updates = context.__Updates;
  return {
    updates, checks, toasts, badge,
    init: () => updates.init({ notify: msg => toasts.push(msg) }),
    open() { const body = { innerHTML: '', querySelector: () => null }; updates.render(body); return body; }
  };
}

(async () => {
  // ---- the report: found, toast missed, restart → must re-arm immediately ----
  {
    const store = new Map();
    const first = launch(store);
    await first.init(); await tick();
    A.eq(first.checks.length, 1, 'a fresh install checks on startup');
    A.eq(first.updates.phase(), 'available', 'the first launch finds 0.13.2');
    A.eq(first.toasts.length, 1, 'one toast announces it');
    A.eq(first.badge.style.display, 'inline-block', 'the dock UPDATES item shows the NEW chip');
    A.eq(first.badge.textContent, 'NEW', 'the chip reads NEW');

    // restart an hour later — still inside the 6h interval that used to suppress the check
    const second = launch(store);
    await second.init(); await tick();
    A.eq(second.checks.length, 1, 'the relaunch checks at once because the last check found an update');
    A.eq(second.updates.phase(), 'available', 'the relaunch shows the update instead of "no update"');
    A.eq(second.toasts.length, 0, 'no second toast for the same version (the chip carries it now)');
    A.eq(second.badge.style.display, 'inline-block', 'the NEW chip is back after the restart');
  }

  // ---- after the update lands, the remembered version is the running one: no forced check, no chip ----
  {
    const store = new Map();
    const before = launch(store);
    await before.init(); await tick();
    const after = launch(store, { current: '0.13.2', latest: '0.13.2' });
    await after.init(); await tick();
    A.eq(after.checks.length, 0, 'the updated app does not re-check inside the interval');
    A.eq(after.badge.style.display, 'none', 'no NEW chip on the version that is already running');
    const body = after.open(); await tick();
    A.eq(after.checks.length, 1, 'opening the Update Center checks (no check yet this launch)');
    A.eq(after.updates.phase(), 'current', 'and proves the app is current');
    after.open(); await tick();
    A.eq(after.checks.length, 1, 'reopening right away reuses this launch\'s fresh answer');
    A.ok(!/No update is pending/.test(body.innerHTML), 'the old unconditional "No update is pending" claim is gone');
  }

  // ---- idle copy states only what is known; AUTO-CHECK off never checks on open ----
  {
    const store = new Map([['starnet.updates.v1', JSON.stringify({ autoCheck: false, lastCheckAt: 0, nextCheckAt: 0 })]]);
    const off = launch(store);
    await off.init(); await tick();
    const body = off.open(); await tick();
    A.eq(off.checks.length, 0, 'AUTO-CHECK off: neither startup nor opening the window sends a request');
    A.eq(off.updates.phase(), 'idle', 'nothing was checked');
    A.ok(/Not checked since never/.test(body.innerHTML), 'the window says it has not checked, never "no update"');
    A.ok(/NOT CHECKED YET/.test(body.innerHTML), 'the status label does not claim READY');

    const known = new Map([['starnet.updates.v1', JSON.stringify({ autoCheck: false, availableVersion: '0.13.2', lastCheckAt: 5 })]]);
    const k = launch(known);
    await k.init(); await tick();
    const kb = k.open(); await tick();
    A.ok(/The last check found v0\.13\.2/.test(kb.innerHTML), 'a remembered update is named, with CHECK NOW to arm it');
  }

  A.report('update-center-truth');
})().catch(e => { console.error(e); process.exit(1); });
