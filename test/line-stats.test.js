/* node test/line-stats.test.js — LINE WATCH per-line stats fold (sidecar/routing/line-stats.js) + the run-row
   stamp it depends on (runstore records lineId/dockId only when present and well-formed).
   Laws under test: numbers come ONLY from rows stamped with the line; "shipped" is the station SHIPPED predicate
   (clean job + proven work) AND a durable terminal receipt (a job shipped, not a stage done); failed is the dead-run set; a line with no runs answers zeros (never absent, never a guess);
   the $ ledger + cap are read through the injected readers; each bay's LAST outcome is its newest row. */
'use strict';
const A = require('./_assert.js');
const { lineStats, median, shippedRow, failedRow, FAILED_REASONS } = require('../sidecar/routing/line-stats.js');
const { makeLineShipments, cleanShipments, loadShipmentReceipts } = require('../sidecar/routing/line-shipments.js');
const receipt = (lineId, runId, at) => ({ lineId, entryRunId: runId, terminalRunId: runId, outboxId: 'outbox', at });

// ---- median ----
A.eq(median([]), null, 'median of nothing is null (no fabricated time)');
A.eq(median([3000]), 3000, 'median of one');
A.eq(median([4000, 1000, 2000]), 2000, 'median of odd count (unsorted input)');
A.eq(median([1000, 2000, 3000, 4000]), 2500, 'median of even count = mean of the middle two');

// ---- predicates ----
A.ok(shippedRow({ reason: 'done', toolsOk: 1 }), 'done + a successful tool = shipped');
A.ok(shippedRow({ reason: 'done', artifacts: [{ kind: 'file' }] }), 'done + an artifact = shipped');
A.ok(!shippedRow({ reason: 'done', toolsOk: 0, artifacts: [] }), 'done with no proven work is NOT shipped (crate honesty)');
A.ok(!shippedRow({ reason: 'error', toolsOk: 3 }), 'a failed run never ships');
for (const r of ['error', 'refusal', 'max_iters', 'budget']) A.ok(failedRow({ reason: r }), r + ' is a failure');
for (const r of ['done', 'cancelled', 'clarifying', 'empty', 'interrupted']) A.ok(!failedRow({ reason: r }), r + ' is not counted as failed');
A.eq(FAILED_REASONS.slice().sort(), ['budget', 'error', 'max_iters', 'refusal'], 'the dead-run set is the slag set');

// ---- the fold ----
const SINCE = 1000;
const rows = [   // NEWEST-FIRST, like runStore.list
  { runId: 'r9', agentId: 'ada', lineId: 'L1', dockId: 'bC', reason: 'error', toolsOk: 0, durationMs: 900, ts: 9000 },
  { runId: 'r8', agentId: 'mira', lineId: 'L1', dockId: 'bB', reason: 'done', toolsOk: 2, durationMs: 3000, ts: 8000 },
  { runId: 'r7', agentId: 'quill', lineId: 'L1', dockId: 'bA', reason: 'done', toolsOk: 0, durationMs: 1000, ts: 7000 },
  { runId: 'r6', agentId: 'zed', lineId: 'L2', dockId: 'bZ', reason: 'refusal', durationMs: 0, ts: 6000 },
  { runId: 'r5', agentId: 'quill', reason: 'done', toolsOk: 4, durationMs: 5000, ts: 5000 },                   // no line: a direct order
  { runId: 'r4', agentId: 'old', lineId: 'GONE', dockId: 'bX', reason: 'done', toolsOk: 1, ts: 4000 },       // a line no longer on the floor
  { runId: 'r3', agentId: 'ada', lineId: 'L1', dockId: 'bC', reason: 'done', toolsOk: 1, durationMs: 2000, ts: 900 },   // BEFORE since
  null, 'garbage', { lineId: 'L1' }                                                                          // unreadable rows are skipped
];
const spend = { L1: 0.0125, L2: 0 };
const caps = { L1: 5, L2: null };
const out = lineStats({ rows, lines: [{ lineId: 'L1' }, { lineId: 'L2' }, { lineId: 'L3' }], since: SINCE,
  spentToday: id => spend[id] || 0, capOf: id => caps[id] == null ? null : caps[id],
  shipments: [receipt('L1', 'r8', 8000)] });   // only r8 has a terminal receipt
