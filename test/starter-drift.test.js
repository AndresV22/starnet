/* node test/starter-drift.test.js — session ideas are generated once per empty session, not once per context drift.

   The waste (measured live 10-14 + the walk's 35-run session): the ideas key is the whole recent context — every
   message of the agent's last six sessions, each session's busy flag, beliefs, the goal. Any crew run anywhere drifts
   it. While an empty session sat open, the 15 s refresh tick threw the shown ideas away on every drift and asked the
   model again (once a minute, the store's gap), and a generation that FINISHED after a drift was discarded unseen and
   asked for again. Each idea already re-validates its evidence and destination at click time (openStarter), and
   REFRESH SUGGESTIONS asks again on demand — so a finished generation stays up until its TTL.

   Laws under test (the production chat.js functions in a vm, stubbed collaborators):
     • a drift under shown READY ideas does not rebuild the empty state (no new generation);
     • a drift under a cold/error/cooldown state still re-evaluates (the first real grounding still earns ideas);
     • an expired READY state still re-evaluates;
     • a READY result that lands after a drift is rendered, not thrown away and re-asked;
     • a non-ready result after a drift still re-evaluates (old behavior). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('./_assert.js');
const code = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'chat.js'), 'utf8');

function harness(o) {
  const calls = { clear: 0, maybe: 0, render: [], request: 0 };
  let ctxKey = o.ctxKey || 'k1';
  const d = Object.assign({ isConnected: true, contains: () => false, querySelector: () => ({}) }, o.d || {});
  const scope = vm.createContext({
    Date, JSON, Promise,
    log: { querySelector: sel => (sel === '.cmsg-empty' ? d : null) },
    activeWs: { id: 'blank', history: [] }, interview: null, input: { value: '' },
    document: { activeElement: null },
    isBusy: () => false,
    starterContext: () => ({ k: ctxKey }), starterOptions: () => ({ system: 's', modelKey: 'm' }),
    clearEmptyState: () => { calls.clear++; }, maybeEmptyState: () => { calls.maybe++; },
    renderStarterIdeas: (dd, hint, result) => { calls.render.push(result.status); },
    RecLedger: { refresh: async () => {} },
    StarterStore: { request: async () => { calls.request++; if (o.duringGeneration) o.duringGeneration(); return o.result || { status: 'ready', ideas: [] }; } },
    requestStarterIdeas: null
  });
  vm.runInContext(A.fnBody(code, 'function refreshStarters('), scope);
  vm.runInContext('async ' + A.fnBody(code, 'function requestStarterIdeas('), scope);
  if (o.driftTo) o.duringGeneration = () => { ctxKey = o.driftTo; };   // a crew run elsewhere lands while the model is thinking
  return { scope, d, calls };
}
const keyOf = k => JSON.stringify([{ k }, { system: 's', modelKey: 'm' }]);

(async () => {
  // ---- a drift under shown READY ideas keeps them (no rebuild, no new generation) ----
  {
    const h = harness({ ctxKey: 'k2', d: { starterKey: keyOf('k1'), shownStatus: 'ready', expiresAt: Date.now() + 3600000 } });
    vm.runInContext('refreshStarters()', h.scope);
    A.eq(h.calls.clear + h.calls.maybe, 0, 'drift under READY ideas does not rebuild the empty state');
  }
  // ---- cold / error / cooldown still re-evaluate on drift ----
  for (const status of ['cold', 'error', 'cooldown']) {
    const h = harness({ ctxKey: 'k2', d: { starterKey: keyOf('k1'), shownStatus: status, expiresAt: Date.now() + 3600000 } });
    vm.runInContext('refreshStarters()', h.scope);
    A.eq(h.calls.maybe, 1, 'drift under a ' + status + ' state still re-evaluates (it can earn real ideas)');
  }
  // ---- an expired READY state re-evaluates ----
  {
    const h = harness({ ctxKey: 'k2', d: { starterKey: keyOf('k1'), shownStatus: 'ready', expiresAt: Date.now() - 1 } });
    vm.runInContext('refreshStarters()', h.scope);
    A.eq(h.calls.maybe, 1, 'READY ideas past their TTL are re-evaluated');
  }
  // ---- a READY generation that finishes after a drift is shown, not discarded and re-asked ----
  {
    const h = harness({ ctxKey: 'k1', driftTo: 'k2', d: {}, result: { status: 'ready', ideas: [{ id: 'i1' }] } });
    const p = vm.runInContext('requestStarterIdeas(d0, {}, {}, {}, false)', Object.assign(h.scope, { d0: h.d }));
    await p; await new Promise(r => setTimeout(r, 0));
    A.eq(h.calls.request, 1, 'one generation');
    A.eq(h.calls.render.filter(s => s === 'ready').length, 1, 'its READY ideas are rendered');
    A.eq(h.calls.maybe, 0, 'and the empty state is not rebuilt into a second generation');
  }
  // ---- a non-ready result after a drift still re-evaluates ----
  {
    const h = harness({ ctxKey: 'k1', driftTo: 'k2', d: {}, result: { status: 'error', ideas: [] } });
    const p = vm.runInContext('requestStarterIdeas(d0, {}, {}, {}, false)', Object.assign(h.scope, { d0: h.d }));
    await p; await new Promise(r => setTimeout(r, 0));
    A.eq(h.calls.maybe, 1, 'an error after a drift re-evaluates against the new context');
  }
  // ---- the render records what it showed (the state the refresh tick reads) ----
  A.ok(/d\.shownStatus = result\.status/.test(A.fnBody(code, 'function renderStarterIdeas(')), 'renderStarterIdeas records the shown status on the empty state');
  A.report('starter-drift.test');
})().catch(e => { console.error(e); process.exit(1); });
