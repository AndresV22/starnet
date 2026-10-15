/* test/returnstore-rate-sync.test.js — org P14 wiring (2026-10-14): a run waiting for its rating shows in TWO places, DELIVERABLES ›
   TO REVIEW and the delivered result in WORKFLOWS. Rating it in either one must clear it from the other, so neither window keeps
   claiming work still waits for a verdict it already got (truthful telemetry). Run for real: returnstore.js in a vm with a pending crate,
   OutboxView/WorkflowsWindow as counting stubs; then source-locked: each window names itself when it resolves. */
'use strict';
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Returns = require('../frontend/app/returns.js');
const rd = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function boot() {
  let saved = JSON.stringify({ lastSeenAt: 1000 });
  const hits = { outbox: 0, workflows: 0 };
  const ctx = vm.createContext({ Returns, Date,
    localStorage: { getItem: () => saved, setItem: (_, v) => { saved = v; }, removeItem: () => { saved = null; } },
    XpStore: { loadRunHistory: async () => ({ runs: [] }) }, window: { addEventListener() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    OutboxView: { refresh() { hits.outbox++; } }, WorkflowsWindow: { refresh() { hits.workflows++; } } });
  vm.runInContext(rd('frontend/app/returnstore.js') + '\nthis.store = ReturnStore;', ctx);
  ctx.store.init({ enabled: true });
  return { store: ctx.store, hits };
}
const fold = (s, id) => { A.ok(s.foldRow({ runId: id, agentId: 'nova', title: id, ts: 1 })); };

{ // rated in WORKFLOWS → TO REVIEW repaints (a minimized DELIVERABLES no longer lists the run); WORKFLOWS repaints itself
  const { store, hits } = boot(); fold(store, 'r1'); hits.outbox = hits.workflows = 0;
  store.resolve('r1', 'workflows');
  A.equal(store.pendingCount(), 0);
  A.equal(hits.outbox, 1, 'a rating in WORKFLOWS rebuilds every mounted TO REVIEW');
  A.equal(hits.workflows, 0, 'WORKFLOWS is not nudged for its own rating (it schedules its own paint)');
}
{ // rated in TO REVIEW → WORKFLOWS' rate control goes; TO REVIEW is NOT rebuilt (its collected() fade would be cut short)
  const { store, hits } = boot(); fold(store, 'r2'); hits.outbox = hits.workflows = 0;
  store.resolve('r2', 'outbox');
  A.equal(hits.workflows, 1, 'a rating in TO REVIEW nudges WORKFLOWS to drop its rate control');
  A.equal(hits.outbox, 0, 'TO REVIEW is not rebuilt under its own fading row');
}
{ // rated from a COMMS away beat (onRated(runId), no caller) → both windows catch up
  const { store, hits } = boot(); fold(store, 'r3'); hits.outbox = hits.workflows = 0;
  store.resolve('r3');
  A.deepEqual(hits, { outbox: 1, workflows: 1 }, 'a COMMS rating repaints both windows');
}
{ // CLEAR ALL in TO REVIEW → WORKFLOWS' rate control goes too
  const { store, hits } = boot(); fold(store, 'r4'); fold(store, 'r5'); hits.outbox = hits.workflows = 0;
  store.resolveAll(['r4', 'r5']);
  A.equal(store.pendingCount(), 0);
  A.ok(hits.workflows >= 1 && hits.outbox >= 1, 'CLEAR ALL repaints TO REVIEW and nudges WORKFLOWS');
}
{ // the callers name themselves
  const outbox = rd('frontend/app/windows/outbox.js'), wf = rd('frontend/app/windows/workflows.js');
  A.equal((outbox.match(/RS\.resolve\(rw\.runId, 'outbox'\)/g) || []).length, 2, 'both TO REVIEW collect paths (rate + mark reviewed) name themselves');
  A.ok(!/RS\.resolve\(rw\.runId\)/.test(outbox), 'no anonymous TO REVIEW resolve left');
  A.ok(/ReturnStore\.resolve\(rw\.runId, 'workflows'\)/.test(wf), 'WORKFLOWS names itself when it rates');
}
console.log('returnstore-rate-sync: ok');
