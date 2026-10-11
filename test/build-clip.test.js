/* test/build-clip.test.js — THE HAND, part 2 (2026-10-11, Andrew: "fully polish and integrate this into starnet" — his build-mode
   prototype): BOX SELECT takes belts too, a double-click takes a WHOLE LINE, and a piece of floor goes in your hand — Ctrl+C / X / V /
   D, COPY LINE, DELETE LINE — with its belts, its junction settings, its names, briefs, budgets and crew.
   Locked here:
     A. the clip (worldmodel.copyLines) carries what makes each machine THAT machine (a LOOP's passes / verdict / lanes — the
        piece the old copy lost — a BAY's role, crew, brief and hand-off, an INBOX's name and budget), every belt between its
        machines and the belt under each junction; never a connector bind, a project folder, crew from another station, or a
        SEND TO pointing outside it (counted);
     B. pasteLines lays it EXACTLY: one undo, a new line (its own INBOX, its own line id, its name numbered), the compile as
        clean as the original's, every belt tile on clear floor (never over another belt), the floor's own reconcile as the
        judge; checkPaste is pure and reports every bad spot; probePaste never touches the doc;
     C. rotateClip turns it a quarter turn (belt headings, junction lanes and all) and a turned paste still compiles clean;
        SEND TO inside a copy is re-pointed at the copy's own INBOX;
     D. the fallback: a clip laid out by the layout engine near the spot (pasteLinesLaid) — one undo, the extras kept;
     E. DELETE LINE (removeLine) and a selection's belts (removeLinks): one undo each, SEND TO into a deleted line let go;
     F. the build.js wiring (source locks). */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const WM = require('../frontend/app/worldmodel.js');
const P = require('../frontend/app/pipeline.js');
const LE = require('../frontend/app/lineedit.js');

const plan = s => P.compileRoutingPlan(s.projectGeometry());
const codes = s => plan(s).errors.filter(e => e.code !== 'UNBOUND_BAY').map(e => e.code).sort();
function fresh() { const s = WM.create(); s.projectGeometry(); s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 90, y2: 40 } }); return s; }
const add = (s, t, x, y) => { const big = t === 'bay' || t === 'intake' || t === 'outbox'; return s.addProp({ t, x, y, w: big ? 2 : 1, h: big ? 2 : 1, block: big }).id; };
const linkOf = (s, a, b) => (s.links() || []).find(l => l.from.prop === a && l.to.prop === b);
const frozen = s => JSON.stringify(s.serialize()) + '|' + s.getSeq() + '|' + s.canUndo();
// INBOX → BAY → LOOP → BAY → OUTBOX along y=4, crewed, named, briefed, budgeted
function line(s) {
  const I = add(s, 'intake', 32, 4), B1 = add(s, 'bay', 40, 4), B2 = add(s, 'bay', 50, 4), O = add(s, 'outbox', 58, 4);
  s.assignPropAgent(B1, 'nova'); s.assignPropAgent(B2, 'atlas');
  for (const [a, b] of [[I, B1], [B1, B2], [B2, O]]) A.ok(s.connectBelt(a, b).ok, 'line laid ' + a + '→' + b);
  s.setPropLabel(I, 'RESEARCH'); s.setPropLimits(I, { maxHops: 5, maxUsdPerMessage: 0.5, maxUsdPerDay: 3 });
  s.setPropRole(B1, 'RESEARCHER'); s.setPropBrief(B1, 'Find three sources.'); s.setPropHands(B1, 'hand on the sources');
  const lt = linkOf(s, B1, B2).path[3], lr = s.junctionOnBelt(lt.x, lt.y, 'loop', { cfg: { maxIter: 4, when: 'APPROVED' } });
  A.ok(lr.ok, 'a LOOP stands on the B1→B2 belt');
  return { I, B1, B2, O, LOOP: lr.id };
}
const lineOfIntake = (s, id) => plan(s).lines.find(l => l.intakes.includes(id));

