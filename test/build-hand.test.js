/* test/build-hand.test.js — THE HAND (2026-10-10, Andrew: "fully polish and integrate this into starnet" — his build-mode prototype).
   Building a line is DRAGGING: drag a machine and the belt follows the pointer (connect / re-route / merge into a belt / empty
   floor → pick what goes there), drag a belt's middle and it branches, a junction held over a belt goes ON it, right-click
   removes, R flips the corner, Alt shows every setting, and every undo says UNDID · <WHAT> where it happened.
   Locked here:
     A. the model gestures (worldmodel.js) — every preview is PURE (the doc and its edit counter never move), every gesture is
        ONE undo, the preview IS the commit (same route, the corner flip included), a junction never lands where it would take
        the line apart, and the compile stays clean (a FILTER keeps its EVERYTHING ELSE lane, a LOOP its DONE lane);
     B. undo / redo hand back what they took back (a label + the rects) — read off the two snapshots, never guessed;
     C. Pipeline.lineStages counts what LINE_TOO_LONG counts (the Alt view's n/max is the compiler's own number);
     D. the build.js wiring (source locks — build.js is the DOM-bound REFIT module): the hand is a sub-state of SELECT, the
        hotbar keys only while the Conveyors tab is up, Alt never reaches the browser menu and never sticks, the ghost is drawn
        geometry (never a second convey.drawBelts), previews are memoized per edit + tile + corner, right-click removes only
        with nothing held. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const WM = require('../frontend/app/worldmodel.js');
const P = require('../frontend/app/pipeline.js');

const plan = s => P.compileRoutingPlan(s.projectGeometry());
const codes = s => plan(s).errors.filter(e => e.code !== 'UNBOUND_BAY').map(e => e.code);
function fresh() { const s = WM.create(); s.projectGeometry(); s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 70, y2: 30 } }); return s; }
const add = (s, t, x, y) => { const big = t === 'bay' || t === 'intake' || t === 'outbox'; return s.addProp({ t, x, y, w: big ? 2 : 1, h: big ? 2 : 1, block: big }).id; };
const pathKey = p => (p || []).map(q => q.x + ',' + q.y).join(' ');
const linkOf = (s, a, b) => (s.links() || []).find(l => l.from.prop === a && l.to.prop === b);
// INBOX → BAY → BAY → OUTBOX along y=4, crewed
function line(s) {
  const I = add(s, 'intake', 32, 4), B1 = add(s, 'bay', 40, 4), B2 = add(s, 'bay', 48, 4), O = add(s, 'outbox', 58, 4);
  s.assignPropAgent(B1, 'a'); s.assignPropAgent(B2, 'b');
  for (const [a, b] of [[I, B1], [B1, B2], [B2, O]]) A.ok(s.connectBelt(a, b).ok, 'line laid ' + a + '→' + b);
  return { I, B1, B2, O };
}
const frozen = s => JSON.stringify(s.serialize()) + '|' + s.getSeq() + '|' + s.canUndo();

/* ---------- A. the model gestures ---------- */
{
  const s = fresh(), L = line(s);
  A.eq(codes(s), [], 'the line compiles clean');
  const before = frozen(s);
  // PURE previews: nothing a drag asks writes to the doc or moves the edit counter
  const mid = linkOf(s, L.B1, L.B2).path[3];
  const pvs = [
    s.previewBeltTo(L.B2, { x: 45, y: 16 }), s.previewBeltTo(L.I, { x: mid.x, y: mid.y }), s.previewBranch({ x: mid.x, y: mid.y }, { x: 50, y: 18 }),
    s.previewBranch({ x: mid.x, y: mid.y }, L.O), s.previewRelink(linkOf(s, L.B1, L.B2).id, L.O), s.junctionOnBeltRefusal(mid.x, mid.y),
    s.probeDrop(L.B2, { x: 45, y: 16 }, [{ t: 'bay', w: 2, h: 2, block: true }, { t: 'filter', w: 1, h: 1, block: false }])
  ];
  A.eq(frozen(s), before, 'every preview (belt-to-tile, branch, re-route, the drop probe) leaves the doc, its edit counter and the undo stack untouched');
  A.ok(pvs[0].ok && pvs[0].mode === 'floor' && pvs[0].path.length > 2, 'a machine dragged to empty floor previews a route there');
  A.ok(pvs[2].ok && pvs[2].mode === 'branchfloor', 'a belt dragged from its middle previews a branch');
  A.ok(pvs[6].length === 2 && pvs[6].every(q => q.ok), 'the drop probe says which pieces fit (asked of a probe copy)');

  // a junction never lands where it takes the line apart
  const l1 = linkOf(s, L.I, L.B1);
  A.eq(s.junctionOnBeltRefusal(l1.path[0].x, l1.path[0].y).error, 'BELT_END', 'never on a belt\'s FIRST tile (it belongs to the machine there)');
  A.eq(s.junctionOnBeltRefusal(l1.path[l1.path.length - 1].x, l1.path[l1.path.length - 1].y).error, 'BELT_END', '…nor its LAST');
  A.eq(s.junctionOnBeltRefusal(36, 20).error, 'NO_BELT', 'a tile with no belt is not a belt');
  A.ok(!!s.junctionOnBeltRefusal(l1.path[1].x, l1.path[1].y) === false, 'a middle tile takes one');

  // FILTER / LOOP on a belt: the lane it already runs on becomes EVERYTHING ELSE / DONE — the line keeps flowing, one undo
  const ft = l1.path[2], fr = s.junctionOnBelt(ft.x, ft.y, 'filter');
  A.ok(fr.ok && s.propById(fr.id).def === ft.d, 'a FILTER put on a belt takes that lane as its default (EVERYTHING ELSE)');
  A.eq(codes(s), [], '…so the floor compiles clean (no FILTER_NO_DEFAULT)');
  A.ok(linkOf(s, L.I, fr.id) && linkOf(s, fr.id, L.B1), '…and the belt it sits on became two links through it');
  A.ok(!!s.junctionOnBeltRefusal(l1.path[1].x, l1.path[1].y), 'never right beside another junction (the tile next to it ends a link now)');
  const u1 = s.undo();
  A.ok(u1.ok && u1.label === 'FILTER' && u1.rects.some(r => r.x1 === ft.x && r.y1 === ft.y), 'ONE undo takes it back — and says UNDID · FILTER over its tile');
  A.ok(linkOf(s, L.I, L.B1), '…the belt is whole again');
  s.redo();
  const lt = linkOf(s, L.B2, L.O).path[3], lr = s.junctionOnBelt(lt.x, lt.y, 'loop', { cfg: { maxIter: 3, when: 'APPROVED', done: 'W' } });
  A.ok(lr.ok && s.propById(lr.id).done === lt.d && s.propById(lr.id).maxIter === 3 && s.propById(lr.id).when === 'APPROVED', 'a LOOP keeps the belt\'s lane as DONE and carries passes + verdict from the hand — never a compass lane from elsewhere');
  // removing a 1-in / 1-out junction rejoins the belt it sat on (the floor's own reconcile)
  A.ok(s.removeProp(lr.id).ok && linkOf(s, L.B2, L.O), 'removing a junction that sat on one belt rejoins that belt');
}

