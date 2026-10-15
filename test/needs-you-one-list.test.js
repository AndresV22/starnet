'use strict';
/* node test/needs-you-one-list.test.js — ONE NEEDS YOU (org pass P01, 2026-10-14).
   Before: the rail's NEEDS YOU read live state while NOTIFICATIONS › NEEDS YOU read the bell's stored entries, so the two
   counts disagreed; STEP-IN, extensions and loop reviews showed only in the bell; builds that need a decision and quests
   an agent says are done showed in neither. Clearing NEEDS YOU did not mean nothing was waiting.
   GENUINE (executed): NeedsYou.items lists every blocking wait from its OWN live source — STEP-IN (StepIn.live), a quest
   attest (QuestLedgerStore.pendingAttests), goal-loop reviews (LoopsReview.waiting), extensions and builds (the sidecar's
   /api/hooks + /api/plugins and WorkshopStore.pendingAll) — each with its existing action words and door; a background
   worker's ask is one row (Channels), never two; TO REVIEW and PROPOSALS are never listed. StationUI's buildNotifs renders
   that SAME list as NOTIFICATIONS › NEEDS YOU (tag NEEDS YOU, OPEN and Dismiss by the rail's rules) and the bell badge adds
   the live count to the unread history, never one instead of the other. */
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const NOW = 50 * 86400000;
global.localStorage = { getItem: () => null, setItem() {} };
global.document = undefined;
const sessions = new Map([['home', { id: 'home', title: null, agentId: 'agent' }]]);
global.Workstreams = { get: id => sessions.get(id) || null, list: () => [...sessions.values()], unread: () => false, generalId: () => 'home' };
global.App = { agentName: id => ({ agent: 'NOVA', writer: 'VEX', researcher: 'MIRA', designer: 'ROOK' })[id] || id, openWorkstream: id => opened.push(['ws', id]) };
global.Chat = { consentPhrase: p => String(p.tool), consentInspect: () => null };
const opened = [];
// a background worker's ask: filed into Channels by the lead (final-approval-truth) — it must be ONE row
global.Channels = { allPending: () => [{ wsId: 'home', p: { promptId: 'bg1', tool: 'fs.read', workerAgentId: 'writer', workerStreamId: 'thread_vex', background: true, askedAt: NOW - 50000 } }] };
global.StepIn = { live: () => [{ id: 'h1', agentId: 'researcher', reason: 'login', where: 'github.com', state: 'waiting', requestedAt: NOW - 40000 }], open: id => opened.push(['stepin', id]) };
let confirmed = [];
global.QuestLedgerStore = {
  pendingAttests: () => [{ id: 'q7', title: 'Ship the landing page', status: 'open', attest: { agentId: 'designer', evidence: 'deployed to /landing', at: NOW - 30000 } }],
  confirm: async (id, ok) => { confirmed.push([id, ok]); return { ok: true }; }
};
global.LoopsReview = { waiting: () => [{ id: 'L1', name: 'Tidy the docs', agentId: 'agent', count: 2, since: NOW - 20000 }] };
// the sidecar-backed waits: builds (per agent) and extensions — answered by the station
global.WorkshopStore = { pendingAll: async () => [{ runId: 'b1', agentId: 'writer', title: 'Pricing page v2', builtAt: NOW - 10000 }], pendingAllOk: () => true };
// NOT waits: the optional TO REVIEW pile and PROPOSALS — present on the page, never listed
global.AutoJobStore = { pendingList: () => [{ id: 'prop1', title: 'A proposed routine' }] };
const fetched = [];
global.fetch = async url => { fetched.push(url); return { ok: true, json: async () => url === '/api/hooks' ? { hooks: [], pending: [{ event: 'on_session_end', command: 'x' }] } : { plugins: [{ id: 'p', pending: true }, { id: 'q', pending: false }] } }; };
const ui = { terms: [], notes: [], rer: [] };
global.StationUI = { openTerm: (k, s) => ui.terms.push([k, s || null]), notify: (t, c) => ui.notes.push([t, c]), rerender: k => ui.rer.push(k), badges() {} };
let shownStatus = null;
global.Deliverables = { showStatus: (body, st) => { shownStatus = st; return true; } };
global.Delegated = require('../frontend/app/delegated.js');
const NY = require('../frontend/app/needsyou.js');

