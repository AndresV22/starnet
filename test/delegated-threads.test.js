/* node test/delegated-threads.test.js — DELEGATED WORK (2026-10-09, Andrew: managing agents and their threads must be
   the easiest thing in the app).

   1. GENUINE: Workstreams.nestRows — a conversation's worker threads fold under it in SESSIONS; nothing is ever hidden.
   2. GENUINE: team.dispatch files every coordinator worker in its own thread under the conversation that asked
      (orchestration.js fileUnderThreads) — best-effort, never blocking the work.
   3. GENUINE: Delegated.stateOf — the card's row state reads the ledger / live channel, and a foreground worker that
      ended without delivering says so (never "done").
   4. SOURCE-LOCKED wiring: the rail renders the projection, the card mounts on Chat.load, the page loads the module,
      the overseer route carries the card's fields, and the lead prompt states the one filing rule.

   OUT OF HEADLESS SCOPE (proven live, lane notes delegation-proto-lane-1008 / work-threads): the folded rail, the card
   in COMMS on a scripted-model station (dev/delegation-preview.cjs), OPEN into a worker thread and BACK. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const W = require('../frontend/app/workstreams.js');
const { makeOrchestrationTools } = require('../sidecar/tools/builtin/orchestration.js');

(async () => {

/* ---- 1. nestRows ---- */
{
  const rows = [
    { id: 'kidB', parentStreamId: 'home' },
    { id: 'home' },
    { id: 'other' },
    { id: 'kidA', parentStreamId: 'home' },
    { id: 'orphan', parentStreamId: 'gone' },
    { id: 'grand', parentStreamId: 'kidA' }
  ];
  const folded = W.nestRows(rows, {});
  const shape = folded.map(i => i.type === 'kids' ? 'kids:' + i.parentId + ':' + i.rows.length : i.w.id + '@' + i.depth);
  A.eq(shape.join(' '), 'home@0 kids:home:2 other@0 orphan@0 grand@0',
    'children fold under their parent; folded children hide; an orphan and a grandchild stay top-level');
  const open = W.nestRows(rows, { expanded: ['kids:home'] }).map(i => i.type === 'kids' ? 'K' + (i.expanded ? '+' : '-') : i.w.id + '@' + i.depth);
  A.eq(open.join(' '), 'home@0 K+ kidB@1 kidA@1 other@0 orphan@0 grand@0', 'expanded, the children follow their parent in their own order');
  const kept = W.nestRows(rows, { keep: ['kidA'] }).map(i => i.type === 'kids' ? 'K' : i.w.id);
  A.eq(kept.join(' '), 'home K kidA other orphan grand', 'a folded child that needs attention (open/busy/waiting/unread) still shows');
  A.eq(W.nestRows([{ id: 'x', parentStreamId: 'x' }]).length, 1, 'a session can never be its own parent');
  A.eq(W.nestRows(null).length, 0, 'no rows, no items');
  A.eq(rows[0].parentStreamId, 'home', 'a display projection: rows are never mutated');
}

