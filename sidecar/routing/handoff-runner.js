/* sidecar/routing/handoff-runner.js — SEND TO at run time (2026-10-10, Andrew: "fully polish and integrate this into starnet").

   A line whose OUTBOX sends on (worldmodel setSendTo → plan.sendTo, outside the hash) hands every job it finishes CLEAN to the
   target line's INBOX. The chain runner tells this module when a job left its line clean (chain.js onShipped — every return
   point, never awaited: a chain never gates the reply); this module decides whether a hand-off may go, queues it, and starts
   the target line's OWN job on the trigger proof's path: a channel hub whose ONE resolution is scoped to the target line
   (index.js makeTriggerHub with lineId = the target), so the target's own INBOX picks the dock, the line gate accepts the
   work, and the job runs on the target line's crew under the target line's own stage / $ / day budget (chain.js reads
   lineLimits(lineId) and the day ledger by the TARGET's id — nothing of the sending line's budget carries over). Never through
   the sample route: that caps input at 2000 characters and holds the one-sample-per-station lock.

   GUARDS (each refusal is said on the target line's job record — a failed record "from LINE A", never a silent drop):
     · E-STOP (the durable automation halt) — nothing starts;
     · the target line must still be on the armed floor and reach a crewed dock, and be under its daily $ cap;
     · the sending job must really have finished: every run row of its stream since it started ended `done` (a chain hop
       treats max_iters with some text as a step that answered; a job record would call that a problem, never delivered);
     · NO CIRCLES, NO RUNAWAYS: a job's lineage (streamId -> { lines, depth }, in memory — an in-flight chain is not durable
       either) refuses a line the job already went through, and a 4th hand-off (MAX_DEPTH); the compiler warns SEND_TO_LOOP
       before any run, but the plan can be re-posted mid-run, so the run-time check stands on its own;
     · at most MAX_PENDING hand-offs wait per target line behind the one running (a burst beyond is refused), one in flight.
   Re-checked at dispatch (a waiting hand-off whose gate closed meanwhile is dropped with the reason on record).

   THE RECORDS: the target line's job is a line-jobs record of ITS line with from:{ line, jobId, name }, and the sending job is
   linked sentTo:{ line, jobId, name } — each line's result stays its own. The crate: workitem.placed { kind:'handoff',
   lineId: target, fromLine, fromOutbox, toIntake } (the frozen contract's obj() stanza allows the extra fields), so the floor
   draws the hand-off from the sending OUTBOX to the target INBOX before the job rides the target line.

   Determinism-clean: the clock and ids are injected (index.js owns timers, fs and the hub). */
'use strict';
const Pipeline = require('../../frontend/app/pipeline.js');
const { crewedDocksOnLine } = require('./trigger-runner.js');

const MAX_PENDING = 5;   // hand-offs waiting per target line behind the one in flight
const MAX_DEPTH = 4;     // the 4th hand-off of one job is refused (a job crosses at most 4 lines: A → B → C → D)
const MAX_REFUSALS = 20; // recent refusals kept for the status read