/* ---------- A2. connect / merge / branch / re-route / drop: one undo each, the preview IS the commit ---------- */
{
  const s = fresh(), L = line(s);
  const B3 = add(s, 'bay', 40, 20); s.assignPropAgent(B3, 'c');
  // MERGE: B3 dragged onto the B1→B2 belt
  const mt = linkOf(s, L.B1, L.B2).path[3], pv = s.previewBeltTo(B3, mt);
  A.ok(pv.ok && pv.mode === 'merge', 'a machine dragged onto a belt previews a MERGE');
  const n0 = s.props().length, mr = s.mergeBelt(B3, mt);
  A.ok(mr.ok && s.propById(mr.id).t === 'merger' && s.props().length === n0 + 1, 'the release lands a MERGER on that tile');
  A.eq(pathKey(linkOf(s, B3, mr.id).path), pathKey(pv.path), 'the belt laid is the belt previewed');
  A.eq(codes(s), ['BAY_NOT_FED'], 'and the floor compiles clean (B3 itself is fed by nothing yet — the one honest finding)');
  A.ok(Object.values(plan(s).junctions).some(j => j.kind === 'merge'), '…with a real MERGE junction on the line');
  const um = s.undo();
  A.ok(um.label === 'MERGER' && s.props().length === n0 && !linkOf(s, B3, mr.id), 'ONE undo takes the merger AND its belt back (UNDID · MERGER)');
  s.redo();
  // RE-ROUTE: B3's one exit (into the merger) laid again to the OUTBOX — same link id, same port
  const ex = s.links().find(l => l.from.prop === B3), rp = s.previewRelink(ex.id, L.O);
  A.ok(rp.ok, 're-route previews');
  const rr = s.relinkTo(ex.id, L.O);
  const nl = s.links().find(l => l.id === ex.id);
  A.ok(rr.ok && nl && nl.to.prop === L.O && nl.from.prop === B3, 'RE-ROUTE keeps the link (its id) and hands it to the new machine');
  A.eq(pathKey(nl.path), pathKey(rp.path), 'the re-route laid is the re-route previewed');
  A.eq(s.undo().label, 'RE-ROUTE', 'one undo — UNDID · RE-ROUTE');
  // BRANCH: drag off the middle of I→B1 onto empty floor, pick a BAY
  const bt = linkOf(s, L.I, L.B1).path[3], bp = s.previewBranch({ x: bt.x, y: bt.y }, { x: 36, y: 16 });
  A.ok(bp.ok && bp.mode === 'branchfloor', 'branch to empty floor previews');
  const br = s.branchBelt({ x: bt.x, y: bt.y }, { x: 36, y: 16 }, { place: { t: 'bay', w: 2, h: 2, block: true } });
  A.ok(br.ok && s.propById(br.id).t === 'splitter' && s.propById(br.made).t === 'bay', 'the release lands a SPLITTER on the belt and the picked BAY at the pin, belted');
  A.ok(linkOf(s, br.id, br.made) && linkOf(s, L.I, br.id) && linkOf(s, br.id, L.B1), 'the splitter feeds both the old line and the new branch');
  A.ok(!codes(s).includes('SPLIT_ONE_LANE'), 'a split never shows with one lane (both lanes laid in ONE transact)');
  A.eq(s.undo().label, 'SPLITTER', 'one undo takes the branch back');
  A.ok(linkOf(s, L.I, L.B1), '…whole');
  // BRANCH onto another belt = SPLITTER + MERGER
  const t1 = linkOf(s, L.I, L.B1).path[3], t2 = linkOf(s, L.B2, L.O).path[4];
  const bm = s.branchBelt({ x: t1.x, y: t1.y }, { x: t2.x, y: t2.y });
  A.ok(bm.ok && s.propById(bm.id).t === 'splitter' && s.propById(bm.made).t === 'merger', 'a belt dragged onto another belt lands a SPLITTER and a MERGER');
  s.undo();
  // EMPTY-FLOOR DROP from a machine: the piece stands at the pin and is belted, one undo
  const d0 = s.props().length, dr = s.dropFrom(B3, { x: 52, y: 22 }, { t: 'outbox', w: 2, h: 2, block: true });
  A.ok(dr.ok && s.propById(dr.id).t === 'outbox' && linkOf(s, B3, dr.id), 'a drop on empty floor stands the picked piece there and belts it');
  A.eq(s.undo().label, 'OUTBOX', '…one undo (UNDID · OUTBOX)');
  A.eq(s.props().length, d0, '…and it is gone again');
  // REMOVE A WHOLE BELT (right-click): the link and every tile no other link rides, one undo
  const kill = linkOf(s, L.I, L.B1), kt = kill.path[2], belts0 = s.belts().length;
  const rl = s.removeLinkAt(kt.x, kt.y);
  A.ok(rl.ok && !s.links().some(l => l.id === kill.id) && s.belts().length === belts0 - kill.path.length, 'right-click on a belt removes its WHOLE link');
  const ur = s.undo();
  A.ok(ur.label === 'BELT' && s.belts().length === belts0 && s.links().some(l => l.id === kill.id), '…one undo puts it back (UNDID · BELT)');
}