/* ---------- A. the clip carries the machine, not just its box ---------- */
{
  const s = fresh(), L = line(s);
  A.eq(codes(s), ['LOOP_NO_BACK'], 'the original line compiles with its one honest finding (the LOOP has no BACK lane yet)');
  const before = frozen(s);
  const m = s.lineMembers(L.B2);
  A.ok(m && m.ids.length === 5 && m.links.length === 4, 'lineMembers names the whole line from any of its machines (5 machines, 4 belts)');
  const c = s.copyLines(m.ids, { agent: id => id === 'nova', turns: () => false });
  A.eq(frozen(s), before, 'copying never touches the floor, its edit counter or the undo stack');
  A.ok(c.ok && c.clip.n === 5 && c.clip.nb === 4, 'the clip holds 5 machines and the 4 belts between them');
  const node = oid => c.clip.nodes.find(n => n.oid === oid);
  A.ok(node(L.LOOP).cfg && node(L.LOOP).cfg.maxIter === 4 && node(L.LOOP).cfg.when === 'APPROVED' && !!node(L.LOOP).cfg.done, 'a LOOP keeps its passes, its verdict and its DONE lane (the old copy lost all three)');
  A.ok(node(L.I).label === 'RESEARCH' && node(L.I).limits && node(L.I).limits.maxHops === 5, 'an INBOX keeps its line\'s name and budget');
  A.ok(node(L.B1).role === 'RESEARCHER' && node(L.B1).brief === 'Find three sources.' && node(L.B1).hands === 'hand on the sources', 'a BAY keeps its role, brief and hand-off');
  A.ok(node(L.B1).agentId === 'nova' && !node(L.B2).agentId && c.clip.crewLeft === 1, 'crew travels only when the caller says that agent is on this station (atlas left behind, counted)');
  A.ok(c.clip.belts.some(b => b.x === node(L.LOOP).x && b.y === node(L.LOOP).y), 'the belt under the junction comes too');
  const all = c.clip.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= c.clip.w && n.y + n.h <= c.clip.h) && c.clip.belts.every(b => b.x >= 0 && b.y >= 0 && b.x < c.clip.w && b.y < c.clip.h);
  A.ok(all, 'everything is relative to the clip\'s top-left, inside its box');
  // a half selection: links with only one end selected stay behind
  const half = s.copyLines([L.I, L.B1]);
  A.ok(half.ok && half.clip.nb === 1 && half.clip.n === 2, 'only belts whose two ends are both in it travel');
  A.eq(s.copyLines([]).ok, false, 'copying nothing is a plain refusal');
}

