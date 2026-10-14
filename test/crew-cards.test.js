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

function load(startAt = 1000000) {
  const L = {};
  const bus = { on: (n, f) => (L[n] = L[n] || []).push(f) };
  const emit = (n, p) => (L[n] || []).forEach(f => f(p));
  let t = startAt;
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
  let tick = null;
  const ctx = {
    window: {},
    U: { bus },
    Date: { now: () => t },
    document: { readyState: 'complete', querySelectorAll: () => [row], querySelector: () => null, getElementById: () => null,
      createElement: () => ({ className: '', textContent: '', setAttribute() {} }) },
    MutationObserver: class { observe() {} },
    setInterval: (fn) => { tick = fn; return 1; }
  };
  vm.runInNewContext(src, ctx);
  return {
    emit, cl,
    advance(ms) { t += ms; if (tick) tick(); },
    clock: () => (kids['crew-clock'] || {}).textContent,
    step: () => (row._step || {}).textContent,
    asking: () => cl.has('asking'),
    elapsed: (runId, now = t) => ctx.window.CrewClock.elapsedForRun(runId, now)
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
  A.eq(c.elapsed('r1'), null, 'idle cleanup also retires the lost run\'s exact accounting');
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

// 4) delegated clocks follow runs, even when the oldest run of the same agent ends
{
  const c = load(100000);
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.advance(60000);
  c.emit('agent.run.start', { agentId: 'nova', runId: 'b' });
  c.advance(60000);
  A.eq([c.elapsed('a'), c.elapsed('b')], [120000, 60000], 'staggered concurrent tasks each keep their own elapsed time');
  c.advance(10000); c.emit('agent.run.end', { runId: 'a' });
  A.eq([c.elapsed('a'), c.elapsed('b')], [null, 70000], 'ending the oldest run cannot reset its sibling clock');
  c.emit('agent.run.end', { runId: 'a' }); c.advance(1000);
  A.eq(c.elapsed('b'), 71000, 'a duplicate old end is harmless to the surviving run');
}

// 5) overlapping prompts count as one wait for their exact worker, never for its same-agent sibling or outer lead
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'lead', runId: 'lead' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.advance(2000); c.emit('agent.run.start', { agentId: 'nova', runId: 'b' });
  c.advance(2000);
  const p1 = { promptId: 'p1', agentId: 'lead', runId: 'lead', workerAgentId: 'nova', workerRunId: 'a' };
  const p2 = { ...p1, promptId: 'p2' };
  c.emit('permission.prompt', p1);
  c.advance(2000); c.emit('permission.prompt', p2); c.emit('permission.prompt', p1);
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  A.eq([c.elapsed('a'), c.elapsed('b'), c.elapsed('lead')], [4000, 4000, 6000], 'only the stamped worker pauses; duplicate delivery does not move its pause');
  c.advance(2000); c.emit('permission.response', { promptId: 'p1', decision: 'once' });
  A.eq([c.elapsed('a'), c.elapsed('b')], [4000, 6000], 'closing one prompt leaves the overlapping prompt paused');
  c.advance(2000); c.emit('permission.response', { promptId: 'p2', decision: 'deny' });
  c.advance(1000);
  A.eq([c.elapsed('a'), c.elapsed('b')], [5000, 9000], 'the closed union is subtracted once, only from its owner');
  c.emit('permission.prompt', p2);
  c.emit('permission.response', { promptId: 'p2', decision: 'deny' });
  c.emit('permission.response', { promptId: 'unseen', decision: 'once' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.advance(1000);
  A.eq([c.elapsed('a'), c.elapsed('b')], [6000, 10000], 'settled prompt replay, duplicate/unknown response and duplicate start cannot reset or double-charge time');
}

// 6) independent simultaneous waits and out-of-order ends retain the sibling's own open pause
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'b' });
  c.advance(1000);
  c.emit('permission.prompt', { promptId: 'pa', agentId: 'lead', workerAgentId: 'nova', workerRunId: 'a' });
  c.emit('permission.prompt', { promptId: 'pb', agentId: 'lead', workerAgentId: 'nova', workerRunId: 'b' });
  c.advance(2000); c.emit('permission.response', { promptId: 'pa', decision: 'once' });
  c.advance(3000);
  A.eq([c.elapsed('a'), c.elapsed('b')], [4000, 1000], 'one worker resumes while the other still awaits an independent answer');
  c.emit('permission.response', { promptId: 'pb', decision: 'deny', expired: true });
  c.advance(1000);
  A.eq([c.elapsed('a'), c.elapsed('b')], [5000, 2000], 'independent answer and expiry close only their recorded owners');
}
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'b' });
  c.advance(1000);
  c.emit('permission.prompt', { promptId: 'pa', agentId: 'lead', workerAgentId: 'nova', workerRunId: 'a' });
  c.advance(1000);
  c.emit('permission.prompt', { promptId: 'pb', agentId: 'lead', workerAgentId: 'nova', workerRunId: 'b' });
  c.advance(3000); c.emit('agent.run.error', { runId: 'b' });
  A.eq([c.elapsed('a'), c.elapsed('b'), c.asking()], [1000, null, true], 'the newer run ending first removes only its own open wait');
  c.emit('permission.response', { promptId: 'pb', decision: 'deny', expired: true });
  c.advance(1000); c.emit('permission.response', { promptId: 'pa', decision: 'once' });
  c.advance(2000);
  A.eq([c.elapsed('a'), c.asking()], [3000, false], 'late settlement of the ended run does not affect the surviving run\'s pause union');
  c.emit('agent.run.start', { agentId: 'nova', runId: 'c' });
  c.emit('agent.run.end', { runId: 'b' }); c.advance(1000);
  A.eq([c.elapsed('a'), c.elapsed('c')], [4000, 1000], 'a delayed old end cannot clear a new same-agent run');
}

