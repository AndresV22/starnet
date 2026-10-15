'use strict';
/* node test/needs-you-rail-fit.test.js — NEEDS YOU's safety rule, tied to the rail it is drawn in (delta review 10-15).

   The rail offers "Approve once" only when its ask line IS the whole request (needsyou.js hiddenDetail); a longer line
   gets Review, which opens the card that shows all of it. The line is .ny-what: a clamped box in a narrow grid column.
   RAIL_CHARS was 48, written for the old three-line clamp. 7732c09c9 made the clamp two lines in a narrower column, so a
   40-character ask was cut to "…" on the rail while the rail still offered to approve it.

   This test DERIVES the budget from the sources that decide it (the row's CSS, the rail's narrowest default width, AUTO's
   largest text step, the bundled font's own advance widths) and pins RAIL_CHARS to it, so a restyle of the row, a new rail
   width, a new AUTO step or a new font fails here first and the number is re-derived, never left stale. */
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const glass = read('frontend/css/pipglass.css');
const ny = read('frontend/app/needsyou.js');

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
A.eq(EM, 0.4, 'VT323 advances 0.4em a character');
A.ok(/#left \.ws-needs \{\s*flex: 0 0 auto;[^}]*font-family: 'VT323', monospace;/.test(glass), 'the NEEDS YOU section is set in VT323');

/* ---- the row: what stands between the rail's edge and the ask line ---- */
const block = sel => {
  const at = glass.indexOf(sel + ' {');
  A.ok(at >= 0, 'pipglass.css still has `' + sel + ' {`');
  return glass.slice(at, glass.indexOf('}', at));
};
const px = (src, re, what) => { const m = re.exec(src); A.ok(!!m, what + ' (re-derive RAIL_CHARS if this moved)'); return m ? m.slice(1).map(Number) : [NaN]; };
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
const [spacing] = px(what, /letter-spacing: (\.?\d*\.?\d+)px;/, 'the ask line keeps its letter-spacing');
const [clamp] = px(what, /-webkit-line-clamp: (\d+);/, 'the ask line is clamped');
A.eq(clamp, 2, 'the ask line clamps at TWO lines (the budget below is derived for two: re-derive it for any other clamp)');
A.ok(/overflow-wrap: anywhere;/.test(what), 'a word too long for a whole line breaks anywhere, so only line 1\'s end can strand room');
const [railEdge] = px(read('frontend/css/glass-demo.css'), /\.glass-demo :is\(#left,#chat-panel,#topbar,#bottombar\) \{\s*background: var\(--gd-face\); border: (\d+)px solid/, 'the rail keeps its 1px edge');
const [scrollbar] = px(glass, /#left \.ws-needs::-webkit-scrollbar \{ width: (\d+)px; \}/, 'the section declares its scrollbar width (an expanded list scrolls inside it)');

/* ---- the rail: its narrowest default, and the text zoom AUTO gives exactly the machines that get it ---- */
const layout = read('frontend/css/comms-layout.css');
const [rail] = px(layout, /@media \(min-width: 861px\) and \(max-width: 1440px\), \(min-width: 861px\) and \(max-height: 740px\) \{\s*body #screen-game\.active \{[^}]*grid-template-columns: calc\(var\(--crew-w, (\d+)px\) \* var\(--cz\)\)/, 'a laptop window (861-1440px) keeps its default rail, out-specifying app.css\'s narrower breakpoints');
A.eq(rail, 200, 'the narrowest default rail is 200px');
const [floorW] = px(read('src-tauri/src/main.rs'), /\.min_inner_size\((\d+)\.0, \d+\.0\)/, 'the desktop window keeps its minimum width');
A.ok(floorW >= 861, 'the window never narrows into the 860px layout (its 168px rail is never shown in the app)');
const [dragMin] = px(read('frontend/app/leftrail.js'), /WMIN = (\d+),/, 'the rail seam keeps its minimum');
A.ok(dragMin >= rail, 'a dragged rail is never narrower than the default');
const [autoMax] = px(read('frontend/app/stationui.js'), /return long <= 1470 \? (\d+) : long <= 1740 \? (\d+) : (\d+);/, 'AUTO text size keeps its steps');
const zoom = autoMax / 100;   // AUTO's largest step lands on the small screens, i.e. the windows that get the 200px rail
A.ok(!/#left[^{]*\.ws-needs[^{]*\{[^}]*zoom:/.test(glass) && /#left > h3, #chat-panel > h3, \.ws-head \{ zoom: var\(--sn-unzoom, 1\); --cz: 1; \}/.test(read('frontend/css/app.css')),
  'the rail is counter-zoomed but NEEDS YOU is not: its text grows with TEXT SIZE inside a rail that does not');

/* ---- the budget ---- */
const line = rail / zoom - 2 * (railEdge + needsMx + itemMx + itemBorder + itemPx) - lampCol - colGap - scrollbar;
const perChar = fontPx * EM + spacing;
const perLine = Math.floor(line / perChar);
const verb = (/const KIND = \{ approval: '([^']+)'/.exec(ny) || [])[1];
A.eq(verb, 'wants to', 'an approval\'s line opens with its ask word');
// line 1 always holds the ask word; everything after it must fit ONE whole line wherever its words break
const budget = (verb + ' ').length + perLine;
const RAIL_CHARS = Number((/const RAIL_CHARS = (\d+);/.exec(ny) || [])[1]);
A.eq(RAIL_CHARS, budget, 'RAIL_CHARS is what the narrowest rail always shows whole: ' + rail + 'px rail at ' + autoMax + '% text = '
  + line.toFixed(1) + 'px of line, ' + perChar.toFixed(1) + 'px a character, ' + perLine + ' a line, + "' + verb + ' " = ' + budget);

/* ---- the rule it feeds: Approve once only for a line that budget covers ---- */
global.localStorage = { getItem: () => null, setItem() {} };
global.document = undefined;
let phrase = '';
global.Chat = { consentInspect: () => null, consentPhrase: () => phrase };
const NY = require('../frontend/app/needsyou.js');
const keys = text => { phrase = text; return NY._internals.keysFor({ key: 'ask:fit', kind: 'approval', p: { promptId: 'fit', tool: 'fs.read', argsSummary: text } }); };
const once = html => /data-ny-act="once"[^>]*>Approve once</.test(html);
const review = html => /data-ny-act="open"[^>]*>Review</.test(html) && !/data-ny-act="once"/.test(html);
const fill = n => 'read ' + 'x'.repeat(Math.max(0, n - (verb + ' read ').length));
A.ok(once(keys(fill(budget))), 'a ' + budget + '-character line (all the rail always shows) is still one-tap Approve once');
A.ok(review(keys(fill(budget + 1))), 'a line one character longer is reviewed on its card');
// the delta review's case: a request that fit the old 48 but is cut to "…" on today's two-line clamp
const cut = 'read notes/launch-prep/pricing.md';
A.ok((verb + ' ' + cut).length <= 48 && (verb + ' ' + cut).length > budget, '(the case is longer than the rail shows and shorter than the old 48)');
A.ok(review(keys(cut)), 'a 42-character ask the two-line clamp cuts is never approved blind from the rail: ' + keys(cut));
A.ok(/data-ny-act="deny"[^>]*>Deny</.test(keys(cut)), 'refusing it stays one tap');

A.report('needs-you-rail-fit');