/* ---------- B. paste: exact, one undo, a new line, the floor as judge ---------- */
{
  const s = fresh(), L = line(s);
  const c = s.copyLines(s.lineMembers(L.I).ids).clip;
  const before = frozen(s);
  // checkPaste is pure and paints every bad spot
  const onTop = s.checkPaste(c, c.x0, c.y0);
  A.ok(!onTop.ok && onTop.badNodes.length === 5 && onTop.badTiles.length > 0, 'over the original every machine and belt tile is a bad spot (reported, all of them)');
  const pr = s.probePaste(c, c.x0, c.y0 + 12);
  A.ok(pr.ok, 'twelve tiles down it fits (the probe says so)');
  A.eq(frozen(s), before, 'checkPaste and probePaste never touch the floor');
  const n0 = s.props().length, l0 = s.links().length;
  const r = s.pasteLines(c, c.x0, c.y0 + 12);
  A.ok(r.ok && r.ids.length === 5 && r.links.length === 4 && s.props().length === n0 + 5 && s.links().length === l0 + 4, 'the paste lays 5 machines and 4 belts');
  const I2 = r.map[L.I];
  A.eq(codes(s), ['LOOP_NO_BACK', 'LOOP_NO_BACK'], 'the floor compiles as it did — the copy brings its own LOOP finding and nothing new');
  const a = lineOfIntake(s, L.I), b = lineOfIntake(s, I2);
  A.ok(a && b && a.lineId !== b.lineId, 'the pasted INBOX starts a NEW line (its own line id)');
  A.eq(s.propById(I2).label, 'RESEARCH 2', 'its name is numbered — two lines never share one name');
  A.ok(s.propById(r.map[L.LOOP]).maxIter === 4 && s.propById(r.map[L.LOOP]).when === 'APPROVED', 'the pasted LOOP passes 4 times on APPROVED');
  A.ok(s.propById(r.map[L.B1]).agentId === 'nova' && s.propById(r.map[L.B1]).brief === 'Find three sources.', 'the pasted BAY is crewed and briefed');
  const pl = plan(s), jOld = Object.values(pl.junctions).filter(j => j.kind === 'loop').length;
  A.eq(jOld, 2, 'both lines have a real LOOP junction');
  const u = s.undo();
  A.ok(u.ok && u.label === 'PASTE' && s.props().length === n0 && s.links().length === l0, 'ONE undo takes the whole paste back (UNDID · PASTE)');
  s.redo();
  A.ok(s.props().length === n0 + 5, 'redo lays it again');
  // a paste never overwrites another belt: a belt across the spot refuses it, whole
  s.undo();
  A.ok(s.placeBeltRun({ tx: 34, ty: 19 }, { tx: 70, ty: 19 }).ok, 'a belt runs across the next spot');
  const c2 = s.checkPaste(c, c.x0, c.y0 + 14);
  A.ok(!c2.ok && (c2.error === 'ON_BELT' || c2.error === 'NEAR_JUNCTION' || c2.error === 'JUNCTION_TOUCH') && c2.badTiles.length + c2.badNodes.length > 0, 'a belt already there is a bad spot (' + c2.error + ')');
  const pc = s.pasteLines(c, c.x0, c.y0 + 14);
  A.ok(!pc.ok && s.props().length === n0, 'and the paste is refused whole — nothing half laid');
  const dupd = s.pasteLines(c, c.x0, c.y0 + 24, { label: 'DUPLICATE' });
  A.ok(dupd.ok && s.undo().label === 'DUPLICATE', 'a caller may name the slot (Ctrl+D: UNDID · DUPLICATE)');
  const off = s.checkPaste(c, 200, 200);
  A.ok(!off.ok && off.error === 'OFF_DECK' && off.short === 'PART OF IT IS OFF THE STATION FLOOR', 'off the station floor says so');
}

/* ---------- C. a quarter turn, and SEND TO inside a copy ---------- */
{
  const s = fresh(), L = line(s);
  const c = s.copyLines(s.lineMembers(L.I).ids, { turns: () => false }).clip;
  A.ok(WM.clipTurns(c), 'a clip of square machines can turn');
  const r1 = WM.rotateClip(c);
  A.ok(r1.w === c.h && r1.h === c.w && r1.rot === 1, 'a turn swaps the clip\'s width and height');
  const r4 = WM.rotateClip(c, 4);
  A.eq(JSON.stringify(r4.nodes) + JSON.stringify(r4.belts), JSON.stringify(c.nodes) + JSON.stringify(c.belts), 'four turns are no turn');
  const back = WM.rotateClip(r1, 3);
  A.eq(JSON.stringify(back.links), JSON.stringify(c.links), 'one turn and three more come back to the start');
  const loop1 = r1.nodes.find(n => n.oid === L.LOOP), loop0 = c.nodes.find(n => n.oid === L.LOOP);
  A.eq(loop1.cfg.done, { E: 'S', S: 'W', W: 'N', N: 'E' }[loop0.cfg.done], 'a junction\'s lane turns with it');
  // turned, it still lays and compiles clean
  let laid = null;
  for (let y = 8; y <= 22 && !laid; y++) for (let x = 64; x <= 80 && !laid; x++) { const v = s.checkPaste(r1, x, y); if (v.ok && s.probePaste(r1, x, y).ok) laid = s.pasteLines(r1, x, y); }
  A.ok(laid && laid.ok, 'the turned line finds a spot and lays');
  A.eq(codes(s), ['LOOP_NO_BACK', 'LOOP_NO_BACK'], 'a turned paste compiles as the original does (nothing new)');
  const ln = lineOfIntake(s, laid.map[L.I]);
  A.ok(ln && ln.lineId !== lineOfIntake(s, L.I).lineId, '…as its own line');
  // non-square pieces never turn
  A.ok(!WM.clipTurns({ nodes: [{ t: 'desk', w: 2, h: 1 }] }) && WM.rotateClip({ w: 2, h: 1, nodes: [{ t: 'desk', x: 0, y: 0, w: 2, h: 1 }], links: [], belts: [] }).w === 2, 'a clip with a piece that is not square does not turn');

  // SEND TO (the SEND TO lane's OUTBOX field — feature-read): inside the copy it is re-pointed, outside it is left behind (counted)
  const s2 = fresh(), X = line(s2);
  const I2 = add(s2, 'intake', 32, 30), B9 = add(s2, 'bay', 42, 30), O2 = add(s2, 'outbox', 52, 30);
  s2.assignPropAgent(B9, 'kai'); s2.connectBelt(I2, B9); s2.connectBelt(B9, O2);
  s2.doc().props.find(p => p.id === X.O).sendTo = I2;   // LINE A sends on to LINE B
  const out = s2.copyLines(s2.lineMembers(X.I).ids).clip;
  A.ok(out.dropped === 1 && !out.nodes.find(n => n.oid === X.O).sendTo, 'a SEND TO pointing outside the copy is left behind, and counted');
  const both = s2.copyLines(s2.lineMembers(X.I).ids.concat(s2.lineMembers(I2).ids)).clip;
  A.ok(both.dropped === 0 && both.nodes.find(n => n.oid === X.O).sendTo === I2, '…one pointing inside it travels');
  let pb = null;
  for (let y = 0; y <= 40 && !pb; y++) for (let x = 30; x <= 90 && !pb; x++) { if (s2.checkPaste(both, x, y).ok) { const r = s2.pasteLines(both, x, y); if (r.ok) pb = r; } }
  A.ok(pb && s2.propById(pb.map[X.O]).sendTo === pb.map[I2], 'a pasted SEND TO points at the COPY\'s INBOX, never back at the original');
}

