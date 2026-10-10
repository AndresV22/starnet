/* STARNET — briefing.js : THE ONE RETURN REPORT, delivered as ONE session.

   THE PROBLEM (2026-10-04 audit): coming back meant a new rail row per routine fire, a new row per away build,
   a COMMS digest that skipped every cron/workshop/night-shift run, a morning report that only knew the night
   shift, a drafts nudge, a workshop reveal that jumped focus, and toasts — ~10 places, stitched together by hand.

   THE SHAPE NOW: the sidecar owns the truth (sidecar/away-briefing.js + POST /api/away/briefing/deliver): one
   durable "briefed through" stamp, everything unattended that ended after it folded into ONE assistant turn in
   ONE durable session (stream 'briefing', pinned, titled "While you were away"). This module only decides WHEN to
   ask (boot, and the first input after a real absence), adopts that one session, opens it when the Commander
   isn't mid-something (else it stays the single unread row), and renders tap-to-open chips for the briefed
   items. The per-run sessions still exist — they are the evidence and hold each build's keep/toss card — but
   they are reached FROM the briefing instead of each one shouting on return. Replying in the briefing continues
   from it: the sidecar gives that run the briefed items' real locations.

   The older return surfaces (ReturnStore's digest beat, NightReportStore, NightNudge, WorkshopStore's return
   reveal) ask ownsReturn() and stand down while this is live — their stores keep working (OUTBOX crates,
   deliverable sessions), only their competing "welcome back" beats go quiet. Never emits on U.bus; fail-open. */