/* ---------- A3. R flips the corner — and the commit lays what the flipped preview drew ---------- */
{
  const s = fresh();
  const C = add(s, 'bay', 48, 14);
  let differs = 0, last = null;
  for (const [x, y] of [[35, 3], [60, 3], [35, 25], [60, 25]]) {
    const T = last = add(s, 'bay', x, y);
    const a = s.previewBelt(C, T), b = s.previewBelt(C, T, { flip: true });
    A.ok(a.ok && b.ok && a.path.length === b.path.length, 'flipped or not, the route is a shortest one (' + x + ',' + y + ')');
    if (pathKey(a.path) !== pathKey(b.path)) differs++;
  }
  A.eq(differs, 4, 'on every diagonal the flip turns the corner the other way');
  const T = last, pv = s.previewBelt(C, T, { flip: true }), r = s.connectBelt(C, T, { flip: true });
  A.ok(r.ok && pathKey(linkOf(s, C, T).path) === pathKey(pv.path), 'connect with the flip lays exactly the flipped preview');
}

/* ---------- B. undo / redo say what they did, and where ---------- */
{
  const s = fresh();
  const id = add(s, 'bay', 40, 10);
  const u = s.undo();
  A.ok(u.ok && u.label === 'BAY' && u.rects.length === 1 && u.rects[0].x1 === 40 && u.rects[0].y2 === 11, 'an undo hands back its word (read off the diff) and the footprint it took back');
  const r = s.redo();
  A.ok(r.ok && r.label === 'BAY' && s.propById(id), 'redo says the same');
  const t = s.transact(() => s.addProp({ t: 'plant', x: 45, y: 10, w: 1, h: 1 }), 'A PLANT');
  A.ok(t.ok && s.undo().label === 'A PLANT', 'a transact may name its own slot');
  let n = 0; while (s.undo().ok && n < 200) n++;
  A.ok(n > 0 && n < 200, 'older slots without a name still undo (' + n + ')');
  A.eq(s.undo().ok, false, 'nothing left to undo is a plain refusal');
}

