/* test/build-select-target.test.js — SELECT MOVES refine (10-11): ONE GESTURE, THE TARGET DECIDES.
   The review's trap: clicking a machine (to crew it in its Workflow panel) leaves it selected, and the next drag — meant to lay a
   belt — MOVED it instead. The fix makes the obvious gesture work: a SELECTED lone conveyor machine dragged onto ANOTHER conveyor
   machine (or a belt the hand would merge into) is THE HAND's belt / SEND TO — the same plan, ghost and commit as an unselected
   drag — and over open floor it stays a MOVE. Shift held = a move, always; furniture and groups never belt.
   Driven for real: build.js's own onMove / onUp / upCommit / the hand's planner and commits run in a VM against a live WorldModel
   (the drag object is the one onDown makes for a press on a piece), so the modes, the plans and the floor after the release are the
   real ones — never a re-implementation. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const vm = require('vm');
const WM = require('../frontend/app/worldmodel.js');

const src = fs.readFileSync(require.resolve('../frontend/app/build.js'), 'utf8');
const between = (start, end) => {
  const i = src.indexOf(start), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('build.js seam moved: ' + start + ' … ' + end);
  return src.slice(i, j);
};
const line1 = re => { const m = src.match(re); if (!m) throw new Error('build.js line moved: ' + re); return m[0] + '\n'; };
const CODE = line1(/const CONNECT_TYPES = [^\n]+/) + line1(/const JUNCTION_TAG_TYPES = [^\n]+/) + line1(/const CLICK_SLOP = [^\n]+/)
  + line1(/const isWorkflowType = [^\n]+/) + line1(/const propRect = [^\n]+/)
  + between('function onMove(ev) {', 'function onCancel()')                         // onMove · onUp · upCommit
  + between('function commitPropMove(d, ev) {', 'function commitPaint(d, ev) {')
  + between('const HAND_PLAN_MODES', '// R mid-drag: the corner turns')             // beltSource · selectedDragAims · handPlan · planHandGesture
  + between('const pathRects = path =>', '/* PICK WHAT GOES HERE')                 // commitHandGesture
  + between('function beltsLeftBehind(', 'function ghostInfo()')                    // beltsLeftBehind · moveMsg
  + between('let sendPvKey = null', '// a line as the floor names it')              // sendToPv (the one SEND TO verdict)
  + between('function intakeAt(', '// the arc from an OUTBOX');                     // intakeAt · commitSendTo

function rig() {
  const s = WM.create(); s.projectGeometry();
  s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 70, y2: 30 } });
  const add = (t, x, y) => { const big = t === 'bay' || t === 'intake' || t === 'outbox'; return s.addProp({ t, x, y, w: big ? 2 : 1, h: big ? 2 : 1, block: big }).id; };
  // line 1: INBOX → BAY → BAY → OUTBOX along y=4; line 2: INBOX → BAY → OUTBOX along y=24; two loose BAYs between them
  const I = add('intake', 32, 4), B1 = add('bay', 40, 4), B2 = add('bay', 48, 4), O = add('outbox', 58, 4);
  const I2 = add('intake', 32, 24), B4 = add('bay', 40, 24), O2 = add('outbox', 48, 24);
  for (const [a, b] of [[I, B1], [B1, B2], [B2, O], [I2, B4], [B4, O2]]) A.ok(s.connectBelt(a, b).ok, 'rig: belt ' + a + '→' + b);
  const B3 = add('bay', 40, 13), B5 = add('bay', 52, 13), SP = add('splitter', 60, 13), CH = s.addProp({ t: 'chair', x: 36, y: 16, w: 1, h: 1 }).id;
  const said = [];
  const ctx = {
    station: s, geoVer: 1, flipPref: false, drag: null, dragPid: null, lastClient: { x: 0, y: 0 },
    tool: 'select', hand: null, touchArm: null, dropPick: null, selectedPropId: null, groupIds: [], selectedRoomId: null,
    hoverHandle: -1, hoverPropId: null, hoverRoomId: null, hoverTile: null, panX: 0, panY: 0,
    cv: { style: { cursor: '' }, releasePointerCapture() {} },
    NO_ROUTE: {}, machineName: id => id, propLabel: t => String(t).toUpperCase(), lineOfProp: () => null, sendName: id => 'LINE ' + id,
    linkedFloor: () => !!s.isLinked(), toWorldTile: ev => ({ tx: ev.tx, ty: ev.ty }), toCanvas: () => ({ x: 0, y: 0 }),
    snapTick() {}, setCursor() {}, rasterTo() {}, roomHandleAt: () => null, propAtEvent: () => null, cursorFor: () => 'default',
    showPropCard() {}, hidePropCard() {}, hideTip() {}, sfx() {}, paintHandKeys() {}, pushFlash() {}, landProps() {}, renderSelection() {},
    setSelection(ids) { ctx.selectedPropId = ids[0] || null; },
    flashTip: (ev, msg, ok) => said.push((ok ? 'OK ' : 'NO ') + msg),
    feedback: (res, ev, okMsg) => said.push(res && res.ok ? 'OK ' + okMsg : 'NO ' + ((res && (res.msg || res.error)) || 'refused')),
    openDropPick: () => said.push('PICK'), onInspect() {}, toggleInSelection() {}, openBeltCard() {}, commitGroupMove() {},
    clickEmptyFloor() {}, commitBox() {}, commitRoomResize() {}, commitDraw() {}, commitMove() {}, commitPropStamp() {}, commitBeltRun() {}, commitPaint() {}, commitReclaim() {}
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  return { s, ctx, said, I, B1, B2, O, I2, B4, O2, B3, B5, SP, CH };
}
const pos = (s, id) => { const p = s.propById(id); return p.x + ',' + p.y; };
const links = s => (s.links() || []).map(l => l.from.prop + '>' + l.to.prop).sort().join(' ');
const tileOf = (s, id) => { const p = s.propById(id); return [p.x, p.y]; };
/* press on piece `id` (as onDown makes it: sel = it is THE selected piece, add = Shift), move through `tiles`, let go on the last */
function drag(R, id, tiles, o) {
  const { ctx } = R, [tx, ty] = tileOf(R.s, id), shift = !!(o && o.shift);
  ctx.geoVer++;   // (build.js bumps geoVer on every edit; the memo keys read it)
  ctx.drag = { mode: 'selectpress', propId: id, start: { tx, ty }, cur: { tx, ty }, moved: false, add: shift, cx: tx * 100, cy: ty * 100, sel: id === ctx.selectedPropId };
  const modes = [], plans = [];
  for (const [x, y] of tiles) {
    ctx.onMove({ tx: x, ty: y, clientX: x * 100, clientY: y * 100, shiftKey: shift });
    modes.push(ctx.drag.mode);
    plans.push(ctx.drag.mode === 'handbelt' ? ctx.handPlan(ctx.drag) : null);
  }
  if (!(o && o.hold)) { const [x, y] = tiles[tiles.length - 1]; ctx.onUp({ tx: x, ty: y, clientX: x * 100, clientY: y * 100, pointerId: 1 }); }
  return { modes, plans };
}