const L = id => out.lines.find(l => l.lineId === id);
A.eq(out.since, SINCE, 'answers the window it folded');
A.eq(out.spendDay, 'utc', 'says the $ ledger keeps the UTC day');
A.eq(out.lines.map(l => l.lineId), ['L1', 'L2', 'L3'], 'one entry per plan line, in plan order');
A.eq(L('L1').runs, 3, 'L1: only its stamped rows since the window (the pre-window row is excluded)');
A.eq(L('L1').shipped, 1, 'L1: only the durable terminal-job receipt ships');
A.eq(L('L1').failed, 1, 'L1: the error run is failed');
A.eq(L('L1').medianMs, 1000, 'L1: median of 900/3000/1000');
A.eq(L('L1').usdToday, 0.0125, 'L1: $ today from the ledger reader');
A.eq(L('L1').capUsdPerDay, 5, 'L1: the daily cap from the limits reader');
A.eq(L('L2'), { lineId: 'L2', runs: 1, shipped: 0, failed: 1, tests: 0, medianMs: null, usdToday: 0, capUsdPerDay: null, spendDay: 'utc' }, 'L2: a refusal with no timing -> median null, no cap');
A.eq(L('L3'), { lineId: 'L3', runs: 0, shipped: 0, failed: 0, tests: 0, medianMs: null, usdToday: 0, capUsdPerDay: null, spendDay: 'utc' }, 'L3: a line with no runs answers zeros');
A.ok(!out.lines.some(l => l.lineId === 'GONE'), 'a line no longer on the floor gets no plate');
// SHIPPED = JOBS that reached the OUTBOX (2026-09-24): a 3-stage line finishing one job is 3 done runs but ONE shipment
{
  const job = [
    { runId: 'j3', agentId: 'ed', lineId: 'LJ', dockId: 'd3', reason: 'done', toolsOk: 1, ts: 3003 },
    { runId: 'j2', agentId: 'mid', lineId: 'LJ', dockId: 'd2', reason: 'done', toolsOk: 1, ts: 3002 },
    { runId: 'j1', agentId: 'w', lineId: 'LJ', dockId: 'd1', reason: 'done', toolsOk: 1, ts: 3001 }
  ];
  const one = lineStats({ rows: job, lines: [{ lineId: 'LJ' }], since: 0, shipments: [receipt('LJ', 'j1', 3003)] }).lines[0];
  A.eq([one.runs, one.shipped], [3, 1], 'three done stage runs, ONE job shipped (was: 3 shipped)');
  A.eq(lineStats({ rows: job, lines: [{ lineId: 'LJ' }], shipments: [receipt('LJ', 'j1', 3003), receipt('LJ', 'j1', 3004)] }).lines[0].shipped, 1, 'a duplicate receipt never counts the same job twice');
  A.eq(lineStats({ rows: job, lines: [{ lineId: 'LJ' }], since: 0 }).lines[0].shipped, 0, 'no receipt -> historical run rows never become guessed shipments');
  A.eq(lineStats({ rows: job, lines: [{ lineId: 'LJ' }], since: 0, shipments: [receipt('LJ', 'j1', 3003)], shipsToOutbox: () => { throw new Error('x'); } }).lines[0].shipped, 1, 'later floor edits never rewrite recorded shipments');
}
// the bays' LAST outcome = newest stamped row (any day)
A.eq(out.docks.bC, { runId: 'r9', agentId: 'ada', reason: 'error', failed: true, ts: 9000 }, 'bay C: the newest row (the failure) wins over the older success');
A.eq(out.docks.bA.failed, false, 'bay A: last run done');
A.eq(out.docks.bX.runId, 'r4', 'a bay\'s last outcome is kept even for an old line (the lamp checks the bay is still bound)');
A.ok(!('undefined' in out.docks), 'rows without a dock never key a bay');

// ---- readers that throw degrade to "cannot prove", never to a crash ----
const safe = lineStats({ rows: [], lines: [{ lineId: 'L1' }], since: 0, spentToday: () => { throw new Error('x'); }, capOf: () => { throw new Error('y'); } });
A.eq(safe.lines[0], { lineId: 'L1', runs: 0, shipped: 0, failed: 0, tests: 0, medianMs: null, usdToday: 0, capUsdPerDay: null, spendDay: 'utc' }, 'throwing readers -> zero $ and no cap');
A.eq(lineStats(null).lines, [], 'no input -> no lines');

