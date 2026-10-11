/* test/line-sendto.test.js — SEND TO: one line hands its finished work on to another (2026-10-10).

   The OUTBOX carries `sendTo` = the target INBOX's prop id — a POINTER, never a belt (belts joining two lines make one line, one
   lineId, one budget: the 10-09 P0). Locked here, on a real station and the real compiler:
     THE MODEL    — setSendTo points an OUTBOX at another line's INBOX in one undo slot; refuses this same line, a circle, a
                    non-OUTBOX and a non-INBOX in words with a floor caption; NOWHERE clears it; it survives serialize →
                    deserialize (the migrate whitelist), rides projectGeometry and lineGraph, and a deleted INBOX takes the
                    pointers into it with it (same undo). sendToChoices lists every other line, a circle disabled with its reason.
     THE COMPILER — plan.sendTo keyed by OUTBOX, rec.sendTo on the line, rec.stages / rec.maxHops / rec.name; SEND_TO_MISSING /
                    SEND_TO_SELF / SEND_TO_LOOP are warnings (the plan stays deployable); plan.hash never moves with a pointer;
                    a floor with no pointer compiles with no plan.sendTo at all.
     RUN TIME     — Pipeline.sendToOf names the target for a finished line; Pipeline.handoffInput composes the next line's job. */
'use strict';
const A = require('./_assert.js');
const P = require('../frontend/app/pipeline.js');
const WM = require('../frontend/app/worldmodel.js');
const LE = require('../frontend/app/lineedit.js');

function lines(n) {
  const d = WM.starterDoc();
  for (const id in d.rooms) for (const r of d.rooms[id].rects) { r.x2 = 44; r.y2 = 44; }
  const st = WM.create(d);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = LE.placeBlueprint(st, 'research_line', { x: 8, y: 4 + i * 12 });
    if (!r.ok) throw new Error('placeBlueprint ' + JSON.stringify(r));
    const of = t => r.ids.filter(id => st.propById(id).t === t);
    out.push({ intake: of('intake')[0], bays: of('bay'), outbox: of('outbox')[0] });
  }
  for (const p of st.props()) if (p.t === 'bay' && !p.agentId) st.assignPropAgent(p.id, 'ag_' + p.id);
  return { st, L: out };
}
const plan = st => P.compileRoutingPlan(st.projectGeometry());
const lineOf = (pl, id) => pl.lineOfProp[id];

