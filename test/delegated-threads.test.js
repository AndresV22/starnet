/* node test/delegated-threads.test.js — DELEGATED WORK, VERSION B (2026-10-11: a blind usability test picked one place —
   the conversation you asked in — over worker threads in SESSIONS and over workers posting into the chat).

   1. GENUINE: Workstreams hides a delegated worker's thread from every session list, re-homes anything that opens it to
      its conversation, finds its words as that conversation's hit, deletes it with its conversation, and keeps the
      worker mark across a save (a session the agent opened itself is never hidden).
   2. GENUINE: team.dispatch files every coordinator worker in its own (hidden) thread under the conversation that asked
      (orchestration.js fileUnderThreads) — best-effort, never blocking the work.
   3. GENUINE: Delegated.stateOf / lineHtml / foldReceipt — the card's rows read the ledger, the live channel and the
      worker's EXACT ask (stamped by the sidecar, never matched by agent id); See work folds the worker run's own record
      and transcript into its receipt.
   4. SOURCE-LOCKED wiring: the rail no longer folds workers, the card mounts on Chat.load, worker asks are answered from
      the card through the approval card's own path, and the lead prompt states the filing rule.

   OUT OF HEADLESS SCOPE (proven live on a scripted-model station, dev/delegation-preview.cjs): the card in COMMS, See
   work unfolding a real receipt, Stop, a worker approval answered from its row. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const W = require('../frontend/app/workstreams.js');
const { makeOrchestrationTools } = require('../sidecar/tools/builtin/orchestration.js');

(async () => {

/* ---- 1. a worker's thread is storage, never a session you go to ---- */
{
  W.init({ generalId: 'home', activeId: 'w1', workstreams: [
    { id: 'home', title: null, agentId: 'agent', history: [{ role: 'user', content: 'Get the launch ready' }] },
    { id: 'w1', title: 'Scan competitors', agentId: 'researcher', parentStreamId: 'home', worker: true, history: [{ role: 'assistant', content: 'Two rivals undercut our entry tier by $5' }] },
    { id: 'made', title: 'Marketing plan', agentId: 'agent', parentStreamId: 'home', history: [] },
    { id: 'orphan', title: 'Lost work', agentId: 'writer', parentStreamId: 'gone', worker: true, history: [] }
  ] });
  A.eq(W.activeId(), 'home', 'a station saved while a worker\'s thread was open boots into its conversation');
  const ids = W.list().map(w => w.id);
  A.ok(!ids.includes('w1') && ids.includes('made') && ids.includes('orphan'), 'session lists hide a worker\'s thread; a session the agent opened, and a worker whose conversation is gone, stay');
  A.ok(W.list({ includeWorkers: true }).some(w => w.id === 'w1'), 'the delegation card asks for workers explicitly');
  A.eq(W.homeOf('w1') + '|' + W.homeOf('made'), 'home|made', 'opening a worker lands on its conversation; anything else opens itself');
  A.ok(W.isHidden('w1') && !W.isHidden('orphan') && !W.isHidden('made'), 'isHidden: a worker with its conversation present');
  const hit = W.search('undercut');
  A.eq(hit.length + '|' + hit[0].id + '|' + hit[0].match + '|' + hit[0].workerId, '1|home|delegated|w1', 'a worker\'s words are found as its conversation\'s hit, naming whose work it was');
  A.eq(W.search('Scan competitors').length, 0, 'a worker\'s title is never a hit of its own');
  W.init(JSON.parse(JSON.stringify(W.serialize())));
  A.eq(String(W.get('w1').worker) + '/' + String(W.get('made').worker), 'true/false', 'the worker mark survives a save and reload; an old saved session reads as not-a-worker');
  W.removeByAgent('researcher');
  A.ok(!!W.get('w1'), 'deleting an agent keeps its delegated work (it is the conversation\'s record)');
  W.create('Side chat'); const side = W.activeId();
  W.init(Object.assign(JSON.parse(JSON.stringify(W.serialize())), {}));
  W.adopt({ id: 'w9', title: 'Draft email', agentId: 'writer', parentStreamId: side, worker: true });
  W.del(side);
  A.ok(!W.get('w9') && W.isDeleted('w9'), 'deleting a conversation deletes its workers\' threads with it (never unreachable leftovers)');
  W.init({});
}