/* 1. the trap, fixed: a SELECTED BAY (just clicked to crew it) dragged across open floor onto the next BAY — the ghost is the MOVE over
      the floor and THE HAND's belt over the BAY; the release lays the belt, the BAY never moved, one undo takes it back */
{
  const R = rig(), { s, ctx } = R;
  ctx.selectedPropId = R.B3;
  const before = links(s), at = pos(s, R.B3);
  const g = drag(R, R.B3, [[45, 13], [52, 13]]);
  A.eq(g.modes, ['propmove', 'handbelt'], 'over open floor the selected BAY moves; over the next BAY the drag is THE HAND');
  A.ok(g.plans[1] && g.plans[1].ok && g.plans[1].kind === 'connect', 'the ghost is the hand\'s green CONNECT verdict');
  A.eq(pos(s, R.B3), at, 'the selected BAY did not move');
  A.ok(links(s) === before + ' ' + R.B3 + '>' + R.B5 || links(s).split(' ').includes(R.B3 + '>' + R.B5), 'the belt BAY → next BAY is laid');
  A.ok(/^OK CONNECTED TO /.test(R.said[R.said.length - 1]), 'the floor says CONNECTED (the hand\'s own words)');
  A.eq(ctx.selectedPropId, R.B3, 'it stays selected (its Workflow panel keeps its BAY)');
  s.undo();
  A.eq(links(s), before, 'ONE undo takes the belt back');
  A.eq(pos(s, R.B3), at, '…and the BAY is where it always was');
}
/* 2. preview == commit, selected or not: the selected drag's plan IS the unselected drag's plan, tile for tile */
{
  const R1 = rig(), R2 = rig();
  R1.ctx.selectedPropId = R1.B3;
  const sel = drag(R1, R1.B3, [[45, 13], [52, 13]], { hold: true }), un = drag(R2, R2.B3, [[45, 13], [52, 13]], { hold: true });
  A.eq(un.modes, ['handbelt', 'handbelt'], 'an UNSELECTED BAY is the hand the moment it moves (unchanged)');
  A.eq(JSON.stringify(sel.plans[1]), JSON.stringify(un.plans[1]), 'over the BAY the selected drag shows exactly the unselected drag\'s plan');
}
/* 3. over open floor it stays a MOVE — and its belts ride along */
{
  const R = rig(), { s, ctx } = R;
  ctx.selectedPropId = R.B1;
  const before = links(s);
  const g = drag(R, R.B1, [[40, 9], [44, 9]]);
  A.eq(g.modes, ['propmove', 'propmove'], 'a selected BAY over open floor is a MOVE all the way');
  A.eq(pos(s, R.B1), '44,9', 'let go on open floor: it moved');
  A.eq(links(s), before, '…with the same belts, re-laid (nothing lost, nothing new)');
}
/* 4. Shift held = a move, always (a red move ghost over the BAY, refused, nothing laid) */
{
  const R = rig(), { s, ctx } = R;
  ctx.selectedPropId = R.B3;
  const before = links(s), at = pos(s, R.B3);
  const g = drag(R, R.B3, [[45, 13], [52, 13]], { shift: true });
  A.eq(g.modes, ['propmove', 'propmove'], 'Shift+drag of the selected BAY never turns into a belt');
  A.eq(pos(s, R.B3), at, 'the move onto the other BAY is refused (overlap) — it stays');
  A.eq(links(s), before, 'and no belt was laid');
}
/* 5. furniture never belts, and a group never takes the single-machine rule */
{
  const R = rig(), { s, ctx } = R;
  ctx.selectedPropId = R.CH;
  const g = drag(R, R.CH, [[38, 16], [40, 13]], { hold: true });
  A.eq(g.modes, ['propmove', 'propmove'], 'a selected chair dragged onto a BAY is a move (red), never a belt');
  ctx.groupIds = [R.B3, R.B5];
  A.eq(ctx.selectedDragAims({ propId: R.B3 }, { tx: 40, ty: 24 }, false), false, 'a member of a selected group: the group moves (groupmove), never the hand');
  ctx.groupIds = [];
  A.eq(ctx.selectedDragAims({ propId: R.B3 }, { tx: 40, ty: 24 }, false), true, '…the same machine alone over another BAY: the hand');
  A.eq(ctx.selectedDragAims({ propId: R.B3 }, { tx: 41, ty: 14 }, false), false, 'over its own footprint: still the move');
}
/* 6. OUTBOX → another line's INBOX = SEND TO, selected or not; and the loop is refused in the SEND TO verdict's own words */
{
  const R = rig(), { s, ctx } = R;
  ctx.selectedPropId = R.O2;
  const g = drag(R, R.O2, [[44, 20], [32, 4]]);
  A.eq(g.modes, ['propmove', 'handbelt'], 'the selected OUTBOX moves over the floor and aims over the INBOX');
  A.ok(g.plans[1] && g.plans[1].ok && g.plans[1].kind === 'send', 'the ghost is the SEND TO verdict');
  A.eq(s.propById(R.O2).sendTo, R.I, 'let go: line 2 sends its finished work to line 1');
  A.eq(pos(s, R.O2), '48,24', '…and the OUTBOX stayed where it stands');
  // now line 1's OUTBOX onto line 2's INBOX would send work round in a circle
  ctx.selectedPropId = R.O;
  const at = pos(s, R.O), before = JSON.stringify(s.serialize());
  const h = drag(R, R.O, [[56, 10], [32, 24]]);
  A.eq(h.modes[1], 'handbelt', 'over the INBOX the selected OUTBOX is the hand');
  A.ok(h.plans[1] && h.plans[1].ok === false && /A LOOP/.test(h.plans[1].why), 'the ghost goes RED with the loop refusal: ' + (h.plans[1] && h.plans[1].why));
  A.eq(JSON.stringify(s.serialize()), before, 'let go on the red verdict: nothing changes');
  A.eq(pos(s, R.O), at, '…the OUTBOX did not move');
  A.ok(/^NO A LOOP/.test(R.said[R.said.length - 1]), 'the floor says why, in the same words');
}
/* 7. a belt the hand would MERGE into counts as a target; a junction's move onto a line stays its own move */
{
  const R = rig(), { s, ctx } = R;
  const l = (s.links() || []).find(x => x.from.prop === R.B1 && x.to.prop === R.B2), mid = l.path[Math.floor(l.path.length / 2)];
  ctx.selectedPropId = R.B3;
  ctx.geoVer++;
  const pv = ctx.handPlan({ mode: 'handbelt', propId: R.B3, moved: true, cur: { tx: mid.x, ty: mid.y } });
  A.ok(pv && pv.ok && pv.kind === 'merge', 'rig: the hand would merge B3 into the line\'s belt at ' + mid.x + ',' + mid.y);
  const g = drag(R, R.B3, [[45, 10], [mid.x, mid.y]]);
  A.eq(g.modes, ['propmove', 'handbelt'], 'the selected BAY over a belt it would merge into is the hand');
  A.ok(links(s).split(' ').some(k => k.startsWith(R.B3 + '>')), 'let go: merged (B3 belts into the MERGER that landed on the belt)');
  ctx.selectedPropId = R.SP;
  A.eq(ctx.selectedDragAims({ propId: R.SP }, { tx: l.path[1].x, ty: l.path[1].y }, false), false, 'a selected SPLITTER over a belt keeps its move (a junction goes ON a line)');
}
/* 8. the source wiring: one line in onMove, the old "deselect first" teaching gone */
{
  const mv = between('function onMove(ev) {', 'function onUp(ev) {');
  A.ok(/if \(drag\.sel && !drag\.add && \(drag\.mode === 'propmove' \|\| drag\.mode === 'handbelt'\)\) drag\.mode = selectedDragAims\(drag, w, ev\.shiftKey\) \? 'handbelt' : 'propmove';/.test(mv)
    && mv.indexOf('selectedDragAims(drag') > mv.indexOf("if(drag.mode==='selectpress'&&drag.moved&&slipped)") && mv.indexOf('selectedDragAims(drag') < mv.indexOf("cv.style.cursor = 'move'"),
    'the target is asked on every move, after the press becomes a drag and before the cursor is said');
  const all = src + fs.readFileSync(require.resolve('../frontend/app/tutorial.js'), 'utf8') + fs.readFileSync(require.resolve('../frontend/app/workflowpanel.js'), 'utf8');
  A.ok(!/ORPHAN_SOURCE_SELECTED|DESELECT, THEN DRAG|deselect it first|deselect the SPLITTER|it was selected, so the drag MOVED it|lay a belt \(if unselected\)|DRAG ON FROM IT, THEN CLICK/.test(all),
    'no copy tells the user to deselect before belting any more');
}

A.report('build-select-target.test');