'use strict';
const Briefing = (() => {
  const STREAM = 'briefing';
  const TITLE = 'While you were away';
  const AWAY_MS = 30 * 60000;       // "genuinely away" — matches the sidecar's NIGHTSHIFT_AWAY_MS default
  const BOOT_DELAY_MS = 1600;       // let the floor + COMMS settle (same cadence family as ReturnStore)
  let enabled = false, wired = false, inFlight = false;
  let lastInputAt = Date.now(), hiddenAt = 0;
  let agentId = 'agent';
  let lastItems = null;             // the last delivered briefing's items (from the server), for the chips

  const tzOffsetMin = () => { try { return -new Date().getTimezoneOffset(); } catch (_) { return 0; } };
  const hasWS = () => typeof Workstreams !== 'undefined' && Workstreams && Workstreams.adopt;

  // the Commander is mid-something a focus jump would stomp (same probes WorkshopStore's reveal uses)
  function engaged() {
    try { if (typeof Chat !== 'undefined' && Chat.isComposerEngaged && Chat.isComposerEngaged()) return true; } catch (_) { return true; }
    try { if (typeof Chat !== 'undefined' && Chat.isBusy && Chat.isBusy()) return true; } catch (_) {}
    try { if (typeof Onboarding !== 'undefined' && Onboarding.isRunning && Onboarding.isRunning()) return true; } catch (_) {}
    try { if (typeof Intake !== 'undefined' && Intake.isRunning && Intake.isRunning()) return true; } catch (_) {}
    try { if (typeof Dialogue !== 'undefined' && Dialogue.isOpen && Dialogue.isOpen()) return true; } catch (_) {}
    return false;
  }

  // adopt (idempotent) the ONE briefing session: pinned, unread (real unseen content), never a duplicate row.
  function ensureSession(at) {
    if (!hasWS()) return null;
    const ws = Workstreams.adopt({ id: STREAM, title: TITLE, titleAuto: false, agentId: agentId, lane: 'active', kind: 'chat', history: [],
      lastActiveAt: at || Date.now(), lastReadAt: 0, revive: true });
    if (!ws) return null;
    // the name is locked like a manual rename: a reply here must never re-title the briefing after that reply's
    // topic. A Commander's own rename (titleAuto already false, a different title) is theirs and is kept.
    if (ws.titleAuto !== false) { ws.title = TITLE; ws.titleAuto = false; }
    if (Workstreams.pin) Workstreams.pin(STREAM, true);
    if (at && (+ws.lastActiveAt || 0) < at) ws.lastActiveAt = at;
    if (Workstreams.markUnread) Workstreams.markUnread(STREAM);
    try { if (typeof App !== 'undefined') { if (App.refreshRail) App.refreshRail(); if (App.persist) App.persist(); } } catch (_) {}
    return ws;
  }

  async function deliver(why) {
    if (!enabled || inFlight) return null;
    inFlight = true;
    try {
      const r = await fetch('/api/away/briefing/deliver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tzOffsetMin: tzOffsetMin(), why: String(why || '') }) });
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      if (!j || !j.delivered) return j;
      if (j.agentId) agentId = String(j.agentId);
      lastItems = Array.isArray(j.items) ? j.items : null;
      const ws = ensureSession(Number(j.at) || Date.now());
      const onScreen = typeof Workstreams !== 'undefined' && Workstreams.activeId && Workstreams.activeId() === STREAM;
      if (ws && onScreen && typeof Chat !== 'undefined' && Chat.load) {
        try { Chat.load(ws); } catch (_) {}   // already on screen: re-sync from the server so the new turn shows
      } else if (ws && !engaged() && typeof App !== 'undefined' && App.openWorkstream) {
        try { App.openWorkstream(STREAM); } catch (_) {}
      }
      return j;
    } catch (_) { return null; }
    finally { inFlight = false; }
  }

  // the chips under the briefing: each briefed thing's OWN session (the evidence + the keep/toss card). Only
  // sessions that really exist are offered (a deleted one stays gone); nothing to offer → no chips.
  function chipsFor(items) {
    const out = [];
    const seen = new Set();
    for (const it of (Array.isArray(items) ? items : [])) {
      let open = '', label = '';
      if (it.kind === 'build') { open = it.open; label = '⚒ review “' + it.title + '”'; }
      else if (it.kind === 'builds-waiting') { open = it.open; label = '⚒ ' + it.count + ' earlier build' + (it.count === 1 ? '' : 's'); }
      else if (it.kind === 'routine' && it.latest) { open = it.latest.open; label = (it.latest.failed ? '⚠ ' : '✦ ') + it.name; }
      else if (it.kind === 'loop' && it.latest) { open = it.latest.open; label = '∞ ' + it.name; }
      if (!open || seen.has(open)) continue;
      if (!(typeof Workstreams !== 'undefined' && Workstreams.get && Workstreams.get(open))) continue;
      seen.add(open);
      out.push({ label: label.slice(0, 60), value: open });
      if (out.length >= 6) break;
    }
    return out;
  }
  /* THE ORGANIZED VIEW (2026-10-09, Andrew: "when the user isn't there and comes back, really easily and organized see
     all the work done"). The briefing's own items, sorted into what NEEDS YOU, what got DONE and IDEAS, one row
     each: what it is, what happened (the run's own words), and OPEN into the thread that holds the evidence. Every
     row is a server item (truthful telemetry — no row without a run behind it); OPEN only where that thread really
     exists on this station (a deleted one stays gone, chipsFor's rule). */
  function rowsFor(items) {
    const has = id => !!id && typeof Workstreams !== 'undefined' && Workstreams.get && !!Workstreams.get(id);
    const out = { needs: [], done: [], ideas: [], next: [] };
    const push = (bucket, r) => out[bucket].push(Object.assign({ open: '' }, r, { open: has(r.open) ? r.open : '' }));
    for (const it of (Array.isArray(items) ? items : [])) {
      const L = it.latest || {};
      if (it.kind === 'build') push('needs', { state: 'needs', tag: 'BUILD', name: it.title, what: 'built while you were away — keep it or toss it' + (it.summary ? ' · ' + it.summary : ''), open: it.open });
      else if (it.kind === 'builds-waiting') push('needs', { state: 'needs', tag: 'BUILDS', name: it.count + ' earlier build' + (it.count === 1 ? '' : 's'), what: 'still waiting on a decision', open: it.open });
      else if (it.kind === 'build-failed') push('needs', { state: 'failed', tag: 'BUILD', name: it.title, what: 'did not finish: ' + it.why, open: 'workshop-' + it.runId });
      else if (it.kind === 'routine') push(L.failed ? 'needs' : 'done', { state: L.failed ? 'failed' : 'done', tag: 'ROUTINE', name: it.name,
        what: (L.failed ? 'failed: ' + L.why : (L.excerpt || 'nothing new to report')), count: it.runs > 1 ? it.runs + '×' : '', open: L.open });
      else if (it.kind === 'loop') push(L.failed ? 'needs' : 'done', { state: L.failed ? 'failed' : 'done', tag: 'LOOP', name: it.name,
        what: (L.failed ? 'failed: ' + L.why : (L.excerpt || it.runs + ' pass' + (it.runs === 1 ? '' : 'es'))), count: it.runs > 1 ? it.runs + '×' : '', open: L.open });
      else if (it.kind === 'delegated') push(it.failed ? 'needs' : 'done', { state: it.failed ? 'failed' : 'done', tag: 'DELEGATED', name: it.name,
        what: (it.runs - it.failed) + ' of ' + it.runs + ' job' + (it.runs === 1 ? '' : 's') + ' finished' + (it.failed ? ' · ' + it.failed + ' did not' : (L.excerpt ? ' · ' + L.excerpt : '')), open: it.open });
      else if (it.kind === 'draft') push('ideas', { state: 'idea', tag: 'IDEA', name: it.title, what: 'drafted, not built', open: '' });
      else if (it.kind === 'next') push('next', { state: 'idea', tag: 'NEXT', name: it.title, what: it.why || 'what the station picks up next', open: '' });
    }
    return out;
  }
  function cardFor(items) {
    const r = rowsFor(items);
    const total = r.needs.length + r.done.length + r.ideas.length + r.next.length;
    if (!total) return null;
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const card = el('div', 'bf-card briefing-links');
    card.setAttribute && card.setAttribute('role', 'group');
    const head = el('div', 'bf-head');
    head.appendChild(el('span', 'bf-title', 'WHILE YOU WERE AWAY'));
    head.appendChild(el('span', 'bf-sum', [r.needs.length && r.needs.length + ' need' + (r.needs.length === 1 ? 's' : '') + ' you', r.done.length && r.done.length + ' done', r.ideas.length && r.ideas.length + ' idea' + (r.ideas.length === 1 ? '' : 's')].filter(Boolean).join(' · ')));
    card.appendChild(head);
    const section = (label, rows) => {
      if (!rows.length) return;
      card.appendChild(el('div', 'bf-sec', label));
      for (const x of rows) {
        const row = el('div', 'bf-row ' + x.state);
        row.appendChild(el('span', 'bf-lamp'));
        const main = el('span', 'bf-main');
        const line = el('span', 'bf-line1');
        line.appendChild(el('span', 'bf-tag', x.tag));
        line.appendChild(el('span', 'bf-name', String(x.name || '').slice(0, 80)));
        if (x.count) line.appendChild(el('span', 'bf-count', x.count));
        main.appendChild(line);
        main.appendChild(el('span', 'bf-what', String(x.what || '').slice(0, 160)));
        row.appendChild(main);
        if (x.open) {
          // the whole row opens the item's thread (keyboard too); OPEN stays as the visible door
          const go = (e) => { if (e && e.stopPropagation) e.stopPropagation(); try { if (typeof App !== 'undefined' && App.openWorkstream) App.openWorkstream(String(x.open)); } catch (_) {} };
          const b = el('button', 'bf-key', 'OPEN'); b.type = 'button';
          b.addEventListener('click', go);
          row.appendChild(b);
          if (row.setAttribute) { row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0'); row.setAttribute('aria-label', x.tag + ': ' + x.name + ' — open'); }
          row.addEventListener('click', go);
          row.addEventListener('keydown', (e) => { if (e && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(e); } });
        }
        card.appendChild(row);
      }
    };
    section('NEEDS YOU', r.needs); section('DONE', r.done); section('IDEAS', r.ideas); section('NEXT UP', r.next);
    return card;
  }
  async function presentFor(wsId) {
    if (String(wsId || '') !== STREAM) return;
    if (typeof Chat === 'undefined' || !Chat.choices) return;
    let items = lastItems;
    if (!items) {
      try {
        const r = await fetch('/api/away/briefing', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); items = (j && j.last && Array.isArray(j.last.items)) ? j.last.items : []; lastItems = items; }
      } catch (_) { return; }
    }
    if (typeof Workstreams === 'undefined' || !Workstreams.activeId || Workstreams.activeId() !== STREAM) return;   // switched away meanwhile
    const log = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('chat-log') : null;
    if (!log) return;
    // a STANDING card under the briefing (not Chat.choices): the open-doors are navigation, not a one-shot question,
    // so another beat's chips must never clear them; renderHistory wipes the log, and load()/repaint re-present it.
    const old = log.querySelector('.briefing-links'); if (old) old.remove();
    const card = cardFor(items);
    if (card) log.appendChild(card);
    // ONE THING, NOT TWO (2026-10-10): the card carries every item of the newest report (the same server items, and
    // NEXT UP), so the newest report's text above it would only say it twice — it is tucked away while its card shows.
    // Older reports keep their text; the session transcript itself is unchanged (a reply still sees the full report).
    if (card && log.querySelectorAll) {
      const agentRows = Array.from(log.querySelectorAll('.cmsg.agent'));
      for (const n of agentRows) if (n.classList) n.classList.remove('bf-replaced');
      const last = agentRows[agentRows.length - 1];
      const body = last && last.querySelector ? (last.querySelector('.body') || last) : null;
      if (body && last.classList && String(body.textContent || '').trim().indexOf(TITLE) === 0) last.classList.add('bf-replaced');
    }
  }

  // has the Commander been gone (no input) long enough that new unattended work belongs to a briefing?
  function isAway(now) { return ((now || Date.now()) - lastInputAt) >= AWAY_MS; }
  function noteInput() {
    const now = Date.now();
    const wasAway = isAway(now);
    lastInputAt = now;
    if (wasAway) deliver('return').catch(() => {});
  }
  function onVisibility() {
    try {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) { lastInputAt = Date.now(); deliver('return').catch(() => {}); }
      hiddenAt = 0;
    } catch (_) {}
  }

  // init({ enabled, agentId }) — called from enterGame. enabled:false (the awakening) never briefs.
  function init(opts) {
    opts = opts || {};
    enabled = opts.enabled !== false;
    if (opts.agentId) agentId = String(opts.agentId);
    lastInputAt = Date.now();
    if (!wired && typeof window !== 'undefined') {
      wired = true;
      try {
        window.addEventListener('pointerdown', noteInput, { capture: true, passive: true });
        window.addEventListener('keydown', noteInput, { capture: true, passive: true });
        document.addEventListener('visibilitychange', onVisibility);
      } catch (_) {}
    }
    if (enabled) setTimeout(() => { deliver('boot').catch(() => {}); }, BOOT_DELAY_MS);
  }
  function ownsReturn() { return enabled; }
  function reset() { enabled = false; lastItems = null; }

  return { init, reset, deliver, presentFor, ownsReturn, isAway, chipsFor, rowsFor, STREAM, TITLE, _ensureSession: ensureSession };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Briefing;
