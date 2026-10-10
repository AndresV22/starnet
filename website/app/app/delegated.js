'use strict';
/* DELEGATED — the live card in a conversation that handed work to the crew (2026-10-09, Andrew: managing agents
   and their threads must be the easiest thing in the app; approved from the agent/delegation-proto prototype).

   Every worker the overseer dispatches now gets its own thread filed under the conversation that asked
   (sidecar orchestration.js fileUnderThreads); the SESSIONS rail folds those threads under it (Workstreams.nestRows).
   This card is the same work seen from inside the parent: one card per dispatch, one row per worker thread —
   who, what, what it is doing right now, and one click to OPEN its thread (or STOP a background worker).

   TRUTHFUL TELEMETRY. Nothing here is invented:
   - the rows are the sessions this page holds whose parentStreamId is this conversation (the rail's own records);
   - a dispatch groups by the lead run that filed the thread (/api/overseer threads[].leadRunId);
   - state reads the durable worker ledger (/api/overseer workers, polled by Overseer) for background workers and
     the session's live channel (the bridge's real runId via station.dispatch_start/end) for foreground ones;
   - the live step is the worker's own agent.tool_call event, matched by its runId;
   - a finished row quotes the first line the worker itself delivered into its thread.
   A foreground worker that ended without delivering anything says exactly that — never "done". */
