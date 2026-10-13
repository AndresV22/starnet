/* dev/seed-group-lead-builder.js — DEV-ONLY live proof for THE GROUP'S LEAD IS THE ORCHESTRATOR (2026-10-13).

   The report: asked in a group chat to configure a conveyor, the lead (ULTRON) had no station tools (group runs were
   lead:false) and drove StarNet's own window by computer use for 21 minutes. This boots a real sidecar from THIS tree +
   the real frontend (open http://127.0.0.1:<PORT> so the station bridge is attached) and an in-process scripted model
   that plays the group lead, in ASK mode so station.build raises the real approval card:
     brief_proceed (when offered) → station_layout → tool_search "station builder" → station_map → station_plan a line
     → station_build that plan → report.
   Then create a group chat with the lead and send it a job (the proof driver does it over /api/groups). Every request's
   advertised tool names, the group-lead note and every tool result land in <workspace>/mock-log.jsonl as evidence.
   Isolated with SKYNET_WORKSPACES (never SKYNET_HOME). Not part of any build. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'seed-workspace');
const SCRATCH = process.env.SKYNET_GROUP_SCRATCH || path.join(__dirname, '.scratch-group-lead-builder');
const SIDECAR = path.join(REPO, 'sidecar', 'index.js');
const PORT = String(process.env.SKYNET_PORT || '8932');
const LOG = path.join(SCRATCH, 'mock-log.jsonl');

const log = (o) => { try { fs.appendFileSync(LOG, JSON.stringify(Object.assign({ at: new Date().toISOString() }, o)) + '\n'); } catch (_) {} };
const textOf = (c) => typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => (p && (p.text || p.content)) || '').join('') : '';

function sse(res, chunks) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  for (const c of chunks) res.write('data: ' + JSON.stringify(c) + '\n\n');
  res.write('data: [DONE]\n\n'); res.end();
}
const usage = { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 };
let callSeq = 0;
const sayText = (res, text) => sse(res, [{ choices: [{ delta: { content: text } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage }]);
function callTool(res, name, args) {
  const id = 'call_' + (++callSeq);
  sse(res, [
    { choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage }
  ]);
}

function decide(body, res) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const system = msgs.filter(m => m && m.role === 'system').map(m => textOf(m.content)).join('\n');
  const tools = (Array.isArray(body.tools) ? body.tools : []).map(t => (t && t.function && t.function.name) || t.name).filter(Boolean);
  const allResults = msgs.filter(m => m && m.role === 'tool').map(m => textOf(m.content));
  const results = allResults.filter(r => !/Task Brief settled|Task Brief gate/.test(r));
  if (tools.includes('brief_proceed') && !allResults.some(r => /Task Brief settled/.test(r))) {
    log({ kind: 'brief', toolCount: tools.length });
    return callTool(res, 'brief_proceed', { objective: 'set up a conveyor line', deliverable: 'a built line', assumptions: ['use the station builder'] });
  }
  const groupLead = /\[STATION — you lead this group chat\]/.test(system);
  const inGroup = /participant in a user-selected group DM/.test(system);
  const note = (system.match(/\[STATION — you lead this group chat\][^\n]*/) || [''])[0];
  const n = results.length, last = results[n - 1] || '';
  log({ kind: groupLead ? 'group-lead' : inGroup ? 'group-other' : 'other', tools, toolCount: tools.length, step: n,
    lastResult: n ? last.slice(0, 1500) : null, leadNote: note || undefined, hasComputerUse: tools.includes('computer_use') });
  if (!groupLead) return sayText(res, inGroup ? 'Group participant WITHOUT the station kit: tools=' + tools.join(',') : 'ok');
  if (n === 0) return callTool(res, 'station_layout', {});
  if (n === 1) return callTool(res, 'tool_search', { query: 'station builder' });
  if (n === 2) return callTool(res, 'station_map', {});
  if (n === 3) return callTool(res, 'station_plan', { line: 'build_test', name: 'GROUP LEAD LINE' });
  if (n === 4) {
    let planId = '';
    try { planId = JSON.parse(last).planId || ''; } catch (_) {}
    if (!planId) return sayText(res, 'LEAD: the plan did not come back: ' + last.slice(0, 400));
    return callTool(res, 'station_build', { planId });
  }
  return sayText(res, 'LEAD: build result: ' + last.slice(0, 600));
}

function startMock() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.url.indexOf('/models') >= 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'test/model', context_length: 64000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] }));
        return;
      }
      if (req.url.indexOf('/chat/completions') >= 0) {
        let b = ''; req.on('data', d => b += d); req.on('end', () => {
          let body = {};
          try { body = JSON.parse(b); } catch (_) {}
          try { decide(body, res); } catch (e) { log({ mockError: String(e && e.stack || e) }); sayText(res, 'mock error'); }
        });
        return;
      }
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port + '/api/v1'));
  });
}

(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.cpSync(FIXTURE, SCRATCH, { recursive: true });
  const now = Date.now();
  try {
    const sp = path.join(SCRATCH, 'agent.save.json');
    const w = JSON.parse(fs.readFileSync(sp, 'utf8'));
    w.updatedAt = now; w.savedAt = now;
    if (w.doc) { w.doc.updatedAt = now; if (w.doc.agent) w.doc.agent.model = 'test/model'; }
    fs.writeFileSync(sp, JSON.stringify(w, null, 2));
  } catch (_) {}
  try {
    const rp = path.join(SCRATCH, 'agent.roster.json');
    const r = JSON.parse(fs.readFileSync(rp, 'utf8'));
    for (const a of (r.agents || [])) a.model = 'test/model';
    fs.writeFileSync(rp, JSON.stringify(r, null, 2));
  } catch (_) {}
  const base = await startMock();
  // ASK mode on purpose: no SKYNET_FULL_ACCESS, so station.build raises the real approval card
  const env = Object.assign({}, process.env, {
    SKYNET_DEV: '1',
    SKYNET_WORKSPACES: SCRATCH, SKYNET_PORT: PORT,
    SKYNET_OPENROUTER_BASE: base, SKYNET_OPENROUTER_KEY: 'sk-or-v1-mock', SKYNET_DEFAULT_MODEL: 'test/model'
  });
  delete env.SKYNET_FULL_ACCESS; delete env.SKYNET_HOME;
  console.log('[seed-group-lead-builder] mock provider at ' + base + ' -> http://127.0.0.1:' + PORT + ' · log ' + LOG);
  const child = spawn(process.execPath, [SIDECAR], { cwd: REPO, env, stdio: 'inherit' });
  process.on('SIGINT', () => { try { child.kill(); } catch (_) {} });
  child.on('exit', c => process.exit(c == null ? 0 : c));
})();
