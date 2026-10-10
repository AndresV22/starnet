'use strict';

// Durable ownership of delegated threads and their return-to-parent review queue.
// Existing conversations remain owned by the save store; newly delegated threads
// are adopted by the page using their stable IDs. No credentials are persisted.
const { makeDomainStore } = require('./domain-store.js');

function isCoordinatorRun(o) {
  return o.agentId === 'agent' && !o.internal && !o.floorless
    && ((o.surface === 'interactive' && o.lead === true) || o.syntheticTrigger === true);
}

function makeOverseer(deps) {
  const store = makeDomainStore({ fs: deps.fs, path: deps.path, file: deps.file, writeDurable: deps.writeDurable,
    defaults: () => ({ threads: [], reviews: [] }),
    normalize: value => {
      if (!value || !Array.isArray(value.threads) || !Array.isArray(value.reviews)
        || value.threads.some(w => !w || typeof w.id !== 'string' || typeof w.title !== 'string')
        || value.reviews.some(r => !r || typeof r.id !== 'string' || typeof r.status !== 'string')) {
        throw new Error('invalid overseer state');
      }
      return value;
    } });
  const loaded = store.load();
  const unavailable = !['ok', 'absent', 'recovered'].includes(loaded.status)
    ? 'overseer state unavailable: ' + loaded.status : '';
  let state = loaded.value;
  let emergencyPaused = false;
  const copy = value => JSON.parse(JSON.stringify(value));
  const commit = next => { if (unavailable) throw new Error(unavailable); store.save(next); state = next; };
  const update = fn => { const next = copy(state); const out = fn(next); commit(next); return copy(out); };
  const valid = value => /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ''));
  const locks = new Map();

  function threads() {
    if (unavailable) throw new Error(unavailable);
    const legacy = deps.sessions() || {};
    const deleted = new Set(legacy.deletedIds || []);
    const rows = new Map((legacy.workstreams || []).map(w => [w.id, w]));
    for (const w of state.threads) {
      if (deleted.has(w.id)) { rows.delete(w.id); continue; }
      const visible = rows.get(w.id);
      // the page's saved copy wins for what the Commander edits (title, lane…), but never blanks the project this thread
      // was filed under: a page that adopted it before learning the project saves projectRoot:null
      rows.set(w.id, Object.assign({}, w, visible || {}, { parentStreamId: w.parentStreamId, projectHome: !!w.projectHome,
        projectRoot: (visible && visible.projectRoot) || w.projectRoot || null }));
    }
    return Array.from(rows.values()).filter(w => !w.archived).map(w => ({ ...w,
      title: w.title || (w.id === legacy.generalId ? 'General' : 'Untitled') }));
  }
  function resolve(ref) {
    const rows = threads();
    const key = String(ref || '').trim().toLowerCase();
    const exact = rows.filter(w => w.id === ref);
    const named = rows.filter(w => w.title.toLowerCase() === key);
    const hits = exact.length ? exact : named;
    if (hits.length !== 1) throw new Error(hits.length ? 'ambiguous session title; use its id' : 'no such session');
    return hits[0];
  }
  function create(args) {
    const title = String(args.title || '').trim().slice(0, 80);
    if (!title) throw new Error('a session needs a title');
    const parent = resolve(args.parentStreamId);
    const duplicate = state.threads.find(w => args.requestId && w.requestId === args.requestId);
    if (duplicate) return copy(resolve(duplicate.id));
    if (threads().some(w => w.title.toLowerCase() === title.toLowerCase())) throw new Error('session title already exists; use its id');
    const agentId = args.agentId || parent.agentId || 'agent';
    if (!valid(agentId) || !deps.hasAgent(agentId)) throw new Error('unknown crew agent');
    const row = { id: deps.newId(), title, agentId, parentStreamId: parent.id,
      // the parent's project, or the project the creating run was admitted under (a page-saved parent row can lag it)
      projectRoot: parent.projectRoot || (args.projectRoot ? String(args.projectRoot) : null), requestId: String(args.requestId || ''),
      kind: 'chat', lane: 'active', history: [], runIds: [], createdAt: deps.now(), lastActiveAt: deps.now() };
    return update(s => { s.threads.push(row); return row; });
  }
  // A brand-new conversation whose FIRST ask delegates: its run is live before the page's debounced save lands, so the
  // overseer has never seen it and every worker lost its thread ("no such session", 2026-10-10). The run that asks proves
  // the conversation exists; it is filed from that run's identity, and the page's saved copy wins every field once it
  // lands. A conversation the Commander deleted is never brought back.
  function ensure(args) {
    const id = String(args.id || '');
    if (threads().some(w => w.id === id)) return resolve(id);
    const legacy = deps.sessions() || {};
    if (!valid(id) || (legacy.deletedIds || []).includes(id) || state.threads.some(w => w.id === id)) throw new Error('no such session');
    const agentId = args.agentId || 'agent';
    if (!valid(agentId) || !deps.hasAgent(agentId)) throw new Error('unknown crew agent');
    const row = { id, title: String(args.title || '').trim().slice(0, 80), agentId, projectRoot: args.projectRoot ? String(args.projectRoot) : null,
      parentStreamId: '', kind: 'chat', lane: 'active', history: [], runIds: [], createdAt: deps.now(), lastActiveAt: deps.now() };
    update(s => { s.threads.push(row); return row; });
    return resolve(id);
  }
  // One durable conversation per trusted project. Opening a project is an
  // explicit user action; repeated opens reuse the same identity after restart.
  function projectHome(root, title, createIfMissing) {
    const candidates = threads().filter(w => w.projectRoot === root && w.agentId === 'agent' && !w.parentStreamId);
    const existing = candidates.find(w => w.projectHome) || candidates[0];
    if (existing) {
      if (!existing.projectHome && createIfMissing) return update(s => {
        let owned = s.threads.find(w => w.id === existing.id);
        if (!owned) { owned = copy(existing); s.threads.push(owned); }
        owned.projectHome = true; return owned;
      });
      return copy(existing);
    }
    if (!createIfMissing) return null;
    const row = { id: deps.newId(), title, titleAuto: false, agentId: 'agent', projectRoot: root, projectHome: true,
      parentStreamId: '', kind: 'chat', lane: 'active', history: [], runIds: [], createdAt: deps.now(), lastActiveAt: deps.now() };
    return update(s => { s.threads.push(row); return row; });
  }
  function freshReviews(workers) {
    // A worker stopped BECAUSE its lead run was cancelled (subagents.js cancelChildren) gets no review turn: the
    // Commander just pressed Stop on that conversation, and a fresh paid run reporting the stop would override it.
    const fresh = workers.filter(w => w.leadId === 'agent' && valid(w.parentStreamId) && (w.completedAt || w.status === 'stale')
      && w.cancelledBy !== 'parent'
      && ['done', 'error', 'refused', 'interrupted', 'stale'].includes(w.status)
      && !state.reviews.some(r => r.id === w.runId + ':review'));
    return fresh.map(w => ({ id: w.runId + ':review',
      parentStreamId: w.parentStreamId, childStreamId: w.streamId || '', agentId: w.leadId,
      workerId: w.id, workerRunId: w.runId, generation: w.generation, status: 'pending',
      createdAt: deps.now(), reviewRunId: '', error: '' }));
  }
  function collect(workers) {
    const fresh = freshReviews(workers);
    if (fresh.length) update(s => { s.reviews.push(...fresh); return null; });
  }
  function patchReview(id, fields) {
    return update(s => { const r = s.reviews.find(row => row.id === id); if (!r) throw new Error('unknown review'); Object.assign(r, fields); return r; });
  }
  // Shared by user and review turns. A failed turn never poisons the next turn.
  async function withThread(id, fn) {
    const queued = locks.has(id);
    const previous = locks.get(id) || Promise.resolve();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    // The queue stores release signals, not fn's result, so its tail never rejects.
    const tail = previous.then(() => held);
    locks.set(id, tail);
    await previous;
    try { return await fn({ queued }); }
    finally { release(); if (locks.get(id) === tail) locks.delete(id); }
  }
  function stopReviews(workers) {
    // Stop admission immediately even when the disk cannot accept a receipt.
    emergencyPaused = true;
    // Keep cancellation in RAM even if persistence fails. A later successful
    // resume must not resurrect work the Commander already stopped.
    const next = copy(state);
    next.reviews.push(...freshReviews(workers || []));
    next.paused = true;
    for (const r of next.reviews) if (r.status === 'pending' || r.status === 'reviewing') {
      r.status = 'cancelled'; r.error = 'Stopped by the Commander.';
    }
    state = next;
    commit(state);
  }
  function snapshot() { if (unavailable) return { threads: [], reviews: [], paused: true, error: unavailable };
    return { threads: threads().map(w => ({ id: w.id, title: w.title, agentId: w.agentId,
    parentStreamId: w.parentStreamId || '', projectRoot: w.projectRoot || null, projectHome: !!w.projectHome,
    kind: w.kind, lane: w.lane, createdAt: w.createdAt,
    // the lead run that filed this thread (requestId = '<leadRunId>:<n|title>'): the page groups a dispatch's threads by it
    leadRunId: String(w.requestId || '').split(':')[0],
    // the worker slot in that dispatch ('<leadRunId>:<n>'): the page lists a dispatch's workers in the order they were asked
    slot: Number(String(w.requestId || '').split(':').pop()) || 0 })), reviews: copy(state.reviews), paused: emergencyPaused || !!state.paused }; }
  function resumeReviews() {
    // A damaged optional coordination store must not prevent ordinary chat.
    // Reads/creates still refuse, and the poller remains paused; never overwrite it.
    if (unavailable) return;
    if (state.paused || emergencyPaused) update(s => { s.paused = false; return null; });
    emergencyPaused = false;
  }
  return { threads, resolve, create, ensure, projectHome, collect, patchReview, withThread, snapshot, stopReviews, resumeReviews };
}
module.exports = { makeOverseer, isCoordinatorRun };
