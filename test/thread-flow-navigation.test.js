/* Thread UX regressions: delegated participation stays findable without exposing worker storage,
   and polling that adopts thread metadata keeps that index current. Live DOM proof is separate. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const A = require('./_assert.js');
const W = require('../frontend/app/workstreams.js');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function fn(src, name) {
  const hit = new RegExp('^( {0,4})(?:async )?function ' + name + '\\([^]*?\\n\\1\\}', 'm').exec(src);
  if (!hit) throw new Error('Missing function ' + name);
  return hit[0];
}

/* The parent remains the one conversation in every view, including after work finishes or archives. */
W.init({ generalId: 'general', activeId: 'general', workstreams: [
  { id: 'general', title: null, agentId: 'nova', kind: 'chat' },
  { id: 'launch', title: 'Launch', agentId: 'nova', kind: 'chat' },
  { id: 'mira-work', title: 'Compare prices', agentId: 'mira', worker: true, parentStreamId: 'launch',
    runIds: ['mira-run'], lastRunOk: true, history: [{ role: 'assistant', content: 'Competitor pricing is 19.' }] },
  { id: 'rook-work', title: 'Check code', agentId: 'rook', worker: true, parentStreamId: 'launch', history: [] },
  { id: 'agent-created', title: 'Side research', agentId: 'mira', parentStreamId: 'general', history: [] }
] });
const visibleFor = (id, includeArchived = false) => W.list({ includeArchived }).filter(w => W.hasAgent(w, id)).map(w => w.id).sort();
A.eq(visibleFor('mira'), ['agent-created', 'launch'], 'completed delegated work lists the parent under its worker, never the storage row');
A.eq(visibleFor('rook'), ['launch'], 'each worker can find the conversation that holds their work');
A.ok(!W.hasAgent(W.get('general'), 'mira'), 'a session the agent created with a parent link does not imply delegated participation');
const hits = W.search('Competitor').filter(h => W.hasAgent(W.get(h.id), 'mira'));
A.eq(hits.map(h => [h.id, h.workerId]), [['launch', 'mira-work']], 'worker-scoped search keeps its parent hit and exact worker reveal target');
W.archive('launch');
A.eq(visibleFor('mira'), ['agent-created'], 'archiving the parent hides it from the worker open-session view');
A.eq(visibleFor('mira', true), ['agent-created', 'launch'], 'the same archived parent is discoverable under its worker');
W.archive('mira-work'); W.archive('launch', false);
A.eq(visibleFor('mira'), ['agent-created', 'launch'], 'legacy archive state on hidden storage does not hide a visible parent receipt');
W.init(JSON.parse(JSON.stringify(W.serialize())));
A.ok(W.hasAgent(W.get('launch'), 'mira'), 'participation survives save/reload');
W.adopt({ id: 'vex-work', worker: true, parentStreamId: 'launch', agentId: 'vex' });
A.ok(W.hasAgent(W.get('launch'), 'vex'), 'a newly delegated worker invalidates the participation index');
W.setAgent('vex-work', 'finn');
A.ok(!W.hasAgent(W.get('launch'), 'vex') && W.hasAgent(W.get('launch'), 'finn'), 'rebinding a worker updates both old and new participation');
W.del('vex-work');
A.ok(!W.hasAgent(W.get('launch'), 'finn'), 'deleting a worker removes its participation');
W.del('launch');
A.eq(W.search('Competitor'), [], 'deleting the parent removes its worker search results');
A.ok(!W.get('mira-work') && !W.get('rook-work'), 'deleting the conversation removes its hidden worker records');
W.adopt({ id: 'launch', agentId: 'nova', revive: true });
A.ok(!W.hasAgent(W.get('launch'), 'mira'), 'reviving a parent never resurrects deleted worker membership');
W.reset();
A.ok(!W.hasAgent({ id: 'launch', agentId: 'nova' }, 'mira'), 'reset clears participation');

/* An attention shortcut follows the actual asker, not every past participant in that conversation. */
W.adopt({ id: 'home', agentId: 'nova' });
W.adopt({ id: 'm', agentId: 'mira', worker: true, parentStreamId: 'home' });
W.adopt({ id: 'r', agentId: 'rook', worker: true, parentStreamId: 'home' });
let asks = [{ agentId: 'nova', workerAgentId: 'rook' }];
const waiting = new Function('Workstreams', 'Channels', 'railPendingIds', 'railHasAgent', fn(read('frontend/app/app.js'), 'waitingSessionOf') + ';return waitingSessionOf;')(
  W, { pendingAllOf: () => asks }, () => ['home'], (w, id) => W.hasAgent(w, id));
A.eq(waiting('mira'), null, 'MIRA is not routed to a former crewmate\'s approval');
A.eq(waiting('rook'), 'home', 'ROOK is routed to the parent carrying ROOK\'s stamped ask');
A.eq(waiting('nova'), null, 'the lead stamp does not misattribute a worker ask');
asks.push({ agentId: 'nova', workerAgentId: 'mira' });
A.eq(waiting('mira'), 'home', 'the second pending worker ask is found too');
asks = [{ agentId: 'nova' }];
A.eq(waiting('nova'), 'home', 'ordinary direct asks still route to the lead');

(async () => {
  // Real Overseer.refresh: a delivered stream can exist before its worker metadata arrives.
  W.init({ generalId: 'poll-home', workstreams: [
    { id: 'poll-home', agentId: 'nova', title: null },
    { id: 'poll-worker', agentId: 'mira', title: 'Original title', history: [{ role: 'assistant', content: 'A saved finding' }] }
  ] });
  A.ok(!W.hasAgent(W.get('poll-home'), 'mira'), 'pre-poll participation index has no unproven link');
  const snapshot = { threads: [{ id: 'poll-worker', agentId: 'mira', parentStreamId: 'poll-home', worker: true, projectRoot: 'C:/launch', title: 'Incoming metadata' }], workers: [] };
  let saves = 0, refreshes = 0;
  const ctx = { Workstreams: W, App: { persist: () => { saves++; }, refreshRail: () => { refreshes++; } },
    fetch: async () => ({ ok: true, json: async () => snapshot }), AbortController, setTimeout, clearTimeout, console, module: { exports: {} } };
  require('node:vm').runInNewContext(read('frontend/app/overseer.js'), ctx);
  await ctx.module.exports.refresh();
  A.ok(W.hasAgent(W.get('poll-home'), 'mira'), 'polling an existing stream invalidates the stale participation index');
  A.eq(W.list().filter(w => W.hasAgent(w, 'mira')).map(w => w.id), ['poll-home'], 'the live poll replaces the visible worker row with its discoverable parent');
  A.eq(W.get('poll-worker').title, 'Original title', 'additive adoption preserves existing conversation content and title');
  A.eq(W.get('poll-worker').projectRoot, 'C:/launch', 'the same poll adopts a missing project scope');
  A.eq([saves, refreshes], [1, 1], 'new thread metadata persists and refreshes the rail once');
  await ctx.module.exports.refresh();
  A.eq([saves, refreshes], [1, 1], 'an unchanged poll does not repeatedly persist or repaint');
  snapshot.threads[0].parentStreamId = 'other'; snapshot.threads[0].projectRoot = 'C:/other';
  W.adopt({ id: 'other', agentId: 'nova' }); await ctx.module.exports.refresh();
  A.eq([W.get('poll-worker').parentStreamId, W.get('poll-worker').projectRoot], ['poll-home', 'C:/launch'], 'later metadata never silently rehomes an established worker');
  A.report('thread-flow-navigation.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