/* ---------- THE MODEL ---------- */
{
  const { st, L: [a, b, c] } = lines(3);
  st.setPropLabel(a.intake, 'A'); st.setPropLabel(b.intake, 'B'); st.setPropLabel(c.intake, 'C');
  const p0 = plan(st);
  A.eq(p0.sendTo, undefined, 'a floor with no SEND TO compiles no plan.sendTo at all (existing floors byte-identical)');
  A.ok(p0.lines.length === 3 && p0.lines.every(l => !l.sendTo), 'three lines, none sending');
  const hash0 = p0.hash;

  const r = st.setSendTo(a.outbox, b.intake);
  A.ok(r.ok && r.sendTo === b.intake && r.toLine === lineOf(p0, b.intake) && r.name === 'LINE B', 'LINE A’s OUTBOX sends to LINE B’s INBOX — ' + JSON.stringify(r));
  A.eq(st.propById(a.outbox).sendTo, b.intake, 'the pointer is on the OUTBOX prop');
  A.ok(st.links().every(l => l.from.prop !== a.outbox && l.to.prop !== b.intake), 'no link was laid: the two lines stay two lines');
  const p1 = plan(st);
  A.eq(p1.lines.length, 3, '…still three lines after SEND TO (never fused)');
  A.eq(p1.sendTo, { [a.outbox]: { intakeId: b.intake, fromLine: lineOf(p1, a.outbox), toLine: lineOf(p1, b.intake) } }, 'plan.sendTo keyed by OUTBOX');
  const recA = p1.lines.find(l => l.lineId === lineOf(p1, a.outbox));
  A.eq(recA.sendTo, [{ outboxId: a.outbox, intakeId: b.intake, toLine: lineOf(p1, b.intake) }], 'LINE A’s record names where it sends');
  A.ok(recA.name === 'A' && typeof recA.stages === 'number' && recA.stages >= 1 && recA.maxHops === P.LINE_LIMIT_DEFAULTS.maxHops, 'the line record carries its name and stages n / max — ' + JSON.stringify({ name: recA.name, stages: recA.stages, maxHops: recA.maxHops }));
  A.eq(p1.hash, hash0, 'plan.hash never moves with a SEND TO (dispatch topology is unchanged; SPLITTER counters keep)');
  A.ok(P.ok(p1) && !p1.errors.some(e => /^SEND_TO/.test(e.code)), 'a clean SEND TO is no finding');

  // the same pointer again burns no undo slot
  st.undo(); A.eq(st.propById(a.outbox).sendTo, undefined, 'UNDO takes the pointer back');
  st.redo(); A.eq(st.propById(a.outbox).sendTo, b.intake, 'REDO puts it back');

  // refusals
  const same = st.setSendTo(a.outbox, a.intake);
  A.ok(same.ok === false && same.error === 'SAME_LINE' && /same line/i.test(same.msg) && same.short, 'its own line’s INBOX is refused — ' + JSON.stringify(same));
  A.ok(st.setSendTo(b.outbox, c.intake).ok, 'LINE B sends to LINE C');
  const loop = st.setSendTo(c.outbox, a.intake);
  A.ok(loop.ok === false && loop.error === 'SEND_LOOP' && /circle/.test(loop.msg) && /LINE A/.test(loop.msg) && /LOOP/.test(loop.short), 'C → A would close a circle (A → B → C): refused, naming the line — ' + JSON.stringify(loop));
  A.eq(st.propById(c.outbox).sendTo, undefined, '…and nothing was written');
  const bad1 = st.setSendTo(a.bays[0], b.intake), bad2 = st.setSendTo(a.outbox, b.bays[0]);
  A.ok(bad1.error === 'BAD_TYPE' && bad2.error === 'NOT_INBOX', 'only an OUTBOX sends, only to an INBOX');
  A.eq(st.connectRefusal(a.outbox, null), null, 'the BELT tool may arm an OUTBOX now (its destination is an INBOX: SEND TO)');
  A.eq((st.connectRefusal(c.outbox, a.intake) || {}).error, 'SEND_LOOP', '…and its second click on an INBOX answers the SEND TO refusal');
  A.eq((st.connectRefusal(a.outbox, b.bays[0]) || {}).error, 'FROM_OUTBOX', '…an OUTBOX to a BAY is still no belt');
  A.eq(st.connectBelt(a.outbox, b.intake).error, 'FROM_OUTBOX', 'connectBelt still never lays a belt OUTBOX → INBOX');

  // the Workflow panel's chips
  const ch = st.sendToChoices(c.outbox);
  A.eq(ch.map(x => [x.name, x.on, x.refusal ? x.refusal.error : null]), [['LINE A', false, 'SEND_LOOP'], ['LINE B', false, 'SEND_LOOP']], 'C’s chips: A and B each close a circle — disabled with the reason');
  const chA = st.sendToChoices(a.outbox);
  A.eq(chA.map(x => [x.name, x.on, x.refusal ? x.refusal.error : null]), [['LINE B', true, null], ['LINE C', false, null]], 'A’s chips: B on, C open');

  // NOWHERE
  const nw = st.setSendTo(b.outbox, null);
  A.ok(nw.ok && st.propById(b.outbox).sendTo === undefined, 'NOWHERE clears it');
  A.ok(st.setSendTo(c.outbox, a.intake).ok, 'with B → C gone, C → A is no circle (C → A → B)');
}

/* ---------- PERSISTENCE + PROJECTION + LINE GRAPH ---------- */
{
  const { st, L: [a, b] } = lines(2);
  st.setSendTo(a.outbox, b.intake);
  const back = WM.deserialize(JSON.parse(JSON.stringify(st.serialize())));
  A.eq(back.propById(a.outbox).sendTo, b.intake, 'the pointer survives a save + reload (migrate whitelist)');
  const geo = st.projectGeometry();
  A.eq(geo.props.find(p => p.id === a.outbox).sendTo, b.intake, 'projectGeometry carries it to the compiler');
  const g = st.lineGraph(a.outbox);
  A.ok(g.ok && g.graph.nodes.find(n => n.id === a.outbox).sendTo === b.intake, 'lineGraph carries it (a re-laid line keeps where it sends)');
  const tidy = LE.run(st, a.outbox, 'tidy', {});
  A.ok(tidy.ok && st.propById(a.outbox).sendTo === b.intake, 'a TIDY of LINE A keeps the pointer');
  // a migrated junk value is dropped on a non-OUTBOX
  const d = JSON.parse(JSON.stringify(st.serialize()));
  d.props.find(p => p.id === a.bays[0]).sendTo = b.intake;
  A.eq(WM.deserialize(d).propById(a.bays[0]).sendTo, undefined, 'only an OUTBOX keeps a sendTo through migrate');

  // deleting the target INBOX takes the pointer with it, in the same undo slot
  st.removeProp(b.intake);
  A.eq(st.propById(a.outbox).sendTo, undefined, 'the INBOX deleted: the OUTBOX now sends nowhere');
  st.undo();
  A.ok(st.propById(b.intake) && st.propById(a.outbox).sendTo === b.intake, 'one UNDO brings back the INBOX and the pointer');
}