// 7) no observed start or no proven wait owner means unavailable accounting, never an agent-based guess
{
  const c = load();
  A.eq(c.elapsed('recovered'), null, 'a run already active on reload has no page-observed start');
  c.emit('permission.prompt', { promptId: 'early', agentId: 'lead', workerAgentId: 'nova', workerRunId: 'late-start' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'late-start' });
  c.emit('permission.response', { promptId: 'early', decision: 'once' });
  A.eq(c.elapsed('late-start'), null, 'a start arriving after its wait cannot reconstruct elapsed accounting');
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'b' });
  c.emit('agent.run.start', { agentId: 'other', runId: 'other' });
  c.advance(1000);
  c.emit('permission.prompt', { promptId: 'ordinary', agentId: 'nova', runId: 'outer-is-not-a-worker-stamp' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'during-wait' });
  c.advance(1000); c.emit('permission.response', { promptId: 'ordinary', decision: 'once' });
  A.eq([c.elapsed('a'), c.elapsed('b'), c.elapsed('during-wait'), c.elapsed('other')], [null, null, null, 2000], 'an unstamped wait invalidates possible owners, not unrelated agents; closing it cannot repair the missing history');
  c.emit('agent.run.start', { agentId: 'nova', runId: 'after-wait' });
  A.eq(c.elapsed('after-wait'), 0, 'a later observed start has a fresh known clock');
  c.emit('permission.prompt', { promptId: 'missing-worker', agentId: 'lead', runId: 'other', workerAgentId: 'nova' });
  A.eq([c.elapsed('after-wait'), c.elapsed('other')], [null, 2000], 'a worker ask without workerRunId cannot borrow its outer consent run');
}
{
  const c = load();
  c.emit('agent.run.start', { agentId: 'nova', runId: 'a' });
  c.emit('agent.run.start', { agentId: 'nova', runId: 'b' });
  c.advance(2000);
  c.emit('permission.prompt', { promptId: 'conflict', agentId: 'lead', workerAgentId: 'other', workerRunId: 'a' });
  A.eq([c.elapsed('a'), c.elapsed('b')], [null, 2000], 'a conflicting worker stamp makes that exact clock unavailable without pausing its sibling');
  c.advance(1000); c.emit('permission.response', { promptId: 'conflict', decision: 'deny' });
  A.eq([c.elapsed('a'), c.elapsed('b')], [null, 3000], 'settling a conflicting stamp cannot restore missing certainty');
}
{
  const c = load(0);
  c.emit('agent.run.start', { agentId: 'nova', runId: 'zero' });
  c.emit('permission.prompt', { promptId: 'zero-pause', agentId: 'lead', workerAgentId: 'nova', workerRunId: 'zero' });
  c.advance(1000);
  A.eq(c.elapsed('zero'), 0, 'zero is a valid start and pause timestamp');
  c.emit('permission.response', { promptId: 'zero-pause', decision: 'once' });
  c.advance(1000); c.emit('agent.run.start', { agentId: 'nova', runId: 'zero' });
  A.eq(c.elapsed('zero'), 1000, 'a repeated start retains the original start and settled wait');
  A.eq(c.elapsed('zero', NaN), null, 'invalid observation time is unavailable, not a painted zero');
}

// 8) the page side: every way a question/approval is settled reaches the bus
{
  const chat = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'chat.js'), 'utf8');
  const clar = chat.slice(chat.indexOf('function clarifyRow('), chat.indexOf('function permissionRow('));
  A.ok((clar.match(/U\.bus\.emit\('permission\.response', ?\{ ?promptId: ?p\.promptId, ?decision: ?'once', ?via: ?'desk' ?\}\)/g) || []).length === 2,
    'both question paths (buttons and the conversation) announce the local desk answer on the bus');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'index.js'), 'utf8');
  A.ok(/onAutoDeny: \(promptId\) => \{ try \{ emit\('permission\.response', \{ promptId, decision: 'deny', expired: true \}\);/.test(idx),
    'a prompt that expired or lost its run is announced on the run stream');
}

A.report('crew-cards');