// ---- STEP TESTS ARE COUNTED APART (conveyor sweep 2026-09-25) ----
// Try-this-step and step-test hops are real runs at real bays (their $ is in the ledger), but they are not JOBS:
// a floor plate that said "10 RUNS · 0 SHIPPED" after ten test clicks claimed work the line never did.
{
  const trows = [
    { runId: 't3', agentId: 'mira', lineId: 'L1', dockId: 'bB', reason: 'done', toolsOk: 2, durationMs: 50, ts: 9500, stepTest: true },
    { runId: 't2', agentId: 'ada', lineId: 'L1', dockId: 'bC', reason: 'error', durationMs: 60, ts: 9400, stepTest: true },
    { runId: 'j1', agentId: 'mira', lineId: 'L1', dockId: 'bB', reason: 'done', toolsOk: 1, durationMs: 4000, ts: 9300 }
  ];
  const t = lineStats({ rows: trows, lines: [{ lineId: 'L1' }], since: SINCE, shipments: [receipt('L1', 'j1', 9300)] }).lines[0];
  A.eq([t.runs, t.shipped, t.failed, t.tests], [1, 1, 0, 2], 'test hops count as TESTS, never as runs / shipped / failed: ' + JSON.stringify(t));
  A.eq(t.medianMs, 4000, 'the median is the real jobs\' time only');
  const LW = require('../frontend/app/linewatch.js');
  A.ok(LW.statsRow(t).some(c => c[0] === 'TESTS' && c[1] === '2'), 'the Workflow panel TODAY row names the tests');
  A.ok(!LW.statsRow(Object.assign({}, t, { tests: 0 })).some(c => c[0] === 'TESTS'), 'and shows no TESTS cell when there were none');
  const st = require('../sidecar/runstore.js').makeRunStore({ io: { readAll: () => [], append: () => {} }, clock: { now: () => 1 } });
  A.eq(st.record({ runId: 's1', reason: 'done', stepTest: true }).stepTest, true, 'the run row records a step-test hop');
  A.ok(!('stepTest' in st.record({ runId: 's2', reason: 'done' })), 'every other row keeps its old shape');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'sidecar', 'index.js'), 'utf8');
  A.ok(/stepTest: true\s+\/\/ the run row says it was a TEST hop/.test(src), 'the step-test host stamps its runs stepTest');
  A.ok(/stepTest: o\.stepTest === true, lineId: o\.lineId/.test(src), 'runOnce passes the stamp to the run row');
}

// ---- the run-row stamp (runstore): present only when well-formed ----
const { makeRunStore } = require('../sidecar/runstore.js');
const store = makeRunStore({ io: { readAll: () => [], append: () => {} }, clock: { now: () => 1 } });
if (store && store.record) {
  const a = store.record({ runId: 'x1', agentId: 'quill', reason: 'done', lineId: 'p18', dockId: 'p19' });
  A.eq([a.lineId, a.dockId], ['p18', 'p19'], 'a dispatched run records its line + bay');
  const b = store.record({ runId: 'x2', agentId: 'quill', reason: 'done' });
  A.ok(!('lineId' in b) && !('dockId' in b), 'a run with no line/bay keeps the old row shape');
  const c = store.record({ runId: 'x3', agentId: 'quill', reason: 'done', lineId: '../etc', dockId: '' });
  A.ok(!('lineId' in c) && !('dockId' in c), 'a malformed id is never recorded');
} else {
  A.ok(false, 'runstore exposes makeRunStore().record');
}