/* ---------- THE COMPILER'S WARNINGS ---------- */
{
  const { st, L: [a, b] } = lines(2);
  const doc = st.serialize();
  // a hand-edited / stale save: the pointer names a lone INBOX, its own line, and a circle
  const lone = { id: 'p900', t: 'intake', x: 40, y: 40, w: 2, h: 2 };
  const geoOf = mut => { const d = JSON.parse(JSON.stringify(doc)); mut(d); return WM.deserialize(d).projectGeometry(); };
  const pm = P.compileRoutingPlan(geoOf(d => { d.props.push(lone); d.props.find(p => p.id === a.outbox).sendTo = 'p900'; }));
  A.ok(pm.errors.some(e => e.code === 'SEND_TO_MISSING' && e.propId === a.outbox && e.warn) && !pm.sendTo && P.ok(pm), 'a pointer at an INBOX that starts no line: SEND_TO_MISSING, a warning, no hand-off');
  const pg = P.compileRoutingPlan(geoOf(d => { d.props.find(p => p.id === a.outbox).sendTo = 'p99999'; }));
  A.ok(pg.errors.some(e => e.code === 'SEND_TO_MISSING') && P.ok(pg), 'a pointer at a deleted INBOX: SEND_TO_MISSING');
  const ps = P.compileRoutingPlan(geoOf(d => { d.props.find(p => p.id === a.outbox).sendTo = a.intake; }));
  A.ok(ps.errors.some(e => e.code === 'SEND_TO_SELF' && e.warn) && !ps.sendTo && P.ok(ps), 'a pointer at its own line: SEND_TO_SELF');
  const pc = P.compileRoutingPlan(geoOf(d => { d.props.find(p => p.id === a.outbox).sendTo = b.intake; d.props.find(p => p.id === b.outbox).sendTo = a.intake; }));
  A.eq(pc.errors.filter(e => e.code === 'SEND_TO_LOOP').map(e => e.propId).sort(), [a.outbox, b.outbox].sort(), 'A → B → A: both pointers on the circle are SEND_TO_LOOP…');
  A.ok(!pc.sendTo && P.ok(pc) && pc.errors.filter(e => /^SEND_TO/.test(e.code)).every(e => e.warn), '…both off, and the plan stays deployable (warnings, never blockers)');
}

/* ---------- RUN TIME HELPERS ---------- */
{
  const { st, L: [a, b] } = lines(2);
  st.setSendTo(a.outbox, b.intake);
  const pl = plan(st), la = lineOf(pl, a.outbox), lb = lineOf(pl, b.intake);
  const last = a.bays[a.bays.length - 1];
  A.eq(P.sendToOf(pl, la, last), { outboxId: a.outbox, intakeId: b.intake, fromLine: la, toLine: lb }, 'sendToOf names LINE B for a job that finished on LINE A');
  A.eq(P.sendToOf(pl, lb, b.bays[0]), null, 'LINE B sends nowhere');
  A.eq(P.sendToOf(pl, null, last), null, 'no line, no hand-off (a direct order)');
  const txt = P.handoffInput({ fromName: 'research', original: 'Find three facts.', output: 'Fact 1. Fact 2. Fact 3.', files: ['C:/w/a.md', 'C:/w/a.md', ''] });
  A.ok(/^\[HAND-OFF — LINE RESEARCH finished its part/.test(txt) && /THE JOB AS IT FIRST ARRIVED:\nFind three facts\./.test(txt) && /WHAT LINE RESEARCH DELIVERED:\nFact 1\./.test(txt), 'handoffInput: who, the job, what came back — ' + JSON.stringify(txt));
  A.ok(/FILES IT MADE \(paths on this machine\):\n- C:\/w\/a\.md$/.test(txt), '…and each file once');
  A.ok(P.handoffInput({ output: 'x'.repeat(20000) }).length < 12400, 'bounded');
}

A.report('line-sendto.test');