/* ---------- D. the fallback: laid out by the engine near the spot ---------- */
{
  const s = fresh(), L = line(s);
  const c = s.copyLines(s.lineMembers(L.I).ids, { agent: () => true }).clip;
  const g = s.clipGraph(c);
  A.ok(g.ok && g.graph.nodes.length === 5 && g.graph.links.length === 4 && g.graph.nodes.every(n => /^clip:/.test(n.id)), 'the clip as a graph: fresh node ids no prop can hold');
  A.eq(s.clipGraph({ nodes: [{ oid: 'x', t: 'desk', w: 2, h: 1 }], links: [] }).ok, false, 'furniture has no lane to lay out (refused)');
  const Lay = LE.layoutGraphNear(s, g.graph, { x: 50, y: 24 });
  A.ok(Lay && Lay.ok, 'the engine lays the copied line out near the spot');
  const n0 = s.props().length, r = s.pasteLinesLaid(c, Lay);
  A.ok(r.ok && r.ids.length === 5 && s.props().length === n0 + 5, 'pasteLinesLaid writes it');
  A.ok(s.propById(r.map[L.B1]).brief === 'Find three sources.' && s.propById(r.map[L.I]).label === 'RESEARCH 2' && s.propById(r.map[L.LOOP]).maxIter === 4, '…with its briefs, its name (numbered) and its LOOP passes');
  A.eq(codes(s), ['LOOP_NO_BACK', 'LOOP_NO_BACK'], '…and it compiles as the original does');
  A.eq(s.undo().label, 'PASTE', 'one undo (UNDID · PASTE)');
  A.eq(s.props().length, n0, '…takes it all back');
}

