/* test/build-room-delete-sendto.test.js — deleting a room that holds a SEND TO target (final floor lane M15).

   The warning says "THIS CUTS 1 SEND TO FROM LINE A — repeat DELETE / REMOVE to continue", but the room was deselected BEFORE
   the warning fired, so the "repeat" Delete did nothing (and a slower re-select warned and deselected again). Driven for real:
   build.js's own deleteSelectedRoom / doDeleteRoom / warnSendCuts run in a VM against a live WorldModel. Locked:
     - Delete, Delete = the cut warning, and the room STAYS selected and armed;
     - the next Delete deletes it (the warning passes through, the selection clears);
     - a room with no SEND TO in it deletes on the second Delete, as before;
     - a refused delete (the spawn room guard aside) leaves the room selected — it still stands. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const vm = require('vm');
const WM = require('../frontend/app/worldmodel.js');
const P = require('../frontend/app/pipeline.js');

const src = fs.readFileSync(require.resolve('../frontend/app/build.js'), 'utf8');
const between = (start, end) => {
  const i = src.indexOf(start), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('build.js seam moved: ' + start + ' … ' + end);
  return src.slice(i, j);
};
const CODE = between('function warnSendCuts(', 'function deleteSelected(ev)')
  + between('function doDeleteRoom(', 'function openDoorPicker(')
  + between('function deleteSelectedRoom(', 'function nudgeRoom(');

function rig() {
  const s = WM.create(); s.projectGeometry();
  const ra = s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 70, y2: 12 } }), rb = s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 14, x2: 70, y2: 26 } });
  A.ok(ra.ok && rb.ok, 'rig: two rooms');
  const add = (t, x, y) => s.addProp({ t, x, y, w: 2, h: 2, block: true }).id;
  const a = [add('intake', 32, 4), add('bay', 42, 4), add('outbox', 56, 4)], b = [add('intake', 32, 18), add('bay', 42, 18), add('outbox', 56, 18)];
  for (const L of [a, b]) for (let i = 1; i < 3; i++) A.ok(s.connectBelt(L[i - 1], L[i]).ok, 'rig: belt');
  A.ok(s.setSendTo(a[2], b[0]).ok, 'rig: LINE A sends to the line in room B');
  let clock = 1000;
  const said = [];
  const ctx = {
    station: s, Pipeline: P, performance: { now: () => clock }, selectedRoomId: null, roomDelArmedAt: 0, sendCutArm: null,
    lineOfProp: () => null, lineNameOf: () => null, keepsHalls: fn => fn(), pushFlash() {}, vanishProp() {}, flashUndo() {},
    flashTip: (ev, msg) => said.push(String(msg)), sfx() {}, renderSelection() {}, setHint() {}
  };
  vm.createContext(ctx); vm.runInContext(CODE, ctx);
  return { s, ctx, said, ra: ra.id, rb: rb.id, tick: ms => { clock += ms; } };
}
{
  const R = rig(), { s, ctx, said } = R;
  ctx.selectedRoomId = R.rb;
  ctx.deleteSelectedRoom({}); R.tick(300);
  A.ok(/press Delete again/.test(said[said.length - 1]), 'the first Delete arms');
  ctx.deleteSelectedRoom({}); R.tick(300);
  A.ok(/THIS CUTS 1 SEND TO/.test(said[said.length - 1]) && /repeat DELETE/.test(said[said.length - 1]), 'the second warns that a SEND TO is cut — ' + said[said.length - 1]);
  A.ok(!!s.roomById(R.rb), '…the room still stands');
  A.eq(ctx.selectedRoomId, R.rb, '…and STAYS selected, so "repeat DELETE" can mean the next Delete');
  R.tick(1500);   // (the warning re-armed the room: the next Delete inside the 2.5 s arm confirms)
  ctx.deleteSelectedRoom({});
  A.ok(!s.roomById(R.rb), 'the repeated Delete deletes the room');
  A.eq(ctx.selectedRoomId, null, '…and only then the selection clears');
  A.ok(/deleted/.test(said[said.length - 1]), '…saying so');
  A.ok(s.undo().ok && !!s.roomById(R.rb), '(one undo brings it back)');
}
{
  const R = rig(), { s, ctx } = R;
  A.ok(s.setSendTo(s.props().find(p => p.t === 'outbox' && p.sendTo).id, null).ok, 'no SEND TO into room B any more');
  ctx.selectedRoomId = R.rb;
  ctx.deleteSelectedRoom({}); R.tick(300); ctx.deleteSelectedRoom({});
  A.ok(!s.roomById(R.rb) && ctx.selectedRoomId === null, 'a room no SEND TO points into deletes on the second Delete, as before');
}
{
  // LIVE-FOUND (final floor lane, 2026-10-12 CDP run): reading the warning took ~4 s, and the "repeat DELETE" re-armed with
  // "press Delete again" — the room arm (2.5 s) ran out inside the SEND TO cut window (6 s). The repeat confirms anywhere in it.
  const R = rig(), { s, ctx, said } = R;
  ctx.selectedRoomId = R.rb;
  ctx.deleteSelectedRoom({}); R.tick(300); ctx.deleteSelectedRoom({});
  A.ok(/THIS CUTS 1 SEND TO/.test(said[said.length - 1]), 'the cut warning');
  R.tick(4200);   // the Commander reads it
  ctx.deleteSelectedRoom({});
  A.ok(!s.roomById(R.rb) && ctx.selectedRoomId === null, 'a repeat DELETE 4 s after the warning deletes the room — ' + said[said.length - 1]);
  const R2 = rig();
  R2.ctx.selectedRoomId = R2.rb;
  R2.ctx.deleteSelectedRoom({}); R2.tick(300); R2.ctx.deleteSelectedRoom({}); R2.tick(7000); R2.ctx.deleteSelectedRoom({});
  A.ok(!!R2.s.roomById(R2.rb) && /press Delete again/.test(R2.said[R2.said.length - 1]), 'past the 6 s window the warning has lapsed: Delete arms afresh (never a silent delete)');
}
A.report('build-room-delete-sendto.test');