/* ---- 2. every coordinator worker gets its own thread ---- */
function fakeRunOnce() {
  const calls = [];
  const fn = async (o) => { calls.push(o); return { reason: 'done', messages: [{ role: 'assistant', content: 'out:' + o.agentId }], usd: 0 }; };
  fn.calls = calls; return fn;
}
const counter = () => { let n = 0; return () => 'id_' + (++n); };
const roster = new Map([['researcher', { system: 'R', name: 'MIRA' }], ['writer', { system: 'W', name: 'VEX' }]]);
{
  const ro = fakeRunOnce(), made = [];
  const childThread = (a) => { made.push(a); return { id: 'thread_' + made.length, title: a.title }; };
  const { dispatchTool } = makeOrchestrationTools({ runOnce: ro, roster: () => roster, key: 'k', model: 'm', newId: counter(), coordinateResults: true, childThread });
  await dispatchTool.run({ workers: [
    { agentId: 'researcher', prompt: 'Scan our four closest competitors and their entry pricing, then save it.\nUse public pages only.' },
    { agentId: 'writer', prompt: 'Write the launch email.' }
  ] }, { agentId: 'agent', streamId: 'home', runId: 'lead1' });
  A.eq(made.length, 2, 'one thread per worker');
  A.eq(made[0].parentStreamId, 'home', 'filed under the conversation that delegated it');
  A.eq(made[0].agentId, 'researcher', 'bound to the worker');
  A.eq(made[0].requestId, 'lead1:0', 'idempotent per lead run + worker slot');
  A.eq(made[0].title, 'Scan our four closest competitors and their ent…', 'titled from the first line, clipped to the rail');
  A.eq(made[1].title, 'Write the launch email', 'a short task keeps its own words');
  A.eq(ro.calls[0].streamId, 'thread_1', 'the worker runs (and is filed) in its own thread');
  A.eq(ro.calls[0].sessionTitle, made[0].title, 'with that thread\'s title');
  A.eq(ro.calls[1].streamId, 'thread_2', 'every worker, not just the first');
}
{
  const ro = fakeRunOnce(); let asked = 0;
  const { dispatchTool } = makeOrchestrationTools({ runOnce: ro, roster: () => roster, key: 'k', model: 'm', newId: counter(), coordinateResults: true, childThread: () => { asked++; throw new Error('no such session'); } });
  await dispatchTool.run({ workers: [{ agentId: 'researcher', prompt: 'find X' }] }, { agentId: 'agent', streamId: 'home', runId: 'lead2' });
  A.eq(asked, 1, 'a thread was asked for');
  A.eq(ro.calls.length, 1, 'a thread that cannot be created never blocks the work');
  A.eq(ro.calls[0].streamId, undefined, 'the worker runs exactly as before (in the lead stream)');
}
{
  const ro = fakeRunOnce(); let asked = 0;
  const { dispatchTool } = makeOrchestrationTools({ runOnce: ro, roster: () => roster, key: 'k', model: 'm', newId: counter(), coordinateResults: true, childThread: () => { asked++; return { id: 't' }; } });
  await dispatchTool.run({ workers: [{ agentId: 'researcher', prompt: 'find X' }] }, { agentId: 'agent', streamId: 'global', runId: 'lead3' });
  A.eq(asked, 0, 'a global (channel) run has no conversation to file under');
  const none = makeOrchestrationTools({ runOnce: fakeRunOnce(), roster: () => roster, key: 'k', model: 'm', newId: counter() });
  await none.dispatchTool.run({ workers: [{ agentId: 'researcher', prompt: 'find X' }] }, { agentId: 'researcher_lead', streamId: 'home', runId: 'lead4' });
  A.ok(true, 'a non-coordinator lead (no childThread) dispatches unchanged');
}

/* ---- 3. the card's row state ---- */
{
  const busy = new Set(), pend = new Map(), runOf = new Map();
  global.Channels = { pendingOf: id => pend.get(id) || null, isBusy: id => busy.has(id), elapsedOf: () => 65000, runIdOf: id => runOf.get(id) || '' };
  global.document = undefined;
  const D = require('../frontend/app/delegated.js');
  const ws = (o) => Object.assign({ id: 'k', history: [], runIds: [] }, o);
  const st = (r, lead) => D.stateOf(r, 'home', lead || 'lead1');
  A.eq(st({ ws: ws(), worker: { status: 'running', startedAt: Date.now() - 5000, canInterrupt: true, id: 'w1', runId: 'r1' } }).cls, 'working', 'a running ledger worker is working');
  A.ok(st({ ws: ws(), worker: { status: 'running', startedAt: Date.now(), canInterrupt: true, id: 'w1', runId: 'r1' } }).stop, 'and STOP is offered only when the ledger says it can be interrupted');
  const done = st({ ws: ws({ history: [{ role: 'system', sys: true, content: '— delegated —' }, { role: 'assistant', content: '## Found\n**Two** competitors undercut us.' }] }), worker: { status: 'done', startedAt: 1000, completedAt: 13000 } });
  A.eq(done.cls + '|' + done.live + '|' + done.t, 'done|Found|0:12', 'a finished worker quotes the first line it delivered, with its real run time');
  A.eq(st({ ws: ws(), worker: { status: 'error', reason: 'timeout' } }).live, 'failed · timeout', 'a failed worker says why');
  A.eq(st({ ws: ws(), worker: { status: 'stale' } }).live, 'stopped when the station restarted', 'a stale worker is honest about it');
  pend.set('k', { tool: 'brief.ask' });
  A.eq(st({ ws: ws(), worker: { status: 'running', startedAt: Date.now() } }).cls, 'waiting', 'waiting on the Commander outranks working');
  pend.clear(); busy.add('k');
  A.eq(st({ ws: ws(), worker: null }).cls + '|' + st({ ws: ws(), worker: null }).t, 'working|1:05', 'a foreground worker is working while its thread channel is live');
  busy.clear();
  A.eq(st({ ws: ws({ runIds: ['r9'] }), worker: null }).cls, 'done', 'a delivered foreground worker is done');
  busy.add('home'); runOf.set('home', 'lead1');
  A.eq(st({ ws: ws(), worker: null }).live, 'starting', 'before delivery, while the lead run that dispatched it is still live: starting');
  busy.clear();
  A.eq(st({ ws: ws(), worker: null }).live, 'ended without a result', 'after the lead run ended with nothing delivered: never "done"');
  delete global.Channels; delete global.document;
}

