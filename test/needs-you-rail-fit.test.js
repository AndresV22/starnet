'use strict';
/* node test/needs-you-rail-fit.test.js — NEEDS YOU's safety rule, held at every rail width and every TEXT SIZE (delta review
   10-15, and its fix round).

   The rail offers "Approve once" only when its ask line IS the whole request (needsyou.js); a line the rail cuts gets
   Review, which opens the card that shows all of it. The line is .ny-what: a box clamped to two lines in the rail's narrow
   column. Its width moves with the rail (168px in a browser window of 860px or less, 200px on a laptop, 232px on a desktop,
   up to 400px dragged) and its type with TEXT SIZE (a body zoom from 90% to 150% that the counter-zoomed rail does not
   follow). A fixed character count failed both ways: 48 let a 40-character ask be cut to "…" with Approve once beside it,
   and 23 still cut "wants to use fs rm: a" at HUGE (145%) while taking Approve once from a 28-character line that sits whole
   on a 232px rail at 100%. So needsyou.js reads the box it drew.

   This test lays each row out the way the browser does (the row's metrics from pipglass.css and the rail CSS, the bundled
   VT323's own advance width, word wrap with overflow-wrap: anywhere, the two-line clamp), on every rail, at every TEXT SIZE
   step and the 150% clamp, with and without the section's scrollbar, and drives the REAL render path with each row's box
   reporting that layout. Approve once must be offered exactly where the line lays out whole, the 1s heartbeat must follow
   a TEXT SIZE change, and a click must never approve a line that is cut now. */
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const glass = read('frontend/css/pipglass.css');
const appCss = read('frontend/css/app.css');
const stationui = read('frontend/app/stationui.js');

