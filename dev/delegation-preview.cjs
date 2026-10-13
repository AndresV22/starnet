'use strict';
/* node dev/delegation-preview.cjs [workspaceDir] — a REAL station (dev/seed.js, isolated workspace + profile) on a
   scripted local model, to see the delegated-work flow end to end without credentials or spend:
   the lead dispatches up to three crew in the background → each worker gets its own thread under the conversation
   (fileUnderThreads) → the rail folds them under it → the DELEGATED card follows the real ledger → each result is
   reviewed back in the parent. Recruit two or three specialists first; the lead dispatches the first three on the roster.
   The scripted model proves the harness flow, not real-model judgment. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TASKS = [
  { prompt: 'Scan our 4 closest competitors and their entry pricing', ms: 9000, tool: ['fs_list', { path: '.' }], out: 'Scanned 4 competitors. Two undercut our entry tier by $5 to $8 a month; none offer a local-first plan.' },
  { prompt: 'Draft the new pricing page copy and layout', ms: 16000, tool: ['fs_list', { path: '.' }], out: 'Drafted the pricing page: entry price unchanged, a cheaper annual plan, and a local-first comparison row.' },
  // the THIRD crew member on the roster writes a file: a real artifact for its receipt, and (SEED_FULL_ACCESS=0) a real
  // approval that names that agent. Recruit at least three specialists to see it.
  { prompt: 'Write the launch email for the 20th', ms: 12000, tool: ['fs_write', { path: 'launch-email.md', content: '# Launch email\n\nSubject: Local-first, finally.\n' }], out: 'Wrote the launch email: subject line plus two openers built on the local-first angle.' }
];

async function provider() {
  const server = http.createServer(async (req, res) => {
    if (req.url.includes('/models')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: 'test/model', context_length: 32000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] }));
    }
    let body = ''; for await (const c of req) body += c;
    const parsed = JSON.parse(body), messages = parsed.messages || [];
    res.setHeader('Content-Type', 'text/event-stream');
    const send = delta => res.write('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n');
    const call = (name, args) => send({ tool_calls: [{ index: 0, id: name + Date.now(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    const lastUser = messages.map(m => m.role).lastIndexOf('user');
    const user = String((messages[lastUser] || {}).content || '');
    const used = messages.slice(lastUser + 1).filter(m => m.role === 'assistant').flatMap(m => m.tool_calls || []).map(t => t.function && t.function.name);
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const crew = Array.from(system.matchAll(/^  - ([A-Za-z0-9_-]+) \(/mg)).map(m => m[1]);
    const task = TASKS.find(t => user.includes(t.prompt));
    if (!parsed.tools || !parsed.tools.length) send({ content: 'Launch prep' });   // titles + other no-tool asks
    else if (user.startsWith('Review the background work')) {
      await sleep(600);
      // ONE report for the hand-off (version B): the outcome, then one line per worker by name, then who is still working
      let brief = { workers: [], stillWorking: [] };
      try { brief = JSON.parse(user.slice(user.lastIndexOf('{"workers"'))); } catch (_) { brief = { workers: [], stillWorking: [] }; }
      const lines = (brief.workers || []).map(w => {
        const t = TASKS.find(x => String(w.objective || '').includes(x.prompt));
        return w.name + ' — ' + (w.status === 'done' ? (t ? t.out : 'finished its part.') : 'stopped before it finished.');
      });
      const still = (brief.stillWorking || []).map(w => w.name);
      send({ content: (lines.length > 1 ? 'The launch kit is ready.' : 'Here is what came back.') + '\n\n' + lines.join('\n')
        + (still.length ? '\n\n' + still.join(' and ') + (still.length > 1 ? ' are' : ' is') + ' still working; I will report when they finish.' : '') });
    }
    else if (task && !system.includes('[ORCHESTRATION]')) {
      // PREVIEW_TWO_ASKS=1 (with SEED_FULL_ACCESS=0): ROOK writes a file too, so two workers wait on approvals at once
      // — answering one must leave the other waiting, with its bell and no second toast
      const tool = process.env.PREVIEW_TWO_ASKS === '1' && task === TASKS[1] ? ['fs_write', { path: 'pricing-page.md', content: '# Pricing\n\nEntry, annual, local-first.\n' }] : task.tool;
      if (!used.includes(tool[0])) call(tool[0], tool[1]);
      else { await sleep(task.ms); send({ content: task.out }); }
    }
    else if (system.includes('[ORCHESTRATION]')) {
      if (!used.includes('brief_proceed')) call('brief_proceed', { objective: 'Get the launch ready with the crew', deliverable: 'Competitor scan, pricing page draft, launch email' });
      // "quick …" asks run the workers in the FOREGROUND (the lead waits for them inside its own run)
      else if (!used.includes('team_dispatch') && crew.length) call('team_dispatch', { background: !/\bquick\b/i.test(user), workers: crew.slice(0, 3).map((id, i) => ({ agentId: id, prompt: TASKS[i].prompt })) });
      // a foreground hand-off has its results in hand when the lead replies: say them, never "I will report back"
      else if (crew.length && /\bquick\b/i.test(user)) send({ content: 'All three are done.\n\n' + crew.slice(0, 3).map((id, i) => id + ' — ' + TASKS[i].out).join('\n') });
      else send({ content: crew.length ? 'Three of the crew are on it: competitors, the pricing page and the launch email. I will report back here when they finish.' : 'There is no crew to delegate to yet: recruit a specialist or two first.' });
    }
    else send({ content: 'Done.' });
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return server;
}

(async () => {
  const mock = await provider();
  const root = path.resolve(process.argv[2] || '.dogfood/delegation');
  const profile = path.join(root, 'profile'); fs.mkdirSync(profile, { recursive: true });
  const port = Number(process.env.STARNET_PORT) || 9444;
  const child = spawn(process.execPath, [path.join(__dirname, 'seed.js'), '--keep', '--workspace', path.join(root, 'workspace')], { windowsHide: true, stdio: 'inherit', env: {
    ...process.env, APPDATA: profile, LOCALAPPDATA: profile, XDG_DATA_HOME: profile,
    SKYNET_PORT: String(port), STARNET_PORT: String(port), SKYNET_DEFAULT_MODEL: 'test/model',
    SKYNET_OPENROUTER_KEY: 'sk-or-v1-local-proof', SKYNET_OPENROUTER_BASE: 'http://127.0.0.1:' + mock.address().port + '/api/v1'
  } });
  child.on('exit', () => mock.close());
  process.on('exit', () => { try { child.kill(); } catch (_) {} });
})().catch(e => { console.error(e); process.exitCode = 1; });
