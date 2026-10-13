/* node dev/brief-quote-live-proof.js — LIVE proof of the Task Brief gate seam for the 2026-10-12 Publisher report:
   "StarNet repeatedly blocked authorized actions with brief_update quote/source validation errors."

   The chain on trunk: the agent asks (brief_ask, conversation mode) → the Commander answers → the agent records its
   understanding (brief_update) quoting the answer the way models do — re-typed, not byte-exact → the host rejects
   the WHOLE update → brief_proceed refuses until the answer is incorporated → every write tool (web_request) is
   blocked by the brief gate. One paraphrase locks the run out of the action the Commander just authorized.

   A real model will not paraphrase on demand, so a scripted mock provider plays the agent and does exactly that, in
   a REAL hermetic sidecar (SidecarFixture: temp workspace + profile). The script answers the in-turn question through
   the same /api/consent/answer route the COMMS card uses and clicks "allow once" on approval cards. PROOF_ENTRY=<a
   trunk sidecar/index.js> runs the baseline. Prints one JSON line; PASS = brief_update saved, brief_proceed settled,
   web_request ran, the run ended done. Free: no real model is called. */
'use strict';
const path = require('node:path');
const http = require('node:http');
const { SidecarFixture } = require('../test/helpers/sidecar-fixture.js');

const ENTRY = process.env.PROOF_ENTRY ? path.resolve(process.env.PROOF_ENTRY) : undefined;
const ANSWER = 'Yes — you’re authorized to create and configure the Coffee Break Cat product in Printify.';

function sse(res, delta, finish) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.write('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) + '\n\n');
  res.write('data: [DONE]\n\n'); res.end();
}
const call = (name, args) => ({ tool_calls: [{ index: 0, id: 'call_' + name + '_' + Math.random().toString(36).slice(2, 8), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

function startMock() {
  const results = [];   // { tool, ok, text } — exactly what the host handed back to the "model"
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.url.indexOf('/models') >= 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'test/model', context_length: 200000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] }));
      }
      if (req.url.indexOf('/chat/completions') < 0) { res.writeHead(404); return res.end(); }
      let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
        let body = {}; try { body = JSON.parse(b); } catch (_) {}
        const toolNames = (body.tools || []).map(t => t && t.function && t.function.name);
        if (toolNames.indexOf('brief_ask') < 0) return sse(res, { content: 'ok' }, 'stop');   // aux/internal calls: plain text
        const msgs = body.messages || [];
        const names = new Map();
        for (const m of msgs) for (const tc of (m && m.tool_calls) || []) names.set(tc.id, tc.function && tc.function.name);
        const toolMsgs = msgs.filter(m => m && m.role === 'tool');
        const last = toolMsgs[toolMsgs.length - 1];
        const lastName = last ? names.get(last.tool_call_id) : null;
        const lastText = last ? (typeof last.content === 'string' ? last.content : (last.content || []).map(p => p && p.text || '').join('')) : '';
        if (last && results.length < toolMsgs.length) results.push({ tool: lastName, ok: !/^ERROR|failed:/.test(lastText), text: lastText.slice(0, 400) });
        if (!last) return sse(res, call('brief_ask', { mode: 'conversation', dimension: 'safety', discoverable: false,
          question: 'Am I authorized to create and configure the product in Printify now?', reason: 'Creating the product writes to your Printify shop.' }), 'tool_calls');
        if (lastName === 'brief_ask') {
          const qid = (/Answer sourceId: (\S+)/.exec(lastText) || [])[1] || 'request';
          return sse(res, call('brief_update', { through: qid, nextStep: 'Create the product in Printify.', facts: [
            // re-typed the way models do: curly quote + case (anchors after folding) ...
            { dimension: 'safety', text: 'The Commander authorized creating the product', quote: 'YES — YOU’RE AUTHORIZED to create', sourceId: qid },
            // ... and a paraphrase under the WRONG sourceId (no anchor: demoted to an assumption, never a refusal)
            { dimension: 'scope', text: 'Create and configure the Printify product', quote: 'you are authorized to create and configure the product', sourceId: 'request' }
          ] }), 'tool_calls');
        }
        if (lastName === 'brief_update') return sse(res, call('brief_proceed', { objective: 'Create and configure the Coffee Break Cat product in Printify' }), 'tool_calls');
        if (lastName === 'brief_proceed') return sse(res, call('web_request', { url: 'https://api.github.com/zen', method: 'GET' }), 'tool_calls');
        return sse(res, { content: 'Done: the authorized request went through.' }, 'stop');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + server.address().port + '/api/v1', results, close: () => server.close() }));
  });
}

(async () => {
  const mock = await startMock();
  const fixture = SidecarFixture.create({ prefix: 'brief-quote-proof-', timeoutMs: 30000, entry: ENTRY,
    env: { SKYNET_OPENROUTER_BASE: mock.base, SKYNET_DEFAULT_MODEL: 'test/model', SKYNET_QUEST_REFRESH: '0', SKYNET_AUX_BUDGET: '0' } });
  await fixture.start();
  const events = [], prompts = [];
  let runId = '';
  try {
    const r = await fixture.request('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'sk-or-v1-mock', model: 'test/model', agentId: 'proof-brief', streamId: 'proof-stream', isTask: true, placed: ['dish'],
        messages: [{ role: 'user', content: 'Create the Coffee Break Cat product in Printify from the approved artwork.' }] }) });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev = null; try { ev = JSON.parse(line); } catch (_) { continue; }
        events.push(ev);
        if (!runId && ev.payload && ev.payload.runId) runId = ev.payload.runId;
        if (ev.name === 'permission.prompt') {
          prompts.push(ev.payload.tool);
          const route = ev.payload.tool === 'brief.ask' ? '/api/consent/answer' : '/api/consent';
          const answer = ev.payload.tool === 'brief.ask' ? { answer: ANSWER } : { decision: 'once' };
          fixture.request(route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ runId, promptId: ev.payload.promptId }, answer)) }).catch(() => {});
        }
      }
    }
  } finally { await fixture.dispose(); mock.close(); }
  const end = events.find(e => e.name === 'agent.run.end');
  const by = name => mock.results.find(x => x.tool === name);
  const out = { sidecar: ENTRY || 'this tree', reason: end && end.payload.reason, prompts, steps: mock.results };
  out.PASS = !!(end && end.payload.reason === 'done' && by('brief_update') && by('brief_update').ok && by('brief_proceed') && by('brief_proceed').ok
    && by('web_request') && by('web_request').ok && /HTTP 200/.test(by('web_request').text));
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.PASS ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
