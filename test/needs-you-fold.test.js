'use strict';
/* node test/needs-you-fold.test.js — NEEDS YOU's fold counts WAITS, and its rows keep their age honest
   (two independent reviews of the one-panel rail, 2026-10-16).

   1. "N more" counted CARDS while the header counted WAITS: an agent's 23 builds are one card, so a folded build card
      read "1 more" for 23 waits, and the header never matched the rows (2 + "3 more" under a header of 28). The fold now
      counts the waits in every row it leaves out (each row carries its own: data-ny-n), so the header is always the waits
      shown plus N.
   2. A card of builds that carry no time showed the age "now" (Math.min of no times is Infinity): the module's own rule
      is "no time: show no age".
   GENUINE (executed): the real needsyou.js renders into a host laid out by a height model (a row's lines and its keys,
   Approve once · Deny stacking in this column), so the real fitRows and measure run. */
const A = require('./_assert.js');

const NOW = 40 * 86400000;
let clock = NOW;
Date.now = () => clock;
global.localStorage = { getItem: () => null, setItem() {} };
const sessions = new Map([['home', { id: 'home', title: null, agentId: 'agent' }], ['proj', { id: 'proj', title: 'Launch prep', agentId: 'agent' }]]);
global.Workstreams = { get: id => sessions.get(id) || null, list: () => [...sessions.values()], unread: () => false, generalId: () => 'home', isDeleted: () => false };
let pending = [];
global.Channels = { allPending: () => pending };
const opened = [], answered = [];
global.App = { agentName: id => ({ agent: 'NOVA', ultron: 'ULTRON', vex: 'VEX', mira: 'MIRA' })[id] || id, openWorkstream: id => opened.push(id) };
global.Chat = { consentPhrase: p => 'use fs read: ' + p.argsSummary, consentInspect: () => null, revealAsk: () => true,
  answerConsent: async (p, ws, d) => { answered.push(p.promptId + ':' + d); } };
let builds = [], workers = [];
global.WorkshopStore = { pendingAll: async () => builds, pendingAllOk: () => true, ensureSession: m => 'workshop-' + m.runId };
global.Overseer = { snapshot: () => ({ workers }) };
global.fetch = async url => ({ ok: true, json: async () => url === '/api/hooks' ? { hooks: [], pending: [] } : { plugins: [] } });
global.document = undefined;
const NY = require('../frontend/app/needsyou.js');

/* ---- the section, laid out: head, rows (name + ask lines, then keys), and the fold key when it shows ---- */
const HEAD = 30, MORE = 25;
const lineCut = false;   // every ask line reads whole here
const dataset = attrs => Object.fromEntries([...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(m => [m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()), m[2]]));
const LISTENERS = {};   // needsyou.js wires its click listener once (one section per page): every host here shares it
function makeHost(room) {
  const doc = { activeElement: null, hidden: false };
  const host = { hidden: false, writes: 0, rows: [], buttons: [], more: null, listeners: LISTENERS, _h: '', clientHeight: room,
    setAttribute() {}, addEventListener(t, fn) { LISTENERS[t] = fn; }, contains: () => false,
    querySelectorAll: sel => sel === 'li.ny-item[data-ny-key]' ? host.rows : sel === '[data-ny-act]' ? host.buttons : [],
    querySelector: sel => sel === '.ny-more' ? host.more : null,
    get scrollHeight() { return HEAD + host.rows.filter(r => !r.hidden).reduce((s, r) => s + r.h, 0) + (host.more && !host.more.hidden ? MORE : 0); },
    get innerHTML() { return this._h; },
    set innerHTML(h) {
      this._h = h; this.writes++;
      this.rows = [...h.matchAll(/<li class="ny-item ([^"]*)"([^>]*)>([\s\S]*?)<\/li>/g)].map(m => {
        const inner = m[3], labels = [...inner.matchAll(/class="ny-key\b[^"]*"[^>]*>([^<]*)</g)].map(k => k[1]);
        const row = { dataset: dataset(m[2]), labels, hidden: false, ageEl: { textContent: (/<span class="ny-age">([^<]*)<\/span>/.exec(inner) || [])[1] },
          // 60px of name and ask lines, then the keys: one row of them (40px), or Approve once · Deny stacked (80px)
          h: 60 + (!labels.length ? 0 : labels.includes('Approve once') ? 80 : 40) };
        // the ask line's box, as the browser reports it: a row the section folded away (hidden) is not laid out
        const what = { get clientHeight() { return row.hidden ? 0 : 40; }, get scrollHeight() { return row.hidden ? 0 : lineCut ? 60 : 40; },
          get clientWidth() { return row.hidden ? 0 : 150; }, get scrollWidth() { return row.hidden ? 0 : 150; } };
        row.querySelector = sel => sel === '.ny-age' ? row.ageEl : sel === '.ny-what' ? what : null;
        return row;
      });
      const mm = /<button type="button" class="ny-more"([^>]*)>([^<]*)<\/button>/.exec(h);
      this.more = mm ? { dataset: Object.assign(dataset(mm[1]), { nyAct: 'more' }), hidden: / hidden/.test(mm[1]), textContent: mm[2] } : null;
      this.buttons = [...h.matchAll(/<button type="button" class="ny-key[^"]*" data-ny-act="([^"]*)" data-ny-key="([^"]*)"[^>]*>([^<]*)</g)].map(m =>
        ({ dataset: { nyAct: m[1], nyKey: m[2] }, label: m[3], closest: sel => sel === 'li.ny-item' ? host.rows.find(r => r.dataset.nyKey === m[2]) || null : null }));
    } };
  doc.getElementById = id => id === 'ws-needs' ? host : null;
  global.document = doc;
  return host;
}
// a fresh section (another rail, another room): leaving SESSIONS and coming back makes the next render a full rebuild
function remount(room) { const host = makeHost(room); App.railView = () => 'projects'; NY.render(); delete App.railView; NY.render(); return host; }
const click = (host, b) => host.listeners.click({ target: { closest: sel => sel === '[data-ny-act]' ? b : null }, preventDefault() {}, stopPropagation() {} });
const headerOf = host => Number((/<span class="ny-count">(\d+)<\/span>/.exec(host.innerHTML) || [])[1]);
const moreOf = host => host.more && !host.more.hidden ? Number((/^(\d+) more$/.exec(host.more.textContent) || [])[1]) : 0;
const shownKeys = host => host.rows.filter(r => !r.hidden).map(r => r.dataset.nyKey);
const rowOf = (host, k) => host.rows.find(r => r.dataset.nyKey === k);
const keysOf = (host, k) => (rowOf(host, k) || { labels: [] }).labels.join(' · ');

