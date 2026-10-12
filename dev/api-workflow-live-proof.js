/* node dev/api-workflow-live-proof.js — LIVE A/B proof for the 2026-10-12 "Publisher refuses / can't verify" report.

   The user's Etsy-factory Publisher could not configure a Printify product: every product / variant-catalog GET came
   back cut off, so the agent could not see every variant (Printify's PUT needs ALL of them) and stopped on "cannot
   verify". Root cause: web_request clamped every response body to 8,000 characters with nothing parked.

   No Printify key is needed to reproduce the failure class: the task below needs facts spread through a 1.4 MB JSON
   API response (every Oceania country's cca3 code, the same shape as "every variant id"). The SAME real model and the
   SAME task run against two sidecars — PROOF_ENTRY=<path to a trunk sidecar/index.js> for the baseline, this tree by
   default — each hermetic (SidecarFixture: temp workspace + temp profile, never the real station). A forwarding proxy
   to OpenRouter records exactly what each web_request result handed the model.

   Needs SKYNET_OPENROUTER_KEY (dev/.env.dev). Optional: SKYNET_DEFAULT_MODEL (default anthropic/claude-haiku-4.5),
   PROOF_ENTRY. Prints one JSON line; PASS = the run ended done and its answer names every Oceania cca3 code. */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { SidecarFixture } = require('../test/helpers/sidecar-fixture.js');

for (const envFile of [path.join(__dirname, '.env.dev'), path.join(os.homedir(), 'Desktop', 'gen', 'dev', '.env.dev')]) {
  if (!fs.existsSync(envFile)) continue;
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
  break;
}
const KEY = String(process.env.SKYNET_OPENROUTER_KEY || '').trim();
const MODEL = String(process.env.SKYNET_DEFAULT_MODEL || 'anthropic/claude-haiku-4.5').trim();
const ENTRY = process.env.PROOF_ENTRY ? path.resolve(process.env.PROOF_ENTRY) : undefined;
const DOC_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const UPSTREAM = 'https://openrouter.ai/api/v1';
if (!KEY) { console.error('no SKYNET_OPENROUTER_KEY'); process.exit(2); }

// ---- forwarding proxy: records every tool result the model was shown, pipes everything to OpenRouter ----
function startProxy() {
  const seen = new Map();   // tool_call_id -> { name, args, chars, head }
  const offered = [];       // tool names on the first model request
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      if (req.url.indexOf('/chat/completions') >= 0) {
        try {
          const j = JSON.parse(body.toString('utf8'));
          if (!offered.length) for (const t of j.tools || []) offered.push(t && t.function && t.function.name);
          const calls = new Map();
          for (const m of j.messages || []) {
            for (const tc of (m && m.tool_calls) || []) calls.set(tc.id, { name: tc.function && tc.function.name, args: tc.function && tc.function.arguments });
            if (m && m.role === 'tool' && !seen.has(m.tool_call_id)) {
              const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              const c = calls.get(m.tool_call_id) || {};
              seen.set(m.tool_call_id, { name: c.name, args: String(c.args || '').slice(0, 300), chars: text.length, head: text.slice(0, 220), parkedNote: /saved (?:once )?to|WAS SAVED to/.test(text) });
            }
          }
        } catch (_) {}
      }
      const url = UPSTREAM + req.url.replace(/^\/api\/v1/, '');
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) if (!/^(host|content-length|connection)$/i.test(k)) headers[k] = v;
      let up;
      try { up = await fetch(url, { method: req.method, headers, body: req.method === 'GET' ? undefined : body }); }
      catch (e) { res.writeHead(502); res.end(String(e && e.message)); return; }
      const h = {}; up.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) h[k] = v; });
      res.writeHead(up.status, h);
      if (!up.body) { res.end(); return; }
      const reader = up.body.getReader();
      while (true) { const { value, done } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
      res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + server.address().port + '/api/v1', seen, offered, close: () => server.close() }));
  });
}

(async () => {
  // ground truth from the same document the agent will read
  const doc = await (await fetch(DOC_URL)).json();
  const truth = doc.filter(c => c && c.region === 'Oceania').map(c => c.cca3).sort();
  const proxy = await startProxy();
  // NOT Full Access: Full Access hands the run a shell, and a shell lets the model route around web_request entirely
  // (live-seen on the trunk baseline: it re-downloaded the document in Python). The reporting user's Publisher works
  // the API through web_request — so the run gets exactly a DISH (web) + CABINET (files), in ASK mode, and this script
  // plays the Commander clicking "allow once" on every approval card, counting them.
  const fixture = SidecarFixture.create({
    prefix: 'api-workflow-proof-', timeoutMs: 30000, entry: ENTRY,
    env: { SKYNET_OPENROUTER_BASE: proxy.base, SKYNET_QUEST_REFRESH: '0', SKYNET_AUX_BUDGET: '0' }
  });
  await fixture.start();
  const task = 'Use web_request to GET ' + DOC_URL + ' — it is one JSON API response listing every country. '
    + 'I need the cca3 code of EVERY country whose region is "Oceania", from that response. '
    + 'Reply with the complete list of codes, comma-separated, sorted alphabetically, and nothing else.';
  const events = [], approvals = [];
  let runId = '';
  try {
    const r = await fixture.request('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KEY, model: MODEL, agentId: 'proof-api', isTask: true, placed: ['dish', 'cabinet'], messages: [{ role: 'user', content: task }] }) });
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
          approvals.push({ tool: ev.payload.tool, scope: ev.payload.scope, args: String(ev.payload.argsSummary || '').slice(0, 120) });
          fixture.request('/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId, promptId: ev.payload.promptId, decision: 'once' }) }).catch(() => {});
        }
      }
    }
  } finally {
    await fixture.dispose(); proxy.close();
  }
  let text = '';
  for (const ev of events) if (ev.name === 'agent.token') text += (ev.payload && ev.payload.delta) || '';
  const end = events.find(e => e.name === 'agent.run.end');
  const answer = (text || '').trim();
  const found = truth.filter(code => new RegExp('\\b' + code + '\\b').test(answer));
  const tools = Array.from(proxy.seen.values()).map(t => ({ name: t.name, args: t.args, chars: t.chars, parked: t.parkedNote, head: t.head }));
  const out = {
    sidecar: ENTRY || 'this tree', model: MODEL, reason: end && end.payload.reason, turns: end && end.payload.turns, usd: end && end.payload.usd,
    truth: truth.length, found: found.length + '/' + truth.length, missing: truth.filter(c => found.indexOf(c) < 0),
    toolsOffered: proxy.offered, approvals, toolCalls: tools, answer: answer.slice(-600)
  };
  out.PASS = !!(end && end.payload.reason === 'done' && found.length === truth.length);
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.PASS ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