/* ---- 2. every coordinator worker gets its own (hidden) thread ---- */
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
  ] }, { agentId: 'agent', streamId: 'home', runId: 'lead1', projectRoot: '/projects/launch' });
  A.eq(made.length, 2, 'one thread per worker');
  A.eq(made[0].parentStreamId, 'home', 'filed under the conversation that delegated it');
  A.eq(made[0].agentId, 'researcher', 'bound to the worker');
  A.ok(/^lead1:[^:]+:0$/.test(made[0].requestId), 'idempotent per lead run + dispatch call + worker slot');
  A.eq(made[0].requestId.split(':')[1], made[1].requestId.split(':')[1], 'one call id for every worker of a dispatch');
  A.ok(/:1$/.test(made[1].requestId), 'the slot is the last segment');
  A.eq(made[0].projectRoot, '/projects/launch', 'a project conversation worker thread keeps the project it was dispatched under');
  A.eq(made[0].title, 'Scan our four closest competitors and their ent…', 'titled from the first line, clipped');
  A.eq(made[1].title, 'Write the launch email', 'a short task keeps its own words');
  const before = made[0].requestId;
  await dispatchTool.run({ workers: [{ agentId: 'researcher', prompt: 'Again.' }] }, { agentId: 'agent', streamId: 'home', runId: 'lead1' });
  A.ok(made[2].requestId !== before && /^lead1:/.test(made[2].requestId), 'a second dispatch in the same lead run gets new threads, never the first one\'s');
  A.eq(ro.calls[0].streamId, 'thread_1', 'the worker runs (and is filed) in its own thread');
  A.eq(ro.calls[0].sessionTitle, made[0].title, 'with that thread\'s title');
  A.eq(ro.calls[1].streamId, 'thread_2', 'every worker, not just the first');
  A.eq(ro.calls[2].streamId, 'thread_3', 'and the second dispatch runs in its own new thread');
}
{
  const ro = fakeRunOnce(); let asked = 0;
  const { dispatchTool } = makeOrchestrationTools({ runOnce: ro, roster: () => roster, key: 'k', model: 'm', newId: counter(), coordinateResults: true, childThread: () => { asked++; throw new Error('no such session'); } });
  const res = await dispatchTool.run({ workers: [{ agentId: 'researcher', prompt: 'find X' }] }, { agentId: 'agent', streamId: 'home', runId: 'lead2' });
  A.eq(asked, 1, 'a thread was asked for');
  A.eq(ro.calls.length, 1, 'a thread that cannot be created never blocks the work');
  A.eq(ro.calls[0].streamId, undefined, 'the worker runs exactly as before (in the lead stream)');
  A.ok(/its own thread could not be created \(no such session\)/.test(JSON.stringify(res)), 'and the lead is told where it ran and why');
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

/* ---- 3. the card: row state, the worker's exact ask, the receipt ---- */
{
  const busy = new Set(), pend = new Map(), runOf = new Map();
  global.Channels = { pendingOf: id => (pend.get(id) || [])[0] || null, pendingAllOf: id => pend.get(id) || [], isBusy: id => busy.has(id), elapsedOf: () => 65000, runIdOf: id => runOf.get(id) || '' };
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
  const stale = { ws: ws({ runIds: ['r1', 'r2'], lastRunReason: 'done' }), worker: { status: 'done', reason: 'budget', runId: 'r1' } };
  A.eq(st(stale).cls, 'done', 'an older capped ledger run cannot override the newer completed run');
  A.eq(D._internals.workerRunOf(stale), 'r2', 'the receipt follows the newer recorded run');
  busy.add('k'); runOf.set('k', 'r3'); stale.worker.status = 'running'; stale.worker.canInterrupt = true;
  A.ok(st(stale).cls === 'working' && !st(stale).stop, 'an old running ledger cannot offer Stop for a newer live run');
  A.eq(D._internals.workerRunOf(stale), 'r3', 'the receipt follows the current live run ahead of polling');
  busy.delete('k'); runOf.delete('k');
  // a worker's ask rides the lead's channel stamped with the worker that asked: matched EXACTLY, never by agent id
  pend.set('home', [{ promptId: 'p1', tool: 'fs.write', agentId: 'agent', workerStreamId: 'k1', workerRunId: 'r1', workerAgentId: 'researcher' }]);
  A.eq(st({ ws: ws({ id: 'k1', agentId: 'researcher' }), worker: { status: 'running', startedAt: Date.now(), id: 'w1', runId: 'r1' } }).cls, 'waiting', 'the worker that asked reads as waiting on you');
  A.eq(st({ ws: ws({ id: 'k2', agentId: 'researcher' }), worker: { status: 'running', startedAt: Date.now(), id: 'w2', runId: 'r2' } }).cls, 'working', 'a crewmate of the same agent does not (the stamp names the run)');
  pend.set('home', [{ promptId: 'p2', tool: 'fs.write', agentId: 'agent', workerAgentId: 'researcher' }]);
  A.eq(st({ ws: ws({ id: 'k1', agentId: 'researcher' }), worker: { status: 'running', startedAt: Date.now(), id: 'w1', runId: 'r1' } }).cls, 'working', 'an ask with no worker stamp is never pinned on a row by agent id');
  pend.set('home', [{ promptId: 'p3', tool: 'fs.write', agentId: 'agent', workerRunId: 'r7' }, { promptId: 'p4', tool: 'web.request', agentId: 'agent', workerRunId: 'r8' }]);
  A.eq(D._internals.askOf({ ws: ws({ id: 'k8' }), worker: { runId: 'r8' } }, 'home').promptId, 'p4', 'two workers asking at once each find their own ask');
  // the live permission.prompt event and the copy Channels stores are DIFFERENT objects for one ask: the card must still
  // claim it (live drive 10-11: an identity check missed it, so COMMS drew a second approval card and toasted the lead)
  {
    const stored = { promptId: 'p6', tool: 'fs.write', agentId: 'agent', workerStreamId: 'k6', workerAgentId: 'writer' };
    pend.set('home', [stored]);
    global.Workstreams = { activeId: () => 'home', list: () => [ws({ id: 'k6', agentId: 'writer', worker: true, parentStreamId: 'home', createdAt: 1 })] };
    A.ok(D.hosts({ ...stored }), 'a worker\'s ask is hosted on its card row even when the event is not the stored object');
    A.ok(!D.hosts({ ...stored, promptId: 'p7' }), 'and a different ask is not');
    A.ok(!D.hosts({ promptId: 'p6', tool: 'fs.write' }), 'an unstamped (lead\'s own) ask is never hosted on the card');
    delete global.Workstreams;
  }
  pend.clear(); pend.set('k', [{ tool: 'brief.ask' }]);
  A.eq(st({ ws: ws(), worker: { status: 'running', startedAt: Date.now() } }).cls, 'waiting', 'an ask on the worker\'s own thread outranks working');
  pend.clear(); busy.add('k');
  A.eq(st({ ws: ws(), worker: null }).cls + '|' + st({ ws: ws(), worker: null }).t, 'working|1:05', 'a foreground worker is working while its thread channel is live');
  busy.clear();
  A.eq(st({ ws: ws({ runIds: ['r9'], lastRunReason: 'done' }), worker: null }).cls, 'done', 'a confirmed completed foreground worker is done');
  A.eq(st({ ws: ws({ runIds: ['r9'] }), worker: null }).cls, 'recorded', 'a legacy delivery with unknown terminal reason is never claimed complete');
  for (const reason of ['budget', 'max_iters', 'aborted']) A.eq(st({ ws: ws({ runIds: ['r9'], lastRunReason: reason }), worker: null }).cls, 'stopped', reason + ' is unfinished even with partial output');
  busy.add('home'); runOf.set('home', 'lead1');
  A.eq(st({ ws: ws(), worker: null }).live, 'starting', 'before delivery, while the lead run that dispatched it is still live: starting');
  busy.clear();
  A.eq(st({ ws: ws(), worker: null }).live, 'ended without a result', 'after the lead run ended with nothing delivered: never "done"');
  // OPEN WHILE IT RUNS: who has what + stop without a click until every worker settles; settled rows offer See work
  const L = D._internals;
  global.App = { agentName: id => ({ researcher: 'MIRA', writer: 'VEX' })[id] || id };
  const running = { lead: 'b1', rows: [{ ws: ws({ id: 'k1', agentId: 'researcher', title: 'Scan competitors' }), worker: { status: 'running', startedAt: Date.now(), canInterrupt: true, id: 'w1', runId: 'r1' } },
    { ws: ws({ id: 'k2', agentId: 'writer', title: 'Write the email (3)', runIds: ['r2'] }), worker: { status: 'done', startedAt: 1000, completedAt: 5000 } }] };
  const live = L.lineHtml(running, 'home');
  A.ok(/aria-expanded="true"/.test(live) && /dg-li-task"[^>]*>Scan competitors/.test(live) && /data-dg-stop="w1"/.test(live), 'a running dispatch shows each worker, its task and Stop without a click');
  A.ok(/data-dg-see="k2"/.test(live) && /dg-li-task"[^>]*>Write the email</.test(live), 'a finished worker offers See work (and its task loses the thread\'s "(3)")');
  A.ok(!/data-dg-open/.test(live), 'nothing on the card opens a worker\'s thread: its work unfolds in place');
  const settled = L.lineHtml({ lead: 'b2', rows: [running.rows[1]] }, 'home');
  A.ok(/aria-expanded="false"/.test(settled) && !/dg-line-list/.test(settled), 'once every worker settles it folds to the one line');
  L.closed.add('b1');
  A.ok(/aria-expanded="false"/.test(L.lineHtml(running, 'home')), 'the Commander folding a running dispatch is respected');
  pend.set('home', [{ promptId: 'p5', tool: 'fs.write', agentId: 'agent', workerStreamId: 'k1' }]);
  const asking = L.lineHtml(running, 'home');
  A.ok(/aria-expanded="true"/.test(asking) && /data-dg-consent="once" data-dg-ws="k1"/.test(asking) && /data-dg-consent="deny" data-dg-ws="k1"/.test(asking), 'a worker waiting on you shows even folded, with Approve and Deny on its row');
  A.ok(!/data-dg-consent="(always|full|session)"/.test(asking), 'a worker row never offers a lead- or station-wide grant');
  pend.set('home', [{ promptId: 'question-1', tool: 'brief.ask', agentId: 'agent', workerStreamId: 'k1', argsSummary: JSON.stringify({ question: 'Which palette?', options: ['Blue', 'Green'] }) }]);
  const question = L.lineHtml(running, 'home');
  A.ok(/data-dg-question="question-1"[^>]*>Answer/.test(question), 'a delegated question links to its exact question card');
  A.ok(!/data-dg-consent=/.test(question), 'a question never offers approval grades that would discard its answer');
  let click = null, focused = 0, scrolled = 0;
  global.document = { addEventListener: (name, fn) => { if (name === 'click') click = fn; }, getElementById: () => null };
  D.presentFor(); // wire the real delegation click handler without creating a second rendered card
  const exact = { dataset: { clarifyPrompt: 'question-1' }, scrollIntoView: () => scrolled++, focus: () => focused++ };
  const unrelated = { dataset: { clarifyPrompt: 'question-2' }, scrollIntoView: () => { throw new Error('wrong question'); } };
  global.document.getElementById = () => ({ querySelectorAll: () => [unrelated, exact] });
  const answerKey = { dataset: { dgQuestion: 'question-1' } };
  click({ target: { closest: selector => selector === '#chat-log [data-dg-question]' ? answerKey : null }, preventDefault() {} });
  A.eq([scrolled, focused], [1, 1], 'Answer focuses only the exact existing question card and does not submit an approval');
  global.document = undefined;
  pend.clear(); L.closed.clear(); L.opened.add('b2');
  A.ok(/aria-expanded="true"/.test(L.lineHtml({ lead: 'b2', rows: [running.rows[1]] }, 'home')), 'and opening a settled one too');
  L.seen.add('k2'); L.receipts.set('k2', { status: 'loading', at: Date.now() });
  A.ok(/Loading VEX's work/.test(L.lineHtml({ lead: 'b2', rows: [running.rows[1]] }, 'home')), 'See work says it is loading, never an empty receipt');
  L.opened.clear(); L.seen.clear(); L.receipts.clear(); delete global.App;
  delete global.Channels; delete global.document;
  // the receipt: the worker run's own record + transcript, nothing invented
  global.DeskScreen = { parseScreens: require('../frontend/app/deskscreen.js')._parseScreens || require('../frontend/app/deskscreen.js').parseScreens };
  const turns = [
    { role: 'assistant', toolCalls: JSON.stringify([{ id: 'c1', function: { name: 'web_search', arguments: JSON.stringify({ query: 'closest competitors pricing' }) } }, { id: 'c2', function: { name: 'web_fetch', arguments: JSON.stringify({ url: 'https://www.acme.com/pricing/' }) } }]) },
    { role: 'tool', toolCallId: 'c1', content: '4 results' }, { role: 'tool', toolCallId: 'c2', content: 'ERROR: blocked' },
    { role: 'assistant', toolCalls: JSON.stringify([{ id: 'c3', function: { name: 'fs_write', arguments: JSON.stringify({ path: 'competitors.md', content: 'x' }) } }]) },
    { role: 'tool', toolCallId: 'c3', content: 'wrote 1 KB' },
    { role: 'assistant', content: 'Scanned 4 competitors. Two undercut us.' }
  ];
  const row = { runId: 'r1', agentId: 'researcher', deliveryText: 'Scanned 4 competitors. Two undercut us.', durationMs: 41000, usd: 0.031, projectRoot: '',
    artifacts: [{ path: 'competitors.md', kind: 'file' }, { kind: 'message', target: 'email' }] };
  const rec = L.foldReceipt(row, turns);
  A.eq(rec.answer, 'Scanned 4 competitors. Two undercut us.', 'the answer is the one it delivered');
  A.eq(rec.steps.map(s => s.verb + ':' + s.arg + ':' + s.ok).join(' | '), 'searched:closest competitors pricing:true | opened:acme.com/pricing:false | wrote:competitors.md:true', 'every step it took, in words, failures marked');
  A.eq(rec.sites.map(s => s.host).join(',') + '|' + rec.searches.join(','), 'acme.com|closest competitors pricing', 'the sites it opened and what it searched for');
  A.eq(rec.files.map(f => f.name + '@' + f.agentId).join(','), 'competitors.md@researcher', 'the files it saved, opened from the WORKER\'s workspace (a sent message is not a file)');
  A.eq(rec.ms + '|' + rec.cost, '41000|$0.03', 'its own time and cost');
  A.eq(L.foldReceipt({ ...row, unmetered: true }, []).cost, 'subscription', 'a subscription run never shows a fake price');
  A.eq(L.foldReceipt(null, turns).live, true, 'no run record yet = still working (never "no work")');
  delete global.DeskScreen;
}

/* ---- 4. wiring ---- */
{
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const app = src('frontend/app/app.js'), chat = src('frontend/app/chat.js'), html = src('frontend/index.html'), idx = src('sidecar/index.js'), ov = src('frontend/app/overseer.js');
  const dg = src('frontend/app/delegated.js'), sc = src('frontend/app/stationcommands.js'), rs = src('frontend/app/returnstore.js');
  A.ok(!/nestRows|railKidsChip|ws-child/.test(app), 'SESSIONS never folds or counts workers\' threads (they are not sessions)');
  A.ok(/const home = Workstreams\.homeOf \? Workstreams\.homeOf\(id\) : id;\s*\n\s*if \(home !== id\) \{ switchWorkstream\(home\); if \(typeof Delegated !== 'undefined' && Delegated\.reveal\) Delegated\.reveal\(id\); return; \}/.test(app),
    'opening a worker\'s thread from anywhere lands on its conversation with its work unfolded');
  A.ok(/x\.status === 'running' && x\.parentStreamId === w\.id/.test(app), 'a conversation whose crew is still working says so on its own lamp');
  A.ok(/title, worker: true \}\);/.test(idx) && /parentStreamId: t\.worker \? \(t\.parentStreamId \|\| ''\) : ''/.test(idx), 'the delegating run marks its threads as workers, and only those are briefed as delegated work');
  A.ok(/includeArchived: true, includeWorkers: true \}\)\.filter\(w => w && w\.worker === true && w\.parentStreamId === parentId\)/.test(dg), 'the card is the one place that reads workers\' threads');
  A.ok(/parentStreamId: parentId, worker: true,/.test(sc) && /if \(prompt && !ws\.worker\) ws\.history\.push\(/.test(sc) && /markUnread && !ws\.worker/.test(sc), 'a worker adopted on first delivery is marked a worker, never unread on its own');
  A.ok(/Workstreams\.isHidden && Workstreams\.isHidden\(w\)\) \|\| filed/.test(rs), 'a deliverable\'s "open conversation" never adopts a worker\'s thread as a session');
  A.ok(/overseer\.threads\(\)\.filter\(w => w\.worker !== true\)\.map/.test(idx), 'the lead\'s session list never offers a worker\'s thread');
  A.ok(/workerThreadIds: \(\) =>/.test(idx) && /workers\.has\(r\.streamId\)/.test(src('sidecar/remote/host.js')), 'nor does the phone');
  A.ok(/Delegated\.presentFor\(activeWs\.id\)/.test(chat), 'Chat.load mounts the card');
  A.ok(html.indexOf('app/overseer.js') >= 0 && html.indexOf('app/delegated.js') > 0, 'the page loads the card module');
  A.ok(/agentId: w\.agentId, parentRunId: w\.parentRunId \|\| '', generation: w\.generation/.test(idx), 'the overseer route carries the card\'s fields');
  A.ok(/each worker\\'s work is filed on this conversation\\'s card/.test(idx), 'the lead prompt states the filing rule');
  A.ok(/childThread: require\('\.\/overseer\.js'\)\.isCoordinatorRun/.test(idx), 'only coordinator runs file child threads');
  A.ok(/for \(let n = 1; n <= 99; n\+\+\)/.test(idx) && /return make\(a\.title \+ ' · ' \+ new Date\(\)\.toISOString\(\)/.test(idx), 'the same ask delegated again and again never runs out of thread titles');
  A.ok(/if \(!local\.parentStreamId\) \{ local\.parentStreamId = String\(row\.parentStreamId\); adopted = true; \}/.test(ov) && /if \(!local\.projectRoot && row\.projectRoot\)/.test(ov), 'a thread the page already had learns its parent and project');
  A.ok(/Chat\.answerConsent\(p, Workstreams\.get\(Workstreams\.activeId\(\)\), decision === 'deny' \? 'deny' : 'once'\)/.test(dg), 'a worker\'s ask is answered from its row through the approval card\'s own path, once or deny only');
  A.ok(/Chat\.renderProse\(el, text, \{ files:/.test(dg), 'a worker\'s answer renders through the safe prose renderer, never raw HTML');
  A.ok(/function openFile\(path, agentId, projectRoot\)/.test(chat) && /openFile, answerConsent, consentPhrase: actionPhrase,/.test(chat), 'a receipt\'s files open through the same doors as a COMMS file row');
  // COMING BACK (2026-10-09): every "what happened" line opens the conversation that holds it
  const ui = src('frontend/app/stationui.js'), world = src('frontend/app/world.js'), auto = src('frontend/app/autosessions.js'), rt = src('frontend/app/windows/routines.js');
  A.ok(/li\.classList\.contains\('asking'\) && typeof App !== 'undefined' && App\.waitingSessionOf \? App\.waitingSessionOf\(li\.dataset\.agentId\)/.test(ui), 'a crew card that needs your OK opens where it is waiting');
  A.ok(/const ses = p\.runId \? \{ ws: 'cron-' \+ p\.runId \}/.test(world), 'a routine notification opens that run\'s own session');
  A.ok(/lastReadAt: existing \? undefined : 0 \}\);/.test(auto), 'a routine run that finished while the station was closed arrives unread');
  A.ok(/data-act="open-run" data-run="/.test(rt) && /ReturnStore\.openWork\(\{ runId: btn\.dataset\.run/.test(rt), 'every routine HISTORY run opens its conversation');
  A.ok(/if \(runs\.has\(r\.runId\) \|\| transcriptLiveRuns\.has\(r\.runId\)\) return false;/.test(idx.slice(idx.indexOf('function serveRunRecoveries'))), 'live runs are not recoverable');
  const bf = src('frontend/app/briefing.js');
  A.ok(/else if \(it\.kind === 'delegated'\) \{ open = it\.open;/.test(bf) && !/bf-card|bf-replaced/.test(bf), 'the away report offers delegated work as a chip into its conversation, never a separate card');
  const convo = src('frontend/css/comms-convo.css');
  A.ok(/\.cmsg\.user\.brief \{ align-self: flex-start; \}/.test(convo), 'a worker\'s brief (in its stored thread) sits on the agent side');
}

A.report('delegated-threads.test');
})().catch(e => { console.error(e); process.exit(1); });
