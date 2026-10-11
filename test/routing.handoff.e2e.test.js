'use strict';
/* routing.handoff.e2e — SEND TO on a real sidecar (2026-10-10). LINE A's OUTBOX sends to LINE B's INBOX (a pointer on the OUTBOX,
   compiled into plan.sendTo — never a belt). A job sent down LINE A (POST /api/routing/sample with its line) delivers on A as
   always; the sidecar's handoff runner then starts LINE B's OWN job: a line-jobs record on B saying where it came from, A's record
   saying where it went, B's run rows stamped lineId B at B's bay by B's crew, and B handed the job as it arrived plus what A made.
   With the SEND TO set to nowhere, the same job stops at A. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Pipeline = require('../frontend/app/pipeline.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

test('a job that ships on LINE A rides on to LINE B by SEND TO', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.url.includes('/chat/completions')) {
      let raw = ''; req.on('data', d => { raw += d; });
      req.on('end', () => {
        const body = JSON.parse(raw);
        const user = (body.messages || []).filter(m => m && m.role === 'user').map(m => String(m.content || '')).join('\n');
        const handoff = user.indexOf('[HAND-OFF') >= 0;   // (the roster's own system prompt wins over the hub persona)
        calls.push({ handoff, user });
        const text = handoff ? 'B turned the facts into a haiku.' : 'Two facts about the moon.';
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }) + '\n\ndata: [DONE]\n\n');
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.includes('/models') ? { data: [{ id: 'handoff-model', context_length: 8000 }] } : { ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const fixture = SidecarFixture.create({ prefix: 'handoff-', timeoutMs: 20000, env: {
    STARNET_DEFAULT_MODEL: '', SKYNET_DEFAULT_MODEL: '',
    STARNET_OPENROUTER_KEY: '', SKYNET_OPENROUTER_KEY: '',
    CUSTOM_OPENAI_KEY: 'direct-fixture', CUSTOM_OPENAI_BASE_URL: base + '/v1'
  } });
  try {
    await fixture.start();
    const agents = [
      { agentId: 'alpha', name: 'Alpha', system: 'Line A', provider: 'custom', model: 'handoff-model' },
      { agentId: 'beta', name: 'Beta', system: 'Line B', provider: 'custom', model: 'handoff-model' }
    ];
    assert.equal((await fixture.json('POST', '/api/roster', { agents, updatedAt: Date.now() })).status, 200);
    const geoOf = sendTo => ({ props: [
      { id: 'p1', t: 'intake', x: 0, y: 0, w: 1, h: 1, label: 'A' },
      { id: 'p2', t: 'bay', x: 3, y: 0, w: 1, h: 1, agentId: 'alpha', role: 'WRITER', brief: 'Write two short facts.' },
      Object.assign({ id: 'p3', t: 'outbox', x: 6, y: 0, w: 1, h: 1 }, sendTo ? { sendTo } : {}),
      { id: 'p4', t: 'intake', x: 0, y: 4, w: 1, h: 1, label: 'B', limits: { maxHops: 2, maxUsdPerMessage: 0.5 } },
      { id: 'p5', t: 'bay', x: 3, y: 4, w: 1, h: 1, agentId: 'beta', role: 'WRITER', brief: 'Turn what you are handed into a haiku.' },
      { id: 'p6', t: 'outbox', x: 6, y: 4, w: 1, h: 1 }
    ], belts: [1, 2, 4, 5].map(x => ({ x, y: 0, dir: 'E' })).concat([1, 2, 4, 5].map(x => ({ x, y: 4, dir: 'E' }))) });
    const arm = async (geo) => {
      const plan = Pipeline.compileRoutingPlan(geo);
      for (const bay of plan.bays.concat(plan.dockBays)) bay.objects = ['computer'];
      const r = await fixture.json('POST', '/api/routing', plan);
      assert.equal(r.body.ok, true, JSON.stringify(r.body));
      return plan;
    };
    const plan = await arm(geoOf('p4'));
    const LA = plan.lineOfProp.p1, LB = plan.lineOfProp.p4;
    assert.ok(LA && LB && LA !== LB, 'two lines, never fused');
    assert.deepEqual(plan.sendTo, { p3: { intakeId: 'p4', fromLine: LA, toLine: LB } });

    const sent = await fixture.json('POST', '/api/routing/sample', { line: LA, text: 'Two facts about the moon.', name: 'A' });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    let onB = [];
    for (let i = 0; i < 100 && !(onB.length && onB[0].status !== 'running'); i++) {
      await sleep(100);
      onB = (await fixture.json('GET', '/api/line-jobs?line=' + encodeURIComponent(LB))).body.jobs;
    }
    assert.equal(onB.length, 1, 'LINE B has one job: ' + JSON.stringify(onB));
    const y = (await fixture.json('GET', '/api/line-jobs/' + onB[0].id)).body.job;
    assert.equal(y.status, 'delivered', JSON.stringify({ status: y.status, error: y.error }));
    assert.deepEqual(y.from, { line: LA, jobId: sent.body.jobId, name: 'A' }, 'B’s job says it came from A’s');
    assert.equal(y.output, 'B turned the facts into a haiku.', 'B’s result is B’s');
    // the record keeps the job as it first arrived and what A handed in APART (the agent was handed the whole frame — below)
    assert.equal(y.text, 'Two facts about the moon.', 'B’s job is the job as it first arrived, never the frame');
    assert.equal(y.handedIn, 'Two facts about the moon.', 'what A handed in, whole');
    assert.ok(y.runs.length >= 1 && y.runs.every(r => r.dockId === 'p5' && r.agentId === 'beta' && r.reason === 'done'), 'B’s crew ran it at B’s bay: ' + JSON.stringify(y.runs));
    const x = (await fixture.json('GET', '/api/line-jobs/' + sent.body.jobId)).body.job;
    assert.equal(x.status, 'delivered');
    assert.equal(x.output, 'Two facts about the moon.', 'A’s result stays A’s');
    assert.deepEqual(x.sentTo, { line: LB, jobId: y.id, name: 'B' }, 'A’s job says where it went');
    // the run rows: B's stamped with B's line on B's stream (B's budget and day ledger key on that line)
    const rows = (await fixture.json('GET', '/api/runs?agent=beta&limit=20')).body;
    const runs = Array.isArray(rows) ? rows : (rows.runs || []);
    const bRow = runs.find(r => r && r.streamId === y.streamId);
    assert.ok(bRow && bRow.lineId === LB && bRow.dockId === 'p5' && bRow.reason === 'done', 'B’s run row is stamped with LINE B: ' + JSON.stringify(bRow && { lineId: bRow.lineId, dockId: bRow.dockId, streamId: bRow.streamId }));
    assert.ok(calls.some(c => c.handoff && /WHAT LINE A DELIVERED:\nTwo facts about the moon\./.test(c.user)), 'B’s agent was handed A’s result');

    // SEND TO nowhere: the same job stops at A
    await arm(geoOf(null));
    const again = await fixture.json('POST', '/api/routing/sample', { line: LA, text: 'Two more facts.', name: 'A' });
    assert.equal(again.status, 200);
    await sleep(500);
    assert.equal((await fixture.json('GET', '/api/line-jobs?line=' + encodeURIComponent(LB))).body.jobs.length, 1, 'nothing new on B');
    assert.equal((await fixture.json('GET', '/api/line-jobs/' + again.body.jobId)).body.job.sentTo, null);

    // the records survive a restart
    await fixture.restart();
    const after = (await fixture.json('GET', '/api/line-jobs/' + y.id)).body.job;
    assert.deepEqual(after.from, { line: LA, jobId: sent.body.jobId, name: 'A' });
    assert.equal(after.handedIn, 'Two facts about the moon.', 'what A handed in survives a restart');
  } finally {
    await fixture.dispose();
    await new Promise(resolve => server.close(resolve));
  }
});
