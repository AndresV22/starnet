/* test/conveyor-no-handoff.test.js — A BELT NEVER RUNS OUT OF AN OUTBOX OR INTO AN INBOX (2026-10-09 P0).

   Lines do not hand work to each other (dispatch never routes THROUGH an OUTBOX; an INBOX is where a line starts). A real user
   lost three days to the floor accepting a belt from one line's OUTBOX into the next line's INBOX: it chimed "CONNECTED · N belts
   laid themselves" and fused the two lines into one jumbled line. Locked here, on a real station:
     THE BELT TOOL   — connectBelt refuses OUTBOX → anything and anything → INBOX: a code, a plain reason that says what to do
                       instead, nothing laid, no undo slot used; the lane preview (previewBelt) refuses the same, with the floor
                       caption; connectRefusal answers the BELT tool's FIRST click (an OUTBOX is never a start).
     A HAND-DRAWN RUN — placeBeltRun / canPlaceBeltRun (the ghost) refuse a run the floor would read as a link out of an OUTBOX
                       or into an INBOX; a run between two steps is still laid.
     THE WIRING      — REFIT says it where the click was (first click, hover caption, the drag ghost). */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
require('../frontend/app/pipeline.js');
const WM = require('../frontend/app/worldmodel.js');
const LE = require('../frontend/app/lineedit.js');

const FROM_OUTBOX = 'An OUTBOX ends its line. Lines can’t hand work to each other yet — to chain them, belt this line’s last BAY into the next line’s first BAY.';
const INTO_INBOX = 'An INBOX is where a line starts — nothing can belt into it.';

function twoLines() {
  const d = WM.starterDoc();
  for (const id in d.rooms) for (const r of d.rooms[id].rects) { r.x2 = 40; r.y2 = 30; }
  const st = WM.create(d);
  const a = LE.placeBlueprint(st, 'research_line', { x: 8, y: 4 }), b = LE.placeBlueprint(st, 'research_line', { x: 8, y: 16 });
  if (!a.ok || !b.ok) throw new Error('placeBlueprint ' + JSON.stringify([a, b]));
  for (const p of st.props()) if (p.t === 'bay' && !p.agentId) st.assignPropAgent(p.id, 'ag_' + p.id);
  const of = (ids, t) => ids.filter(id => st.propById(id).t === t);
  return { st, A: { intake: of(a.ids, 'intake')[0], bays: of(a.ids, 'bay'), outbox: of(a.ids, 'outbox')[0] }, B: { intake: of(b.ids, 'intake')[0], bays: of(b.ids, 'bay'), outbox: of(b.ids, 'outbox')[0] } };
}
const snap = st => JSON.stringify({ props: st.props(), belts: st.belts(), links: st.links() });

/* ---------- THE BELT TOOL ---------- */
{
  const { st, A: a, B: b } = twoLines();
  A.ok(Array.isArray(st.links()), 'the floor builds by links (the live case)');
  const s0 = snap(st), undo0 = st.canUndo();
  const cases = [
    ['OUTBOX → the next line\'s INBOX (the live case)', a.outbox, b.intake, 'FROM_OUTBOX', FROM_OUTBOX],
    ['OUTBOX → the next line\'s first BAY', a.outbox, b.bays[0], 'FROM_OUTBOX', FROM_OUTBOX],
    ['the last BAY → the next line\'s INBOX', a.bays[a.bays.length - 1], b.intake, 'INTO_INBOX', INTO_INBOX],
    ['a BAY → its own line\'s INBOX', a.bays[0], a.intake, 'INTO_INBOX', INTO_INBOX]
  ];
  for (const [label, from, to, code, msg] of cases) {
    const r = st.connectBelt(from, to);
    A.ok(r && r.ok === false && r.error === code, label + ': refused ' + code + ' — ' + JSON.stringify(r));
    A.eq(r && r.msg, msg, label + ': …in words that say what to do instead');
    const pv = st.previewBelt(from, to);
    A.ok(pv && pv.ok === false && pv.error === code && pv.msg === msg && typeof pv.short === 'string' && pv.short.length > 10, label + ': the lane preview refuses the same, with a floor caption — ' + JSON.stringify(pv));
  }
  A.eq(snap(st), s0, 'nothing was laid: props, belts and links exactly as before');
  A.eq(st.canUndo(), undo0, 'and no undo slot was used');
  A.eq((st.connectRefusal(a.outbox, null) || {}).error, 'FROM_OUTBOX', 'the BELT tool\'s FIRST click on an OUTBOX is refused (it is never where a belt starts)');
  A.eq(st.connectRefusal(a.bays[0], null), null, '…a BAY is a fine start');
  A.eq((st.connectRefusal(a.bays[0], b.intake) || {}).error, 'INTO_INBOX', '…and an INBOX is never a destination');
  // the way the message says to chain two lines still works: the last BAY into the next line's first BAY
  const ok = st.connectBelt(a.bays[a.bays.length - 1], b.bays[0]);
  A.ok(ok && ok.ok === true && ok.count > 0, 'belting the last BAY into the next line\'s first BAY is laid — ' + JSON.stringify(ok));
}

