'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeOverseer, isCoordinatorRun } = require('../sidecar/overseer.js');
const { makeSubagentManager } = require('../sidecar/subagents.js');

(async () => {
  assert.equal(isCoordinatorRun({ agentId: 'agent', surface: 'interactive', lead: true }), true, 'COMMS orchestrator opts into automatic follow-through');
  assert.equal(isCoordinatorRun({ agentId: 'custom_researcher', surface: 'interactive', lead: true }), false, 'specialists keep existing behavior');
  assert.equal(isCoordinatorRun({ agentId: 'agent', surface: 'autonomous', lead: true }), false, 'scheduled work keeps existing behavior');
  assert.equal(isCoordinatorRun({ agentId: 'agent', surface: 'interactive', lead: true, floorless: true }), false, 'channel approvals do not opt external conversations in');
  assert.equal(isCoordinatorRun({ agentId: 'agent', surface: 'autonomous', lead: true, syntheticTrigger: true }), true, 'already-admitted orchestration can follow through');
  assert.equal(isCoordinatorRun({ agentId: 'agent', surface: 'interactive', lead: true, internal: true }), false, 'internal helper requests do not coordinate the crew');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-overseer-'));
  let serial = 0;
  const saved = { generalId: 'home', workstreams: [{ id: 'home', title: null, agentId: 'agent' }], deletedIds: [] };
  const deps = { fs, path, file: path.join(root, 'overseer.json'), now: () => ++serial,
    newId: () => 'thread_' + ++serial, sessions: () => saved, hasAgent: id => ['agent', 'researcher'].includes(id) };
  try {
    let manager = makeOverseer(deps);
    const projectRoot = path.join(root, 'workspace-home');
    assert.equal(manager.projectHome(projectRoot, 'Workspace', false), null, 'read does not create a conversation');
    const project = manager.projectHome(projectRoot, 'Workspace', true);
    assert.equal(manager.projectHome(projectRoot, 'Renamed folder', true).id, project.id, 'reopening reuses the project conversation');
    manager = makeOverseer(deps);
    assert.equal(manager.projectHome(projectRoot, 'Workspace', true).id, project.id, 'project identity survives restart');
    assert.equal(manager.resolve(project.id).projectHome, true);
    const otherProject = manager.projectHome(path.join(root, 'other-project'), 'Other project', true);
    assert.notEqual(project.id, otherProject.id, 'different projects do not share conversation identity');
    saved.workstreams[0].projectRoot = path.join(root, 'project-alpha');
    const child = manager.create({ title: 'Research', agentId: 'researcher', parentStreamId: 'home', requestId: 'create_1', projectRoot: 'untrusted-model-root' });
    assert.equal(child.parentStreamId, 'home');
    assert.equal(child.projectRoot, saved.workstreams[0].projectRoot, 'scope comes from the parent, never tool arguments');
    assert.equal(manager.create({ title: 'Research', parentStreamId: 'home', requestId: 'create_1' }).id, child.id);
    assert.throws(() => manager.create({ title: 'Research', parentStreamId: 'home' }), /already exists/);
    assert.throws(() => manager.create({ title: 'Other', parentStreamId: 'missing' }), /no such/);
    manager = makeOverseer(deps);
    assert.equal(manager.resolve(child.id).title, 'Research');
    saved.workstreams.push({ ...child, title: 'Renamed research' });
    assert.equal(manager.resolve(child.id).title, 'Renamed research');

    const workers = makeSubagentManager({ fs, pathMod: path, file: path.join(root, 'workers.json'),
      clock: { now: () => ++serial }, newId: () => 'worker_' + ++serial });
    workers.start({ leadId: 'agent', agentId: 'researcher', parentStreamId: 'home', streamId: child.id },
      async () => ({ status: 'done', reason: 'done', result: 'Findings' }));
    await new Promise(resolve => setImmediate(resolve));
    manager.collect(workers.list()); manager.collect(workers.list());
    manager.collect([{ ...workers.list()[0], id: 'specialist-work', runId: 'specialist-run', leadId: 'researcher' }]);
    assert.equal(manager.snapshot().reviews.length, 1, 'completion replay must not duplicate review');
    const review = manager.snapshot().reviews[0];
    assert.equal(review.childStreamId, child.id);
    manager.patchReview(review.id, { status: 'reviewing', reviewRunId: 'review_1' });
    manager = makeOverseer(deps);
    assert.equal(manager.snapshot().reviews[0].reviewRunId, 'review_1', 'restart preserves exact review attempt');

    let release;
    const order = [];
    const first = manager.withThread('home', async () => { order.push('first'); await new Promise(r => { release = r; }); throw new Error('failed'); });
    await new Promise(resolve => setImmediate(resolve));
    const second = manager.withThread('home', async () => { order.push('second'); });
    await manager.withThread('other', async () => { order.push('other'); });
    assert.deepEqual(order, ['first', 'other']);
    const caught = assert.rejects(first, /failed/); release(); await caught; await second;
    assert.deepEqual(order, ['first', 'other', 'second']);
    manager.stopReviews();
    manager = makeOverseer(deps);
    assert.equal(manager.snapshot().paused, true, 'stop survives restart');
    assert.equal(manager.snapshot().reviews[0].status, 'cancelled');
    manager.resumeReviews();
    assert.equal(manager.snapshot().paused, false);
    assert.equal(manager.snapshot().reviews[0].status, 'cancelled', 'resuming does not replay cancelled work');
    let diskFull = true;
    const failedDisk = new Proxy(fs, { get(target, key) {
      if (key === 'writeSync' && diskFull) return () => { throw new Error('simulated full disk'); };
      return target[key];
    } });
    const failedStop = makeOverseer({ ...deps, fs: failedDisk });
    const stoppedWorker = { ...workers.list()[0], runId: 'stop-during-disk-failure' };
    assert.throws(() => failedStop.stopReviews([stoppedWorker]), /simulated full disk/);
    assert.equal(failedStop.snapshot().paused, true, 'a failed durable stop still blocks admission in memory');
    assert.throws(() => failedStop.resumeReviews(), /simulated full disk/);
    assert.equal(failedStop.snapshot().paused, true, 'a failed resume does not silently release the emergency stop');
    diskFull = false;
    failedStop.resumeReviews();
    failedStop.collect([stoppedWorker]);
    assert.equal(failedStop.snapshot().reviews.find(r => r.workerRunId === stoppedWorker.runId).status, 'cancelled', 'storage recovery cannot resurrect a stopped worker');
    assert.equal(makeOverseer(deps).snapshot().reviews.find(r => r.workerRunId === stoppedWorker.runId).status, 'cancelled', 'recovered cancellation survives restart');
    const corruptPath = path.join(root, 'corrupt-overseer.json');
    fs.writeFileSync(corruptPath, '{broken');
    const unavailable = makeOverseer({ ...deps, file: corruptPath });
    assert.equal(unavailable.snapshot().paused, true, 'corrupt optional state disables coordination without crashing app boot');
    assert.match(unavailable.snapshot().error, /unavailable/);
    unavailable.resumeReviews();
    assert.throws(() => unavailable.create({ title: 'No overwrite', parentStreamId: 'home' }), /unavailable/);
    assert.equal(fs.readFileSync(corruptPath, 'utf8'), '{broken', 'damaged state is retained for recovery');
    saved.deletedIds.push(child.id); saved.workstreams = saved.workstreams.filter(w => w.id !== child.id);
    assert.throws(() => manager.resolve(child.id), /no such/, 'deleted threads stay deleted');
    // a brand-new conversation the page has not saved yet: its delegating run files it, then its worker threads
    assert.throws(() => manager.create({ title: 'Too early', parentStreamId: 'ws_fresh', agentId: 'researcher' }), /no such session/);
    const fresh = manager.ensure({ id: 'ws_fresh', title: '', agentId: 'agent', projectRoot: '' });
    assert.equal(fresh.id, 'ws_fresh', 'the asking run files its own conversation');
    assert.equal(manager.create({ title: 'Scan competitors', parentStreamId: 'ws_fresh', agentId: 'researcher', requestId: 'r:c:0' }).parentStreamId, 'ws_fresh', 'so the first ask in a new chat still gets its worker threads');
    assert.equal(manager.ensure({ id: 'ws_fresh', agentId: 'agent' }).id, 'ws_fresh', 'filing it again is a no-op');
    const workerRow = manager.create({ title: 'Worker thread', parentStreamId: 'ws_fresh', agentId: 'researcher', requestId: 'r:c:1', worker: true });
    const madeRow = manager.create({ title: 'A session the agent opened', parentStreamId: 'ws_fresh', agentId: 'agent', requestId: 'r:made' });
    const snap = manager.snapshot().threads;
    assert.equal(snap.find(t => t.id === workerRow.id).worker, true, 'a delegated worker thread is marked a worker');
    assert.equal(snap.find(t => t.id === madeRow.id).worker, false, 'a session.create session is not (it keeps its own row on the page)');
    saved.workstreams.push({ id: 'ws_fresh', title: 'Launch prep', agentId: 'agent' });
    assert.equal(manager.resolve('ws_fresh').title, 'Launch prep', 'once the page saves it, the page copy wins');
    assert.throws(() => manager.ensure({ id: child.id, agentId: 'agent' }), /no such session/, 'a deleted conversation is never brought back');

    // COST + GROWTH (review threads-backend-07). A routine that delegates the same ask every day used to load and
    // parse the whole save file twice per taken title; filing a worker now costs one load whatever the repeats.
    {
      let loads = 0, now = 1000;
      const page = { generalId: 'home', workstreams: [{ id: 'home', title: 'Home', agentId: 'agent' }], deletedIds: [] };
      const cdeps = { fs, path, file: path.join(root, 'overseer-cost.json'), now: () => now,
        newId: () => 'ws_cost_' + ++serial, sessions: () => { loads++; return JSON.parse(JSON.stringify(page)); },
        hasAgent: id => ['agent', 'researcher'].includes(id), reviewRetentionMs: 1000 };
      const ov = makeOverseer(cdeps);
      const file = (title, n) => ov.create({ parentStreamId: 'home', agentId: 'researcher', requestId: 'lead' + n + ':team.dispatch:0', title, worker: true, uniqueTitle: true });
      loads = 0;
      assert.equal(file('Summarize my inbox', 1).title, 'Summarize my inbox');
      assert.equal(loads, 1, 'filing a worker thread loads the save once');
      for (let n = 2; n <= 5; n++) file('Summarize my inbox', n);
      loads = 0;
      const sixth = file('Summarize my inbox', 6);
      assert.equal(sixth.title, 'Summarize my inbox (6)', 'a repeated ask counts up to a free title');
      assert.equal(loads, 1, 'a repeated title still costs one save load, not one per taken title');
      assert.throws(() => ov.create({ parentStreamId: 'home', agentId: 'researcher', title: 'Summarize my inbox', worker: true }), /already exists/, 'without uniqueTitle a taken title still refuses');
      const long = 'x'.repeat(80);
      file(long, 7);
      assert.equal(file(long, 8).title, 'x'.repeat(76) + ' (2)', 'a suffix fits inside the 80-char title instead of being cut off');
      for (let n = 2; n <= 99; n++) page.workstreams.push({ id: 'page_' + n, title: 'Weekly scan (' + n + ')', agentId: 'agent' });
      page.workstreams.push({ id: 'page_1', title: 'Weekly scan', agentId: 'agent' });
      const a = file('Weekly scan', 9), b = file('Weekly scan', 10);
      assert.match(a.title, /^Weekly scan · \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/, 'past 99 the time it was asked names it');
      assert.notEqual(a.title, b.title, 'two such workers in the same second still both get a thread');
      // a thread the Commander deleted is dropped from overseer.json the next time a thread is filed
      page.deletedIds.push(sixth.id);
      file('After delete', 11);
      assert.ok(!JSON.parse(fs.readFileSync(cdeps.file, 'utf8')).value.threads.some(t => t.id === sixth.id), 'deleted thread rows do not pile up in overseer.json');
      assert.throws(() => ov.ensure({ id: sixth.id, agentId: 'agent' }), /no such session/, 'a pruned deleted conversation is still never brought back');
      // settled reports whose workers the registry no longer holds stop growing overseer.json; covered work is never re-reported
      const worker = (id, runId) => ({ id, runId, generation: 1, leadId: 'agent', agentId: 'researcher', parentStreamId: 'home', parentRunId: 'lead_' + id, streamId: 'home', status: 'done', completedAt: now });
      ov.collect([worker('w_old', 'run_old'), worker('w_kept', 'run_kept')]);
      for (const r of ov.snapshot().reviews) ov.patchReview(r.id, { status: 'done' });
      assert.equal(ov.snapshot().reviews.length, 2);
      now += 5000;
      ov.collect([worker('w_kept', 'run_kept')]);
      assert.deepEqual(ov.snapshot().reviews.map(r => r.workerRunId), ['run_kept'], 'an old settled report whose worker is gone is dropped; one whose worker is still listed is kept');
      ov.collect([worker('w_kept', 'run_kept')]);
      assert.equal(ov.snapshot().reviews.length, 1, 'a kept report still covers its worker (no second report)');
    }
    console.log('overseer: durable identity, deduplication, restart, rename, tombstones and turn serialization PASS');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