/* ---------- E. DELETE LINE and a selection's belts ---------- */
{
  const s = fresh(), L = line(s);
  const I2 = add(s, 'intake', 32, 30), B9 = add(s, 'bay', 42, 30), O2 = add(s, 'outbox', 52, 30);
  s.assignPropAgent(B9, 'kai'); s.connectBelt(I2, B9); s.connectBelt(B9, O2);
  s.doc().props.find(p => p.id === O2).sendTo = L.I;   // LINE B sends on to LINE A
  const n0 = s.props().length, b0 = s.belts().length;
  const r = s.removeLine(L.B1);
  A.ok(r.ok && r.ids.length === 5 && s.props().length === n0 - 5, 'DELETE LINE takes every machine of the line');
  A.ok(!s.links().some(l => r.links.includes(l.id)) && s.belts().length < b0, '…and every belt between them');
  A.ok(s.propById(I2) && linkOf(s, I2, B9), '…and never another line');
  A.ok(!s.propById(O2).sendTo, 'a SEND TO pointing into the deleted line is let go');
  const u = s.undo();
  A.ok(u.label === 'LINE' && s.props().length === n0 && s.belts().length === b0 && s.propById(O2).sendTo === L.I, 'ONE undo puts the line, its belts and the SEND TO back (UNDID · LINE)');
  // a selection's belts: links by id + loose tiles, one undo inside a transact
  const k = linkOf(s, L.I, L.B1);
  const t = s.transact(() => { s.removeLinks([k.id], []); return s.removeProp(L.I); }, '2 PIECES');
  A.ok(t.ok && !s.links().some(l => l.id === k.id) && !s.propById(L.I), 'a selected belt goes whole with the selection, in one transact');
  A.ok(!s.belts().some(b => k.path.some(q => q.x === b.x && q.y === b.y)), '…every tile of it');
  A.eq(s.undo().label, '2 PIECES', 'one undo');
  const rb = s.removeLinks([k.id]);
  A.ok(rb.ok && s.undo().label === 'BELT', 'outside a transact removeLinks takes its own undo slot (UNDID · BELT)');
}

