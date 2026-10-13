'use strict';
/* NEEDS YOU — every thing on the station waiting on the Commander, in ONE list at the top of SESSIONS (2026-10-11: all
   nine blind usability testers, on every design, asked for exactly this: approvals and failures from every conversation
   in one place, each with its action right there, saying exactly what will happen and how long it has waited).

   TRUTHFUL TELEMETRY: every item is state this page can prove, read live each render — nothing is stored or guessed.
   - an approval or question: Channels.allPending() (the asking run's own permission.prompt; a delegated worker's ask
     names the worker — sidecar attributeAsks);
   - a group chat waiting on you: GroupChat.attentionIds();
   - delegated work that failed, or was stopped by a restart or the liveness check: the overseer's worker ledger (/api/overseer), for a
     conversation this page holds, until you open it or dismiss it;
   - a routine run that failed and you have not looked at: its own cron-<runId> session (lastRunOk === false, unread).
   Actions are the real ones: Approve / Deny answer through the approval card's own path (Chat.answerConsent), Retry runs
   the routine again (POST /api/cron/run), Open lands on the conversation (a worker's work unfolded on its card). */
const NeedsYou = (() => {
  const DAY = 86400000;
  const KEEP_FAILED_MS = 3 * DAY;      // a failure older than this is history, not a to-do
  const SHOW = 3;                       // rows before "N more"
  const DISMISS_KEY = 'skynet.needs-dismissed';
  let expanded = false, wired = false, lastSig = '';
  const has = (o, k) => typeof o !== 'undefined' && o && typeof o[k] === 'function';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // a dismissal is a per-viewer convenience (which failures you have already seen), never station state
  function dismissed() {
    try { const v = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (_) { return new Set(); }
  }
  function dismiss(key) {
    try { const s = dismissed(); s.add(key); localStorage.setItem(DISMISS_KEY, JSON.stringify([...s].slice(-300))); } catch (_) { /* storage blocked: the item stays, never lost */ }
  }
  function nameOf(id) { return (has(App, 'agentName') && App.agentName(id)) || id || 'an agent'; }
  function titleOf(ws) { return (ws && (ws.title || (typeof Workstreams !== 'undefined' && Workstreams.generalId && ws.id === Workstreams.generalId() ? 'General' : ''))) || 'a conversation'; }
  function questionOf(p) {
    try { const j = JSON.parse(p.argsSummary || '{}'); if (j && typeof j.question === 'string' && j.question.trim()) return j.question.trim(); } catch (_) { /* a plain-text ask */ }
    return String(p.argsSummary || 'a question').trim();
  }
  // a stale worker: a restart cut it off, or the liveness check stopped it (Delegated words both, for the card and here)
  const reasonOf = w => w.status === 'stale' ? (typeof Delegated !== 'undefined' && Delegated.staleLine ? Delegated.staleLine(w) : 'stopped')
    : 'failed' + (w.reason && w.reason !== 'error' ? ': ' + w.reason : '');

  // the live list, most urgent first: asks (oldest waiting first), then what failed (newest first)
  function items(now) {
    now = Number(now) || Date.now();
    const out = [];
    if (typeof Workstreams === 'undefined') return out;
    const gone = dismissed();
    if (typeof Channels !== 'undefined' && Channels.allPending) {
      for (const { wsId, p } of Channels.allPending()) {
        const ws = Workstreams.get(wsId); if (!ws || !p || !p.promptId) continue;
        const question = p.tool === 'brief.ask';
        out.push({ key: 'ask:' + p.promptId, kind: question ? 'question' : 'approval', wsId, workerWsId: p.workerStreamId || '',
          who: nameOf(p.workerAgentId || ws.agentId || p.agentId), what: question ? questionOf(p) : (typeof Chat !== 'undefined' && Chat.consentPhrase ? Chat.consentPhrase(p) : String(p.tool || '')),
          where: titleOf(ws), since: Number(p.askedAt) || 0, p });
      }
    }
    if (typeof GroupChat !== 'undefined' && GroupChat.attentionIds) {
      for (const id of GroupChat.attentionIds()) {
        const ws = Workstreams.get(id); if (!ws) continue;
        const st = GroupChat.stateOf ? GroupChat.stateOf(id) : null;
        out.push({ key: 'group:' + id, kind: 'group', wsId: id, who: 'GROUP', what: st && st.approvals ? 'an approval is waiting' : 'a question is waiting', where: titleOf(ws), since: 0 });
      }
    }
    const ov = typeof Overseer !== 'undefined' && Overseer.snapshot ? Overseer.snapshot() : null;
    for (const w of ((ov && ov.workers) || [])) {
      if (!w || !['error', 'refused', 'stale'].includes(w.status) || !w.parentStreamId) continue;
      const parent = Workstreams.get(w.parentStreamId); if (!parent) continue;
      const at = Number(w.completedAt) || Number(w.startedAt) || 0, key = 'worker:' + w.runId;
      if (gone.has(key) || (at && now - at > KEEP_FAILED_MS)) continue;
      out.push({ key, kind: 'failed', wsId: parent.id, workerWsId: w.streamId || '', who: nameOf(w.agentId), what: reasonOf(w), where: titleOf(parent), since: at });
    }
    for (const ws of Workstreams.list()) {
      if (!/^cron-/.test(String(ws.id)) || ws.lastRunOk !== false || !(Workstreams.unread && Workstreams.unread(ws))) continue;
      out.push({ key: 'routine:' + ws.id, kind: 'routine', wsId: ws.id, who: nameOf(ws.agentId), what: 'routine "' + ((ws.automation && ws.automation.name) || ws.title || 'routine') + '" failed',
        where: 'routines', since: Number(ws.lastActiveAt) || 0, routineId: (ws.automation && ws.automation.id) || '' });
    }
    const asks = out.filter(i => i.kind === 'approval' || i.kind === 'question' || i.kind === 'group').sort((a, b) => (a.since || 0) - (b.since || 0));
    const fails = out.filter(i => i.kind === 'failed' || i.kind === 'routine').sort((a, b) => (b.since || 0) - (a.since || 0));
    return asks.concat(fails);
  }
  function age(ms, now) {
    if (!ms) return '';
    const s = Math.max(0, Math.round(((Number(now) || Date.now()) - ms) / 1000));
    return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < DAY / 1000 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
  }
  const KIND = { approval: 'wants to', question: 'asks', group: '', failed: '', routine: '' };
  function keysFor(i) {
    const k = (act, label, cls) => '<button type="button" class="ny-key' + (cls ? ' ' + cls : '') + '" data-ny-act="' + act + '" data-ny-key="' + esc(i.key) + '">' + label + '</button>';
    if (i.kind === 'approval') return k('once', 'Approve', 'primary') + k('deny', 'Deny', 'deny');
    if (i.kind === 'question') return k('open', 'Answer', 'primary');
    if (i.kind === 'routine' && i.routineId) return k('retry', 'Retry', 'primary') + k('open', 'Open');
    if (i.kind === 'failed') return k('open', 'Open') + k('dismiss', 'Dismiss', 'quiet');
    return k('open', 'Open');
  }
  function html(list, now) {
    if (!list.length) return '';
    const shown = expanded ? list : list.slice(0, SHOW);
    return '<div class="ny-head"><span class="ny-lamp" aria-hidden="true"></span><span class="ny-title">Needs you</span><span class="ny-count">' + list.length + '</span></div>'
      + '<ul class="ny-list">' + shown.map(i => '<li class="ny-item ' + i.kind + '" data-ny-key="' + esc(i.key) + '">'
        // the rail is narrow: who · where · how long on one line, what exactly on its own (two lines at most), keys below
        + '<div class="ny-line"><span class="ny-who">' + esc(i.who) + '</span><button type="button" class="ny-where" data-ny-act="open" data-ny-key="' + esc(i.key) + '">in ' + esc(i.where) + '</button><span class="ny-age">' + esc(age(i.since, now)) + '</span></div>'
        + '<div class="ny-what" title="' + esc(i.what) + '">' + esc((KIND[i.kind] ? KIND[i.kind] + ' ' : '') + i.what) + '</div>'
        + '<div class="ny-keys">' + keysFor(i) + '</div>'
        + '</li>').join('') + '</ul>'
      + (list.length > SHOW ? '<button type="button" class="ny-more" data-ny-act="more" aria-expanded="' + expanded + '">' + (expanded ? 'Show fewer' : (list.length - SHOW) + ' more') + '</button>' : '');
  }
  // what the list holds, for change detection (the rail's 1s ticker re-renders only when this moves)
  function signature(now) { return items(now).map(i => i.key + '@' + age(i.since, now)).join('|') + '#' + expanded; }

  function render() {
    const host = typeof document !== 'undefined' && document.getElementById('ws-needs');
    if (!host) return;
    wire(host);
    const now = Date.now(), list = items(now), sig = list.map(i => i.key + '@' + age(i.since, now)).join('|') + '#' + expanded;
    host.hidden = !list.length;
    host.setAttribute('aria-label', list.length ? 'Needs you: ' + list.length + ' waiting' : 'Needs you');
    if (sig === lastSig) return;
    lastSig = sig;
    host.innerHTML = html(list, now);
  }
  function open(i) {
    if (!i || !has(App, 'openWorkstream')) return;
    if (i.kind === 'failed') dismiss(i.key);   // you went to look at it: it has done its job here
    App.openWorkstream(i.wsId);
    if (i.workerWsId && typeof Delegated !== 'undefined' && Delegated.reveal) Delegated.reveal(i.workerWsId);
  }
  async function act(kind, key, btn) {
    const i = items().find(x => x.key === key);
    if (kind === 'more') { expanded = !expanded; lastSig = ''; render(); return; }
    if (!i) { lastSig = ''; render(); return; }
    if (kind === 'open') return open(i);
    if (kind === 'dismiss') { dismiss(key); lastSig = ''; render(); return; }
    if ((kind === 'once' || kind === 'deny') && i.p && typeof Chat !== 'undefined' && Chat.answerConsent) {
      if (btn) btn.disabled = true;
      try { await Chat.answerConsent(i.p, Workstreams.get(i.wsId), kind); }
      catch (e) { if (btn) btn.disabled = false; if (typeof StationUI !== 'undefined' && StationUI.notify) StationUI.notify('Could not send that answer: ' + ((e && e.message) || e), 'warn'); }
      lastSig = ''; render(); if (has(App, 'refreshRail')) App.refreshRail(); return;
    }
    if (kind === 'retry' && i.routineId) {
      if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
      try {
        const r = await fetch('/api/cron/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: i.routineId, detach: true }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j && j.error) || ('HTTP ' + r.status)); }
        if (typeof Workstreams !== 'undefined' && Workstreams.markRead) Workstreams.markRead(i.wsId);   // the new run is what counts now
        if (typeof StationUI !== 'undefined' && StationUI.notify) StationUI.notify('Running ' + i.what.replace(/ failed$/, '') + ' again', 'good');
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
        if (typeof StationUI !== 'undefined' && StationUI.notify) StationUI.notify('Could not rerun it: ' + ((e && e.message) || e), 'warn');
      }
      lastSig = ''; render(); if (has(App, 'refreshRail')) App.refreshRail();
    }
  }
  function wire(host) {
    if (wired || !host) return; wired = true;
    host.addEventListener('click', e => {
      const b = e.target && e.target.closest ? e.target.closest('[data-ny-act]') : null;
      if (b) { e.preventDefault(); e.stopPropagation(); act(b.dataset.nyAct, b.dataset.nyKey, b); return; }
      const row = e.target && e.target.closest ? e.target.closest('.ny-item[data-ny-key]') : null;
      if (row) { const i = items().find(x => x.key === row.dataset.nyKey); open(i); }
    });
    if (typeof U !== 'undefined' && U.bus && U.bus.on) {
      // an ask arrives or is answered anywhere (here, its card, the phone, a timeout): the list follows at once
      U.bus.on('permission.prompt', () => setTimeout(render, 0));
      U.bus.on('permission.response', () => setTimeout(render, 0));
    }
  }
  return { items, render, signature, _internals: { html, age, keysFor, dismissed } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NeedsYou;
