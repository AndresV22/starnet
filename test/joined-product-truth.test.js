'use strict';
/* Real stamped JOINER floors, the real executor and the real world.js shipping functions.
   Time passing is not evidence that a join released. Exercise a slow sibling and an SSE echo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WM = require('../frontend/app/worldmodel.js');
const P = require('../frontend/app/pipeline.js');
const Conveyor = require('../frontend/app/conveyor.js');
const { makeRouter } = require('../sidecar/routing/router.js');
const { makeChainRunner } = require('../sidecar/routing/chain.js');
const source = fs.readFileSync(path.join(__dirname, '../frontend/app/world.js'), 'utf8');
const pairing = source.slice(source.indexOf('  const dockLineWork = new Map();'), source.indexOf('  // the bay an agent\'s CURRENT work'));
const shipping = source.slice(source.indexOf('  const HANDOFF_GRACE_MS = 8000;'), source.indexOf('  function enqueueSlag'));

function floor(id) {
  const s = WM.create();
  assert.ok(s.addRoom({ kind: 'hab', rect: { x1: 30, y1: 0, x2: 69, y2: 14 } }).ok);
  assert.ok(s.stampBlueprint(id, 32, 2).ok);
  s.props().filter(p => p.t === 'bay').forEach((b, i) => s.assignPropAgent(b.id, 'crew' + i));
  const plan = P.compileRoutingPlan(s.projectGeometry());
  assert.deepEqual(plan.errors, []);
  const router = makeRouter(); assert.ok(router.setPlan(plan).ok);
  return { plan, router };
}
function surface(plan) {
  const crates = [], timers = [];
  const context = vm.createContext({ routingPlan: plan, Pipeline: P, Conveyor, runUsdRecon: new Map(), shippedRunIds: new Set(), runWork: new Map(), runKey: p => p.runId,
    convey: { enqueueAt: (x, y, payload) => crates.push({ x, y, payload }) },
    outboundBeltTile: (aid, dockId) => (plan.dockChains[dockId] || plan.chains[aid] || {}).tile,
    setTimeout: (fn, ms) => { const t = { fn, ms, active: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.active = false; } });
  vm.runInContext(pairing + shipping + `
    globalThis.proof = {
      end(aid, dockId, lineId, runId, workitemId, usd = 0.01) {
        runWork.set(runId, { workitemId }); runUsdRecon.set(runId, usd);
        const q = dockLineWork.get(aid) || []; q.push({ dockId, lineId }); dockLineWork.set(aid, q);
        shipProductCrate({ agentId: aid, runId });
      },
      placed(p) { if (p.kind === 'chain' && p.from) { cancelDeferredShip(p.from); } },
      release: releaseJoinedProduct,
      clear: clearDeferredShips
    };
  `, context);
  return { ...context.proof, crates, expire: () => { for (const t of timers) if (t.active) { t.active = false; t.fn(); } } };
}

(async () => {
  for (const id of ['second_opinion', 'swarm_synthesis']) {
    const { plan, router } = floor(id), ui = surface(plan), events = [], ran = [];
    const entry = router.resolveDock({ tag: 'general' }), lineId = router.lineOriginFor(entry.agentId, entry.dockId);
    const sibling = router.fanSiblingsDock(entry.dockId).at(-1);
    let unblock, started;
    const blocked = new Promise(r => { unblock = r; }), entered = new Promise(r => { started = r; });
    const chain = makeChainRunner({
      nextAgent: (a, c) => router.chainNext(a, c), stepDock: (d, c) => router.chainStepDock(d, c),
      peekDock: (d, c) => router.chainPeekDock(d, c), entryDockOf: a => router.entryDockOf(a),
      fanSiblingsDock: d => router.fanSiblingsDock(d), lineOfAgent: (a, d) => router.lineOfAgent(a, d),
      emit: (name, p) => { events.push({ name, p }); if (name === 'workitem.placed') ui.placed(p); if (name === 'workitem.delivered') ui.release(p); }
    });
    ui.end(entry.agentId, entry.dockId, lineId, 'entry');
    const running = chain.advance({ ...entry, lineId, runId: 'entry', text: 'Entry evidence', originalText: 'Compare the evidence',
      runAgent: async h => {
        ran.push(h.dockId);
        if (h.dockId === sibling.dockId) { started(); await blocked; }
        ui.end(h.agentId, h.dockId, lineId, 'run-' + h.dockId, h.workitemId);
        return { text: h.agentId + ' evidence', usd: 0.01 };
      } });
    await entered;
    assert.equal(ui.crates.length, 0, id + ': no product ships before the slow sibling finishes');
    ui.expire();
    assert.equal(ui.crates.length, 0, id + ': even the old 8-second fallback cannot bypass the join');
    unblock();
    const result = await running;
    assert.equal(result.stopped, null);
    const releases = events.filter(e => e.name === 'workitem.delivered' && e.p.box === 'line-output');
    assert.equal(releases.length, 1, id + ': the actual joined release is emitted once');
    assert.equal(ui.crates.length, 1, id + ': exactly one finished result ships');
    ui.release(releases[0].p);
    assert.equal(ui.crates.length, 1, 'an SSE echo does not duplicate the merged result');
    const out = plan.outs.find(o => o.propId === releases[0].p.outboxId);
    assert.deepEqual([ui.crates[0].x, ui.crates[0].y], [out.tile.x, out.tile.y], 'result starts at the actual OUTBOX inlet');
    assert.equal(ui.crates[0].payload.weight, Conveyor.weightForUsd((ran.length + 1) * 0.01), 'merged mass uses all observed reconciled spend');
    if (id === 'swarm_synthesis') assert.ok(ran.includes(result.dockId), 'the analyst really ran after the join');
    // Another job can finish first at these exact same docks. Its terminal receipt must not
    // steal A's productive work or mint product for talk-only B.
    ui.end(entry.agentId, entry.dockId, lineId, 'overlap-A');
    const overlapBefore = ui.crates.length;
    await chain.advance({ ...entry, lineId, runId: 'talk-only-B', text: 'B only talked', originalText: 'B',
      runAgent: async h => ({ text: 'B only talked', usd: 0 }) });
    assert.equal(ui.crates.length, overlapBefore, 'a talk-only overlapping job cannot release productive A');
    await chain.advance({ ...entry, lineId, runId: 'overlap-A', text: 'A evidence', originalText: 'A',
      runAgent: async h => ({ text: 'A continuation', usd: 0 }) });
    assert.equal(ui.crates.length, overlapBefore + 1, 'A keeps its own productive proof until A reaches OUTBOX');
    const before = ui.crates.length;
    ui.end(entry.agentId, entry.dockId, null, 'direct');
    assert.equal(ui.crates.length, before + 1, 'a direct order remains its own immediate product');
    ui.clear(); ui.release({ ...releases[0].p, workitemId: 'unobserved-after-reconnect' });
    assert.equal(ui.crates.length, before + 1, 'a release with no observed branch work invents no crate');
  }
  console.log('joined-product-truth: OK — slow sequential/parallel siblings, exact job identity, terminal authority, mass, echo dedup and direct-order isolation');
})().catch(e => { console.error(e); process.exitCode = 1; });
