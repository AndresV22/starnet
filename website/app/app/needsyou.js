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
   - a routine run that failed and you have not looked at: its own cron-<runId> session (lastRunOk === false, unread);
   - (org P01) every other wait that BLOCKS on the Commander, each from its own live source, never the bell's stored entries:
     an agent waiting at STEP-IN (StepIn.live — the sidecar's handoff records), extensions awaiting approval (GET /api/hooks +
     /api/plugins, re-read every minute), builds that need a keep/discard decision (GET /api/workshop/pending via
     WorkshopStore.pendingAll — DELIVERABLES' NEEDS A DECISION), a quest an agent says is done (QuestLedgerStore.pendingAttests),
     and goal-loop results waiting on review (LoopsReview.waiting — the loops watcher's own GET /api/loops). TO REVIEW (an
     optional rating pile) and PROPOSALS (optional, in QUESTS) are not waits and are never listed.
   NOTIFICATIONS › NEEDS YOU renders this SAME list (StationUI buildNotifs), so its count, Dismiss and OPEN match the rail.
   Actions are the real ones: Approve / Deny answer through the approval card's own path (Chat.answerConsent) — Approve
   only when the rail's line is the whole request, else Review opens the card that shows all of it (a direct-chat ask
   offers Review beside Approve once too, org P02) — Retry runs the
   routine again (POST /api/cron/run), Open lands on the conversation (a worker's work unfolded on its card). */
const NeedsYou = (() => {
  const DAY = 86400000;
  const KEEP_FAILED_MS = 3 * DAY;      // a failure older than this is history, not a to-do
  const SHOW = 3;                       // rows before "N more"
  const DISMISS_KEY = 'skynet.needs-dismissed';
  let expanded = false, wired = false, lastShape = '';
  // (org P01) the waits whose source is a sidecar read, not page state: re-read at most once a minute (and at once after a
  // decision here), so each row is the station's last answer. null = never answered yet: say nothing rather than guess.
  const FEED_MS = 60000;
  let feeds = { builds: null, extensions: null }, feedsAt = 0, feedsLoading = null, feedsAgain = null;
  const answering = new Set();          // promptIds whose answer is on its way: their keys stay disabled through re-renders
  let parked = null;                    // { act, cls, key } of a focused key that went disabled: focus returns when it can
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
  // why a worker ended, in the card's own words (Delegated words them once): a stale worker was cut off by a restart or
  // stopped by the liveness check; a failed one says why in plain words, never the ledger's internal code
  function reasonOf(w) {
    const D = typeof Delegated !== 'undefined' ? Delegated : null;
    if (w.status === 'stale') return D && D.staleLine ? D.staleLine(w) : 'stopped';
    const why = w.reason && w.reason !== 'error' && D && D.whyOf ? D.whyOf(w.reason) : '';
    return 'failed' + (why ? ': ' + why : '');
  }

  /* (org P01) THE OTHER BLOCKING WAITS — each read live from its own source, each keeping its existing action words:
     STEP-IN → Open (its window, on that handoff) · extensions → Open (ABILITIES › EXTENSIONS) · a build → Open (DELIVERABLES,
     filtered to NEEDS A DECISION) · a quest an agent says is done → Confirm / Not yet · goal-loop results → Open (GOAL LOOPS).
     A background worker's ask is already an approval row through Channels: it is never added twice. */
  const WAIT_KINDS = new Set(['approval', 'question', 'group', 'stepin', 'attest', 'extension', 'build', 'loop']);
  const STEPIN_WHY = { login: 'sign in', '2fa': 'enter a sign-in code', captcha: 'get past a human check', payment: 'confirm a payment', other: 'help with a page' };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function blockingWaits(out, now) {
    if (typeof StepIn !== 'undefined' && StepIn.live) {
      for (const h of StepIn.live()) {
        if (!h || !h.id) continue;
        out.push({ key: 'stepin:' + h.id, kind: 'stepin', handoffId: String(h.id), who: nameOf(h.agentId),
          what: 'needs you to ' + (STEPIN_WHY[h.reason] || STEPIN_WHY.other) + (h.where ? ' at ' + h.where : ''), where: 'STEP-IN', since: Number(h.requestedAt) || 0 });
      }
    }
    if (typeof QuestLedgerStore !== 'undefined' && QuestLedgerStore.pendingAttests) {
      for (const q of QuestLedgerStore.pendingAttests()) {
        if (!q || !q.id || !q.attest) continue;
        out.push({ key: 'attest:' + q.id + '@' + (Number(q.attest.at) || 0), kind: 'attest', questId: String(q.id), who: nameOf(q.attest.agentId || 'agent'),
          what: 'says "' + String(q.title || 'a quest') + '" is done', tip: String(q.attest.evidence || ''), where: 'QUESTS', since: Number(q.attest.at) || 0 });
      }
    }
    if (typeof LoopsReview !== 'undefined' && LoopsReview.waiting) {
      for (const l of LoopsReview.waiting()) {
        if (!l || !l.id || !(l.count > 0)) continue;
        out.push({ key: 'loop:' + l.id, kind: 'loop', who: nameOf(l.agentId || 'agent'),
          what: 'has ' + plural(l.count, 'result', 'results') + ' waiting on your review from "' + String(l.name || 'a goal loop') + '"', where: 'GOAL LOOPS', since: Number(l.since) || 0 });
      }
    }
    refreshFeeds(false, now);
    // no time: the sidecar's pending lists carry none, so the row shows no age rather than a guessed one
    if (feeds.extensions > 0) out.push({ key: 'extensions', kind: 'extension', who: 'STATION', what: 'has ' + plural(feeds.extensions, 'extension', 'extensions') + ' awaiting your approval', where: 'EXTENSIONS', since: 0 });
    for (const m of (feeds.builds || [])) {
      out.push({ key: 'build:' + m.runId, kind: 'build', who: nameOf(m.agentId), what: 'built "' + String(m.title || 'a build') + '": keep or discard it', where: 'DELIVERABLES', since: Number(m.builtAt) || 0 });
    }
  }
  // re-read the sidecar-backed waits (builds, extensions) when a minute has passed, or now (force). A failed read keeps the
  // last answer: an unreachable station is not "nothing waiting". A forced re-read asked for while a read is already on its
  // way (a keep/discard made while opening the build row started one) is never dropped: that read may have left before the
  // decision, so one more read follows it and its answer is the one the row shows.
  function refreshFeeds(force, now) {
    if (typeof fetch !== 'function') return null;
    if (feedsLoading) {
      if (!force) return feedsLoading;
      if (!feedsAgain) feedsAgain = feedsLoading.then(() => { feedsAgain = null; return refreshFeeds(true); });
      return feedsAgain;
    }
    now = Number(now) || Date.now();
    if (!force && feedsAt && now - feedsAt < FEED_MS) return null;
    if (typeof document !== 'undefined' && document && document.hidden && !force) return null;
    feedsAt = now;
    const json = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const builds = typeof WorkshopStore !== 'undefined' && WorkshopStore.pendingAll ? WorkshopStore.pendingAll().catch(() => null) : Promise.resolve(null);
    feedsLoading = Promise.all([builds, json('/api/hooks'), json('/api/plugins')]).then(([b, h, p]) => {
      const before = JSON.stringify(feeds);
      if (Array.isArray(b) && (typeof WorkshopStore === 'undefined' || !WorkshopStore.pendingAllOk || WorkshopStore.pendingAllOk())) feeds.builds = b.filter(m => m && m.runId);
      if (h && p && Array.isArray(h.pending || []) && Array.isArray(p.plugins)) feeds.extensions = (h.pending || []).length + p.plugins.filter(x => x && x.pending).length;
      if (JSON.stringify(feeds) !== before) { lastShape = ''; render(); if (typeof StationUI !== 'undefined' && StationUI.badges) StationUI.badges(); }
    }).then(() => { feedsLoading = null; }, () => { feedsLoading = null; });
    return feedsLoading;
  }

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
        out.push({ key: 'group:' + id, kind: 'group', wsId: id, who: 'GROUP', what: st && st.approvals ? 'has an approval waiting' : 'has a question waiting', where: titleOf(ws), since: 0 });
      }
    }
    const ov = typeof Overseer !== 'undefined' && Overseer.snapshot ? Overseer.snapshot() : null;
    for (const w of ((ov && ov.workers) || [])) {
      if (!w || !['error', 'refused', 'stale'].includes(w.status) || !w.parentStreamId) continue;
      const parent = Workstreams.get(w.parentStreamId); if (!parent) continue;
      const at = Number(w.completedAt) || Number(w.startedAt) || 0, key = 'worker:' + w.runId;
      if (gone.has(key) || (at && now - at > KEEP_FAILED_MS)) continue;
      const tip = typeof Delegated !== 'undefined' && Delegated.tipOf ? Delegated.tipOf(w) : '';   // the sidecar's own sentence, on hover
      out.push({ key, kind: 'failed', wsId: parent.id, workerWsId: w.streamId || '', who: nameOf(w.agentId), what: reasonOf(w), tip, where: titleOf(parent), since: at });
    }
    for (const ws of Workstreams.list()) {
      if (!/^cron-/.test(String(ws.id)) || ws.lastRunOk !== false || !(Workstreams.unread && Workstreams.unread(ws))) continue;
      out.push({ key: 'routine:' + ws.id, kind: 'routine', wsId: ws.id, who: nameOf(ws.agentId), what: 'routine "' + ((ws.automation && ws.automation.name) || ws.title || 'routine') + '" failed',
        where: 'routines', since: Number(ws.lastActiveAt) || 0, routineId: (ws.automation && ws.automation.id) || '' });
    }
    blockingWaits(out, now);
    const asks = out.filter(i => WAIT_KINDS.has(i.kind)).sort((a, b) => (a.since || 0) - (b.since || 0));
    const fails = out.filter(i => i.kind === 'failed' || i.kind === 'routine').sort((a, b) => (b.since || 0) - (a.since || 0));
    return asks.concat(fails);
  }
  function age(ms, now) {
    if (!ms) return '';
    const s = Math.max(0, Math.round(((Number(now) || Date.now()) - ms) / 1000));
    return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < DAY / 1000 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
  }
  const KIND = { approval: 'wants to', question: 'asks', group: '', failed: '', routine: '' };
  const RAIL_CHARS = 48;   // within what the rail's three clamped ask lines show (pipglass.css .ny-what: line-clamp 3)
  // the rail shows one glance line. Approve from here only when that line IS the whole request; when the approval card
  // holds more (INSPECT: a long command's tail, a file change, every argument; a station ask's own sentence: a build's
  // plan, the job a line runs, what its runs spend, that it runs unattended), or the line is longer than the rail
  // shows, Review lands on that card instead. Deny stays one tap: refusing without the detail is safe.
  function hiddenDetail(p) {
    if (/^station[._]/.test(String((p && p.tool) || ''))) return true;
    if (typeof Chat === 'undefined' || !Chat.consentInspect || !Chat.consentPhrase) return true;   // no way to tell: never approve blind
    return !!Chat.consentInspect(p) || (KIND.approval + ' ' + Chat.consentPhrase(p)).length > RAIL_CHARS;
  }
  function keysFor(i) {
    const k = (act, label, cls, off) => '<button type="button" class="ny-key' + (cls ? ' ' + cls : '') + '" data-ny-act="' + act + '" data-ny-key="' + esc(i.key) + '"' + (off ? ' disabled' : '') + '>' + label + '</button>';
    const sending = !!(i.p && answering.has(String(i.p.promptId))) || answering.has(i.key);
    if (i.kind === 'approval') {
      if (hiddenDetail(i.p)) return k('open', 'Review', 'primary') + k('deny', 'Deny', 'deny', sending);
      // org P02: a direct-chat ask always offers Review too — the COMMS card holds the whole request and its Always /
      // Full power keys, which the rail never grants. A worker's ask (background ones too) reviews on its Delegated row's
      // INSPECT instead, so its row stays Approve once · Deny.
      const worker = !!(i.p && (i.p.workerStreamId || i.p.workerRunId || i.p.background === true));
      return k('once', 'Approve once', 'primary', sending) + k('deny', 'Deny', 'deny', sending) + (worker ? '' : k('open', 'Review', 'quiet ny-review'));
    }
    if (i.kind === 'question') return k('open', 'Answer', 'primary');
    // a quest an agent says is done: the QUESTS card's own verdict keys (Confirm → done; Not yet keeps it open, the agent sees why)
    if (i.kind === 'attest') return k('attest-yes', 'Confirm ✓', 'primary', sending) + k('attest-no', 'Not yet', 'deny', sending);
    if (i.kind === 'routine' && i.routineId) return k('retry', 'Retry', 'primary') + k('open', 'Open');
    if (i.kind === 'failed') return k('open', 'Open') + k('dismiss', 'Dismiss', 'quiet');
    return k('open', 'Open');
  }
  function html(list, now) {
    if (!list.length) return '';
    const shown = expanded ? list : list.slice(0, SHOW);
    return '<div class="ny-head"><span class="ny-lamp" aria-hidden="true"></span><span class="ny-title">Needs you</span><span class="ny-count">' + list.length + '</span></div>'
      + '<ul class="ny-list">' + shown.map(i => '<li class="ny-item ' + i.kind + '" data-ny-key="' + esc(i.key) + '">'
        // the rail is narrow: who · where · how long (where wraps under who rather than being cut), what exactly on its own
        // (an ask three lines at most, any other wait in full), keys below
        + '<div class="ny-line"><span class="ny-who">' + esc(i.who) + '</span><button type="button" class="ny-where" data-ny-act="open" data-ny-key="' + esc(i.key) + '">in ' + esc(i.where) + '</button><span class="ny-age">' + esc(age(i.since, now)) + '</span></div>'
        + '<div class="ny-what" title="' + esc(i.what + (i.tip ? ' — ' + i.tip : '')) + '">' + esc((KIND[i.kind] ? KIND[i.kind] + ' ' : '') + i.what) + '</div>'
        + '<div class="ny-keys">' + keysFor(i) + '</div>'
        + '</li>').join('') + '</ul>'
      + (list.length > SHOW ? '<button type="button" class="ny-more" data-ny-act="more" aria-expanded="' + expanded + '">' + (expanded ? 'Show fewer' : (list.length - SHOW) + ' more') + '</button>' : '');
  }
  // what the list shows apart from its ages: the rail's 1s heartbeat rebuilds the list only when this moves
  const shapeOf = list => list.map(i => [i.key, i.who, i.what, i.tip || '', i.where, keysFor(i)].join('\u0001')).join('\u0002') + '#' + expanded;

  function render() {
    const host = typeof document !== 'undefined' && document.getElementById('ws-needs');
    if (!host) return;
    wire(host);
    const now = Date.now(), list = items(now), shape = shapeOf(list);
    host.hidden = !list.length;
    host.setAttribute('aria-label', list.length ? 'Needs you: ' + list.length + ' waiting' : 'Needs you');
    if (shape === lastShape) {
      // only time moved: update the ages in place, so the key the Commander is on keeps its focus
      const since = new Map(list.map(i => [i.key, i.since]));
      host.querySelectorAll('li.ny-item[data-ny-key]').forEach(li => {
        const el = li.querySelector('.ny-age'), text = age(since.get(li.dataset.nyKey), now);
        if (el && el.textContent !== text) el.textContent = text;
      });
      return;
    }
    lastShape = shape;
    // a real rebuild: put focus back on the same key in the new list
    const f = typeof document !== 'undefined' && document.activeElement && host.contains(document.activeElement) ? document.activeElement : null;
    let fAct = f && f.dataset ? f.dataset.nyAct : '', fCls = f ? f.className : '';
    const fKey = f && f.dataset ? f.dataset.nyKey : '';
    // focus is on the stand-in for a key that was locked: aim for that key again (it is back when its answer failed)
    if (f && parked && parked.key === fKey) { fAct = parked.act; fCls = parked.cls; }
    parked = null;
    host.innerHTML = html(list, now);
    if (fAct) {
      // "in <where>" and Review/Open share an action: the class tells them apart
      const keys = Array.from(host.querySelectorAll('[data-ny-act]'));
      const same = keys.filter(n => n.dataset.nyAct === fAct && (fAct === 'more' || n.dataset.nyKey === fKey));
      const again = same.find(n => n.className === fCls) || same[0];
      // a disabled key cannot hold focus (its answer is on the way): keep it on the same row's live key, else its
      // "in <where>", so a keyboard Commander is never dropped to the page
      const live = again && !again.disabled ? again
        : fKey ? keys.find(n => n.dataset.nyKey === fKey && !n.disabled && /\bny-key\b/.test(n.className)) || keys.find(n => n.dataset.nyKey === fKey && !n.disabled) : null;
      if (live && again && live !== again) parked = { act: fAct, cls: fCls, key: fKey };
      if (live && live.focus) live.focus({ preventScroll: true });
    }
  }
  // (org P01) the waits that live in a window, not a conversation: Open goes through that window's own door
  function openDoor(i) {
    const ui = typeof StationUI !== 'undefined' ? StationUI : null;
    if (i.kind === 'stepin') { if (typeof StepIn !== 'undefined' && StepIn.open) StepIn.open(i.handoffId); return true; }
    if (!ui || !ui.openTerm) return true;
    if (i.kind === 'extension') ui.openTerm('connectors', 'extensions');
    else if (i.kind === 'attest') ui.openTerm('quests');
    else if (i.kind === 'loop') ui.openTerm('loops');
    else if (i.kind === 'build') {
      ui.openTerm('deliverables');
      // lands on NEEDS A DECISION: the library's own status filter (the summary's "N need a decision" route)
      const lib = typeof document !== 'undefined' && document.querySelector ? document.querySelector('#dl-status') : null;
      const body = lib && lib.closest ? lib.closest('.term-body') : null;
      if (body && typeof Deliverables !== 'undefined' && Deliverables.showStatus) Deliverables.showStatus(body, 'pending');
      refreshFeeds(true);   // a decision is likely next: the row follows it at once, not a minute later
    }
    return true;
  }
  function open(i) {
    if (i && !i.wsId) return openDoor(i);
    if (!i || !has(App, 'openWorkstream')) return false;
    if (i.kind === 'failed') dismiss(i.key);   // you went to look at it: it has done its job here
    App.openWorkstream(i.wsId);
    // a question lands on its question card in one hop (not on the worker's row, which only points there)
    if (i.kind === 'question' && i.p && typeof Chat !== 'undefined' && Chat.revealAsk && Chat.revealAsk(i.p.promptId)) return true;
    if (i.workerWsId && typeof Delegated !== 'undefined' && Delegated.reveal) Delegated.reveal(i.workerWsId);
    return true;
  }
  async function act(kind, key, btn) {
    const i = items().find(x => x.key === key);
    if (kind === 'more') { expanded = !expanded; lastShape = ''; render(); return; }
    if (!i) { lastShape = ''; render(); return; }
    if (kind === 'open' || (kind === 'once' && hiddenDetail(i.p))) return open(i);   // never approve what the rail cannot show
    if (kind === 'dismiss') { if (i.kind === 'failed') dismiss(key); lastShape = ''; render(); return; }
    if ((kind === 'attest-yes' || kind === 'attest-no') && i.kind === 'attest' && typeof QuestLedgerStore !== 'undefined' && QuestLedgerStore.confirm) {
      if (answering.has(key)) return;
      answering.add(key); render(); if (btn) btn.disabled = true;
      let r = null;
      try { r = await QuestLedgerStore.confirm(i.questId, kind === 'attest-yes'); }
      catch (e) { r = { ok: false, error: (e && e.message) || String(e) }; }
      finally { answering.delete(key); }
      if (!(r && r.ok) && typeof StationUI !== 'undefined' && StationUI.notify) StationUI.notify('could not record that verdict', 'bad');
      if (typeof StationUI !== 'undefined' && StationUI.rerender) StationUI.rerender('quests', false);
      lastShape = ''; render(); if (typeof StationUI !== 'undefined' && StationUI.badges) StationUI.badges(); return;
    }
    if ((kind === 'once' || kind === 'deny') && i.p && typeof Chat !== 'undefined' && Chat.answerConsent) {
      // one answer per ask: a re-render while it is on its way keeps both keys disabled, and a second click sends nothing
      const promptId = String(i.p.promptId);
      if (answering.has(promptId)) return;
      // render first, while the clicked key still holds focus (the rebuild moves it to the row), then lock the key in hand
      answering.add(promptId); render(); if (btn) btn.disabled = true;
      // 'needs-you': the ask's card settles as answered here, never "from your phone"
      try { await Chat.answerConsent(i.p, Workstreams.get(i.wsId), kind, 'needs-you'); }
      catch (e) { if (typeof StationUI !== 'undefined' && StationUI.notify) StationUI.notify('Could not send that answer: ' + ((e && e.message) || e), 'warn'); }
      finally { answering.delete(promptId); }
      render(); if (has(App, 'refreshRail')) App.refreshRail(); return;
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
      lastShape = ''; render(); if (has(App, 'refreshRail')) App.refreshRail();
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
      // (org P01) a STEP-IN opens or ends, a build lands: the list follows at once (a build is a sidecar read: re-read now)
      U.bus.on('browser.handoff', () => setTimeout(render, 0));
      U.bus.on('workshop.built', () => { refreshFeeds(true); });
    }
  }
  /* (org P01) for NOTIFICATIONS › NEEDS YOU, which renders this same list: the line it reads, Open / Dismiss by key, and a
     shape that moves only when the list does (the bell repaints on it) */
  const lineOf = i => (KIND[i.kind] ? KIND[i.kind] + ' ' : '') + i.what;
  // what it opened: { conversation: true } when the door was a session (NOTIFICATIONS then steps aside with a way back),
  // { conversation: false } when it was a window (STEP-IN, EXTENSIONS, DELIVERABLES, QUESTS, GOAL LOOPS keep the focus)
  function openKey(key) { const i = items().find(x => x.key === key); if (!i || !open(i)) return false; return { conversation: !!i.wsId }; }
  function dismissKey(key) { const i = items().find(x => x.key === key); if (!i || i.kind !== 'failed') return false; dismiss(key); lastShape = ''; render(); return true; }
  const canDismiss = i => !!i && i.kind === 'failed';
  const listShape = list => (list || items()).map(i => i.key + '\u0001' + i.what + '\u0001' + i.where).join('\u0002');
  return { items, render, openKey, dismissKey, canDismiss, lineOf, listShape, refreshFeeds, _internals: { html, age, keysFor, dismissed, feeds: () => feeds } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NeedsYou;
