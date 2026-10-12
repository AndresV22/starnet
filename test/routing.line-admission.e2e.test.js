'use strict';
/* A line's DAILY LIMIT applies before its first stage on every host-routed entry.
   Real sidecar + local provider: no keys, no billable requests, isolated persisted day ledger. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Pipeline = require('../frontend/app/pipeline.js');

(async () => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    if (!req.url.includes('/chat/completions')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: 'test/model', supported_parameters: ['tools'], pricing: { prompt: '0', completion: '0' } }] }));
    }
    calls.push(JSON.parse(raw));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'The workflow result.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 2 } }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const fixture = SidecarFixture.create({ timeoutMs: 30000, env: {
    STARNET_OPENROUTER_KEY: 'fixture', SKYNET_OPENROUTER_KEY: 'fixture',
    STARNET_OPENROUTER_BASE: base + '/v1', SKYNET_OPENROUTER_BASE: base + '/v1',
    STARNET_DEFAULT_MODEL: 'test/model', SKYNET_DEFAULT_MODEL: 'test/model',
    STARNET_CRON_TICK_MS: '100', SKYNET_CRON_TICK_MS: '100',
    STARNET_FULL_ACCESS: '0', SKYNET_FULL_ACCESS: '0', SKYNET_AUX_BUDGET: '0', STARNET_AUX_BUDGET: '0'
  } });
  const geometry = { props: [
    { id: 'iA', t: 'intake', x: 0, y: 0, w: 1, h: 1, limits: { maxUsdPerDay: 1 } },
    { id: 'a1', t: 'bay', x: 3, y: 0, w: 1, h: 1, agentId: 'writer' },
    { id: 'oA', t: 'outbox', x: 6, y: 0, w: 1, h: 1 },
    { id: 'iB', t: 'intake', x: 0, y: 4, w: 1, h: 1 },
    { id: 'b1', t: 'bay', x: 3, y: 4, w: 1, h: 1, agentId: 'writer' },
    { id: 'oB', t: 'outbox', x: 6, y: 4, w: 1, h: 1 }
  ], belts: [0, 4].flatMap(y => [1, 2, 4, 5].map(x => ({ x, y, dir: 'E' }))) };
  const plan = Pipeline.compileRoutingPlan(geometry);
  assert.equal(Pipeline.ok(plan), true);
  for (const bay of plan.bays.concat(plan.dockBays)) bay.objects = ['computer'];
  const lineA = plan.lineOfProp.iA, lineB = plan.lineOfProp.iB;
  const day = Math.floor(Date.now() / 86400000);
  const ledger = path.join(fixture.workspace, 'line-spend.json');
  fs.writeFileSync(ledger, JSON.stringify({ version: 1, lines: { [lineA]: { day, usd: 1 } } }));
  const before = () => calls.length;
  const sample = line => fixture.json('POST', '/api/routing/sample', { line, text: 'Write the workflow result.' });
  const capText = /line reached its \$1\.00 daily limit/i;
  async function cappedSample(label) {
    const count = before(), result = await sample(lineA);
    assert.equal(calls.length, count, label + ': the exhausted line must make zero provider calls');
    assert.equal(result.body.ok, false, result.text);
    assert.ok(capText.test(JSON.stringify(result.body.replies)), label + ': the reply names the line daily cap: ' + result.text);
    // the refusal's REASON is the route's error (the panel / FINISH card / station.test_line read it) — never only "no durable run outcome"
    assert.ok(capText.test(String(result.body.error || '')) && /raise its LINE BUDGET or try again tomorrow/.test(result.body.error) && !/^⚠/.test(result.body.error), label + ': the error says the daily limit and how to raise it: ' + result.body.error);
    assert.equal(result.body.delivered, null, 'the refused job never claims delivery');
    const job = await fixture.json('GET', '/api/line-jobs/' + result.body.jobId);
    assert.equal(job.body.job.status, 'failed', 'the line history keeps the refused job');
    assert.ok(capText.test(String(job.body.job.error || '')), label + ': the job record says why it did not run (WORKFLOWS shows it): ' + job.body.job.error);
    return result;
  }
  try {
    await fixture.start();
    await fixture.json('POST', '/api/roster', { agents: [{ agentId: 'writer', name: 'Writer', provider: 'openrouter', model: 'test/model' }], updatedAt: Date.now() });
    assert.equal((await fixture.json('POST', '/api/routing', plan)).body.ok, true);
    await cappedSample('sample entry');
    await fixture.restart();
    await cappedSample('after restart');

    const routine = await fixture.json('POST', '/api/cron', { name: 'Capped line', prompt: 'Write the workflow result.',
      schedule: 'every 1h', agentId: 'writer', dockId: 'a1', model: 'test/model', provider: 'openrouter', runsLine: true });
    assert.ok(routine.body.job?.id, routine.text);
    let count = before();
    const run = await fixture.json('POST', '/api/cron/run', { id: routine.body.job.id });
    assert.equal(calls.length, count, 'Run Now also refuses before the first provider call');
    assert.ok(capText.test(run.text), run.text);
    assert.ok(run.text.includes('"reason":"budget"'), 'Run Now emits a budget outcome');

    const scheduled = await fixture.json('POST', '/api/cron', { name: 'Scheduled capped line', prompt: 'Write the workflow result.',
      schedule: 'in 1s', agentId: 'writer', dockId: 'a1', model: 'test/model', provider: 'openrouter', runsLine: true });
    assert.ok(scheduled.body.job?.id, scheduled.text);
    await fixture.json('POST', '/api/cron/arm', { enabled: true });
    let fired = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const jobs = (await fixture.json('GET', '/api/cron')).body.jobs || [];
      fired = jobs.find(j => j.id === scheduled.body.job.id && j.lastRunAt);
      if (fired) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(fired, 'the scheduled job fired');
    assert.notEqual(fired.lastStatus, 'ok', 'the scheduled refusal is not success');
    assert.equal(calls.length, count, 'the scheduled line also spends nothing after the cap');
    await fixture.json('POST', '/api/cron/arm', { enabled: false });

    count = before();
    const other = await sample(lineB);
    assert.equal(other.body.ok, true, other.text);
    assert.ok(calls.length > count, 'the same agent can still run another line with no cap');

    count = before();
    const direct = await fixture.json('POST', '/api/run', { agentId: 'writer', provider: 'openrouter', model: 'test/model',
      lineId: lineA, messages: [{ role: 'user', content: 'Say hello.' }] });
    assert.ok(!capText.test(direct.text), 'a direct order cannot forge a workflow origin');
    assert.ok(calls.length > count, 'direct conversation stays outside the workflow budget');

    await fixture.stop();
    fs.writeFileSync(ledger, JSON.stringify({ version: 1, lines: { [lineA]: { day: day - 1, usd: 1 } } }));
    await fixture.start();
    const tomorrow = await sample(lineA);
    assert.equal(tomorrow.body.ok, true, 'a previous day bucket no longer refuses: ' + tomorrow.text);
    console.log('routing.line-admission: OK — capped sample, restart, Run Now, scheduled entry, multi-bay isolation, direct order and day rollover');
  } finally {
    await fixture.dispose();
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
