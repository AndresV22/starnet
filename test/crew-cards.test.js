/* node test/crew-cards.test.js — the CREW cards (frontend/app/crewcards.js) show only what the harness proves (sweep 2026-10-02):
   · a run the page never saw END (Stop, E-STOP, a dropped stream) does not haunt the agent's NEXT run with its clock,
     step and gold "needs your OK" frame;
   · the run clock excludes time spent waiting on the Commander (the duration law COMMS keeps with Channels.elapsedOf);
   · a question or approval that was answered, denied or expired clears the frame. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'crewcards.js'), 'utf8');

function load() {
  const L = {};
  const bus = { on: (n, f) => (L[n] = L[n] || []).push(f) };
  const emit = (n, p) => (L[n] || []).forEach(f => f(p));
  let t = 1000000;
  const kids = {};
  const cl = new Set(['working']);
  const el = (c) => ({ className: c, textContent: '', after() {}, appendChild(x) { kids[x.className] = x; }, querySelector() { return null; }, setAttribute() {} });
  const name = el('crew-name'); name.querySelector = () => kids['crew-clock'] || null;
  const status = el('crew-status');
  const row = {
    dataset: { agentId: 'nova' }, _step: null,
    classList: { contains: c => cl.has(c), toggle: (c, on) => (on ? cl.add(c) : cl.delete(c)) },
    querySelector: s => s === '.crew-name' ? name : s === '.crew-status' ? status : s === '.crew-clock' ? kids['crew-clock'] : s === '.crew-step' ? row._step : null
  };
  status.after = x => { row._step = x; };
  let tick = null, nextMs = null;
  const win = {};
  const ctx = {
    window: win,
    U: { bus },
    Date: { now: () => t },
    document: { readyState: 'complete', querySelectorAll: () => [row], querySelector: () => null, getElementById: () => null,
      createElement: () => ({ className: '', textContent: '', setAttribute() {} }) },
    MutationObserver: class { observe() {} },
    // the paint loop is a setTimeout chain timed to the clock's next second (msToNextSecond); the stub keeps the latest one
    setTimeout: (fn, ms) => { tick = fn; nextMs = ms; return 1; }, clearTimeout: () => {}
  };
  vm.runInNewContext(src, ctx);
  return {
    emit, cl,
    advance(ms) { t += ms; if (tick) tick(); },
    clock: () => (kids['crew-clock'] || {}).textContent,
    step: () => (row._step || {}).textContent,
    asking: () => cl.has('asking'),
    nextMs: () => nextMs, crewClock: () => win.CrewClock,
    at: (ms) => { t = ms; }, now: () => t
  };
}

// 1) a stopped run (no agent.run.end ever arrives) does not haunt the next run
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'r1' });
  c.emit('permission.prompt', { promptId: 'p1', agentId: 'nova', tool: 'fs.write' });
  c.advance(120000);
  A.ok(c.asking(), 'fixture: the first run is waiting on the Commander');
  c.cl.delete('working'); c.advance(1000); c.advance(9000);   // Stop: the row goes idle, the run never reports its end
  c.advance(3600000);
  c.cl.add('working');
  c.emit('agent.run.start', { agentId: 'nova', runId: 'r2' });
  c.advance(5000);
  A.eq([c.clock(), c.step(), c.asking()], ['0:05', '', false], 'the next run starts its own clock, with no leftover step or "needs your OK"');
}
// 2) the clock excludes the wait on the Commander, then resumes
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'r1' });
  c.advance(10000);
  c.emit('permission.prompt', { promptId: 'p1', agentId: 'nova', tool: 'fs.write' });
  c.advance(60000);
  A.eq([c.clock(), c.asking()], ['0:10', true], 'while it waits on you the clock holds');
  c.emit('permission.response', { promptId: 'p1', decision: 'once' });
  c.advance(5000);
  A.eq([c.clock(), c.asking()], ['0:15', false], 'answered: the frame clears and the clock resumes without the wait');
}
// 3) a short idle blip (a fresh start before .working lands) does not drop a live run
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'r1' });
  c.cl.delete('working'); c.advance(2000); c.cl.add('working'); c.advance(1000);
  A.eq(c.clock(), '0:03', 'a run is kept through a brief not-working blip (8s grace)');
}

// 4) CREW turns its second in the same frame the world's desk tag does (review of rc walk #21: a free-running 1 s interval
//    painted at the page's own phase, so the card read a second behind the tag that reads the same clock every frame)
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'r1' });
  const t0 = c.now();
  c.at(t0 + 2300); c.advance(0);                      // a paint 2.3 s into the run
  A.eq(c.clock(), '0:02', 'fixture: 2.3 s reads 0:02');
  A.eq(c.nextMs(), 700 + 4, 'the next paint is due when the clock turns 0:03 (700 ms on, +4 ms past the turn): ' + c.nextMs());
  c.advance(c.nextMs());
  A.eq(c.clock(), '0:03', '…and the paint at that moment reads 0:03, as the world tag does');
  A.eq(c.crewClock().msToNextSecond(c.now()), 1000 - 4 + 4, 'CrewClock answers the same next turn for any other once-a-second readout');
  c.emit('permission.prompt', { promptId: 'p1', agentId: 'nova', tool: 'fs.write' });
  c.advance(0);
  A.eq(c.nextMs(), 1000, 'a clock held on a wait on you never turns: the loop idles at 1 s');
  // one run's own clock, by runId (a DELEGATED row names its worker's run)
  c.at(c.now() + 30000);
  A.eq(c.crewClock().elapsedOfRun('r1', c.now()), 3004, 'elapsedOfRun excludes the open wait on you: ' + c.crewClock().elapsedOfRun('r1', c.now()));
  A.eq(c.crewClock().elapsedOfRun('r-never-seen', c.now()), null, 'a run this page never saw start has no clock here (null, never 0)');
  c.emit('agent.run.start', { agentId: 'nova', runId: 'r2' });
  c.emit('permission.response', { promptId: 'p1', decision: 'once' });
  c.at(c.now() + 5000);
  A.eq(c.crewClock().elapsedOfRun('r2', c.now()), 5000, 'a second run of the same agent keeps its own clock');
  A.eq(c.crewClock().elapsedOf('nova', c.now()), 8004, 'the agent clock (CREW) is still its oldest run');
}

// 5) the page side: every way a question/approval is settled reaches the bus
{
  const chat = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'chat.js'), 'utf8');
  const clar = chat.slice(chat.indexOf('function clarifyRow('), chat.indexOf('function permissionRow('));
  A.ok((clar.match(/U\.bus\.emit\('permission\.response', ?\{ ?promptId: ?p\.promptId, ?decision: ?'once' ?\}\)/g) || []).length === 2,
    'both question paths (buttons and the conversation) announce the answer on the bus');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'index.js'), 'utf8');
  A.ok(/onAutoDeny: \(promptId\) => \{ try \{ emit\('permission\.response', \{ promptId, decision: 'deny', expired: true \}\);/.test(idx),
    'a prompt that expired or lost its run is announced on the run stream');
}

A.report('crew-cards');
