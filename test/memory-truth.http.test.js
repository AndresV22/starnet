'use strict';
/* node test/memory-truth.http.test.js — the MEMORY TRUTH lane (2026-10-11) through a REAL, isolated sidecar
   (SidecarFixture: temp workspace + temp APPDATA/LOCALAPPDATA profile + its own port) and a local mock provider.
   A user reported: "they will randomly recall from OLD memories. Not save or update from old instructions, even when
   stated as saved." End to end, through runOnce and the real routes:
     - a standing instruction typed by the Commander and saved by notebook.write is recorded as THEIR words (with the
       proving quote) and scoped to EVERY conversation — a different chat's recall carries it, dated, under the
       "newer wins" header;
     - a run's receipt (/api/memory/proposals?run=) lists exactly that run's saves: the saving run sees its note, and a
       run that saved nothing gets NOTHING — never the previous run's list (the wrong "remembered" receipt);
     - a memory the Commander forgot is not resurrected by a backup import (reported as forgotten:1);
     - all of it survives a sidecar restart. */
const assert = require('node:assert/strict');
const http = require('node:http');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');

async function journey() {
  const said = 'From now on, always use spaces instead of tabs for indentation.';
  const note = 'User prefers spaces over tabs for indentation';
  const fact = 'The deploy target is the staging cluster in Frankfurt';
  let phase = 'stated', sequence = 0;
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
      if (!req.url.includes('/chat/completions')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'memory-fixture', context_length: 32000, supported_parameters: ['tools', 'tool_choice'] }] }));
      }
      const body = JSON.parse(raw), messages = body.messages || [];
      const auxiliary = /agent reflecting right after/.test(String(messages[0] && messages[0].content));
      calls.push({ phase, auxiliary, messages });
      let delta = {}, finish = 'stop';
      const tool = (name, args) => { delta = { tool_calls: [{ index: 0, id: 'truth_call_' + (++sequence), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }; finish = 'tool_calls'; };
      const lastUser = messages.map(m => m.role).lastIndexOf('user');
      const did = name => messages.slice(lastUser + 1).some(m => (m.tool_calls || []).some(t => t.function && t.function.name === name));
      if (auxiliary) delta.content = phase === 'reflect' ? 'FACT: ' + fact : 'NONE';
      else if (phase === 'stated') {
        if ((body.tools || []).some(t => t.function && t.function.name === 'brief_proceed') && !did('brief_proceed')) tool('brief_proceed', { objective: 'Save the Commander\'s indentation preference in durable memory' });
        else if (!did('notebook_write')) tool('notebook_write', { title: 'Indentation', body: note, pinned: true });
        else delta.content = "I've saved your indentation preference.";
      } else delta.content = 'The request has been reviewed and handled. ' + 'The plan covers the deploy target and the rollout order. '.repeat(4);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20 } }) + '\n\ndata: [DONE]\n\n');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const providerBase = 'http://127.0.0.1:' + server.address().port + '/v1';
  const fixture = SidecarFixture.create({ prefix: 'memory-truth-', timeoutMs: 20000, env: {
    SKYNET_FULL_ACCESS: '1', STARNET_FULL_ACCESS: '1', SKYNET_AUX_BUDGET: '1', STARNET_AUX_BUDGET: '1',
    SKYNET_OPENROUTER_KEY: 'memory-fixture', STARNET_OPENROUTER_KEY: 'memory-fixture',
    SKYNET_OPENROUTER_BASE: providerBase, STARNET_OPENROUTER_BASE: providerBase,
    SKYNET_DEFAULT_MODEL: 'memory-fixture', STARNET_DEFAULT_MODEL: 'memory-fixture'
  } });
  const json = async (method, route, body) => {
    const r = await fixture.request(route, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const run = async (text, streamId, isTask) => {
    const r = await fixture.request('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: 'agent', provider: 'openrouter', model: 'memory-fixture', key: 'memory-fixture', baseUrl: providerBase, isTask: !!isTask, streamId, objects: ['computer', 'notebook'], messages: [{ role: 'user', content: text }] }) });
    const raw = await r.text(); assert.equal(r.status, 200, raw);
    const events = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const start = events.find(e => e.name === 'agent.run.start');
    return { events, runId: start && start.payload.runId, end: events.find(e => e.name === 'agent.run.end') };
  };
  const records = async () => (await json('GET', '/api/memory/records?agent=agent')).body.records;
  const receipts = async runId => (await json('GET', '/api/memory/proposals?agent=agent&run=' + encodeURIComponent(runId))).body.proposals;
  const today = new Date(Date.now()).toISOString().slice(0, 10);
  try {
    await fixture.start();
    await json('POST', '/api/memory/config', { reflectEnabled: false });

    // 1. the Commander states a standing instruction; the agent saves it
    const a = await run(said, 'chat-a', true);
    assert.equal(a.end.payload.reason, 'done', JSON.stringify(a.events.slice(-4)));
    let recs = await records();
    assert.equal(recs.length, 1, JSON.stringify(recs));
    assert.equal(recs[0].confirmation, 'user-stated', 'the note is recorded as the Commander\'s own words');
    assert.equal(recs[0].statedQuote, 'From now on, always use spaces instead of tabs for indentation', 'with the sentence that proves it');
    assert.equal(recs[0].scope, 'global', 'a standing instruction is not trapped in the chat it was said in');
    const ra = await receipts(a.runId);
    assert.deepEqual(ra.map(p => [p.id, p.saved, p.source]), [['note_1', true, 'notebook.write']], 'the saving run\'s receipt lists exactly its save');

    // 2. a DIFFERENT chat: recall carries the standing order, dated, under the newer-wins rule
    phase = 'other'; const from = calls.length;
    const b = await run('Write a function that parses one CSV line.', 'chat-b', false);
    const fence = calls.slice(from).flatMap(c => c.messages).map(m => String(m.content)).find(s => s.includes('<recalled-memory>')) || '';
    assert.ok(fence.includes('[note_1] [user-stated] Indentation — ' + note + ' (saved ' + today + ')'), 'another chat recalls it as the Commander\'s words, dated: ' + fence.slice(0, 600));
    assert.ok(/newer one wins/.test(fence) && /latest message beats any memory/.test(fence), 'under the conflict rule');
    assert.deepEqual(await receipts(b.runId), [], 'a run that saved nothing has an empty receipt');

    // 3. reflection stashes a batch for run C; a later run D that saves nothing must NOT be shown C's memories
    await json('POST', '/api/memory/config', { reflectEnabled: true, reflectCooldownMs: 0 });
    phase = 'reflect';
    const c = await run('Plan the deploy for this week.', 'chat-c', true);
    let rc = [];
    for (let i = 0; i < 100 && !rc.length; i++) { rc = await receipts(c.runId); if (!rc.length) await new Promise(r => setTimeout(r, 50)); }
    assert.ok(rc.some(p => p.saved && String(p.content).includes('Frankfurt')), 'reflection\'s auto-save is run C\'s receipt: ' + JSON.stringify(rc));
    await json('POST', '/api/memory/config', { reflectEnabled: false });
    phase = 'quiet';
    const d = await run('Thanks, that is all for now.', 'chat-d', false);
    assert.deepEqual(await receipts(d.runId), [], 'run D gets NOTHING — never the previous run\'s "remembered" list');

    // 4. forget the reflected fact, then import an old backup that still holds it
    recs = await records();
    const factRec = recs.find(r => String(r.body).includes('Frankfurt'));
    assert.ok(factRec, JSON.stringify(recs));
    assert.equal((await json('POST', '/api/memory/forget', { agentId: 'agent', id: factRec.id })).status, 200);
    const imported = await json('POST', '/api/notebook/restore', { agent: 'agent', notes: [
      { id: 'note_90', title: 'Fact', body: fact, content: fact, ts: 1 },
      { id: 'note_91', title: 'Fact', body: 'The release train leaves on Thursdays', ts: 2 }
    ] });
    assert.equal(imported.body.forgotten, 1, 'the forgotten memory is reported, not resurrected: ' + JSON.stringify(imported.body));
    assert.equal(imported.body.added, 1, 'the never-forgotten note still restores');
    assert.ok(!(await records()).some(r => String(r.body).includes('Frankfurt')), 'Frankfurt stays forgotten');

    // 5. persistence: everything above survives a restart
    await fixture.restart();
    recs = await records();
    const kept = recs.find(r => r.id === 'note_1');
    assert.ok(kept && kept.confirmation === 'user-stated' && kept.scope === 'global' && kept.statedQuote, 'provenance + scope survive a restart: ' + JSON.stringify(kept));
    assert.ok(!recs.some(r => String(r.body).includes('Frankfurt')), 'the forget survives a restart');
    console.log('memory-truth.http.test: PASS (stated provenance, station-wide standing order, dated recall, per-run receipts, forgotten stays forgotten, restart)');
  } finally { await fixture.dispose(); await new Promise(r => server.close(r)); }
}
journey().catch(e => { console.error(e); process.exitCode = 1; });
