// Manual isolated seeded Chromium proof. Coordinate the single live slot before execution.
// Phone events are injected desktop events after real backend consent; no paired phone is used.
// Voice exposes one private production function at load time and spies consent/speech for synthetic pending asks.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { launchChrome, connectCDP, evalJS, sleep, collectDiagnostics } from '../../../scripts/lib/cdp.mjs';
import { waitDevReady } from '../../../scripts/lib/seed.mjs';
const require = createRequire(import.meta.url);
const { SidecarFixture, allocatePort } = require('../../../test/helpers/sidecar-fixture.js');
const output = 'qa/evidence/frontend-deep-sweep-2026-10-11/phone-voice-live.json';
const results = [], calls = [], hookErrors = []; let cdp, chrome, diagnostics, worker, hookCount = 0, releaseLead;
const leadHold = new Promise(resolve => { releaseLead = resolve; });
const check = (name, ok, detail) => { const r = { name, ok: !!ok, detail }; results.push(r); console.log(JSON.stringify(r)); if (!ok) throw Error(name); };
const mock = http.createServer(async (req, res) => {
  if (req.url.includes('/models')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'test/model', context_length: 128000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] })); }
  let raw = ''; for await (const d of req) raw += d;
  const b = JSON.parse(raw || '{}'), msgs = b.messages || [];
  const user = String([...msgs].reverse().find(m => m.role === 'user')?.content || '');
  const system = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const used = msgs.filter(m => m.role === 'assistant').flatMap(m => m.tool_calls || []).map(t => t.function?.name);
  const child = /PROBE_SAVE/.test(user); let tool = null, text = 'Synthetic local tasks settled.';
  if (b.tools?.length) {
    if (child) {
      if (!used.includes('brief_proceed')) tool = { name: 'brief_proceed', args: { objective: 'Save the worker proof note', deliverable: 'worker-proof.txt' } };
      else if (!used.includes('fs_write')) tool = { name: 'fs_write', args: { path: 'worker-proof.txt', content: 'Synthetic worker note.' } };
    } else if (/\[ORCHESTRATION\]/.test(system)) {
      if (!used.includes('brief_proceed')) tool = { name: 'brief_proceed', args: { objective: 'Save two independent proof notes', deliverable: 'local proof files' } };
      else if (!used.includes('team_dispatch')) tool = { name: 'team_dispatch', args: { background: true, workers: [{ agentId: worker, prompt: 'PROBE_SAVE: save the worker proof note.' }] } };
      else if (!used.includes('fs_write')) tool = { name: 'fs_write', args: { path: 'lead-proof.txt', content: 'Synthetic lead note.' } };
      else await leadHold; // keep the real run alive until the independent worker ask is answered
    }
  }
  calls.push({ kind: child ? 'worker' : 'lead', tool: tool?.name || null });
  const delta = tool ? { tool_calls: [{ index: 0, id: 'call_' + calls.length, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } : { content: text };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) + '\n\n'); res.end('data: [DONE]\n\n');
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
const base = 'http://127.0.0.1:' + mock.address().port + '/api/v1';
const fixture = new SidecarFixture({ entry: path.resolve('dev/seed.js'), timeoutMs: 60000, env: { SKYNET_DEFAULT_MODEL: 'test/model', SKYNET_OPENROUTER_KEY: 'sk-or-v1-synthetic-proof', SKYNET_OPENROUTER_BASE: base, STARNET_OPENROUTER_BASE: base, SEED_FULL_ACCESS: '0', SKYNET_FULL_ACCESS: '0', STARNET_FULL_ACCESS: '0', SKYNET_REFLECT: '0', SKYNET_SKILL_REVIEW: '0', SKYNET_EDGE_TTS: '0', SKYNET_AUX_BUDGET: '0' } });
fixture.args = ['--keep', '--workspace', fixture.workspace];
const run = s => evalJS(cdp, s);
const until = async (fn, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(150); } throw Error('condition timeout'); };
try {
  await fixture.start(); const port = await allocatePort(); chrome = launchChrome({ cdpPort: port, profileDir: path.join(fixture.profile, 'chrome') }); cdp = await connectCDP(port);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); diagnostics = collectDiagnostics(cdp); await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['*assets/portraits/*', '*assets/agents/*'] });
  const voice = fs.readFileSync('frontend/app/voice-live.js', 'utf8');
  const marker = 'return { init, start, end, isActive:';
  if (!voice.includes(marker)) throw Error('voice proof hook target missing');
  const instrumented = voice.replace(marker, 'return { __approvalCommand: approvalCommand, init, start, end, isActive:');
  cdp.on('Fetch.requestPaused', p => { hookCount++; cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }], body: Buffer.from(instrumented).toString('base64') }).catch(e => hookErrors.push(e.message)); });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*voice-live.js*', requestStage: 'Request' }] });
  await cdp.send('Page.navigate', { url: fixture.baseUrl });
  check('real seeded station opens with one private voice proof hook', await waitDevReady(cdp, evalJS, { url: fixture.baseUrl, tries: 60 }) && hookCount === 1 && !hookErrors.length, { hookCount });
  worker = await run(`(()=>{const w=App.summonAgent({name:'SCRIBE',agentName:'SCRIBE',modelPin:{model:'test/model',provider:'openrouter'}},{activate:false,desk:true});App.setApproval('agent','ask');return w.id;})()`);
  await run('App.configSynced().then(()=>true)');
  await run(`(()=>{const i=document.getElementById('chat-input');i.value='Have SCRIBE save a local proof note. Also save a separate local note yourself.';i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('chat-send').click();return true;})()`);
  await until(() => run(`Channels.allPending().some(x=>/team[._]dispatch/.test(x.p.tool))`));
  await run(`(()=>{const a=Channels.allPending().find(x=>/team[._]dispatch/.test(x.p.tool));return Chat.answerConsent(a.p,Workstreams.get(a.wsId),'once').then(()=>true);})()`);
  await until(() => run(`Channels.allPending().filter(x=>/fs[._]write/.test(x.p.tool)).length===2`));
  const before = await run(`(()=>{const all=Channels.allPending();window.__phone=all.find(x=>!x.p.workerAgentId&&/fs[._]write/.test(x.p.tool));window.__other=all.find(x=>x.p.workerAgentId&&/fs[._]write/.test(x.p.tool));window.__card=[...document.querySelectorAll('#chat-log .cmsg.consent')].find(x=>x.innerText.includes('lead-proof.txt'));return {lead:__phone.p.promptId,worker:__other.p.promptId,card:!!__card,pausedAt:Channels.peek(__phone.wsId).pausedAt};})()`);
  check('actual lead permission card and independent worker permission coexist', before.card && before.lead && before.worker && before.pausedAt, before);
  const ignored = await run(`(()=>{U.bus.emit('permission.response',{promptId:'unrelated-proof',decision:'deny'});return {pending:Channels.allPending().map(x=>x.p.promptId),buttons:!!__card.querySelector('.consent-btns')};})()`);
  check('unrelated phone event leaves the real card and both asks intact', ignored.buttons && ignored.pending.includes(before.lead) && ignored.pending.includes(before.worker), ignored);
  const settled = await run(`(async()=>{const a=await Harness.consent(Channels.runIdOf(__phone.wsId),__phone.p.promptId,'once');if(!a||!a.ok)throw Error('real consent refused');U.bus.emit('permission.response',{promptId:__phone.p.promptId,decision:a.decision});return {receipt:a,pending:Channels.allPending().map(x=>x.p.promptId),pausedAt:Channels.peek(__phone.wsId).pausedAt,text:__card.querySelector('.consent-result')?.textContent,buttons:!!__card.querySelector('.consent-btns')};})()`);
  check('controlled phone event settles the real lead card but preserves worker and pause', settled.pending.length === 1 && settled.pending[0] === before.worker && settled.pausedAt === before.pausedAt && !settled.buttons && settled.text === '✓ approved once from your phone', settled);
  await run(`Chat.answerConsent(__other.p,Workstreams.get(__other.wsId),'deny').then(()=>true)`); releaseLead(); await until(() => run('!Chat.isBusy()'));
  check('independent worker permission can still be answered', await run('Channels.allPending().length===0'));
  const voiceProof = await run(`(()=>{if([...document.querySelectorAll('#chat-log .cmsg.consent .consent-btn')].some(b=>!b.disabled&&/approve once|open login|^done|deny|cancel|^always$/i.test(b.textContent.trim())))throw Error('painted decision buttons would bypass fallback');const ws=Workstreams.active(),savedConsent=Harness.consent,savedSpeak=Voice.speak,calls=[],spoken=[];try{Harness.consent=(...args)=>{calls.push(args);return Promise.resolve({ok:true,decision:args[2]});};Voice.speak=t=>spoken.push(t);Channels.begin(ws.id,100);Channels.setRunId(ws.id,'voice-controlled');Channels.setPending(ws.id,{promptId:'voice-first',tool:'fs.write'},200);Channels.setPending(ws.id,{promptId:'voice-last',tool:'fs.write'},210);VoiceLive.__approvalCommand('approve');const first={pending:Channels.pendingAllOf(ws.id).map(p=>p.promptId),pausedAt:Channels.peek(ws.id).pausedAt,pausedMs:Channels.peek(ws.id).pausedMs,text:document.getElementById('lv-task')?.textContent,pendingClass:document.getElementById('lv-task')?.classList.contains('pending')};VoiceLive.__approvalCommand('deny');const last={pending:Channels.pendingAllOf(ws.id).map(p=>p.promptId),pausedAt:Channels.peek(ws.id).pausedAt,pausedMs:Channels.peek(ws.id).pausedMs,text:document.getElementById('lv-task')?.textContent,pendingClass:document.getElementById('lv-task')?.classList.contains('pending')};return {first,last,calls,spoken};}finally{Harness.consent=savedConsent;Voice.speak=savedSpeak;Channels.end(ws.id);}})()`);
  check('controlled voice fallback preserves the other ask and real panel waiting state', voiceProof.first.pending.length === 1 && voiceProof.first.pending[0] === 'voice-first' && voiceProof.first.pausedAt === 200 && voiceProof.first.pausedMs === 0 && voiceProof.first.pendingClass && /^APPROVAL NEEDED/.test(voiceProof.first.text), voiceProof.first);
  check('controlled final voice answer settles only the final ask and real panel resumes', voiceProof.last.pending.length === 0 && voiceProof.last.pausedAt === 0 && voiceProof.last.pausedMs > 0 && !voiceProof.last.pendingClass && /^WORKING/.test(voiceProof.last.text) && voiceProof.calls[0][1] === 'voice-last' && voiceProof.calls[1][1] === 'voice-first', voiceProof);
  check('no browser exceptions or interception errors', !diagnostics.exceptions.length && !hookErrors.length, { exceptions: diagnostics.exceptions, hookErrors });
} catch (e) { console.error(e.stack); process.exitCode = 1; results.push({ name: 'fixture error', ok: false, error: e.message }); }
finally {
  releaseLead();
  if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.ws.close(); }
  if (chrome?.proc && chrome.proc.exitCode === null) { chrome.proc.kill(); await sleep(1000); }
  await fixture.dispose(); mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  fs.writeFileSync(output, JSON.stringify({ source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), results, calls, cleanup: 'Owned Chromium, sidecar fixture and mock server closed.', limitations: ['Phone coverage is an injected desktop permission.response after actual backend consent, not a paired-phone gateway or physical device proof.', 'Voice coverage calls an exposed private production handler in the real loaded module with controlled pending asks and consent/speech spies; no microphone, STT, TTS or permission-dialog proof.', 'Synthetic local model only; no external accounts or customer station.'] }, null, 2) + '\n');
}