function makeHandoffRunner(deps) {
  const d = deps || {};
  const now = d.now, newId = d.newId;
  if (typeof now !== 'function' || typeof newId !== 'function') throw new Error('handoff-runner: now/newId are required');
  if (typeof d.makeHub !== 'function') throw new Error('handoff-runner: makeHub is required');
  const warn = typeof d.warn === 'function' ? d.warn : function () {};
  const emit = typeof d.emit === 'function' ? d.emit : function () {};
  const bumpQueue = typeof d.bumpQueue === 'function' ? d.bumpQueue : function () { return 0; };
  const halted = typeof d.halted === 'function' ? d.halted : function () { return false; };
  const dayCap = typeof d.dayCap === 'function' ? d.dayCap : function () { return { cap: null, spent: 0 }; };
  const runsFor = typeof d.runsFor === 'function' ? d.runsFor : function () { return []; };
  const shipsToOutbox = typeof d.shipsToOutbox === 'function' ? d.shipsToOutbox : function () { return false; };
  const planOf = typeof d.plan === 'function' ? d.plan : function () { return null; };
  const jobs = d.jobs || {};
  const J = {
    byStream: s => { try { return typeof jobs.byStream === 'function' ? jobs.byStream(s) : null; } catch (e) { warn('[handoff] job lookup: ' + ((e && e.message) || e)); return null; } },
    start: r => { try { return typeof jobs.start === 'function' ? jobs.start(r) : null; } catch (e) { warn('[handoff] job start: ' + ((e && e.message) || e)); return null; } },
    finish: (id, r) => { try { return typeof jobs.finish === 'function' ? jobs.finish(id, r) : null; } catch (e) { warn('[handoff] job finish: ' + ((e && e.message) || e)); return null; } },
    link: (id, to) => { try { return typeof jobs.link === 'function' ? jobs.link(id, to) : null; } catch (e) { warn('[handoff] job link: ' + ((e && e.message) || e)); return null; } }
  };

  const lineage = new Map();   // streamId -> { lines:[lineId…], depth } — the lines a job's work has been through
  const live = new Map();      // target lineId -> { queue:[], busy, hub, current }
  const refused = [];          // [{ at, fromLine, toLine, error }] newest last

  const lineRec = (plan, id) => ((plan && Array.isArray(plan.lines)) ? plan.lines : []).find(l => l && String(l.lineId) === String(id)) || null;
  const nameOf = (plan, id) => { const l = lineRec(plan, id); return (l && typeof l.name === 'string') ? l.name : ''; };
  const say = (plan, id) => { const n = nameOf(plan, id); return n ? 'LINE ' + n.toUpperCase() : 'the next line'; };
  function stateOf(line) {
    let s = live.get(line);
    if (!s) { s = { queue: [], busy: false, hub: null, current: null }; live.set(line, s); }
    return s;
  }
  const newJobId = () => 'job-' + String(newId()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12).padEnd(8, '0');
  const newStream = () => 'handoff-' + String(newId()).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);

  /* can the TARGET line take work right now? (no side effects) — the trigger preflight's questions, asked of the target */
  function preflight(plan, toLine) {
    if (halted()) return 'automation is stopped (E-STOP) — nothing was sent on';
    if (!plan) return 'no work line is armed';
    if (!lineRec(plan, toLine)) return 'the line it sends to is no longer on the floor — set its SEND TO again';
    if (!crewedDocksOnLine(plan, toLine).length) return say(plan, toLine) + ' routes work to no crewed dock — assign an agent to its first step';
    let cap = null;
    try { cap = dayCap(toLine); } catch (e) { cap = null; warn('[handoff] day-cap read failed: ' + ((e && e.message) || e)); }
    if (cap && typeof cap.cap === 'number' && cap.cap > 0 && (cap.spent || 0) >= cap.cap) return say(plan, toLine) + ' reached its $' + cap.cap.toFixed(2) + ' daily limit';
    return null;
  }

  /* a refusal is SAID on the target line: a failed job record "from LINE A" with the reason, linked from the sending job */
  function refuse(item, why) {
    const at = now(), plan = planOf();
    refused.push({ at, fromLine: item.fromLine, toLine: item.toLine, error: why });
    if (refused.length > MAX_REFUSALS) refused.shift();
    const yj = J.start({ id: newJobId(), line: item.toLine, name: nameOf(plan, item.toLine) || item.toName, text: item.input, streamId: '', at,
      from: { line: item.fromLine, jobId: item.fromJobId, name: item.fromName } });
    if (yj) {
      J.finish(yj.id, { at, status: 'failed', usd: 0, output: '', runs: [], error: 'not sent on: ' + why });
      if (item.fromJobId) J.link(item.fromJobId, { line: item.toLine, jobId: yj.id, name: item.toName });
    }
    warn('[handoff] ' + item.fromLine + ' → ' + item.toLine + ' refused: ' + why);
    return { ok: false, error: why, jobId: yj ? yj.id : null };
  }

  /* onShipped(rec) — the chain runner's hook (chain.js): a job left line rec.lineId clean at a stage that ships to the OUTBOX.
     Decides synchronously whether a hand-off may go and queues it; the target line's job is pumped on its own. */
  function onShipped(rec) {
    const r = rec || {};
    if (!r.lineId) return { ok: false, code: 'none' };
    const plan = planOf();
    // the OUTBOX the job landed in (the chain's terminal walk) decides — a line with two OUTBOXes hands on only from the one that sends
    const st = plan ? Pipeline.sendToOf(plan, r.lineId, r.dockId, r.outboxId) : null;
    if (!st) return { ok: false, code: 'none' };   // this line sends nowhere (the common case)
    const from = (r.streamId && lineage.get(String(r.streamId))) || { lines: [String(r.lineId)], depth: 0 };
    const lines = from.lines.indexOf(String(r.lineId)) >= 0 ? from.lines.slice() : from.lines.concat([String(r.lineId)]);
    const fromJob = r.streamId ? J.byStream(String(r.streamId)) : null;
    const item = {
      rec: r, fromLine: String(r.lineId), toLine: st.toLine, fromOutbox: st.outboxId, toIntake: st.intakeId,
      fromName: nameOf(plan, r.lineId), toName: nameOf(plan, st.toLine), fromJobId: fromJob ? fromJob.id : null,
      lines, depth: from.depth + 1, at: now(), files: [], input: ''
    };
    item.input = Pipeline.handoffInput({ fromName: item.fromName, original: r.originalText, output: r.text, files: [] });
    if (lines.indexOf(st.toLine) >= 0) return refuse(item, 'this job already went through ' + say(plan, st.toLine) + ' — sending it on again would send it round in a circle');
    if (item.depth >= MAX_DEPTH) return refuse(item, 'this job has already been handed on ' + from.depth + ' times — a job crosses at most ' + MAX_DEPTH + ' lines');
    const pf = preflight(plan, st.toLine);
    if (pf) return refuse(item, pf);
    const s = stateOf(st.toLine);
    if (s.queue.length >= MAX_PENDING) return refuse(item, say(plan, st.toLine) + ' already has ' + s.queue.length + ' hand-offs waiting behind the one running');
    s.queue.push(item);
    const position = s.queue.length + (s.busy ? 1 : 0);
    pump(st.toLine);
    return { ok: true, queued: position, toLine: st.toLine };
  }

  function pump(line) {
    const s = stateOf(line);
    if (s.busy || !s.queue.length) return;
    const item = s.queue.shift();
    s.busy = true;
    Promise.resolve().then(() => dispatch(item, s)).catch(e => {
      refused.push({ at: now(), fromLine: item.fromLine, toLine: item.toLine, error: 'dispatch failed: ' + ((e && e.message) || e) });
      if (refused.length > MAX_REFUSALS) refused.shift();
      warn('[handoff] dispatch failed: ' + ((e && e.message) || e));
    }).then(() => { s.busy = false; s.current = null; pump(line); });
  }

  function hubFor(line, s) {
    if (s.hub) return s.hub;
    s.hub = d.makeHub({
      lineId: () => line,
      onRouted: (r) => { if (s.current) s.current.routed = r || null; return r; },
      entryAllowed: (agentId) => !!(s.current && s.current.routed && s.current.routed.agentId === agentId),
      onResolved: (info) => { if (s.current && !s.current.resolved) s.current.resolved = info; },
      onLineOutcome: (info) => { if (s.current) s.current.lineOutcome = info; },
      streamId: () => (s.current && s.current.streamId) || undefined,
      turns: (agentId) => { if (!s.current) return []; const k = String(agentId || ''); return s.current.turns[k] || (s.current.turns[k] = []); },
      send: (text) => { if (s.current) { s.current.replies.push(String(text == null ? '' : text)); if (s.current.replies.length > 20) s.current.replies.shift(); } }
    });
    return s.hub;
  }

  // the sending job's own run rows (its stream, since its entry run started): did every step end `done`? + the files it made
  function sendingRuns(rec) {
    if (!rec.streamId) return { known: false, rows: [] };
    let rows = [];
    try { rows = (runsFor(String(rec.streamId)) || []).filter(x => x && String(x.streamId || rec.streamId) === String(rec.streamId)); }
    catch (e) { warn('[handoff] run read-back failed: ' + ((e && e.message) || e)); return { known: false, rows: [] }; }
    if (typeof rec.since === 'number') rows = rows.filter(x => typeof x.startedAt !== 'number' || x.startedAt >= rec.since - 1);
    return { known: true, rows };
  }

  async function dispatch(item, s) {
    // THE GATES AGAIN AT DISPATCH: the item may have waited; E-STOP, the cap, the floor or the SEND TO itself may have changed
    const plan = planOf();
    const still = plan ? Pipeline.sendToOf(plan, item.fromLine, item.rec.dockId, item.fromOutbox) : null;
    if (!still || still.toLine !== item.toLine) return refuse(item, 'the SEND TO changed before the hand-off ran');
    const pf = preflight(plan, item.toLine);
    if (pf) return refuse(item, pf);
    const sr = sendingRuns(item.rec);
    if (sr.known && sr.rows.some(x => x.reason !== 'done')) {
      const bad = sr.rows.find(x => x.reason !== 'done');
      return refuse(item, say(plan, item.fromLine) + '’s job did not finish cleanly (a step ended “' + (bad.reason || 'unknown') + '”)');
    }
    const files = [];
    for (const x of sr.rows) for (const a of (Array.isArray(x.artifacts) ? x.artifacts : [])) if (a && a.path && files.indexOf(String(a.path)) < 0) files.push(String(a.path));
    const input = Pipeline.handoffInput({ fromName: item.fromName, original: item.rec.originalText, output: item.rec.text, files });

    const startedAt = now(), streamId = newStream();
    lineage.set(streamId, { lines: item.lines.concat([item.toLine]), depth: item.depth });
    if (lineage.size > 500) lineage.delete(lineage.keys().next().value);
    const yj = J.start({ id: newJobId(), line: item.toLine, name: nameOf(plan, item.toLine) || item.toName, text: input, streamId, at: startedAt,
      from: { line: item.fromLine, jobId: item.fromJobId, name: item.fromName } });
    if (yj && item.fromJobId) J.link(item.fromJobId, { line: item.toLine, jobId: yj.id, name: item.toName });

    s.current = { streamId, routed: null, resolved: null, lineOutcome: null, replies: [], turns: {} };
    const hub = hubFor(item.toLine, s);
    const settled = Promise.resolve(hub.onInbound({ chatId: 'hof-' + item.toLine, userId: 'handoff', text: input, chatType: 'dm' }))
      .catch(e => ({ error: (e && e.message) || String(e) }));
    // resolution lands in onInbound's first synchronous slice (the one-resolver law); the crate follows it
    const info = s.current.resolved;
    let workitemId = '', agentId = '';
    if (info && info.agentId && s.current.routed && s.current.routed.agentId === info.agentId) {
      agentId = String(info.agentId);
      workitemId = String(newId());
      const depth = bumpQueue(agentId, +1);
      emit('workitem.placed', { workitemId, queueId: agentId, agentId, kind: 'handoff', lineId: info.lineId || item.toLine, dockId: info.dockId || undefined,
        fromLine: item.fromLine, fromOutbox: item.fromOutbox, toIntake: item.toIntake, preview: ('FROM ' + (item.fromName ? 'LINE ' + item.fromName.toUpperCase() : 'ANOTHER LINE')).slice(0, 40), queueDepth: depth, ts: startedAt });
      emit('queue.status', { queueId: agentId, depth, maxCapacity: d.queueCap || 64, nextAdvanceAt: 0 });
    }
    const threw = await settled;
    let runs = [];
    try { runs = (runsFor(streamId) || []).filter(x => x && String(x.streamId || streamId) === streamId); } catch (e) { runs = []; warn('[handoff] run read-back failed: ' + ((e && e.message) || e)); }
    const lo = s.current.lineOutcome;
    const onLine = !!(info && String(info.lineId || '') === String(item.toLine));
    const allDone = runs.length > 0 && runs.every(x => x.reason === 'done');
    const ships = !!(lo && !lo.stopped && shipsToOutbox(lo.agentId, lo.dockId));
    const completed = onLine && allDone && ships;
    const usd = runs.reduce((a, x) => a + ((typeof x.usd === 'number' && isFinite(x.usd)) ? x.usd : 0), 0);
    if (workitemId) {
      const dep = bumpQueue(agentId, -1);
      if (completed) emit('workitem.delivered', { workitemId, finalQueueId: 'outbox', agentId, box: '', ms: now() - startedAt, ts: now() });
      emit('queue.status', { queueId: agentId, depth: dep, maxCapacity: d.queueCap || 64, nextAdvanceAt: 0 });
    }
    let err = '';
    if (!completed) {
      if (threw && threw.error) err = 'the line failed: ' + threw.error;
      else if (!info || !info.agentId || !s.current.routed || s.current.routed.agentId !== info.agentId) err = 'the line routed this work to no dock';
      else if (!onLine) err = 'the work did not enter through this line';
      else if (!runs.length) err = 'no step ran';
      else if (!allDone) err = 'a step did not finish cleanly';
      else if (lo && lo.stopped) err = 'the line stopped early: ' + lo.stopped;
      else err = 'the line did not reach its OUTBOX';
    }
    if (yj) J.finish(yj.id, { at: now(), usd, output: s.current.replies.join(''), status: completed ? 'delivered' : runs.length ? 'problem' : 'failed', error: err,
      runs: runs.map(x => ({ runId: x.runId, agentId: x.agentId, dockId: x.dockId || null, reason: x.reason, usd: x.usd })) });
    return { ok: completed, streamId, jobId: yj ? yj.id : null, runs: runs.length, usd, error: err || null };
  }

  /* E-STOP: drop every waiting hand-off; the host kills the in-flight runs through the hubs' inflight maps. */
  function haltAll() { let n = 0; for (const s of live.values()) { n += s.queue.length; s.queue.length = 0; } return n; }
  function inflights() { const out = []; for (const s of live.values()) if (s.hub && s.hub._internals && s.hub._internals.inflight) out.push(s.hub._internals.inflight); return out; }
  function status() {
    const lines = [];
    for (const [line, s] of live) lines.push({ line, queued: s.queue.length, running: !!s.busy, streamId: (s.current && s.current.streamId) || null });
    return { lines, refused: refused.slice().reverse() };
  }

  return { onShipped, haltAll, inflights, status, _internals: { dispatch, live, lineage, MAX_PENDING, MAX_DEPTH } };
}

module.exports = { makeHandoffRunner, MAX_PENDING, MAX_DEPTH };
