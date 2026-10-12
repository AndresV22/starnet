/* test/first-ship-receipt.test.js — FIRST SHIP rides the executor's terminal receipt, never a crate animation (M8, 2026-10-12).

   The gold 'FIRST SHIP · LINE X' toast and the milestone sound used to fire from world.js onWorkitemDeliver — a crate sinking at
   a chute. A direct COMMS order to the agent crewing a line's last BAY rides a crate down that BAY's belt too, so a line that never
   ran a job "shipped" while its plate read SHIPPED 0. The only proof of a shipment is chain.js's workitem.delivered
   { box: 'line-output', lineId, outboxId } — the same terminal receipt line-shipments mints SHIPPED from.

   Runs the REAL world.js noteFirstShip and the REAL build.js noteLineShipped / noteLineDelivered (source slices in a vm) against a
   real WorldModel station. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs'), path = require('path'), vm = require('vm');
const WM = require('../frontend/app/worldmodel.js'), P = require('../frontend/app/pipeline.js'), LE = require('../frontend/app/lineedit.js');
const world = fs.readFileSync(path.join(__dirname, '../frontend/app/world.js'), 'utf8');
const build = fs.readFileSync(path.join(__dirname, '../frontend/app/build.js'), 'utf8');
const slice = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + 1); A.ok(a >= 0 && b > a, 'source slice ' + from.trim().slice(0, 40)); return src.slice(a, b); };

/* ---------- 1. the world: only a line-output receipt can announce, once per receipt ---------- */
{
  const calls = [], notes = [], sounds = [];
  let first = true;
  const ctx = vm.createContext({ fnow: 123, firstShipPulse: null,
    Build: { noteLineShipped: (o, l) => { calls.push([o, l]); const r = first ? { first: true, name: 'LINE RESEARCH', tiles: { '1,1': 1 } } : null; first = false; return r; } },
    StationUI: { notify: (t, k) => notes.push([t, k]) }, SFX: { milestone: () => sounds.push(1) } });
  vm.runInContext(slice(world, '  const firstShipSeen = new Set();', '  // the crate\'s MASS must be read NOW') + '; globalThis.note = noteFirstShip; globalThis.pulse = () => firstShipPulse;', ctx);
  // a direct COMMS order's delivery (chat.js: box '') and a crate animation's payload (box 'product') announce nothing
  ctx.note({ workitemId: 'wi_direct', finalQueueId: 'outbox', agentId: 'nova', box: '' });
  ctx.note({ workitemId: 'wi_crate', box: 'product', lineId: 'L1', outboxId: 'o1' });
  ctx.note({ workitemId: 'wi_half', box: 'line-output', lineId: 'L1' });   // a receipt with no OUTBOX proves nothing
  A.eq(calls.length + notes.length + sounds.length, 0, 'no receipt, no FIRST SHIP (direct order, crate payload, partial receipt)');
  ctx.note({ workitemId: 'wi_1', box: 'line-output', lineId: 'L1', outboxId: 'o1', entryRunId: 'r1' });
  A.eq(calls, [['o1', 'L1']], 'the receipt asks Build with its exact OUTBOX and line');
  A.eq(notes, [['FIRST SHIP · LINE RESEARCH', 'gold']], 'the first receipt shows the gold toast');
  A.eq(sounds.length, 1, '…and plays the milestone once');
  A.ok(ctx.pulse() && ctx.pulse().at === 123, '…and pulses the line');
  ctx.note({ workitemId: 'wi_1', box: 'line-output', lineId: 'L1', outboxId: 'o1', entryRunId: 'r1' });
  A.eq(calls.length, 1, 'the SSE echo of the same receipt is ignored');
  ctx.note({ workitemId: 'wi_2', box: 'line-output', lineId: 'L1', outboxId: 'o1', entryRunId: 'r2' });
  A.eq([calls.length, notes.length, sounds.length], [2, 1, 1], 'a later shipment of the same line is not a first');
}
/* ---------- 2. source locks: the crate seam is silent; the receipt is the only announcer ---------- */
{
  const deliver = slice(world, '  function onWorkitemDeliver(bx) {', '\n  }\n');
  A.ok(!/'FIRST SHIP|SFX\.milestone|StationUI\.notify|firstShipPulse/.test(deliver), 'a crate sinking at a chute announces nothing');
  A.ok(/Build\.noteLineDelivered\(/.test(deliver), '…it still retires the finish card silently');
  A.eq((world.match(/'FIRST SHIP · '/g) || []).length, 1, 'FIRST SHIP is said in exactly one place');
  A.ok(/function noteFirstShip\(p\) \{\s*if \(!p \|\| p\.box !== 'line-output'/.test(world), '…and that place answers only box line-output');
  A.ok(/U\.bus\.on\('workitem\.delivered', p => \{ releaseJoinedProduct\(p\); noteFirstShip\(p\); \}\)/.test(world), 'the receipt listener calls it');
}
/* ---------- 3. Build: noteLineShipped judges first per line; noteLineDelivered is silent ---------- */
{
  const s = WM.create(); s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 90, y2: 40 } });
  const a = LE.placeBlueprint(s, 'research_line', { x: 40, y: 4 }), b = LE.placeBlueprint(s, 'research_line', { x: 40, y: 22 });
  A.ok(a.ok && b.ok, 'fixture: two lines');
  for (const p of s.props()) if (p.t === 'bay') s.assignPropAgent(p.id, 'ag_' + p.id);
  const of = (r, t) => r.ids.find(id => s.propById(id).t === t);
  s.setPropLabel(of(a, 'intake'), 'Research');
  const comps = P.lineComponents(s.projectGeometry()), ca = comps.find(c => c.outboxes.includes(of(a, 'outbox'))), cb = comps.find(c => c.outboxes.includes(of(b, 'outbox')));
  const store = {};
  const ctx = vm.createContext({ opts: { getStation: () => s }, station: null, running: false, renderFinCard: () => {}, Pipeline: P,
    stationKeyOf: () => 'test', localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } });
  vm.runInContext(slice(build, '  const FIN_KEY = st =>', '  /* SAMPLE-JOB seam detection') + slice(build, '  function noteLineDelivered(wtx, wty) {', '  /* ---------- AIRLOCK door-state picker')
    + '; globalThis.shipped = noteLineShipped; globalThis.delivered = noteLineDelivered; globalThis.reg = () => finRead(opts.getStation());', ctx);
  const o = s.projectGeometry().origin, k0 = Object.keys(ca.tiles)[0].split(',').map(Number);
  A.eq(ctx.delivered(k0[0] + o.tx, k0[1] + o.ty), undefined, 'a crate at a chute returns nothing to announce');
  A.ok(ctx.reg()[ca.key].done && !ctx.reg()[ca.key].shipped, '…it retires the finish card only (no shipped flag)');
  A.eq(ctx.shipped(of(a, 'outbox'), cb.key), null, 'a receipt whose OUTBOX is on another line announces nothing');
  A.eq(ctx.shipped('no-such-outbox', ca.key), null, 'a receipt for an OUTBOX no longer on the floor announces nothing');
  const r = ctx.shipped(of(a, 'outbox'), ca.key);
  A.ok(r && r.first === true && r.name === 'LINE RESEARCH' && JSON.stringify(Object.keys(r.tiles).sort()) === JSON.stringify(Object.keys(ca.tiles).sort()), 'the first receipt of a line is its FIRST SHIP, named as the floor names it: ' + JSON.stringify(r && { first: r.first, name: r.name }));
  A.eq(ctx.shipped(of(a, 'outbox'), ca.key), null, 'the second receipt of that line is not');
  const rb = ctx.shipped(of(b, 'outbox'), cb.key);
  A.ok(rb && rb.first && /^LINE [A-Z]+$/.test(rb.name), 'another line ships its own first (an unnamed line by its letter): ' + (rb && rb.name));
}
A.report('first-ship-receipt');
