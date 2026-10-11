/* test/chain-audit-1010.test.js — chain-runner bugs the 2026-10-10 conveyor audit proved, pinned through the REAL compiler +
   router where a floor exists (fake harness, no provider):
     1. two review LOOP gates in a row: the outer gate's re-run used to stop at "the line loops back to style" — the inner gate
        letting work out lowered the loop pass the outer gate still had open;
     2. E-STOP / STOP while a JOINER waits: advance sat out the joiner's whole timeout (default 10 min) holding locks. */
'use strict';
const A = require('./_assert.js');
const { makeChainRunner } = require('../sidecar/routing/chain.js');
const { makeRouter } = require('../sidecar/routing/router.js');
const P = require('../frontend/app/pipeline.js');
const belt = (x, y, dir) => ({ x, y, dir });

(async () => {
  /* ---- 1. drafter ▸ factcheck ▸ LOOP ▸ style ▸ LOOP ▸ publisher, both back lanes to the drafter ---- */
  {
    const belts = [belt(1, 4, 'E'), belt(2, 4, 'E'), belt(5, 4, 'E'), belt(6, 4, 'E'), belt(7, 4, 'E'), belt(10, 4, 'E'), belt(11, 4, 'E'), belt(12, 4, 'E'),
      belt(13, 4, 'E'), belt(14, 4, 'E'), belt(12, 3, 'N'), belt(12, 2, 'N'), belt(12, 1, 'W')];
    for (let x = 11; x >= 6; x--) belts.push(belt(x, 1, 'W'));
    belts.push(belt(5, 1, 'S'), belt(5, 2, 'S'));
    belts.push(belt(17, 4, 'E'), belt(18, 4, 'E'), belt(19, 4, 'E'), belt(20, 4, 'E'), belt(21, 4, 'E'));
    belts.push(belt(19, 3, 'N'), belt(19, 2, 'N'), belt(19, 1, 'N'), belt(19, 0, 'W'));
    for (let x = 18; x >= 5; x--) belts.push(belt(x, 0, 'W'));
    belts.push(belt(4, 0, 'S'), belt(4, 1, 'S'), belt(4, 2, 'S'));
    const geo = { props: [
      { id: 'p1', t: 'intake', x: 0, y: 4, w: 1, h: 1 },
      { id: 'p2', t: 'bay', x: 3, y: 3, w: 2, h: 2, agentId: 'drafter' },
      { id: 'p3', t: 'bay', x: 8, y: 3, w: 2, h: 2, agentId: 'factcheck' },
      { id: 'p5', t: 'loop', x: 12, y: 4, w: 1, h: 1, done: 'E', when: 'approved', maxIter: 3 },
      { id: 'p6', t: 'bay', x: 15, y: 3, w: 2, h: 2, agentId: 'style' },
      { id: 'p7', t: 'loop', x: 19, y: 4, w: 1, h: 1, done: 'E', when: 'approved', maxIter: 3 },
      { id: 'p8', t: 'bay', x: 22, y: 3, w: 2, h: 2, agentId: 'publisher' }], belts };
    const plan = P.compileRoutingPlan(geo);
    A.eq(plan.errors.length, 0, 'the two-gate floor compiles clean');
    const router = makeRouter(); A.ok(router.setPlan(plan).ok, 'and deploys');
    let styleN = 0; const ran = [];
    const c = makeChainRunner({ nextAgent: (a, x) => router.chainNext(a, x), stepAgent: (a, x) => router.chainStep(a, x),
      stepDock: (d, x) => router.chainStepDock(d, x), entryDockOf: a => router.entryDockOf(a), fanSiblings: a => router.fanSiblings(a),
      fanSiblingsDock: d => router.fanSiblingsDock(d), lineOfAgent: (a, d) => router.lineOfAgent(a, d) });
    const out = await c.advance({ agentId: 'drafter', text: 'draft v1', originalText: 'write X', lineId: router.lineOfAgent('drafter'),
      runAgent: async (h) => { ran.push(h.agentId);
        if (h.agentId === 'factcheck') return { text: 'facts ok\nVERDICT: approved' };
        if (h.agentId === 'style') return { text: (++styleN === 1) ? 'tone off\nVERDICT: revise' : 'good\nVERDICT: approved' };
        return { text: h.agentId + ' out' }; } });
    A.eq(ran.join(' > '), 'factcheck > style > drafter > factcheck > style > publisher', 'the outer gate sends it round once, then on to the publisher');
    A.eq(out.stopped, null, 'the line runs to its end (' + out.stopped + ')');
    A.eq(out.agentId, 'publisher', 'the publisher has the last word');
  }

  /* ---- 2. a stop while the joiner waits settles at once ---- */
  {
    let fire = null; const ran = [];
    const r = makeChainRunner({
      nextAgent: () => null,
      stepAgent: (a, ctx) => ctx.fromTile ? { agentId: 'D' } : (a === 'B' ? null : (a === 'D' ? null : { join: '5,5', expect: 3, timeoutMin: 10, next: 'D' })),
      fanSiblings: (a) => ['A', 'B', 'C'].filter(x => x !== a),
      setTimer: (fn) => { fire = fn; return 0; }
    });
    const ac = new AbortController();
    const p = r.advance({ agentId: 'A', text: 'A-out', originalText: 'q', lineId: 'L1', signal: ac.signal,
      runAgent: async (h) => { ran.push(h.agentId); return { text: h.agentId + '-out', usd: 0.1 }; } });
    await new Promise(res => setTimeout(res, 30));
    A.ok(typeof fire === 'function', 'the joiner is waiting on its timeout');
    ac.abort();
    const settled = await Promise.race([p.then(() => true), new Promise(res => setTimeout(() => res(false), 200))]);
    A.ok(settled, 'STOP ends the wait at once — it no longer sits out the joiner timeout');
    const out = await p;
    A.eq(out.stopped, 'stopped', 'and says it was stopped');
    A.eq(r._barrier.size(), 0, 'the parked barrier is dropped');
  }

  /* ---- 3. the compiler + line editor: real starters, real edits ---- */
  const WM = require('../frontend/app/worldmodel.js'), LE = require('../frontend/app/lineedit.js');
  const crew = s => { for (const b of s.props().filter(p => p.t === 'bay')) if (!b.agentId) s.assignPropAgent(b.id, 'a_' + b.id); };
  const runnerFor = (router, timers) => makeChainRunner({ nextAgent: (a, c) => router.chainNext(a, c), lineOfAgent: (a, d) => router.lineOfAgent(a, d), stepAgent: (a, c) => router.chainStep(a, c),
    stepDock: (d, c) => router.chainStepDock(d, c), fanSiblingsDock: d => router.fanSiblingsDock(d), entryDockOf: a => router.entryDockOf(a), getTag: () => 'general',
    setTimer: (fn, ms) => { timers.push(ms); setImmediate(fn); return 0; } });

  // 3a. a TAKE TURNS split never copies because a COPY section sits after its MERGER
  {
    const s = WM.create(), z = s.rooms()[0].rects[0];
    s.addRoom({ kind: 'hab', rect: { x1: z.x2 + 1, y1: z.y1, x2: z.x2 + 40, y2: z.y1 + 30 } });
    const near = { x: 35, y: 12 };
    A.ok(LE.placeBlueprint(s, 'load_balancer', near).ok, 'LOAD BALANCER placed');
    const M = s.props().find(p => p.t === 'merger'), O = s.props().find(p => p.t === 'outbox');
    A.ok(LE.run(s, M.id, 'insertStep', { from: M.id, to: O.id, role: 'WRITER' }, { near }).ok, 'a WRITER after its MERGER');
    const E = s.props().find(p => p.role === 'WRITER');
    let r = LE.run(s, E.id, 'addBranch', { around: E.id, mode: 'copy', n: 2 }, { near });
    if (!r.ok) r = LE.run(s, E.id, 'addBranch', { around: E.id, mode: 'copy', n: 2 }, { near, tidy: true });
    A.ok(r.ok, 'a COPY section round that WRITER');
    crew(s);
    const plan = P.compileRoutingPlan(s.projectGeometry());
    const splits = Object.keys(plan.junctions).filter(k => plan.junctions[k].kind === 'split');
    const turns = splits.filter(k => P.rejoinOf(plan, k).lanes.every(l => l.kind === 'merge')), copies = splits.filter(k => P.rejoinOf(plan, k).lanes.every(l => l.kind === 'join'));
    A.ok(turns.length === 1 && !plan.junctions[turns[0]].fanout, 'the balancer still takes turns — the JOINER past its MERGER is not its own');
    A.ok(copies.length === 1 && plan.junctions[copies[0]].fanout === true, 'the later section still copies');
    const router = makeRouter(); router.setPlan(plan);
    const e = router.resolveDock({ tag: 'general' }), timers = [];
    const res = await runnerFor(router, timers).advance({ agentId: e.agentId, dockId: e.dockId, text: 'entry out', lineId: router.lineOriginFor(e.agentId, e.dockId), runAgent: async c => ({ text: 'out ' + c.dockId }) });
    A.eq(res.stopped, null, 'a job runs the whole line (' + res.stopped + ')');
    A.ok(/JOINED OUTPUT — 2 of 2/.test(res.text), 'through the COPY section and its joiner');
    A.eq(timers.length, 0, 'no joiner waits out a timeout');
  }

  // 3b. a review loop on one branch of a COPY split: the reviewed work reaches the JOINER
  {
    const s = WM.create(WM.starterDoc());
    A.ok(LE.placeBlueprint(s, 'second_opinion', { x: 8, y: 5 }).ok, 'SECOND OPINION placed');
    crew(s);
    const b = s.props().filter(p => p.t === 'bay')[1];
    A.ok(LE.run(s, b.id, 'addLoop', { around: b.id, max: 2 }, { near: { x: 8, y: 5 } }).ok, 'a review loop on one branch');
    crew(s);
    const plan = P.compileRoutingPlan(s.projectGeometry());
    A.eq(plan.errors.length, 0, 'compiles clean');
    const router = makeRouter(); router.setPlan(plan);
    const timers = [];
    // enter at the reviewed branch's own dock so its loop is on the walk
    const e = router.resolveDock({ tag: 'general' });
    const out = await runnerFor(router, timers).advance({ agentId: e.agentId, dockId: e.dockId, text: 'entry out', lineId: router.lineOriginFor(e.agentId, e.dockId),
      runAgent: async c => ({ text: 'out of ' + c.agentId + (/REVIEWER/.test((s.propById(c.dockId) || {}).role || '') ? '\nVERDICT: approved' : '') }) });
    A.eq(out.stopped, null, 'the line runs to its end (' + out.stopped + ')');
    A.ok(/JOINED OUTPUT — 2 of 2 branches delivered/.test(out.text) && !/PARTIAL/.test(out.text), 'both branches — the reviewed one included — reach the joiner');
    A.eq(timers.length, 0, 'the joiner never times out waiting for the reviewed branch');
  }

  // 3c. no COPY branch round a step a review loop sends work back to
  {
    const s = WM.create(WM.starterDoc());
    A.ok(LE.placeBlueprint(s, 'revision_loop', { x: 8, y: 5 }).ok, 'REVISION LOOP placed');
    const W = s.props().find(p => p.t === 'bay' && p.role === 'WRITER');
    const chk = LE.check(s, W.id, 'addBranch', { around: W.id, mode: 'copy', n: 2 });
    A.ok(!chk.ok && chk.error === 'HAS_LOOP', 'refused, naming the loop (' + JSON.stringify(chk.error) + ')');
  }

  /* ---- 4. SEND TO still fires from a line that ends at a JOINER, on every new branch path (parallel, divided, a failed
     branch): onShipped needs the OUTBOX the job landed in (ctx.reach), and the peek that found the joiner must carry it ---- */
  {
    const s = WM.create(), z = s.rooms()[0].rects[0];
    s.addRoom({ kind: 'hab', rect: { x1: z.x2 + 1, y1: z.y1, x2: z.x2 + 40, y2: z.y1 + 30 } });
    let ok = null;
    for (let y = z.y1; y < z.y1 + 25 && !ok; y++) for (let x = z.x1; x < z.x2 + 30 && !ok; x++) { const r = s.stampBlueprint('parallel_crew', x, y); if (r.ok) ok = r; }
    A.ok(!!ok, 'PARALLEL CREW stamped');
    const intake = s.props().find(p => p.t === 'intake'), split = s.props().find(p => p.t === 'splitter'), merger = s.props().find(p => p.t === 'merger'), outbox = s.props().find(p => p.t === 'outbox');
    A.ok(LE.run(s, intake.id, 'insertStep', { from: intake.id, to: split.id, role: 'PLANNER' }, { near: { x: split.x, y: split.y } }).ok, 'a PLANNER before the splitter');
    A.ok(s.swapJoinerMerger(merger.id).ok && s.setSplitDivide(split.id, true).ok, 'its MERGER is a JOINER and the splitter divides');
    s.props().filter(p => p.t === 'bay').forEach((b, i) => s.assignPropAgent(b.id, b.role === 'PLANNER' ? 'planner' : 'c' + i));
    const plan = P.compileRoutingPlan(s.projectGeometry());
    A.eq(plan.errors.filter(e => !e.warn).length, 0, 'compiles');
    const router = makeRouter(); router.setPlan(plan);
    const planner = s.props().find(p => p.role === 'PLANNER'), lineId = router.lineOfAgent('planner', planner.id);
    const run = async (opts) => {
      const shipped = [];
      const c = makeChainRunner(Object.assign({ nextAgent: (a, x) => router.chainNext(a, x), stepAgent: (a, x) => router.chainStep(a, x),
        stepDock: (d, x) => router.chainStepDock(d, x), entryDockOf: a => router.entryDockOf(a), fanSiblingsDock: d => router.fanSiblingsDock(d),
        lineOfAgent: (a, d) => router.lineOfAgent(a, d), lastStage: (a, d) => router.chainShipsToOutbox(a, d), onShipped: r => shipped.push(r),
        setTimer: () => 0 }, opts.peek ? { peekDock: (d, x) => router.chainPeekDock(d, x) } : {}));
      const res = await c.advance({ agentId: 'planner', dockId: planner.id, text: opts.text, originalText: 'do X', lineId,
        runAgent: async h => (opts.fail && h.agentId === opts.fail ? { error: 'down' } : { text: h.agentId + ' did it' }) });
      await new Promise(r => setImmediate(r));
      return { res, shipped };
    };
    for (const [name, opts] of [['parallel + divided', { peek: true, text: 'PART 1: a\nPART 2: b\nPART 3: c' }], ['one after another + divided', { peek: false, text: 'PART 1: a\nPART 2: b\nPART 3: c' }],
      ['parallel, one branch failing', { peek: true, text: 'PART 1: a\nPART 2: b\nPART 3: c', fail: 'c2' }], ['one after another, last branch failing', { peek: false, text: 'PART 1: a\nPART 2: b\nPART 3: c', fail: 'c2' }]]) {
      const { res, shipped } = await run(opts);
      A.eq(res.stopped, null, name + ': the line ends clean (' + res.stopped + ')');
      A.eq(res.outboxId, outbox.id, name + ': it names the OUTBOX the joined job landed in');
      A.ok(shipped.length === 1 && shipped[0].outboxId === outbox.id, name + ': SEND TO is told it shipped');
      if (opts.fail) A.ok(/1 branch failed and sent nothing/.test(res.text), name + ': the failed branch really failed, and is named');
    }
  }

  A.report('chain-audit-1010');
})();