/* ---------- C. the stage count the Alt view shows is the compiler's ---------- */
{
  const s = fresh();
  const I = add(s, 'intake', 31, 4); let prev = I;
  const at = [[37, 4], [43, 4], [49, 4], [55, 4], [61, 4], [61, 16], [55, 16], [49, 16]];
  for (let i = 0; i < at.length; i++) { const b = add(s, 'bay', at[i][0], at[i][1]); s.assignPropAgent(b, 'ag' + i); A.ok(s.connectBelt(prev, b).ok, 'stage ' + (i + 1) + ' laid'); prev = b; }
  const p = plan(s), rec = p.lines.find(l => l.intakes.includes(I)), ls = P.lineStages(p, rec.lineId), e = p.errors.find(q => q.code === 'LINE_TOO_LONG');
  A.ok(ls && e && ls.stages === e.stages && ls.max === e.maxHops + 1, 'lineStages counts what LINE_TOO_LONG counts (' + (ls && ls.stages) + '/' + (ls && ls.max) + ')');
  const s2 = fresh(), L = line(s2), p2 = plan(s2), r2 = p2.lines.find(l => l.intakes.includes(L.I));
  A.eq(P.lineStages(p2, r2.lineId), { stages: 2, max: 7, maxHops: 6 }, '…and a line under budget too (2 of 7)');
  A.ok(!JSON.stringify(P.compileRoutingPlan(s2.projectGeometry())).includes('lineStages'), 'it is a reader, never a plan field (the hash and the posted plan are untouched)');
}