const Delegated = (() => {
  const steps = new Map();   // worker runId -> { name, args } of its latest agent.tool_call
  let ticker = 0, wired = false;
  const $log = () => document.getElementById('chat-log');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clock = ms => { const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const snap = () => (typeof Overseer !== 'undefined' && Overseer.snapshot && Overseer.snapshot()) || {};
  const has = (o, k) => typeof o !== 'undefined' && o && typeof o[k] === 'function';

  function agentOf(id) {
    const list = has(App, 'agents') ? App.agents() : [];
    return list.find(a => a.id === id) || { id, name: (has(App, 'agentName') && App.agentName(id)) || id };
  }
  function portrait(id) {
    const img = document.querySelector('#crew .crew-row[data-agent-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] img');
    return img ? img.src : '';
  }
  function excerpt(ws) {
    const h = (ws && ws.history) || [];
    for (let i = h.length - 1; i >= 0; i--) {
      const m = h[i];
      if (m && m.role === 'assistant' && !m.sys && String(m.content || '').trim()) {
        const line = String(m.content).split(/\r?\n/).map(s => s.replace(/^[#>*\-\s]+/, '').replace(/\*\*|`/g, '').trim()).find(Boolean) || '';
        return line.length > 90 ? line.slice(0, 89).trimEnd() + '…' : line;
      }
    }
    return '';
  }

  /* one dispatch = the threads one lead run filed; rows keep the order the threads were made in */
  function batches(parentId) {
    if (typeof Workstreams === 'undefined' || !parentId) return [];
    const s = snap();
    const threads = new Map((s.threads || []).map(t => [t.id, t]));
    const workers = Array.isArray(s.workers) ? s.workers : [];
    const groups = new Map();
    const kids = Workstreams.list({ includeArchived: true }).filter(w => w && w.parentStreamId === parentId)
      .sort((a, b) => (+a.createdAt || 0) - (+b.createdAt || 0));
    for (const k of kids) {
      const worker = workers.filter(x => x && x.streamId === k.id).sort((a, b) => (+b.startedAt || 0) - (+a.startedAt || 0))[0] || null;
      const t = threads.get(k.id);
      const lead = (t && t.leadRunId) || (worker && worker.parentRunId) || ('at:' + Math.floor((+k.createdAt || 0) / 60000));
      if (!groups.has(lead)) groups.set(lead, { lead, at: +k.createdAt || 0, rows: [] });
      groups.get(lead).rows.push({ ws: k, worker });
    }
    return Array.from(groups.values()).sort((a, b) => a.at - b.at);
  }

  /* what a worker is doing, in words: the verb its tool call means plus the one argument that says what about
     (the query, the page, the file). Read off its own agent.tool_call event — never a guess. */
  const VERBS = [[/search/, 'searching'], [/fetch|request|browse|browser|navigate/, 'reading the web'], [/(^|[._])(write|edit|patch|append)/, 'writing'],
    [/(^|[._])(read|list|glob|grep|find)/, 'looking through files'], [/shell|exec|terminal|verify/, 'running a command'],
    [/image|voice|video|audio|media/, 'making media'], [/notebook|memory|recall/, 'checking its notes']];
  function argOf(raw) {
    let v = '';
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') for (const k of ['query', 'q', 'url', 'path', 'file', 'command', 'cmd', 'pattern', 'prompt', 'text', 'name']) if (typeof j[k] === 'string' && j[k].trim()) { v = j[k]; break; }
    } catch (_) { v = /^[\s{[]/.test(String(raw)) ? '' : String(raw || ''); }
    v = String(v).replace(/\s+/g, ' ').trim();
    return v.length > 60 ? v.slice(0, 59) + '…' : v;
  }
  function doing(step) {
    if (!step) return 'working';
    const n = String(step.name || '').toLowerCase().replace(/^mcp__/, '');
    const hit = VERBS.find(([re]) => re.test(n));
    const verb = hit ? hit[1] : n.replace(/^[a-z]+[._]/, '').replace(/[_.]+/g, ' ');
    const arg = argOf(step.args);
    return arg && arg !== '.' ? verb + ' · ' + arg : verb;
  }

  /* the row's state, in priority order. `parentLive` = the lead run that dispatched it is still running on this page. */
  function stateOf(r, parentId, lead) {
    const k = r.ws, w = r.worker, C = typeof Channels !== 'undefined' ? Channels : null;
    const pend = C && C.pendingOf ? C.pendingOf(k.id) : null;
    if (pend) return { cls: 'waiting', live: pend.tool === 'brief.ask' ? 'asking you a question' : 'waiting for your approval', t: '' };
    if (w && w.status === 'running') {
      return { cls: 'working', live: doing(steps.get(String(w.runId))), t: clock(Date.now() - (+w.startedAt || Date.now())), stop: !!w.canInterrupt, worker: w };
    }
    if (C && C.isBusy && C.isBusy(k.id)) return { cls: 'working', live: 'working', t: C.elapsedOf ? clock(C.elapsedOf(k.id)) : '' };
    if (w && w.status === 'done') return { cls: 'done', live: excerpt(k) || 'done', t: w.completedAt && w.startedAt ? clock(w.completedAt - w.startedAt) : '' };
    if (w && (w.status === 'error' || w.status === 'refused')) return { cls: 'failed', live: 'failed' + (w.reason && w.reason !== 'error' ? ' · ' + w.reason : ''), t: '' };
    if (w && (w.status === 'interrupted' || w.status === 'stale')) return { cls: 'stopped', live: w.status === 'stale' ? 'stopped when the station restarted' : 'stopped', t: '' };
    if (k.lastRunOk === false) return { cls: 'failed', live: 'failed', t: '' };
    if ((k.runIds || []).length) return { cls: 'done', live: excerpt(k) || 'done', t: '' };
    const parentBusy = C && C.isBusy && C.isBusy(parentId) && (!C.runIdOf || !lead || C.runIdOf(parentId) === lead);
    if (parentBusy) return { cls: 'queued', live: 'starting', t: '' };
    return { cls: 'stopped', live: 'ended without a result', t: '' };
  }

  const CHIP = { working: 'WORKING', waiting: 'NEEDS YOU', done: 'DONE', failed: 'FAILED', stopped: 'STOPPED', queued: 'STARTING' };
  function cardHtml(b, parentId) {
    const rows = b.rows.map(r => ({ r, st: stateOf(r, parentId, b.lead) }));
    const count = c => rows.filter(x => x.st.cls === c).length;
    const sum = [count('waiting') && count('waiting') + ' need' + (count('waiting') === 1 ? 's' : '') + ' you', count('working') && count('working') + ' working',
      count('queued') && count('queued') + ' starting', count('failed') && count('failed') + ' failed', count('stopped') && count('stopped') + ' stopped', count('done') && count('done') + ' done']
      .filter(Boolean).join(' · ');
    // one segment per worker, in row order, coloured by its state: the whole dispatch at a glance
    const meter = '<div class="dg-meter" aria-hidden="true">' + rows.map(({ st }) => '<i class="' + st.cls + '"></i>').join('') + '</div>';
    return '<div class="dg-head"><span class="dg-title">DELEGATED</span><span class="dg-n">' + rows.length + '</span><span class="dg-sum">' + esc(sum) + '</span></div>' + meter
      + rows.map(({ r, st }) => {
        const a = agentOf(r.ws.agentId || 'agent'), src = portrait(a.id), task = r.ws.title || 'Delegated task';
        // the whole row opens the worker's thread (keyboard too); OPEN stays as the visible door, STOP never falls through
        return '<div class="dg-row ' + st.cls + '" data-dg-open="' + esc(r.ws.id) + '" role="button" tabindex="0" aria-label="' + esc((a.name || a.id) + ': ' + task + ' — ' + CHIP[st.cls] + '. Open its thread') + '">'
          + '<span class="dg-face" aria-hidden="true">' + (src ? '<img alt="" src="' + esc(src) + '">' : '') + '</span>'
          + '<span class="dg-main">'
          + '<span class="dg-line1"><span class="dg-name"' + (a.color ? ' style="color:' + esc(a.color) + '"' : '') + '>' + esc(a.name || a.id) + '</span>'
          + (st.t ? '<span class="dg-time">' + esc(st.t) + '</span>' : '') + '</span>'
          + '<span class="dg-task">' + esc(task) + '</span>'
          + '<span class="dg-live"><span class="dg-chip ' + st.cls + '"><i aria-hidden="true"></i>' + CHIP[st.cls] + '</span><span class="dg-what">' + esc(st.live) + '</span></span>'
          + '</span>'
          + '<span class="dg-keys">' + (st.stop ? '<button type="button" class="dg-key stop" data-dg-stop="' + esc(st.worker.id) + '" data-tip="Stop this worker">STOP</button>' : '')
          + '<button type="button" class="dg-key" data-dg-open="' + esc(r.ws.id) + '">OPEN</button></span></div>';
      }).join('');
  }

  // a dispatch's card sits under the lead's reply to that ask: the first agent row stamped at/after the dispatch
  function anchorFor(log, at) {
    const rows = Array.from(log.querySelectorAll(':scope > .cmsg.agent[data-ts]'));
    const hit = rows.find(n => +n.dataset.ts >= at - 1500);
    if (!hit) return null;
    let n = hit; while (n.nextElementSibling && n.nextElementSibling.matches('.comms-presence.resolved, .run-fold')) n = n.nextElementSibling;
    return n;
  }

  function repaint() {
    const log = $log();
    if (!log || typeof Workstreams === 'undefined') return;
    const parentId = Workstreams.activeId();
    const list = batches(parentId);
    const keepKeys = new Set(list.map(b => b.lead));
    log.querySelectorAll(':scope > .dg-card').forEach(n => { if (n.dataset.dgParent !== parentId || !keepKeys.has(n.dataset.dgBatch)) n.remove(); });
    for (const b of list) {
      let card = Array.from(log.querySelectorAll(':scope > .dg-card')).find(n => n.dataset.dgBatch === b.lead);
      if (!card) {
        card = document.createElement('div'); card.className = 'dg-card'; card.dataset.dgBatch = b.lead; card.dataset.dgParent = parentId;
        card.setAttribute('role', 'group'); card.setAttribute('aria-label', 'Delegated work');
        const anchor = anchorFor(log, b.at);
        if (anchor) anchor.after(card); else log.appendChild(card);
      }
      const html = cardHtml(b, parentId);
      if (card.dataset.dgHtml !== html) { card.innerHTML = html; card.dataset.dgHtml = html; }
    }
    strip(log);
    const anyLive = list.some(b => b.rows.some(r => (r.worker && r.worker.status === 'running') || (typeof Channels !== 'undefined' && Channels.isBusy && Channels.isBusy(r.ws.id))));
    if (anyLive && !ticker) ticker = setInterval(repaint, 1000);
    if (!anyLive && ticker) { clearInterval(ticker); ticker = 0; }
  }

  // inside a worker's own thread: where it came from, one click back
  function strip(log) {
    const ws = Workstreams.active && Workstreams.active();
    const parent = ws && ws.parentStreamId ? Workstreams.get(ws.parentStreamId) : null;
    let el = log.querySelector(':scope > .dg-from');
    if (!parent) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'dg-from'; log.insertBefore(el, log.firstChild); }
    const lead = agentOf(parent.agentId || 'agent');
    const html = '<span class="dg-from-text"><span class="dg-from-k">DELEGATED BY ' + esc(String(lead.name || lead.id).toUpperCase()) + '</span>'
      + '<span class="dg-from-v">from <b>' + esc(parent.title || 'General') + '</b> · results go back there</span></span>'
      + '<button type="button" class="dg-key" data-dg-open="' + esc(parent.id) + '">BACK</button>';
    if (el.dataset.dgHtml !== html) { el.innerHTML = html; el.dataset.dgHtml = html; }
    if (log.firstChild !== el) log.insertBefore(el, log.firstChild);
  }

  async function stop(id, key) {
    key.disabled = true; key.textContent = 'STOPPING';
    try {
      const r = await fetch('/api/subagents/interrupt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      let j = null; try { j = await r.json(); } catch (_) { j = null; }
      if (!r.ok || (j && j.ok === false)) throw new Error((j && j.error) || ('HTTP ' + r.status));
    } catch (e) {
      key.disabled = false; key.textContent = 'STOP';
      if (typeof StationUI !== 'undefined' && StationUI.notify) StationUI.notify('Could not stop that worker: ' + e.message, 'warn', undefined, { kind: 'alert' });
    }
    if (typeof Overseer !== 'undefined' && Overseer.refresh) Overseer.refresh();
  }

  function wire() {
    if (wired || typeof document === 'undefined') return; wired = true;
    document.addEventListener('click', e => {
      const t = e.target && e.target.closest ? e.target : null; if (!t) return;
      const s = t.closest('#chat-log [data-dg-stop]');
      if (s) { e.preventDefault(); stop(s.dataset.dgStop, s); return; }
      const open = t.closest('#chat-log [data-dg-open]');
      if (open) { e.preventDefault(); if (has(App, 'openWorkstream')) App.openWorkstream(open.dataset.dgOpen); }
    });
    document.addEventListener('keydown', e => {
      const row = e.target && e.target.closest ? e.target.closest('#chat-log .dg-row[data-dg-open]') : null;
      if (!row || e.target !== row || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); if (has(App, 'openWorkstream')) App.openWorkstream(row.dataset.dgOpen);
    });
    if (typeof U !== 'undefined' && U.bus && U.bus.on) {
      U.bus.on('agent.tool_call', p => { if (p && p.runId && p.name) { steps.set(String(p.runId), { name: String(p.name), args: String(p.argsSummary || '') }); } });
      U.bus.on('agent.run.end', p => { if (p && p.runId) steps.delete(String(p.runId)); });
    }
  }

  // Chat.load calls this after it repaints a stream (the log is rebuilt, so the cards are re-placed)
  async function presentFor() { wire(); repaint(); }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', wire);
  return { presentFor, repaint, batches, stateOf, _internals: { anchorFor, excerpt } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Delegated;
