/* test/build-hand-circle.test.js — NO CIRCLE BUT A LOOP'S (2026-10-11, found live on the SELECT MOVES refine).
   The bug: BAY p20 dragged onto BAY p19 — p19 already feeding p20 — went GREEN ("JOIN AN EMPTY BAY'S INPUT") and laid p20 → p19.
   The compiler calls that work-line circle CHAIN_CYCLE, a BLOCKING error: the plan is no longer deployable and routing stops for
   the WHOLE station — and on an uncrewed floor nothing shows at all until the bays are crewed. A LOOP gate's BACK lane is the one
   sanctioned way to send work back (pipeline.js never counts it as a static hand-off).
   Locked here, against the real station model (worldmodel.js) and the real compiler (pipeline.js):
     · every way a lane is laid refuses a circle — connect (the BELT tool's two clicks, the hand's connect, JOIN A LINE), re-route,
       merge, branch (to a machine and to a belt), a hand-drawn belt run — in the ONE verdict its preview reads, so the ghost goes red
       where the commit would refuse, with the same words; nothing is written, the edit counter and the undo stack do not move;
     · a LOOP's back lane is still laid, and the floor compiles clean;
     · a paste never brings a circle onto the floor (a legacy floor's circle is not copied), and the empty-floor drop / a drop-pick
       never makes one (its new piece hands work to nothing). */
'use strict';
const A = require('./_assert.js');
const WM = require('../frontend/app/worldmodel.js');
const P = require('../frontend/app/pipeline.js');

const plan = s => P.compileRoutingPlan(s.projectGeometry());
const blocking = s => plan(s).errors.filter(e => !e.warn).map(e => e.code);
const circular = s => plan(s).errors.some(e => e.code === 'CYCLE' || e.code === 'CHAIN_CYCLE');
function fresh() { const s = WM.create(); s.projectGeometry(); s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 70, y2: 30 } }); return s; }
const add = (s, t, x, y) => { const big = t === 'bay' || t === 'intake' || t === 'outbox'; return s.addProp({ t, x, y, w: big ? 2 : 1, h: big ? 2 : 1, block: big }).id; };
const linkOf = (s, a, b) => (s.links() || []).find(l => l.from.prop === a && l.to.prop === b);
const pairs = s => (s.links() || []).map(l => l.from.prop + '>' + l.to.prop).sort().join(' ');
const frozen = s => JSON.stringify(s.serialize()) + '|' + s.getSeq() + '|' + s.canUndo();
const CIRCLE = /^A CIRCLE — THAT [A-Z]+ ALREADY HANDS WORK BACK TO THIS [A-Z]+ · USE A LOOP TO SEND WORK BACK$/;
// INBOX → BAY → BAY (→ BAY) (→ OUTBOX) along y=4
function line(s, o) {
  const I = add(s, 'intake', 32, 4), B1 = add(s, 'bay', 40, 4), B2 = add(s, 'bay', 48, 4);
  const B3 = o && o.b3 ? add(s, 'bay', 56, 4) : null, O = o && o.outbox ? add(s, 'outbox', 64, 4) : null;
  if (!(o && o.uncrewed)) { s.assignPropAgent(B1, 'a'); s.assignPropAgent(B2, 'b'); if (B3) s.assignPropAgent(B3, 'c'); }
  const chain = [I, B1, B2, B3, O].filter(Boolean);
  for (let i = 1; i < chain.length; i++) A.ok(s.connectBelt(chain[i - 1], chain[i]).ok, 'rig: belt ' + chain[i - 1] + '→' + chain[i]);
  A.eq(blocking(s), [], 'rig: the line compiles with no blocking error');
  return { I, B1, B2, B3, O };
}
// a refusal that names the circle, writes nothing, and leaves the floor routable
function refused(s, r, before, what) {
  A.ok(r && r.ok === false && r.error === 'CIRCLE', what + ' is refused as a CIRCLE (got ' + JSON.stringify(r && (r.error || r.ok)) + ')');
  A.ok(r && CIRCLE.test(String(r.short || '')), what + ' says why on the floor: ' + (r && r.short));
  A.eq(frozen(s), before, what + ': nothing written — no belt, no edit, no undo slot');
  A.ok(!circular(s), what + ': the floor has no CYCLE / CHAIN_CYCLE (routing stays on)');
}