/* ---------- D. the build.js wiring (source locks) ---------- */
{
  const build = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'build.js'), 'utf8');
  const fn = name => { const i = build.indexOf('function ' + name + '('); if (i < 0) return ''; const j = build.indexOf('\n  }\n', i); return build.slice(i, j + 4); };
  A.ok(/const HOTBAR = \['bay', 'intake', 'outbox', 'splitter', 'merger', 'joiner', 'filter', 'loop'\];/.test(build), 'the hotbar holds the eight conveyor pieces, in the order the lane decided');
  A.ok(/let hand = null;/.test(build) && !/id: 'hand'/.test(build), 'the hand is state, not an eleventh tool');
  A.ok(/if \(next && tool !== 'select'\) selectTool\('select'/.test(fn('setHand')) && !/selectTool\('prop'/.test(fn('setHand')), 'arming a piece puts you in SELECT with it in hand (never the PROP tool)');
  A.ok(/hand = null; touchArm = null; dropPick = null;/.test(fn('selectTool')), 'arming any tool puts down what was held');
  const key = fn('onKey');
  A.ok(/if \(buildGroup === 'workflow' && \/\^\[1-8\]\$\/\.test\(ev\.key\)/.test(key) && key.indexOf("buildGroup === 'workflow' && /^[1-8]$/") < key.indexOf("const map = { '0': 'select'"), 'keys 1–8 pick hotbar pieces only while the Conveyors tab is up — the other tabs keep their tool keys');
  A.ok(/if \(ev\.key === 'Alt'\) \{ ev\.preventDefault\(\); altHeld = true; return; \}/.test(key), 'Alt is the ALT VIEW — preventDefault, so the browser menu bar never takes the focus');
  A.ok(/if \(ev\.key === 'Alt'\) \{ ev\.preventDefault\(\); altHeld = false; \}/.test(build) && /function onBlur\(\) \{ spaceHeld = false; altHeld = false;/.test(build), '…let go on keyup, and on blur (Alt+Tab never leaves it stuck on)');
  A.ok(/drag\.mode === 'handbelt' \|\| drag\.mode === 'handbranch'\)\) \{ ev\.preventDefault\(\); flipCorner\(\); return; \}/.test(key) && key.indexOf('flipCorner()') < key.indexOf('turnUnderCursor('), 'R mid-drag flips the corner (before R turns a prop)');
  A.ok(/if \(!drag && \(hand \|\| touchArm \|\| dropPick\)\) \{ setHand\(null\); return; \}/.test(key), 'Esc puts down what is held (or the unanswered picker)');
  const down = fn('onDown');
  A.ok(/const held = !!\(drag \|\| connectFrom \|\| connectTo \|\| dupe \|\| hand \|\| touchArm \|\| dropPick \|\| tool !== 'select'\);/.test(down) && /if \(!held && removeAt\(ev\)\) return;/.test(down), 'right-click removes ONLY with nothing held, armed or live — otherwise it puts down / deselects as before');
  A.ok(/if \(station\.beltAt\(w\.tx, w\.ty\)\) \{ drag = \{ mode: 'beltpress'/.test(down), 'a press on a belt can become a branch (the belt card waits for the release)');
  A.ok(/drag\.mode=\(!drag\.add&&beltSource\(drag\.propId\)\)\?'handbelt':'propmove';/.test(build), 'a workflow machine dragged lays a belt; with Shift (or any other prop) it moves');
  A.ok(/if \(d\.mode === 'beltpress'\) return openBeltCard\(/.test(fn('onUp')), 'a belt CLICKED still opens its card');
  const rm = fn('removeAt');
  A.ok(/if \(p && isConveyorPiece\(p\)\)/.test(rm) && /if \(p\) return false;/.test(rm) && /station\.removeLinkAt\(w\.tx, w\.ty\)/.test(rm), 'right-click removes a conveyor piece or a whole belt — never furniture');
  const hp = fn('handPlan');
  A.ok(/const k = geoVer \+ '\|' \+ src \+ '\|' \+ d\.cur\.tx \+ ',' \+ d\.cur\.ty \+ '\|' \+ \(flipPref \? 1 : 0\);/.test(hp) && /if \(k === handPvKey\) return handPvMemo;/.test(hp), 'the drag ghost is memoized per (edit, tile, corner) — the planner never runs per frame (H9)');
  const plan2 = fn('planHandGesture');
  A.ok(!/\.(connectBelt|mergeBelt|branchBelt|relinkTo|dropFrom|addProp|removeProp|junctionOnBelt)\(/.test(plan2), 'planning a drag never mutates the doc (previews only, H9)');
  A.ok(/typeof station\.setSendTo === 'function'/.test(plan2), 'an OUTBOX onto another line\'s INBOX is SEND TO only when the station can (feature-detected)');
  const ghost = fn('drawHandGhost');
  A.ok(/drawBeltPreview\(t, \{ path: plan\.path \}, col\)/.test(ghost) && !/convey\.drawBelts/.test(ghost), 'the ghost belt is drawn geometry — never a second convey.drawBelts (the atlas law, H9)');
  A.ok(/voiceSay\('activeFlow', box, box,/.test(ghost), '…and its one caption speaks through the arbiter');
  A.ok(/drawLayer\('hand', \(\) => drawHandGhost\(t, now\)\);/.test(build) && /drawLayer\('altView', \(\) => drawAltView\(t\)\);/.test(build), 'the hand ghost and the Alt view each draw in their own guarded layer');
  const alt = fn('drawAltView');
  A.ok(/if \(alt\) for \(const p of \(cacheGeo\.props \|\| \[\]\)\)/.test(alt) && /\(!alt && !st\.over\)/.test(alt), 'at rest only an over-budget INBOX says n/max; junction settings and SEND TO arcs wait for Alt (one-voice law)');
  const ajt = fn('altJunctionText');
  A.ok(!/[×→▸]/.test(ajt), 'the Alt texts are ASCII (VT323 has no × or arrows)');
  A.ok(/floatHistory\(r, ev\.shiftKey \? 'REDID' : 'UNDID'\)/.test(key) && /undoBtn\.onclick = \(\) => \{ const r = station\.undo\(\); sfx\(r\.ok \? 'click' : 'bad'\); floatHistory\(r, 'UNDID'\); \};/.test(build), 'Ctrl+Z / Ctrl+Y and the UNDO / REDO keys float UNDID · / REDID · <WHAT>');
  A.ok(/if\(dropPick\)\{host\.hidden=false;root\.classList\.add\('has-selection'\);return renderDropPick\(host\);\}/.test(build), 'PICK WHAT GOES HERE docks where the selection card does (windows dock from the bottom — never a popover at the pointer)');
  const od = fn('openDropPick');
  A.ok(/station\.probeDrop\(/.test(od) && !/probeDrop/.test(hp + plan2), 'the fit probe runs once on RELEASE, never per frame');
  A.ok(/propType = c\.id;\s*setHand\(\{ t: c\.id \}, \{ silent: true \}\);/.test(fn('machinePalette')), 'the MACHINES shelf puts its pick in the same hand');
  A.ok(/data-handkey|dataset\.handkey = id/.test(build) && /key\('remove', 'REMOVE', 'R-CLICK'/.test(build) && /key\('pipette', 'PICK UP', 'Q'/.test(build) && /key\('corner', 'CORNER', 'R'/.test(build) && /key\('alt', 'ALT VIEW', 'ALT'/.test(build), 'touch gets a dock key for each gesture a finger lacks (right-click, Q, R, Alt)');
  A.ok(!/b\.title = /.test(fn('hotbarEl')) && /b\.dataset\.tip = /.test(fn('hotbarEl')), 'the hotbar explains itself in the station tooltip (no native title), never in sentences under the tiles');
  A.ok(/agentHere\(held\.agentId\)/.test(fn('commitPropStamp')) && /if \(agentHere\(p\.agentId\)\) h\.agentId = p\.agentId;/.test(fn('handFromProp')), 'a pipetted crew travels only when that agent is on this station');
}

A.report('build-hand.test');