// Terminal-job evidence: loop revisits and parallel productive branches still ship once.
{
  let disk = [], writes = 0, clock = 9000, fail = false;
  const base = { streamId: 'channel-1', lineId: 'L1', reason: 'done', toolsOk: 1, ts: 8000, startedAt: 7000 };
  let rows = [
    Object.assign({}, base, { runId: 'last', agentId: 'reviewer', dockId: 'd3' }),
    Object.assign({}, base, { runId: 'branch', agentId: 'branch', dockId: 'd2' }),
    Object.assign({}, base, { runId: 'earlier-pass', agentId: 'reviewer', dockId: 'd3' }),
    Object.assign({}, base, { runId: 'entry', agentId: 'planner', dockId: 'd1' }),
    Object.assign({}, base, { runId: 'previous-job', agentId: 'planner', dockId: 'd1', reason: 'error' })
  ];
  const options = { now: () => clock, load: () => disk,
    save: value => { if (fail) throw new Error('disk full'); disk = JSON.parse(JSON.stringify(value)); writes++; },
    runsFor: () => rows };
  const ledger = makeLineShipments(options);
  const rec = { entryRunId: 'entry', streamId: 'channel-1', lineId: 'L1', agentId: 'reviewer', dockId: 'd3', outboxId: 'o1' };
  A.ok(ledger.record(rec), 'clean productive job at its exact OUTBOX records a shipment');
  A.eq(ledger.snapshot().length, 1, 'four productive runs including a repeated loop bay are one shipped job');
  A.eq(ledger.snapshot()[0].terminalRunId, 'last', 'receipt names the final run at the terminal dock');
  A.ok(ledger.record(rec), 'duplicate callback is idempotent');
  A.eq(writes, 1, 'duplicate does not rewrite persistence');
  A.eq(makeLineShipments(options).snapshot(), ledger.snapshot(), 'receipt survives a fresh ledger load');
  A.eq(lineStats({ rows: [], lines: [{ lineId: 'L1' }], shipments: disk, since: 0 }).lines[0].shipped, 1, 'receipt outlives the run-list query horizon');
  A.eq(lineStats({ lines: [{ lineId: 'L1' }], shipments: disk, since: clock }).lines[0].shipped, 0, 'shipment time obeys the requested window');
  A.eq(cleanShipments([{}, receipt('L1', 'entry', 9000), receipt('L1', 'entry', 9001)]).length, 1, 'malformed and duplicate stored receipts are normalized');
  const changed = Object.assign({}, rec, { entryRunId: 'next', agentId: 'planner', dockId: 'd1' });
  rows.unshift(Object.assign({}, base, { runId: 'next', agentId: 'planner', dockId: 'd1' }));
  A.ok(ledger.record(changed), 'second job with identical timestamps has its own exact entry boundary');
  A.eq(ledger.snapshot().length, 2, 'same-stream adjacent jobs do not collapse');
  A.ok(ledger.record(rec), 'late duplicate cannot borrow later jobs');
  A.eq(ledger.snapshot().length, 2, 'late duplicate stays deduplicated');
  for (const patch of [{ entryRunId: 'missing' }, { outboxId: null }, { streamId: null }, { dockId: 'missing', entryRunId: 'branch' }]) {
    A.ok(!ledger.record(Object.assign({}, rec, patch)), 'unknown shipment evidence is refused: ' + JSON.stringify(patch));
  }
  for (const patch of [{ reason: 'error' }, { reason: 'budget' }, { reason: 'max_iters' }, { stepTest: true }, { toolsOk: 0, artifacts: [] }]) {
    rows = [Object.assign({}, base, patch, { runId: 'fresh', agentId: 'reviewer', dockId: 'd3' })];
    A.ok(!ledger.record(Object.assign({}, rec, { entryRunId: 'fresh' })), 'unclean/test/workless run cannot mint a shipment: ' + JSON.stringify(patch));
  }
  rows = [Object.assign({}, base, { runId: 'fresh', agentId: 'reviewer', dockId: 'd3', toolsOk: 0, artifacts: [{ kind: 'file' }] })];
  fail = true;
  A.ok(!ledger.record(Object.assign({}, rec, { entryRunId: 'fresh' })), 'failed durable save refuses the count');
  A.eq(ledger.snapshot().length, 2, 'failed save does not publish an in-memory shipment');
  fail = false;
  A.ok(ledger.record(Object.assign({}, rec, { entryRunId: 'fresh' })), 'retry can record a proven artifact after storage recovers');
}
// The host must preserve domain-store provenance instead of reading .value alone.
{
  for (const status of ['ok', 'recovered', 'absent']) {
    A.eq(loadShipmentReceipts({ load: () => ({ status, value: [] }) }), [], status + ' receipt store may be read');
  }
  for (const status of ['unreadable', 'corrupt', 'invalid', 'unknown']) {
    let failed = false;
    try { loadShipmentReceipts({ load: () => ({ status, value: [] }) }); } catch (_) { failed = true; }
    A.ok(failed, status + ' default value must never be mistaken for a new empty history');
  }
}
// A temporarily unreadable store is not an empty history. A failed first stats
// poll must leave loading retryable, and no later save may replace old receipts.
{
  const original = receipt('L1', 'old', 100);
  let disk = [original], blocked = true, writes = 0;
  const fresh = { lineId: 'L1', entryRunId: 'new', streamId: 's', agentId: 'a', dockId: 'd', outboxId: 'o' };
  const ledger = makeLineShipments({
    now: () => 200,
    load: () => { if (blocked) throw new Error('locked'); return disk; },
    save: value => { writes++; disk = JSON.parse(JSON.stringify(value)); },
    runsFor: () => [{ runId: 'new', lineId: 'L1', streamId: 's', agentId: 'a', dockId: 'd', reason: 'done', toolsOk: 1 }]
  });
  let failed = false; try { ledger.snapshot(); } catch (_) { failed = true; }
  A.ok(failed, 'first failed stats read does not assert an empty shipment history');
  A.ok(!ledger.record(fresh), 'unreadable prior history refuses receipt writes');
  A.eq(writes, 0, 'no write occurs while the load authority is unavailable');
  blocked = false;
  A.eq(ledger.snapshot(), [original], 'next stats read retries and recovers the previous receipt');
  A.ok(ledger.record(fresh), 'after recovery a real new receipt may be saved');
  A.eq(disk.map(r => r.entryRunId), ['old', 'new'], 'recovered history and new shipment both survive');
}
// Actual PARALLEL CREW switched to COPY/JOINER: three productive branches,
// one terminal job. Removing the OUTBOX cannot alter its historical receipt.
{
  const WM = require('../frontend/app/worldmodel.js'), P = require('../frontend/app/pipeline.js');
  const { makeRouter } = require('../sidecar/routing/router.js');
  const doc = WM.starterDoc();
  for (const room of Object.values(doc.rooms)) for (const rect of room.rects) { rect.x2 = 55; rect.y2 = 35; }
  const station = WM.create(doc), placed = station.stampBlueprint('parallel_crew', 10, 10);
  A.ok(placed.ok, 'parallel blueprint stamps for shipment proof');
  station.props().filter(p => p.t === 'bay').forEach((p, i) => station.assignPropAgent(p.id, 'a' + i));
  A.ok(station.swapJoinerMerger(station.props().find(p => p.t === 'merger').id).ok, 'branches meet at JOINER');
  const router = makeRouter(), plan = P.compileRoutingPlan(station.projectGeometry());
  A.ok(router.setPlan(plan).ok, 'joined floor deploys');
  const bays = station.props().filter(p => p.t === 'bay'), lineId = plan.lineOfProp[bays[0].id];
  const rows = bays.map((p, i) => ({ runId: 'branch-' + i, lineId, dockId: p.id, agentId: p.agentId, reason: 'done', toolsOk: 1, ts: 100 + i }));
  A.ok(rows.every(r => router.chainShipsToOutbox(r.agentId, r.dockId)), 'old topology predicate incorrectly qualified every branch');
  const done = Object.assign(receipt(lineId, 'branch-0', 104), { outboxId: station.props().find(p => p.t === 'outbox').id });
  const input = { rows, lines: plan.lines, since: 0, shipments: [done], shipsToOutbox: (a, d) => router.chainShipsToOutbox(a, d) };
  A.eq(lineStats(input).lines.find(l => l.lineId === lineId).shipped, 1, 'three joined branch runs ship one job');
  station.removeProp(done.outboxId);
  router.setPlan(P.compileRoutingPlan(station.projectGeometry()));
  A.ok(rows.every(r => !router.chainShipsToOutbox(r.agentId, r.dockId)), 'edited topology no longer reaches OUTBOX');
  A.eq(lineStats(input).lines.find(l => l.lineId === lineId).shipped, 1, 'floor edit cannot erase the real past shipment');
}
A.report();