/* ---- 4. wiring ---- */
{
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const app = src('frontend/app/app.js'), chat = src('frontend/app/chat.js'), html = src('frontend/index.html'), idx = src('sidecar/index.js'), ov = src('frontend/app/overseer.js');
  A.ok(/Workstreams\.nestRows\(flat, \{ expanded: \[\.\.\.railExpanded\], keep \}\)/.test(app), 'the rail renders the nesting projection');
  A.ok(/railChildIds\.has\(w\.id\) \? ' ws-child' : ''/.test(app), 'rowClass marks a folded child, so the 1s ticker never strips it');
  A.ok(/Delegated\.presentFor\(activeWs\.id\)/.test(chat), 'Chat.load mounts the card');
  A.ok(html.indexOf('app/overseer.js') >= 0 && html.indexOf('app/delegated.js') > 0, 'the page loads the card module');
  A.ok(/agentId: w\.agentId, parentRunId: w\.parentRunId \|\| '', generation: w\.generation/.test(idx), 'the overseer route carries the card\'s fields');
  A.ok(/each worker gets its own thread under this conversation/.test(idx), 'the lead prompt states the one filing rule');
  A.ok(/childThread: require\('\.\/overseer\.js'\)\.isCoordinatorRun/.test(idx), 'only coordinator runs file child threads');
  A.ok(/if \(local\) \{ if \(!local\.parentStreamId\)/.test(ov), 'a session the page already had learns its parent');
  // COMING BACK (2026-10-09): every "what happened" line opens the thread that holds it
  const ui = src('frontend/app/stationui.js'), world = src('frontend/app/world.js'), auto = src('frontend/app/autosessions.js'), rt = src('frontend/app/windows/routines.js'), sc = src('frontend/app/stationcommands.js');
  A.ok(/li\.classList\.contains\('asking'\) && typeof App !== 'undefined' && App\.waitingSessionOf \? App\.waitingSessionOf\(li\.dataset\.agentId\)/.test(ui)
    && /if \(waiting && App\.openWorkstream\) \{ App\.openWorkstream\(waiting\); return; \}/.test(ui), 'a crew card that needs your OK opens where it is waiting');
  A.ok(/waitingSessionOf,/.test(app) && /\(p && p\.agentId === agentId\) \|\| railHasAgent\(w, agentId\)/.test(app), 'App finds the session an agent is waiting in');
  A.ok(/const ses = p\.runId \? \{ ws: 'cron-' \+ p\.runId \}/.test(world), 'a routine notification opens that run\'s own session');
  A.ok(/lastReadAt: existing \? undefined : 0 \}\);/.test(auto), 'a routine run that finished while the station was closed arrives unread');
  A.ok(/data-act="open-run" data-run="/.test(rt) && /act === 'open-run'/.test(rt) && /ReturnStore\.openWork\(\{ runId: btn\.dataset\.run/.test(rt), 'every routine HISTORY run opens its conversation');
  A.ok(/if \(id && parentId && Workstreams\.get\(parentId\) && Workstreams\.adopt\)/.test(sc), 'a just-filed worker thread is adopted under its parent on first contact');
}

A.report('delegated-threads.test');
})().catch(e => { console.error(e); process.exit(1); });