(async () => {
  // the feeds are a sidecar read: the first items() call starts it, the list follows when it answers
  NY.items(NOW);
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  A.ok(fetched.includes('/api/hooks') && fetched.includes('/api/plugins'), 'extensions are read from the sidecar (hooks + plugins), never the bell');
  const list = NY.items(NOW);
  const byKind = k => list.filter(i => i.kind === k);
  A.eq(list.map(i => i.kind).join(','), 'approval,stepin,attest,loop,build,extension', 'every blocking wait, one list: the timed ask first, then STEP-IN, then the station waits oldest first (an untimed extension last, never above the approval)');
  A.eq(byKind('approval').length, 1, 'a background worker\'s ask is one row (its Channels ask), never added twice');
  A.ok(!list.some(i => /prop1|review/i.test(i.key)), 'TO REVIEW and PROPOSALS are optional piles, never NEEDS YOU');
  const step = byKind('stepin')[0];
  A.eq([step.who, step.what, step.where].join(' | '), 'MIRA | needs you to sign in at github.com | STEP-IN', 'STEP-IN: who, what exactly, where');
  const att = byKind('attest')[0];
  A.eq([att.who, att.what, att.where].join(' | '), 'ROOK | says "Ship the landing page" is done | QUESTS', 'a quest an agent says is done');
  A.eq(att.tip, 'deployed to /landing', 'its evidence rides the row\'s tip');
  A.eq(byKind('loop')[0].what, 'has 2 results waiting on your review from "Tidy the docs"', 'goal-loop results waiting on review (who + a verb)');
  A.eq(byKind('extension')[0].what, 'has 2 extensions awaiting your approval', 'extensions awaiting approval (1 hook + 1 plugin), read as STATION has …');
  A.eq([byKind('build')[0].who, byKind('build')[0].what, byKind('build')[0].where].join(' | '), 'VEX | built "Pricing page v2": keep or discard it | DELIVERABLES', 'a build that needs a decision');

  // each keeps its existing action words
  const k = NY._internals.keysFor;
  const keys = i => [...k(i).matchAll(/data-ny-act="([a-z-]+)"[^>]*>([^<]+)</g)].map(m => m[1] + ':' + m[2]).join(' · ');
  A.eq(keys(step), 'open:Open', 'STEP-IN → Open');
  A.eq(keys(att), 'attest-yes:Confirm · attest-no:Not yet', 'a quest attest → Confirm / Not yet (the QUESTS card\'s own words, without its fallback-font ✓)');
  A.eq(keys(byKind('loop')[0]), 'open:Open', 'loop review → Open');
  A.eq(keys(byKind('extension')[0]), 'open:Open', 'extensions → Open');
  A.eq(keys(byKind('build')[0]), 'open:Open', 'a build → Open');

  // the doors
  NY.openKey('stepin:h1'); A.eq(opened.pop(), ['stepin', 'h1'], 'STEP-IN opens its window on THAT handoff');
  NY.openKey('extensions'); A.eq(ui.terms.pop(), ['connectors', 'extensions'], 'extensions open ABILITIES › EXTENSIONS');
  NY.openKey(att.key); A.eq(ui.terms.pop(), ['quests', null], 'a quest attest opens QUESTS');
  NY.openKey('loop:L1'); A.eq(ui.terms.pop(), ['loops', null], 'loop results open GOAL LOOPS');
  A.ok(!opened.length, 'none of them opens a conversation');
  global.document = { querySelector: sel => sel === '#dl-status' ? { closest: () => ({}) } : null, hidden: false };
  NY.openKey('build:b1'); A.eq(ui.terms.pop(), ['deliverables', null], 'a build opens DELIVERABLES…');
  A.eq(shownStatus, 'pending', '…filtered to NEEDS A DECISION');
  global.document = undefined;
  // what a door opened: NOTIFICATIONS steps aside (workConversation) only for a session, never over a window it just opened
  A.eq(NY.openKey('loop:L1'), { conversation: false }, 'a window door reports it opened a window, not a conversation'); ui.terms.pop();
  A.eq(NY.openKey('approval:nope'), false, 'an unknown key opens nothing');
  {
    const su0 = read('frontend/app/stationui.js');
    A.ok(/const did = NY && NY\.openKey\(el\.dataset\.nyKey\); if \(did && did\.conversation && open\.notifs\) workConversation\('notifs'\);/.test(su0),
      'NOTIFICATIONS › NEEDS YOU steps aside only when the row opened a conversation (a STEP-IN / EXTENSIONS / DELIVERABLES / QUESTS / GOAL LOOPS window keeps the focus)');
  }
  A.ok(!NY.dismissKey('stepin:h1') && !NY.dismissKey(att.key), 'a wait is never dismissed away — only failed work has Dismiss (as on the rail)');
  A.ok(NY.canDismiss({ kind: 'failed' }) && !NY.canDismiss(step), 'canDismiss follows the rail');

  // Confirm / Not yet answer through the quest store, once
  const hostless = NY._internals;
  A.ok(hostless, 'internals');
  {
    const src = read('frontend/app/needsyou.js');
    A.ok(/QuestLedgerStore\.confirm\(i\.questId, kind === 'attest-yes'\)/.test(src), 'Confirm / Not yet answer through QuestLedgerStore.confirm (the QUESTS card\'s own path)');
  }

  // a forced re-read asked for while a read is on its way is never dropped: the earlier read may predate the decision
  {
    // settle the reads the doors above started (opening the build row forces one)
    for (let n = 0; n < 5; n++) { await NY.refreshFeeds(false); await new Promise(r => setTimeout(r, 0)); }
    const realFetch = global.fetch;
    let gate = null, pendingNow = 1;
    const answer = n => url => ({ ok: true, json: async () => url === '/api/hooks' ? { hooks: [], pending: Array.from({ length: n }, () => ({})) } : { plugins: [] } });
    global.fetch = url => { const n = pendingNow; return gate ? gate.then(() => answer(n)(url)) : Promise.resolve(answer(n)(url)); };
    let release; gate = new Promise(r => { release = r; });
    const first = NY.refreshFeeds(true);          // e.g. opening the row: leaves while 1 extension still waits
    pendingNow = 0;                               // …the Commander approves it while that read is still out
    const second = NY.refreshFeeds(true);
    A.ok(second && second !== first, 'a forced re-read during an in-flight read is queued, not handed the stale promise');
    A.eq(NY.refreshFeeds(true), second, 'several forced asks during one read share the one follow-up read');
    gate = null; release();
    await second;
    A.eq(NY._internals.feeds().extensions, 0, 'the row follows the decision at once (the follow-up read), not a minute later');
    global.fetch = realFetch;
    await NY.refreshFeeds(true);                  // back to the fixture's station (2 extensions waiting) for the rest
    const conn = read('frontend/app/windows/connectors.js');
    A.ok(/NeedsYou\.refreshFeeds\(true\)/.test(conn), 'approving / changing an extension in ABILITIES › EXTENSIONS re-reads NEEDS YOU at once');
  }

  // ---- NOTIFICATIONS › NEEDS YOU renders the SAME list; the bell adds the live count ----
  const su = read('frontend/app/stationui.js');
  const from = su.indexOf('  let notifView = \'all\';'), to = su.indexOf('  /* ============== periodic + save dot');
  A.ok(from > 0 && to > from, 'fixture: the NOTIFICATIONS window + bell');
  const badge = { textContent: '', style: { display: '' } };
  const body = { innerHTML: '', querySelectorAll: () => [], querySelector: () => ({ addEventListener() {} }) };
  const ctx = {
    NeedsYou: NY, store: { notifs: [
      // covered by a live row: the bell's stored entries for an approval (prompt), STEP-IN, extensions, loop reviews
      { id: 'n1', kind: 'needs', txt: 'VEX needs approval', prompt: 'bg1', key: 'needs:home', read: false, t: NOW - 50000 },
      { id: 'n2', kind: 'needs', txt: 'STEP-IN: MIRA', key: 'stepin-h1', read: false, t: NOW - 40000 },
      { id: 'n3', kind: 'needs', txt: '2 extensions', key: 'extensions-pending', read: false, t: NOW - 60000 },
      { id: 'n4', kind: 'needs', txt: 'loop results', key: 'loops-review', read: false, t: NOW - 20000 },
      // NOT covered: a finished reply that asked a question — stays in the history, still counted
      { id: 'n5', kind: 'needs', txt: 'NOVA has a question for you', key: 'needs:other', read: false, t: NOW - 5000 },
      { id: 'n6', kind: 'result', txt: 'NOVA finished', read: false, t: NOW - 4000 },
      { id: 'n7', kind: 'result', txt: 'old news', read: true, t: NOW - 3000 },
      { id: 'n8', kind: 'needs', done: true, txt: 'answered', key: 'needs:x', read: true, t: NOW - 2000 }
    ] },
    open: {}, save() {}, uid: () => 'u', esc: s => String(s), severityOf: () => 'warn', SEV_GLYPH: { warn: '⚠', bad: '✗', good: '✓', gold: '★', info: '▸' },
    notifStamp: () => '[t]', reapDeadPrompts() {}, rerender() {}, sfx() {}, openNotif() {}, workConversation() {}, $: sel => sel === '#nf-badge' ? badge : null
  };
  vm.runInNewContext(su.slice(from, to) + '\nthis.api = { buildNotifs, badges, notifsMarkRead };', ctx);
  ctx.api.buildNotifs(body);
  const h = body.innerHTML;
  const needsSec = h.slice(h.indexOf('<section class="nf-needs">'), h.indexOf('</section>'));
  A.ok(/<h4 class="ms-h">NEEDS YOU <span class="dim">— 6 waiting<\/span><\/h4>/.test(needsSec), 'NOTIFICATIONS › NEEDS YOU counts what the rail counts (6)');
  A.eq((needsSec.match(/class="nf [^"]*nf-live/g) || []).length, 6, 'one row per live wait');
  A.ok(/data-ny-key="stepin:h1"/.test(needsSec) && /data-ny-key="build:b1"/.test(needsSec) && /data-ny-key="attest:q7@/.test(needsSec), 'STEP-IN, builds and quest attests are in it too');
  A.ok(/<span class="nf-kind">in STEP-IN<\/span>/.test(needsSec) && /<span class="nf-kind">in EXTENSIONS<\/span>/.test(needsSec) && !/<span class="nf-kind">NEEDS YOU</.test(needsSec) && !/Waiting on you/.test(h),
    'each row\'s tag says where it waits (the NEEDS YOU heading above already says what they are; never "Waiting on you")');
  A.ok(/<span class="nf-txt">MIRA needs you to sign in at github\.com<\/span>/.test(needsSec), 'the line is who + what, the place in the tag (never " · in STEP-IN" again)');
  A.ok(/OPEN ▸/.test(needsSec) && !/data-ny-dismiss/.test(needsSec), 'every row is a door; no Dismiss on a wait (only failed work has one)');
  A.ok(!/ title=/.test(needsSec), 'no native title tooltips on the new rows');
  const hist = h.slice(h.indexOf('</section>'));
  A.ok(!/STEP-IN: MIRA|2 extensions|loop results|VEX needs approval/.test(hist), 'a stored entry a live row already shows is not listed twice');
  A.ok(/NOVA has a question for you/.test(hist) && /answered/.test(hist), 'a stored wait no live row covers, and the handled history, stay below');
  // only the live section says NEEDS YOU: a history row tagged NEEDS YOU below it (outside the section, absent from the rail)
  // contradicted the one-list promise (wiring review 2026-10-14)
  A.ok(!/<span class="nf-kind">NEEDS YOU</.test(hist), 'no history row carries the NEEDS YOU tag');
  A.ok(/<span class="nf-kind">Asked you<\/span>[\s\S]{0,200}NOVA has a question for you/.test(hist), 'the uncovered stored wait says what it was: Asked you');
  A.ok(/>All · 10</.test(h) && />New · 8</.test(h), 'All / New count the live rows plus the history (New = 6 live + 1 stored wait + 1 unread result)');
  ctx.api.badges();
  A.eq(badge.textContent, '8', 'the bell: unread history (1 result + 1 uncovered wait) PLUS the live NEEDS YOU count (6) — never one instead of the other');
  A.eq(ctx.api.notifsMarkRead().waiting, 7, 'notifications.read reports what is really still waiting (live + uncovered)');
  A.eq(badge.textContent, '7', '…and reading the history never clears a wait off the bell');

  // ---- NEEDS YOU lives in the SESSIONS view: a render from PROJECTS (a build landing, a STEP-IN, an extension change, a
  // dismiss from NOTIFICATIONS) never un-hides it above the projects list (wiring review 2026-10-14) ----
  {
    const host = { hidden: true, innerHTML: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, querySelectorAll: () => [], contains: () => false };
    global.document = { getElementById: id => id === 'ws-needs' ? host : null, querySelector: () => null, hidden: false, activeElement: null };
    let view = 'projects';
    global.App.railView = () => view;
    NY.render();
    A.ok(host.hidden === true && host.innerHTML === '', 'in PROJECTS a render keeps NEEDS YOU hidden (its 6 waits notwithstanding)');
    // a sidecar feed change (a build landing / an extension approved) re-renders from any view: still hidden in PROJECTS
    const realFetch = global.fetch;
    global.fetch = async url => ({ ok: true, json: async () => url === '/api/hooks' ? { hooks: [], pending: [] } : { plugins: [] } });
    await NY.refreshFeeds(true);
    A.eq(NY._internals.feeds().extensions, 0, 'fixture: the feed really changed (extensions approved)');
    A.ok(host.hidden === true && host.innerHTML === '', 'a feed change heard in PROJECTS leaves NEEDS YOU hidden there');
    A.ok(NY.items(NOW).length > 0, 'the bell and NOTIFICATIONS still read the live list in PROJECTS (items() is not gated)');
    view = 'sessions';
    NY.render();
    A.ok(host.hidden === false && /class="ny-head"/.test(host.innerHTML), 'back in SESSIONS the next render rebuilds the block (never a stale shape)');
    global.fetch = realFetch;
    await NY.refreshFeeds(true);
    delete global.App.railView;
    global.document = undefined;
    A.ok(/railView: \(\) => railView,/.test(read('frontend/app/app.js')), 'App exposes the rail view needsyou.js reads');
  }

  // the rail and the bell share one source; the heartbeat keeps the badge live in every rail view
  const app = read('frontend/app/app.js');
  A.ok(/StationUI\.badges\(\);   \/\/ org P01: the bell adds the live NEEDS YOU count/.test(app), 'the 1s rail heartbeat repaints the bell');
  A.ok(/notifsMarkRead, notifsClear, badges,/.test(su), 'StationUI exposes badges() for it');
  // a place the agent can show
  const Places = require('../frontend/app/places.js');
  A.eq(Places.get('needs-you') && Places.get('needs-you').words, 'SESSIONS › NEEDS YOU', 'station.show knows the needs-you place');
  const M = require('../sidecar/manual.js');
  A.ok(/NEEDS YOU at the top of SESSIONS \[needs-you\] lists every card waiting \(also NOTIFICATIONS › NEEDS YOU\)/.test(M.manualSection('concepts')), 'the agent manual points at the rail first, NOTIFICATIONS second');
  A.ok(!/NOTIFICATIONS › NEEDS YOU lists every/.test(M.starnetManual()), 'no manual line points only at NOTIFICATIONS any more');
  A.report('needs-you-one-list.test');
})().catch(e => { console.error(e); process.exit(1); });