/* 1. the bug as found: the last BAY belted back into the BAY that feeds it — crewed (CHAIN_CYCLE) and uncrewed (invisible) */
for (const uncrewed of [false, true]) {
  const s = fresh(), L = line(s, { uncrewed });
  const before = frozen(s), tag = uncrewed ? ' (uncrewed)' : ' (crewed)';
  const pv = s.previewBelt(L.B2, L.B1);
  refused(s, pv, before, 'the preview of BAY → the BAY that feeds it' + tag);
  refused(s, s.connectBelt(L.B2, L.B1), before, 'the connect (the hand\'s release, the BELT tool\'s second click)' + tag);
  A.eq(pv.short, s.connectBelt(L.B2, L.B1).short, 'preview and commit say the same words' + tag);
  refused(s, s.connectRefusal(L.B2, L.B1), before, 'the BELT tool\'s armed check' + tag);
  if (!uncrewed) A.eq(pv.short, 'A CIRCLE — THAT BAY ALREADY HANDS WORK BACK TO THIS BAY · USE A LOOP TO SEND WORK BACK', 'the caption, word for word');
}
/* 1b. a longer circle (three BAYs round) and the forward belts it must never block */
{
  const s = fresh(), L = line(s, { b3: true });
  const before = frozen(s);
  refused(s, s.connectBelt(L.B3, L.B1), before, 'the third BAY belted back to the first');
  const X = add(s, 'bay', 56, 16); s.assignPropAgent(X, 'x');
  A.ok(s.previewBelt(L.B3, X).ok && s.connectBelt(L.B3, X).ok, 'a belt on to a fresh BAY (no circle) is still laid');
  A.ok(s.connectBelt(L.B1, X).ok, 'two BAYs feeding one (a diamond, no circle) is still laid');
  A.ok(!circular(s), '…and the floor stays routable');
}
/* 2. RE-ROUTE: a BAY's one exit re-laid back upstream (the hand on a BAY that already hands work on) */
{
  const s = fresh(), L = line(s, { outbox: true });
  const ex = linkOf(s, L.B2, L.O), before = frozen(s);
  refused(s, s.previewRelink(ex.id, L.B1), before, 'the re-route preview of BAY → OUTBOX into the BAY that feeds it');
  refused(s, s.relinkTo(ex.id, L.B1), before, 'the re-route');
  const ex1 = linkOf(s, L.B1, L.B2);
  A.ok(s.previewRelink(ex1.id, L.O).ok, 'a re-route that closes nothing still previews green');
}
/* 3. MERGE: the last BAY dragged onto the belt that feeds the line */
{
  const s = fresh(), L = line(s);
  const mt = linkOf(s, L.I, L.B1).path[3], before = frozen(s);
  const pv = s.previewBeltTo(L.B2, { x: mt.x, y: mt.y });
  A.eq(pv.mode, 'merge', 'over a belt the preview is a merge');
  refused(s, pv, before, 'the merge preview into the belt that feeds it');
  refused(s, s.mergeBelt(L.B2, { x: mt.x, y: mt.y }), before, 'the merge');
}
/* 4. BRANCH: a belt dragged from its middle back to a machine (or a belt) upstream of it */
{
  const s = fresh(), L = line(s, { b3: true });
  const bt = linkOf(s, L.B2, L.B3).path[3], t2 = linkOf(s, L.I, L.B1).path[3], before = frozen(s);
  refused(s, s.previewBranch({ x: bt.x, y: bt.y }, L.B1), before, 'the branch preview back to the first BAY');
  refused(s, s.branchBelt({ x: bt.x, y: bt.y }, L.B1), before, 'the branch');
  const pv = s.previewBranch({ x: bt.x, y: bt.y }, { x: t2.x, y: t2.y });
  A.eq(pv.mode, 'branchmerge', 'onto another belt the preview is a branch + merge');
  refused(s, pv, before, 'the branch preview into the belt that feeds the line');
  refused(s, s.branchBelt({ x: bt.x, y: bt.y }, { x: t2.x, y: t2.y }), before, 'the branch + merge');
  const X = add(s, 'bay', 56, 16);
  A.ok(s.previewBranch({ x: bt.x, y: bt.y }, X).ok, 'a branch to a fresh BAY still previews green');
}
/* 5. a HAND-DRAWN belt run (the BELT tool dragged across empty floor): the floor's reconcile would link it BAY → upstream BAY */
{
  const s = fresh(), L = line(s);
  const before = frozen(s), a = { tx: 47, ty: 6 }, b = { tx: 42, ty: 6 };
  refused(s, s.canPlaceBeltRun(a, b), before, 'the run\'s ghost (canPlaceBeltRun)');
  refused(s, s.placeBeltRun(a, b), before, 'the run');
  A.ok(s.placeBeltRun({ tx: 48, ty: 7 }, { tx: 41, ty: 7 }).ok, 'a loose run that links nothing is still laid');
}
/* 6. a LOOP's BACK lane is the sanctioned way round: laid, and the floor compiles clean */
{
  const s = fresh(), L = line(s);
  const G = add(s, 'loop', 54, 8), O = add(s, 'outbox', 58, 4);
  A.ok(s.connectBelt(L.B2, G).ok && s.connectBelt(G, O).ok, 'rig: BAY → LOOP → OUTBOX');
  A.ok(s.previewBelt(G, L.B1).ok, 'the LOOP → upstream BAY preview is green (its BACK lane)');
  A.ok(s.connectBelt(G, L.B1).ok, '…and it is laid');
  A.eq(blocking(s), [], 'the floor compiles with no blocking error — no CYCLE, no CHAIN_CYCLE');
  A.ok(!plan(s).errors.some(e => e.code === 'LOOP_NO_BACK'), '…and the LOOP has its back lane');
  const before = frozen(s);
  refused(s, s.connectBelt(L.B2, L.B1), before, 'with the LOOP standing, a plain BAY → upstream BAY belt');
  const X = add(s, 'bay', 40, 16); s.assignPropAgent(X, 'x');
  A.ok(s.connectBelt(L.B1, X).ok, 'a forward belt beside the LOOP is still laid (the back lane is no hand-off)');
  // a RE-ROUTE keeps the lane's port: the LOOP's DONE lane re-laid upstream would make DONE the circle — refused; its BACK lane
  // re-laid to another upstream BAY is still its back lane — laid
  const done = linkOf(s, G, O), backL = linkOf(s, G, L.B1), before2 = frozen(s);
  refused(s, s.relinkTo(done.id, L.B1), before2, 'the LOOP\'s DONE lane re-routed upstream');
  A.ok(s.previewRelink(backL.id, L.B2).ok && s.relinkTo(backL.id, L.B2).ok, 'the LOOP\'s BACK lane re-routed to another upstream BAY is laid');
  A.eq(blocking(s), [], '…and the floor still compiles with no blocking error');
}
/* 7. PASTE: a legacy floor's circle is never copied onto the floor; a LOOP line pastes whole */
{
  const s = fresh(), L = line(s);
  const G = add(s, 'loop', 54, 8), O = add(s, 'outbox', 58, 4);
  for (const [a, b] of [[L.B2, G], [G, O], [G, L.B1]]) A.ok(s.connectBelt(a, b).ok, 'rig: ' + a + '→' + b);
  const ids = [L.I, L.B1, L.B2, G, O];
  const good = s.copyLines(ids).clip;
  const pg = s.pasteLines(good, good.x0, good.y0 + 12);
  A.ok(pg.ok, 'a copied LOOP line pastes (its back lane with it)');
  A.ok(!circular(s), '…and the floor still compiles with no circle');
  // a legacy floor: the same lane through a MERGER (a save from before this refusal) — a circle the compiler blocks
  const d = JSON.parse(JSON.stringify(s.serialize()));
  for (const p of d.props) if (p.id === G) { p.t = 'merger'; delete p.done; delete p.maxIter; }
  const t = WM.create(d);
  A.ok(circular(t), 'rig: the legacy floor carries a circle (CHAIN_CYCLE)');
  const bad = t.copyLines(ids).clip, doc0 = JSON.stringify(t.serialize()), undo0 = t.canUndo(), n0 = t.props().length;
  const pr = t.pasteLines(bad, bad.x0, bad.y0 + 20);
  A.ok(pr && pr.ok === false && pr.error === 'CIRCLE' && CIRCLE.test(String(pr.short || '')), 'pasting the legacy circle is refused as a CIRCLE: ' + (pr && pr.short));
  // (refused INSIDE the paste's one transact, like its other refusals: rolled back whole — the doc and the undo stack as they were)
  A.eq(JSON.stringify(t.serialize()), doc0, '…nothing of the copy is left on the floor');
  A.eq(t.canUndo(), undo0, '…and no undo slot was spent');
  A.eq(t.props().length, n0, '…not one piece');
  A.ok(circular(t), '(the legacy circle itself is the floor\'s own — the compiler still names it; the copy did not add a second)');
}
/* 8. the empty-floor DROP (a drop-pick): the new piece hands work to nothing, so it never closes a circle */
{
  const s = fresh(), L = line(s);
  const opts = s.probeDrop(L.B2, { x: 52, y: 16 }, [{ t: 'bay', w: 2, h: 2, block: true }, { t: 'splitter', w: 1, h: 1, block: false }]);
  A.ok(opts.every(q => q.ok), 'the drop-pick lists its pieces');
  A.ok(s.dropFrom(L.B2, { x: 52, y: 16 }, { t: 'bay', w: 2, h: 2, block: true }).ok && !circular(s), 'a drop is laid and closes no circle');
}

A.report('build-hand-circle.test');
