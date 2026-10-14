/* node test/stop-truth.test.js — STOP keeps the Commander's words and lets go of everything the stopped run was waiting on
   (live walk with a real model, 2026-10-14).

   Found on the 0.13.5 candidate:
     · a message queued behind a running turn vanished on STOP: not sent, not in the box, no notice (stopActive dropped the queue);
     · after STOP the bell kept the stopped run's approval under "NEEDS YOU — 2 waiting" (SYSTEM badge 2) while the rail's NEEDS YOU
       said 1, until a reload: the page drops the stream once the station confirms the kill, so the station's own
       permission.response for the run's open prompts never reached the page — and the thrown-abort teardown never settled them;
     · the floor's AWAITING APPROVAL tag and CREW's gold "needs your OK" card waited on that same lost response.

   This runs the REAL stopActive (+ its helpers) and the REAL bell settlement listener from chat.js in a sandbox. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../frontend/app/chat.js'), 'utf8');
const Channels = require('../frontend/app/channels.js');

function stopRig(opts) {
  Channels.reset();
  const bus = A.makeBus();
  const emitted = A.collectBus(bus, ['permission.response']);
  const settled = [], notified = [], lines = [], retired = [], aborted = [];
  let cancelResolve;
  const ctx = {
    console, Date, Promise, setTimeout, clearTimeout, JSON,
    U: { bus },
    Channels,
    activeWs: { id: 'ws1', agentId: 'agent', conversationMode: 'chat' },
    isBusy: () => true,
    loopStop: () => false,
    localLine: t => lines.push(t),
    interrupted: new Set(), stopSource: new Map(), queued: new Map(),
    status: () => {}, updateControls: () => {},
    retireOpenConsents: (wsId, runId) => retired.push([wsId, runId]),
    aborters: new Map([['ws1', { abort: () => aborted.push('ws1') }]]),
    Harness: { cancel: () => new Promise(r => { cancelResolve = r; }) },
    stopFailed: () => {},
    input: { value: opts && opts.typed || '' },
    autoGrowInput: () => {},
    renderQueued: () => {},
    askerName: () => 'NOVA', actionPhrase: () => 'hand work to copy',
    StationUI: { settleNotifs: k => settled.push(k), notify: (_t, _c, _cat, o) => notified.push(o) }
  };
  vm.createContext(ctx);
  // the bell's one shared settlement path (settlePromptNotice → keepNeeds) and its permission.response listener
  const settleStart = src.indexOf('  const settledPromptNotices = new Set();');
  const settleEnd = src.indexOf('  async function answerConsent(', settleStart);
  const promptStart = src.indexOf('  const promptNeeds = new Map();');
  const promptEnd = src.indexOf('  function backgroundPermissionNotify(', promptStart);
  A.ok(settleStart > 0 && settleEnd > settleStart && promptStart > 0 && promptEnd > promptStart, 'the bell settlement helpers are present');
  const helpers = ['function restoreQueued', 'function settleStoppedAsks'].map(h => A.fnBody(src, h)).filter(Boolean).join('\n');
  const stop = A.fnBody(src, 'function stopActive');
  A.ok(stop.length > 500 && stop.length < 12000, 'stopActive body located');
  vm.runInContext(src.slice(settleStart, settleEnd) + src.slice(promptStart, promptEnd) + '\n' + helpers + '\n' + stop
    + '\n;this.__stop = stopActive; this.__announced = announcedPrompt;', ctx);
  return { ctx, bus, emitted, settled, notified, lines, retired, aborted, confirm: v => cancelResolve(v) };
}

(async () => {
  // ── 1. the queued message survives STOP: back in the composer, unsent, and a line says so ──
  {
    const r = stopRig();
    r.ctx.queued.set('ws1', ['also make one of them funny']);
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.__stop('click');
    A.eq(r.ctx.queued.has('ws1'), false, 'the stopped stream keeps no queue that would auto-send later');
    A.eq(r.ctx.input.value, 'also make one of them funny', 'the queued words are back in the composer, unsent');
    A.ok(r.lines.some(l => /queued message was not sent/i.test(l) && /message box/i.test(l)), 'a short honest line says the queued message was not sent and where it went: ' + JSON.stringify(r.lines));
  }
  {
    // two queued + a half-typed draft: nothing is overwritten, order kept (queue first, then what is in the box)
    const r = stopRig({ typed: 'and shorter' });
    r.ctx.queued.set('ws1', ['first follow-up', 'second follow-up']);
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.__stop('esc');
    A.eq(r.ctx.input.value, 'first follow-up\nsecond follow-up\nand shorter', 'every queued message and the draft already in the box are kept, in order');
    A.ok(r.lines.some(l => /2 queued messages were not sent/i.test(l)), 'the line counts what came back');
  }
  {
    // nothing queued: no line, the box untouched
    const r = stopRig({ typed: 'draft' });
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.__stop('click');
    A.eq(r.ctx.input.value, 'draft', 'with nothing queued the composer is left alone');
    A.ok(!r.lines.some(l => /queued/i.test(l)), 'and no queue line is printed');
  }

  // ── 2. the stopped run's open asks settle everywhere once the station CONFIRMS the stop ──
  {
    const r = stopRig();
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    Channels.setPending('ws1', { promptId: 'p-lead', tool: 'team.dispatch', runId: 'run-1' }, Date.now());
    Channels.setPending('ws1', { promptId: 'p-bg', tool: 'fs.write', runId: 'run-0', background: true }, Date.now());
    A.eq(r.ctx.__announced('p-lead', { id: 'ws1' }), false, 'fixture: the lead ask was filed under the conversation\'s bell key');
    r.ctx.__stop('click');
    A.eq(r.emitted.length, 0, 'nothing is announced before the station confirms the kill');
    r.confirm({ ok: true });
    await new Promise(res => setTimeout(res, 0));
    A.eq(r.retired.length, 1, 'the run\'s open cards retire on the confirmed stop');
    A.eq(r.aborted, ['ws1'], 'the stream is torn down after the confirm');
    A.eq(r.emitted.map(e => e.payload), [{ promptId: 'p-lead', decision: 'deny', stopped: true }],
      'the run\'s own ask is announced settled as STOPPED (nothing approved) — never the background worker\'s');
    A.eq(r.notified.map(o => o && o.prompt), ['p-bg'], 'the conversation\'s one bell entry moves to the background worker\'s ask still waiting — the stopped one is gone from it');
    A.eq(Channels.pendingAllOf('ws1').map(p => p.promptId), ['p-bg'], 'a background worker\'s ask stays filed — it outlives its lead\'s turn');
  }
  {
    // the walk's case: only the stopped run's own ask waited — the bell settles outright (NEEDS YOU and the bell agree on 0)
    const r = stopRig();
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    Channels.setPending('ws1', { promptId: 'p-lead', tool: 'team.dispatch', runId: 'run-1' }, Date.now());
    r.ctx.__announced('p-lead', { id: 'ws1' });
    r.ctx.__stop('click');
    r.confirm({ ok: true });
    await new Promise(res => setTimeout(res, 0));
    A.eq(r.settled, ['needs:ws1'], 'the stopped run\'s bell entry settles: ' + JSON.stringify(r.settled));
    A.eq(Channels.allPending().length, 0, 'and NEEDS YOU (Channels) holds nothing for it either');
  }
  {
    // a refused stop announces nothing: the run may still be waiting on that ask
    const r = stopRig();
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    Channels.setPending('ws1', { promptId: 'p-lead', tool: 'team.dispatch', runId: 'run-1' }, Date.now());
    r.ctx.__stop('click');
    r.confirm({ ok: false, error: 'refused' });
    await new Promise(res => setTimeout(res, 0));
    A.eq(r.emitted.length, 0, 'an unconfirmed stop claims no settlement');
  }

  // ── 3. the thrown-abort teardown (STOP drops the stream) settles the run's own waits like every other end ──
  {
    const catchBody = /\} catch \(e\) \{\s*const aborted = e && \(e\.name === 'AbortError'[\s\S]*?\n    \} finally \{/.exec(src);
    A.ok(catchBody, 'send() has its thrown-teardown catch');
    A.ok(catchBody && /settleRunNeeds\(ws\.id\);/.test(catchBody[0]), 'a thrown teardown (STOP, a dropped stream) settles the run\'s own bell waits — a background worker\'s ask keeps its entry');
  }

  // ── 4. the floor and CREW listen for that same response; the tutorial never reads a stop as the Commander's "no" ──
  {
    const world = fs.readFileSync(path.join(__dirname, '../frontend/app/world.js'), 'utf8');
    A.ok(/U\.bus\.on\('permission\.response', p => \{\s*if \(p && awaitPrompt && \(!p\.promptId \|\| p\.promptId === awaitPrompt\.promptId\)\) clearAwait\(\);/.test(world), 'the hero\'s AWAITING tag clears on the response');
    const tut = fs.readFileSync(path.join(__dirname, '../frontend/app/tutorial.js'), 'utf8');
    A.ok(/p\.decision === 'deny' && !p\.stopped\) sawDeny = true/.test(tut), 'a stopped ask is not counted as the Commander denying it');
  }

  // ── 5. the queued pill never hides the live line: a strip that grows while the log shows its end keeps that end in view ──
  {
    const rq = A.fnBody(src, 'function renderQueued');
    A.ok(rq.length > 200 && rq.length < 4000, 'renderQueued located');
    const strip = { children: [], innerHTML: '', offsetHeight: 0, appendChild(n) { this.children.push(n); this.offsetHeight = 30; } };
    const log = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400, contains: () => false };
    const doc = { createElement: () => ({ appendChild() {}, setAttribute() {}, set textContent(v) {}, className: '' }), createTextNode: () => ({}) };
    const ctx = vm.createContext({ document: doc, el: id => id === 'chat-queued' ? strip : null, log, heldCard: null, activeWs: { id: 'ws1' },
      queued: new Map([['ws1', ['also make one of them funny']]]),
      nearBottom: () => log.scrollHeight - log.scrollTop - log.clientHeight < 40,
      topInLog: () => 0 });
    vm.runInContext(rq + '\n;renderQueued();', ctx);
    A.eq(log.scrollTop, 630, 'the log follows its end up by the strip\'s height, so the presence line under the card is not cut off');
    log.scrollTop = 100; strip.offsetHeight = 0; strip.children = [];
    vm.runInContext('renderQueued();', ctx);
    A.eq(log.scrollTop, 100, 'a reader scrolled up into history is left where they are');
  }

  A.report('stop-truth.test');
})().catch(e => { console.error(e); process.exit(1); });