/* ---- the font: every VT323 glyph advances the same width (read from the bundled woff2's hmtx, not assumed) ---- */
function woff2Advances(buf) {
  const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];
  let o = 48;
  const numTables = buf.readUInt16BE(12), compressed = buf.readUInt32BE(20);
  const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[o++]; v = (v * 128) + (b & 0x7f); if (!(b & 0x80)) return v; } throw new Error('bad UIntBase128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[o++], idx = flags & 0x3f;
    let tag = KNOWN[idx] || '?';
    if (idx === 63) { tag = buf.toString('latin1', o, o + 4); o += 4; }
    const xf = (flags >> 6) & 3, len = b128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? xf === 0 : xf !== 0;
    tables.push({ tag, transformed, len: transformed ? b128() : len });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(o, o + compressed));
  let at = 0; const T = {};
  for (const t of tables) { T[t.tag] = Object.assign(t, { at }); at += t.len; }
  if (T.hmtx.transformed) throw new Error('hmtx is transformed: read the glyf table instead');
  const upem = data.readUInt16BE(T.head.at + 18), n = data.readUInt16BE(T.hhea.at + 34);
  const adv = new Set();
  for (let i = 0; i < n; i++) adv.add(data.readUInt16BE(T.hmtx.at + i * 4));
  return { upem, advances: [...adv].filter(a => a > 0) };   // 0 = combining marks, which take no room
}
const font = woff2Advances(fs.readFileSync(path.join(ROOT, 'frontend/assets/fonts/vt323.woff2')));
A.eq(font.advances.length, 1, 'VT323 is monospaced: one advance width for every spacing glyph (got ' + font.advances.join(', ') + ')');
const EM = font.advances[0] / font.upem;
A.ok(/#left \.ws-needs \{\s*flex: 0 0 auto;[^}]*font-family: 'VT323', monospace;/.test(glass), 'the NEEDS YOU section is set in VT323');

/* ---- the row: what stands between the rail's edge and the ask line, and the box that cuts it ---- */
const block = sel => {
  const at = glass.indexOf(sel + ' {');
  A.ok(at >= 0, 'pipglass.css still has `' + sel + ' {`');
  return glass.slice(at, glass.indexOf('}', at));
};
const px = (src, re, what) => { const m = re.exec(src); A.ok(!!m, what + ' (update the layout below if this moved)'); return m ? m.slice(1).map(Number) : [NaN]; };
const needs = block('body.glass-demo:not(.hud-mode) #left .ws-needs');
const item = block('body.glass-demo:not(.hud-mode) #left .ws-needs .ny-item');
const what = block('body.glass-demo:not(.hud-mode) #left .ws-needs .ny-what');
const [needsMx] = px(needs, /margin: \d+px (\d+)px \d+px;/, 'the section keeps its side margins');
const [itemMx] = px(item, /margin: 0 (\d+)px;/, 'a row keeps its side margins');
const [itemPx] = px(item, /padding: \d+px (\d+)px \d+px;/, 'a row keeps its side padding');
const [itemBorder] = px(item, /border: (\d+)px solid transparent;/, 'a row keeps its 1px edge');
const [lampCol] = px(item, /grid-template-columns: (\d+)px minmax\(0, 1fr\);/, 'a row keeps its lamp column');
const [colGap] = px(item, /column-gap: (\d+)px;/, 'a row keeps its column gap');
const [fontPx] = px(what, /font-size: (\d+)px;/, 'the ask line keeps its type size');
const [lineH] = px(what, /line-height: (\d*\.?\d+);/, 'the ask line keeps its line height');
const [spacing] = px(what, /letter-spacing: (\.?\d*\.?\d+)px;/, 'the ask line keeps its letter-spacing');
const [clamp] = px(what, /-webkit-line-clamp: (\d+);/, 'the ask line is clamped');
// needsyou.js reads .ny-what's own scroll box: the clamp that cuts the line must be on THAT box, or the reading sees nothing cut
A.ok(/overflow: hidden;/.test(what) && /display: -webkit-box;/.test(what) && /-webkit-box-orient: vertical;/.test(what),
  'the clamp is on .ny-what itself (overflow hidden, a vertical -webkit-box): the box the rail reads is the box that cuts');
A.ok(/overflow-wrap: anywhere;/.test(what), 'a word too long for a line breaks anywhere (the layout below wraps the same way)');
const [railEdge] = px(read('frontend/css/glass-demo.css'), /\.glass-demo :is\(#left,#chat-panel,#topbar,#bottombar\) \{\s*background: var\(--gd-face\); border: (\d+)px solid/, 'the rail keeps its 1px edge');
const inset = 2 * (railEdge + needsMx + itemMx + itemBorder + itemPx) + lampCol + colGap;

/* ---- the rails (px, and whether TEXT SIZE's zoom is counter-zoomed out of their width) ---- */
const [desk] = px(appCss, /grid-template-columns: calc\(var\(--crew-w, (\d+)px\) \* var\(--cz\)\) 1fr/, 'a desktop window keeps its counter-zoomed default rail');
const [laptop] = px(read('frontend/css/comms-layout.css'), /@media \(min-width: 861px\) and \(max-width: 1440px\), \(min-width: 861px\) and \(max-height: 740px\) \{\s*body #screen-game\.active \{[^}]*grid-template-columns: calc\(var\(--crew-w, (\d+)px\) \* var\(--cz\)\)/, 'a laptop window keeps its counter-zoomed default rail');
const [narrow] = px(appCss, /@media \(max-width: 860px\) \{\s*#screen-game\.active \{[^}]*grid-template-columns: (\d+)px 1fr;/, 'a browser window of 860px or less keeps its fixed rail (not counter-zoomed: it grows with TEXT SIZE)');
const [dragMin, dragMax] = px(read('frontend/app/leftrail.js'), /WMIN = (\d+), WMAX = (\d+),/, 'the rail seam keeps its range');
const RAILS = [{ px: narrow, cz: false, name: narrow + 'px narrow window' }, { px: laptop, cz: true, name: laptop + 'px laptop' },
  { px: desk, cz: true, name: desk + 'px desktop' }, { px: dragMin, cz: true, name: dragMin + 'px dragged (narrowest)' }, { px: dragMax, cz: true, name: dragMax + 'px dragged (widest)' }];
A.ok(/#left > h3, #chat-panel > h3, \.ws-head \{ zoom: var\(--sn-unzoom, 1\); --cz: 1; \}/.test(appCss) && !/#left[^{]*\.ws-needs[^{]*\{[^}]*zoom:/.test(glass),
  'NEEDS YOU is not counter-zoomed: its text grows with TEXT SIZE inside the rail');

/* ---- every TEXT SIZE a user can pick, AUTO's steps, and the clamp on a stored value ---- */
const steps = [...((/const TEXT_SCALES = \[([^\n]+)\];/.exec(stationui) || [])[1] || '').matchAll(/\[(\d+), '[A-Z-]+'\]/g)].map(m => Number(m[1])).filter(Boolean);
A.ok(steps.length >= 5, 'TEXT SIZE keeps its steps (' + steps.join(', ') + ')');
const autoSteps = px(stationui, /return long <= 1470 \? (\d+) : long <= 1740 \? (\d+) : (\d+);/, 'AUTO text size keeps its steps');
const [lo, hi] = px(stationui, /return n === 0 \? autoTextScale\(\) : clampN\(n, (\d+), (\d+), 100\);/, 'a stored TEXT SIZE is clamped');
const ZOOMS = [...new Set([...steps, ...autoSteps, lo, hi])].sort((a, b) => a - b);
A.ok(ZOOMS.includes(130) && ZOOMS.includes(145) && ZOOMS.includes(150), 'X-LARGE, HUGE and the 150% clamp are all laid out (' + ZOOMS.join(', ') + ')');

/* ---- the browser's layout of one ask line: greedy wrap at spaces, a word too long for a line broken anywhere ---- */
const perChar = fontPx * EM + spacing;
let layout = { rail: RAILS[1], zoom: 100, bar: 0, laid: true };
const lineWidth = () => (layout.rail.cz ? layout.rail.px / (layout.zoom / 100) : layout.rail.px) - inset - layout.bar;
function linesOf(text) {
  const per = Math.max(1, Math.floor(lineWidth() / perChar));
  let lines = 1, cur = 0;
  const place = w => { lines += Math.floor((w.length - 1) / per); cur = ((w.length - 1) % per) + 1; };
  for (const w of text.split(' ').filter(Boolean)) {
    if (!cur) place(w);
    else if (cur + 1 + w.length <= per) cur += 1 + w.length;
    else { lines++; place(w); }
  }
  return lines;
}
const unesc = s => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// the box needsyou.js reads: live getters, so a TEXT SIZE change moves it with no redraw (as the browser's does)
function box(text) {
  const h = n => Math.round(n * fontPx * lineH);
  return {
    get clientHeight() { return layout.laid ? h(Math.min(linesOf(text), clamp)) : 0; },
    get scrollHeight() { return layout.laid ? h(linesOf(text)) : 0; },
    get clientWidth() { return layout.laid ? Math.floor(lineWidth()) : 0; },
    get scrollWidth() { return layout.laid ? Math.floor(lineWidth()) : 0; }   // overflow-wrap: anywhere never overflows sideways
  };
}

/* ---- the real page objects: the approval card's own phrase and INSPECT rule (chat.js, run for real) and the rail ---- */
const card = {};
{
  const src = read('frontend/app/chat.js'), at = src.indexOf('function glance(');
  vm.createContext(card); vm.runInContext(src.slice(at, src.indexOf('  function clarifyRow(', at)), card);
}
let pending = [];
const opened = [], answered = [];
global.localStorage = { getItem: () => null, setItem() {} };
global.Workstreams = { get: id => id === 'home' ? { id: 'home', title: null, agentId: 'agent' } : null, list: () => [], unread: () => false, generalId: () => 'home' };
global.Channels = { allPending: () => pending };
global.App = { agentName: id => ({ agent: 'NOVA' })[id] || id, openWorkstream: id => opened.push(id) };
global.Chat = { consentPhrase: card.actionPhrase, consentInspect: card.consentInspect, revealAsk: () => true, answerConsent: async (p, ws, d) => { answered.push(p.promptId + ':' + d); } };
const doc = { activeElement: null, hidden: false };
const host = { hidden: false, rows: [], buttons: [], listeners: {}, _h: '',
  setAttribute() {}, addEventListener(t, fn) { this.listeners[t] = fn; }, contains: () => false,
  querySelectorAll: sel => sel === 'li.ny-item[data-ny-key]' ? host.rows : sel === '[data-ny-act]' ? host.buttons : [],
  get innerHTML() { return this._h; },
  set innerHTML(h) {
    this._h = h;
    this.rows = [...h.matchAll(/<li class="ny-item [^"]*" data-ny-key="([^"]*)">[\s\S]*?<span class="ny-age">([^<]*)<\/span>[\s\S]*?<div class="ny-what"[^>]*>([\s\S]*?)<\/div>/g)].map(m => {
      const ageEl = { textContent: m[2] }, whatEl = box(unesc(m[3]));
      return { dataset: { nyKey: m[1] }, text: unesc(m[3]), querySelector: sel => sel === '.ny-age' ? ageEl : sel === '.ny-what' ? whatEl : null };
    });
    this.buttons = [...h.matchAll(/<button type="button" class="([^"]*)" data-ny-act="([^"]*)" data-ny-key="([^"]*)"[^>]*>([^<]*)</g)].map(m =>
      ({ className: m[1], dataset: { nyAct: m[2], nyKey: m[3] }, label: m[4], closest: sel => sel === 'li.ny-item' ? host.rows.find(r => r.dataset.nyKey === m[3]) || null : null }));
  } };
doc.getElementById = id => id === 'ws-needs' ? host : null;
global.document = doc;
const NY = require('../frontend/app/needsyou.js');
const keysOf = k => host.buttons.filter(b => b.dataset.nyKey === k && /\bny-key\b/.test(b.className)).map(b => b.label).join(' · ');
const click = (act, k) => host.listeners.click({ target: { closest: sel => sel === '[data-ny-act]' ? host.buttons.find(b => b.dataset.nyAct === act && b.dataset.nyKey === k) : null }, preventDefault() {}, stopPropagation() {} });

// the shapes the sidecar sends (consentSummary): a lone path is the bare path; a call with no arguments is '{}'
const ASKS = [['mcp__fs__rm', 'a'], ['mcp__fs__rm', 'a.md'], ['fs.list', 'src'], ['mcp__fs__rm', 'notes.md'], ['fs.read', 'notes.md'],
  ['mcp__filesystem__read_file', 'notes.md'], ['fs.read', 'notes/launch-prep/pricing.md'], ['mcp__git__push', '{}']];
let n = 0;
function show(tool, argsSummary) {
  const p = { promptId: 'fit' + (++n), tool, argsSummary, agentId: 'agent', askedAt: Date.now() - 1000 };
  pending = [{ wsId: 'home', p }];
  NY.render();
  return 'ask:' + p.promptId;
}
const sayLine = k => (host.rows.find(r => r.dataset.nyKey === k) || {}).text;

/* ---- 1. every rail × every TEXT SIZE × the section's scrollbar off and on: Approve once exactly where the line lays out whole ---- */
const wrong = [];
let wholeSeen = 0, cutSeen = 0;
for (const rail of RAILS) for (const zoom of ZOOMS) for (const bar of [0, 10]) for (const [tool, args] of ASKS) {
  layout = { rail, zoom, bar, laid: true };
  const k = show(tool, args), line = sayLine(k), lines = linesOf(line), detail = !!card.consentInspect({ tool, argsSummary: args });
  const want = !detail && lines <= clamp ? 'Approve once · Deny' : 'Review · Deny';
  if (!detail) { if (lines <= clamp) wholeSeen++; else cutSeen++; }
  if (keysOf(k) !== want) wrong.push(rail.name + ' @' + zoom + '%' + (bar ? ' +bar' : '') + ': "' + line + '" (' + lines + ' lines) offered ' + keysOf(k) + ', not ' + want);
}
A.ok(wholeSeen > 20 && cutSeen > 20, '(the layouts include many whole lines and many cut ones: ' + wholeSeen + ' whole, ' + cutSeen + ' cut)');
A.eq(wrong.slice(0, 6), [], 'at every rail width and TEXT SIZE, Approve once is offered exactly for a line the rail shows whole (' + wrong.length + ' wrong)');

/* ---- 2. the cases the reviews named ---- */
const at = (railPx, zoom, tool, args, bar) => { layout = { rail: RAILS.find(r => r.px === railPx), zoom, bar: bar || 0, laid: true }; const k = show(tool, args); return { k, line: sayLine(k), keys: keysOf(k) }; };
let c = at(laptop, 145, 'mcp__fs__rm', 'a');
A.eq(c.line, 'wants to use fs rm: a', '(HUGE on a laptop: the rm ask\'s line)');
A.eq(c.keys, 'Review · Deny', 'HUGE (145%) on the 200px laptop rail cuts "wants to use fs rm: a" (' + linesOf(c.line) + ' lines): reviewed on its card, never approved blind');
c = at(laptop, 130, 'mcp__fs__rm', 'a', 10);
A.eq(c.keys, linesOf(c.line) > clamp ? 'Review · Deny' : 'Approve once · Deny', 'X-LARGE (130%) with the list scrolling: the same line follows what the rail shows (' + linesOf(c.line) + ' lines)');
c = at(laptop, 115, 'mcp__filesystem__read_file', 'notes.md');
A.eq(c.keys, 'Review · Deny', 'AUTO\'s 115% on the laptop rail cuts a 43-character ask ("' + c.line + '"): reviewed on its card');
c = at(desk, 100, 'mcp__fs__rm', 'notes.md');
A.eq([c.line, linesOf(c.line), c.keys].join(' | '), 'wants to use fs rm: notes.md | 2 | Approve once · Deny', 'a 28-character rm ask that sits whole on the 232px desktop rail at 100% keeps one-tap Approve once (org P02)');
c = at(desk, 100, 'fs.read', 'notes.md');
A.eq(c.keys, 'Approve once · Deny', 'so does "wants to use fs read: notes.md" on the desktop rail at 100%');
c = at(desk, 100, 'mcp__git__push', '{}');
A.eq(c.keys, 'Review · Deny', 'a call with no arguments (the sidecar sends "{}") has an INSPECT panel, so it is reviewed on its card wherever it fits');

/* ---- 3. the 1s heartbeat follows a TEXT SIZE change with no list change; a click reads the line again ---- */
c = at(desk, 100, 'fs.read', 'notes.md');
A.eq(c.keys, 'Approve once · Deny', '(at 100% the line is whole: Approve once)');
layout.zoom = 145;   // the Commander picks HUGE: nothing in the list moves
answered.length = 0; opened.length = 0;
click('once', c.k);
A.eq(answered, [], 'a click on Approve once after the line was cut (before the heartbeat redrew it) approves nothing');
A.eq(opened, ['home'], '…it opens the card that shows the whole request instead');
NY.render();   // the heartbeat
A.eq(keysOf(c.k), 'Review · Deny', 'the next heartbeat re-reads the line and offers Review');
layout.zoom = 100; NY.render();
A.eq(keysOf(c.k), 'Approve once · Deny', 'back at 100% the heartbeat gives Approve once back');
click('once', c.k);
A.eq(answered, [c.k.slice(4) + ':once'], 'and a click on a line read whole approves it once, through the card\'s own path');

/* ---- 4. a line that cannot be read (its row hidden, not laid out) is never approved from the rail ---- */
c = at(desk, 100, 'fs.read', 'a.md'); layout.laid = false; NY.render();
A.eq(keysOf(c.k), 'Review · Deny', 'a row with no layout to read offers Review');

A.report('needs-you-rail-fit');