/* ---------- F. the build.js wiring (source locks) ---------- */
{
  const build = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'build.js'), 'utf8');
  const fn = name => { const i = build.indexOf('function ' + name + '('); if (i < 0) return ''; const j = build.indexOf('\n  }\n', i); return build.slice(i, j + 4); };
  A.ok(build.length > 0, 'build.js reads');
  // the box takes belts, memoized per edit + rect (never re-walked per frame)
  const bib = fn('beltsInBox');
  A.ok(/const key = \[geoVer, r\.x1, r\.y1, r\.x2, r\.y2, \(ids \|\| \[\]\)\.join\(','\)\]\.join\('\|'\);/.test(bib) && /if \(beltBoxMemo && beltBoxMemo\.key === key\) return beltBoxMemo\.v;/.test(bib), 'the belts a box takes are memoized per edit + rect');
  A.ok(/sel\.has\(l\.from\.prop\) && sel\.has\(l\.to\.prop\)/.test(bib) && /path\.some\(q => inR\(q\.x, q\.y\)\)/.test(bib), '…every link with a tile inside it, and every link whose two ends are selected');
  A.ok(/beltsInBox\(r, all\)/.test(fn('commitBox')) && /drawBeltCells\(t, bb\.cells, /.test(fn('drawSelectBox')), 'the box shows the belts it will take, and takes them');
  A.ok(/selBelts\.key !== selectionIds\(\)\.join\(','\)/.test(fn('beltSel')), 'the belts ride with exactly the selection that took them — another selection lets them go');
  A.ok(/if\(selBelts\)\{const bs=beltSel\(\);if\(bs\)drawBeltCells\(t,bs\.cells,/.test(fn('drawHover')), 'a selection\'s belts are drawn gold with it');
  // a whole line
  A.ok(/cv\.addEventListener\('dblclick', onDblClick\);/.test(build) && /selectWholeLine\(p\.id, ev\);/.test(fn('onDblClick')), 'a double-click on a conveyor piece takes its whole line');
  A.ok(/ev&&ev\.pointerType==='touch'&&CONNECT_TYPES\[p\.t\]/.test(fn('onInspect')) && /tNow-lastTap\.t<380/.test(fn('onInspect')), '…a double-TAP does the same (touch has no dblclick to rely on)');
  A.ok(/setSelection\(m\.ids, \{ links: m\.links, tiles: \[\] \}\);/.test(fn('selectWholeLine')), '…its machines AND its belts');
  const gc = fn('renderGroupCard');
  A.ok(/key\(line \? 'COPY LINE' : 'COPY', 'Ctrl\+C'/.test(gc) && /if \(line\) key\('DELETE LINE', 'Del', \(\) => deleteLine\(line\.id, orientEv\(\)\)/.test(gc) && /key\('CUT', 'Ctrl\+X'/.test(gc), 'the group card: COPY / CUT / DELETE — and for exactly one whole line, COPY LINE / DELETE LINE');
  A.ok(/station\.removeLine\(pid\)/.test(fn('deleteLine')), 'DELETE LINE is the model\'s removeLine (one undo; a SEND TO into it is let go)');
  A.ok(/addKey\('WHOLE LINE','dbl-click'/.test(fn('renderSelection')), 'a single conveyor piece\'s card has WHOLE LINE (the double-click, as a key — touch and discoverability)');
  // the clip
  A.ok(/station\.copyLines\(ids, \{ agent: agentHere, turns: t => canTurn\(t\) \}\)/.test(fn('clipOfSelection')), 'a clip carries only crew this station has (agentHere)');
  A.ok(/if \(cut && !deleteGroup\(ev, 'CUT'\)\) return true;/.test(fn('copyClip')) && fn('copyClip').indexOf('clipOfSelection()') < fn('copyClip').indexOf("deleteGroup(ev, 'CUT')"), 'CUT copies first, then takes it up (one undo) — a refused cut holds nothing');
  const cg = fn('clipGhost');
  A.ok(/key = \[geoVer, dupe\.cid, dupe\.rot \| 0, ax, ay\]\.join\('\|'\)/.test(cg) && /if \(clipGhostMemo && clipGhostMemo\.key === key\) return clipGhostMemo\.g;/.test(cg), 'the paste ghost is memoized per edit + clip + turn + spot (H9)');
  A.ok(/if \(v && v\.ok\) \{ const pr = station\.probePaste\(/.test(cg), '…the probe (a clone) runs only where the pure check already said yes');
  const dcg = fn('drawClipGhost');
  A.ok(/drawBeltPreview\(t, \{ path: good \}, GOOD\)/.test(dcg) && !/convey\.drawBelts/.test(dcg) && !/station\./.test(dcg), 'the paste ghost is drawn geometry off the memo — never convey.drawBelts, never a model call per frame');
  A.ok(/if \(g\.clip\) \{ drawClipGhost\(t, now, g\); return; \}/.test(build) && /if \(dupe\.type === 'lines'\) return clipGhost\(tx, ty\);/.test(fn('dupeGhost')) && /if \(dupe\.type === 'lines'\) return pasteClipAt\(w, ev\);/.test(fn('stampDupe')), 'a clip rides the COPY tool\'s own stamp (dupe.type \'lines\')');
  const pca = fn('pasteClipAt');
  A.ok(/station\.pasteLines\(c, ax, ay, \{ agent: agentHere \}\)/.test(pca) && /LineEdit\.layoutGraphNear\(station, gr\.graph, \{ x: w\.tx, y: w\.ty \}\)/.test(pca) && /station\.pasteLinesLaid\(c, L, \{ agent: agentHere \}\)/.test(pca), 'a click lays it exactly — else laid out to fit near the click — else refused, said');
  const key = fn('onKey');
  A.ok(/tool === 'dupe' && dupe && dupe\.type === 'lines' && !\(ev\.ctrlKey \|\| ev\.metaKey\)\) \{ ev\.preventDefault\(\); turnClip\(ev\.shiftKey \? 3 : 1, orientEv\(\)\); return; \}/.test(key) && key.indexOf('turnClip(') < key.indexOf('turnUnderCursor('), 'R turns a clip in hand (before R turns a prop)');
  A.ok(/\(ev\.key === 'x' \|\| ev\.key === 'X'\)\) \{ ev\.preventDefault\(\); cutSelected\(orientEv\(\)\); return; \}/.test(key) && /if \(held\.type === 'lines'\) \{ holdClip\(held, orientEv\(\)\); return; \}/.test(key), 'Ctrl+X cuts; Ctrl+V picks a clip up again');
  A.ok(/if \(selBelts\) \{ setSelection\(\[\]\); return; \}/.test(key), 'Esc lets go of a selection of belts alone');
  A.ok(/\['Double-click', 'a whole line'\]/.test(build) && /\['Ctrl \+ C · X · V', 'copy · cut · paste'\]/.test(build), 'the Edit tab teaches the double-click and the clipboard');
  const tut = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'tutorial.js'), 'utf8');
  A.ok(/fmEntry\(null, 'Select, copy &amp; paste', /.test(tut) && /Double-click a conveyor piece to select its whole line/.test(tut), '…and so does the Field Manual');
}

A.report('build-clip.test');
