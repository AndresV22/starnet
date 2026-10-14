'use strict';
/* test/refit-firstride-stale.test.js — the auto-narrated first ride only ever answers the edit that powered its line
   (2026-10-14, the busy-station walk: BUILD MODE › Conveyors › BUILD YOUR OWN LINE, one lone INBOX placed at the top rooms,
   and the floor said "LINE READY — a test crate rides it now … WATCH IT replays it" over the FOREMAN's untouched line on the
   far side of the station, and a test ride started there).

   The cause: a session's first compile baselines against nothing, so an already-complete floor arms its one narrated ride
   at entry (by design — a station whose lines were finished elsewhere still gets the ride once). When something coach-like
   held it back at entry (the presets list, the first-run card), it stayed armed — and fired after the user's NEXT edit,
   whatever that edit was, on a line it had nothing to do with. Now a compile that powers nothing new drops an entry-armed
   ride that has not fired (its one shot is not burned: it arms again at the next entry, or on a line the user powers on),
   while a ride armed by the edit that powered its line stays armed until it narrates.

   build.js is a browser IIFE; the production maybeFirstRide runs here in a vm with the plan and the latch stubbed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const build = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'build.js'), 'utf8');
const start = build.indexOf('  function maybeFirstRide() {'), end = build.indexOf('  function fireFirstRide() {');
assert.ok(start > 0 && end > start, 'maybeFirstRide is where the test reads it');
const declared = /let ridePending = false, rideTimer = 0, rideAgentId = null, ridePrevReach = null(, rideFresh = false)?;/.exec(build);
assert.ok(declared, 'the ride state is declared as the test expects');

const lines = { foreman: true, nova: true };   // agents whose lines have their own reaching mouth and a full crew
const ctx = vm.createContext({
  valPlan: null, valComps: [], ridePending: false, rideAgentId: null, ridePrevReach: null, rideFresh: false, seen: false,
  rideSeen() { return ctx.seen; }, rideMouthFor(a) { return lines[a] ? { x: 1, y: 1 } : null; }
});
vm.runInContext(build.slice(start, end), ctx);
const compile = (...reaching) => {
  ctx.valPlan = { reach: Object.fromEntries(reaching.map(a => [a, true])) };
  ctx.valComps = reaching.map(a => ({ intakes: [1], bays: [{ agentId: a }] }));
  vm.runInContext('maybeFirstRide()', ctx);
};

// entry on a floor whose FOREMAN line is already complete: armed at entry, not yet fired (the presets list is up)
compile('foreman');
assert.equal(ctx.ridePending, true, 'an already-complete floor still arms its one narrated ride at entry');
assert.equal(ctx.rideAgentId, 'foreman', '…on the line that is complete');

// the user places a lone INBOX: the plan recompiles, nothing new powers on
compile('foreman');
assert.equal(ctx.ridePending, false, 'an edit that powers nothing new drops the entry-armed ride — it never fires on an untouched line after it');
assert.equal(ctx.rideAgentId, null, '…and names no line');

// the user finishes a line of their own: THAT is the teachable moment, and it stays armed through later edits until it narrates
compile('foreman', 'nova');
assert.equal(ctx.ridePending, true, 'a line the user just powered on arms the ride');
assert.equal(ctx.rideAgentId, 'nova', '…on the line they powered');
compile('foreman', 'nova');
assert.equal(ctx.ridePending, true, 'a later edit that powers nothing new keeps that ride armed (the coach may still be up)');
assert.equal(ctx.rideAgentId, 'nova', '…on the same line');

// a fresh session on a floor already seen narrates nothing
ctx.ridePending = false; ctx.rideAgentId = null; ctx.ridePrevReach = null; ctx.rideFresh = false; ctx.seen = true;
compile('foreman', 'nova');
assert.equal(ctx.ridePending, false, 'a station that already had its narrated ride never arms another');

console.log('refit-firstride-stale: an entry-armed ride never fires after an unrelated edit; the line the user powers keeps its ride — PASS');