/* ---------- A HAND-DRAWN RUN ---------- */
{
  const d = WM.starterDoc();
  for (const id in d.rooms) for (const r of d.rooms[id].rects) { r.x2 = 40; r.y2 = 30; }
  const st = WM.create(d);
  const r0 = LE.run(st, null, 'newLine', { role: 'WRITER' }, { near: { x: 6, y: 4 } });
  A.ok(r0.ok, 'a line: INBOX → WRITER → OUTBOX');
  const ob = st.props().find(p => p.t === 'outbox'), bay = st.props().find(p => p.t === 'bay');
  // a lone BAY east of the OUTBOX, a lone INBOX south of the WRITER
  const lb = st.addProp({ t: 'bay', x: ob.x + ob.w + 4, y: ob.y, w: 2, h: 2 });
  const li = st.addProp({ t: 'intake', x: bay.x, y: bay.y + bay.h + 4, w: 2, h: 2 });
  A.ok(lb.ok && li.ok, 'a lone BAY and a lone INBOX stand on the floor');
  const s0 = snap(st);
  // a straight run from the tile beside the OUTBOX's east side, into the lone BAY: the floor would read OUTBOX → BAY
  const run1 = [{ tx: ob.x + ob.w, ty: ob.y }, { tx: ob.x + ob.w + 3, ty: ob.y }];
  const g1 = st.canPlaceBeltRun(run1[0], run1[1]), p1 = st.placeBeltRun(run1[0], run1[1]);
  A.ok(g1.ok === false && g1.error === 'FROM_OUTBOX' && g1.msg === FROM_OUTBOX && !!g1.short, 'the drag ghost refuses a run out of an OUTBOX — ' + JSON.stringify(g1));
  A.ok(p1.ok === false && p1.error === 'FROM_OUTBOX', '…and so does the drop: ' + JSON.stringify(p1));
  // a run down from the WRITER's south side into the lone INBOX: the floor would read WRITER → INBOX
  const run2 = [{ tx: bay.x, ty: bay.y + bay.h }, { tx: bay.x, ty: bay.y + bay.h + 3 }];
  const g2 = st.canPlaceBeltRun(run2[0], run2[1]), p2 = st.placeBeltRun(run2[0], run2[1]);
  A.ok(g2.ok === false && g2.error === 'INTO_INBOX' && g2.msg === INTO_INBOX, 'the drag ghost refuses a run into an INBOX — ' + JSON.stringify(g2));
  A.ok(p2.ok === false && p2.error === 'INTO_INBOX', '…and so does the drop');
  A.eq(snap(st), s0, 'nothing was laid');
  // a run from the WRITER's south side into the lone BAY below it is still laid (a step handing to a step)
  st.removeProp(li.id);
  const lb2 = st.addProp({ t: 'bay', x: bay.x, y: bay.y + bay.h + 4, w: 2, h: 2 });
  A.ok(lb2.ok, 'a lone BAY below the WRITER');
  const p3 = st.placeBeltRun(run2[0], run2[1]);
  A.ok(p3.ok === true && p3.count === 4, 'a hand-drawn run from a step into a step is laid — ' + JSON.stringify(p3));
  A.ok(st.links().some(l => l.from.prop === bay.id && l.to.prop === lb2.id), '…and the floor reads it as WRITER → the new BAY');
}

/* ---------- THE WIRING: REFIT says it where the click was ---------- */
{
  const build = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'build.js'), 'utf8');
  A.ok(/const no = station\.connectRefusal \? station\.connectRefusal\(pid, null\) : null;\s*if \(no\) \{ sfx\('bad'\); flashTip\(ev, no\.msg, false\); return; \}/.test(build), 'the BELT tool\'s first click on an OUTBOX is refused at the click, in the refusal\'s own words');
  A.ok(/\(pv && !pv\.ok\) \? \(pv\.short \|\| 'NO ROUTE — '/.test(build), 'hovering an INBOX mid-connect captions the refusal, not "NO ROUTE"');
  A.ok(/if \(g\.v && g\.v\.short\) return g\.v\.short;/.test(build), 'a hand-drawn run\'s ghost carries the refusal\'s caption');
  A.ok(/else \{ sfx\('bad'\); flashTip\(ev, \(res && res\.msg\) \|\| 'no clear route between those machines', false\); \}/.test(build), 'a refused second click says the refusal\'s words (and never chimes)');
}

A.report('conveyor-no-handoff.test');