(async () => {
  /* ---- 1. the fold counts waits: 2 asks, ULTRON's 23 builds, VEX's 2 untimed builds, a failed worker = 28 waits ---- */
  pending = [
    { wsId: 'proj', p: { promptId: 'q1', tool: 'brief.ask', argsSummary: JSON.stringify({ question: 'Which tier should lead?' }), agentId: 'agent', askedAt: NOW - 120000 } },
    { wsId: 'home', p: { promptId: 'a1', tool: 'fs.read', argsSummary: 'notes.md', agentId: 'agent', askedAt: NOW - 60000 } }];
  builds = Array.from({ length: 23 }, (_, i) => ({ runId: 'u' + i, agentId: 'ultron', title: 'Ghost run v' + i, builtAt: NOW - (40 - i) * 60000 }))
    .concat([{ runId: 'v0', agentId: 'vex', title: 'Pricing page', builtAt: 0 }, { runId: 'v1', agentId: 'vex', title: 'Pricing page v2' }]);
  workers = [{ runId: 'w1', status: 'error', agentId: 'mira', parentStreamId: 'home', completedAt: NOW - 30000 }];
  await NY.refreshFeeds(true);
  A.eq(NY.items(NOW).length, 28, 'fixture: 28 waits');

  let host = remount(10000);   // room for everything: only the three-row collapse folds
  A.eq(headerOf(host), 28, 'the header counts every wait');
  A.eq(shownKeys(host), ['ask:q1', 'ask:a1', 'build:u0'], 'collapsed, three rows show: the two asks and ULTRON\'s builds (one row, named by the oldest)');
  A.eq((rowOf(host, 'build:u0') || { dataset: {} }).dataset.nyN, '23', 'that row holds its 23 waits (data-ny-n)');
  A.eq(moreOf(host), 3, '"N more" counts the WAITS left out (VEX\'s 2 builds + the failed worker), never the 2 cards');
  A.eq(headerOf(host), 25 + moreOf(host), 'so the header is the waits shown (1 + 1 + 23) plus N more');

  /* ---- 2. the same when the room folds a card: ULTRON's builds fold, and all 23 of them are in "N more" ---- */
  host = remount(HEAD + 100 + 140 + MORE + 1);   // the question, the approval with Approve once · Deny stacked, the fold key
  A.eq(shownKeys(host), ['ask:q1', 'ask:a1'], 'a room for two rows shows two');
  A.eq(moreOf(host), 26, '"26 more": ULTRON\'s 23 builds, VEX\'s 2 and the failed worker');
  A.eq(headerOf(host), 2 + moreOf(host), 'the header (28) is still the waits shown plus N more');

  /* ---- 3. no time, no age: a card of untimed builds shows none (never "now") ---- */
  click(host, host.more);   // expand: every row
  A.eq(shownKeys(host), ['ask:q1', 'ask:a1', 'build:u0', 'build:v0', 'worker:w1'], 'expanded, every row shows');
  A.eq(rowOf(host, 'build:v0').ageEl.textContent, '', 'VEX\'s builds carry no time: their card shows no age (it said "now")');
  A.eq(rowOf(host, 'build:u0').ageEl.textContent, '40m', 'ULTRON\'s card shows its oldest build\'s age');
  click(host, host.more);   // Show fewer

  A.report('needs-you-fold.test');
})().catch(e => { console.error(e); process.exit(1); });
