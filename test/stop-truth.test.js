/* node test/stop-truth.test.js — STOP keeps the Commander's words and lets go of everything the stopped run was waiting on
   (live walk with a real model, 2026-10-14).

   Found on the 0.13.5 candidate:
     · a message queued behind a running turn vanished on STOP: not sent, not in the box, no notice (stopActive dropped the queue);
     · after STOP the bell kept the stopped run's approval under "NEEDS YOU — 2 waiting" (SYSTEM badge 2) while the rail's NEEDS YOU
       said 1, until a reload: the page drops the stream once the station confirms the kill, so the station's own
       permission.response for the run's open prompts never reached the page — and the thrown-abort teardown never settled them;
     · the floor's AWAITING APPROVAL tag and CREW's gold "needs your OK" card waited on that same lost response.
   And once trunk's SEND NOW key joined the queued pill (0.13.5 merge): a line handed to the run but not yet read when STOP
   landed died with the run, and a refusal arriving after the STOP re-queued it and auto-sent it as a new turn.

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
    interrupted: new Set(), stopSource: new Map(), queued: new Map(), sentNow: new Map(), heldBack: new Map(),
    flushQueued: () => {},
    status: () => {}, updateControls: () => {},
    retireOpenConsents: (wsId, runId) => retired.push([wsId, runId]),
    aborters: new Map([['ws1', { abort: () => aborted.push('ws1') }]]),
    Harness: (opts && opts.Harness) || { cancel: () => new Promise(r => { cancelResolve = r; }) },
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
  const helperNames = ['function restoreQueued', 'function settleStoppedAsks', 'function sendQueuedNow', 'function forgetSentNow',
    'function steerWire', 'function markSentNowLanded', 'function restoreSentNow', 'function settleSentNow', 'function giveBack', 'function returnHeld', 'function stopReportHolding'];
  const helperSrc = helperNames.map(h => A.fnBody(src, h));
  A.ok(helperSrc.every(Boolean), 'the STOP / SEND NOW helpers are present: ' + helperNames.filter((h, i) => !helperSrc[i]).join(', '));
  const helpers = helperSrc.join('\n');
  const stop = A.fnBody(src, 'function stopActive');
  A.ok(stop.length > 500 && stop.length < 12000, 'stopActive body located');
  vm.runInContext(src.slice(settleStart, settleEnd) + src.slice(promptStart, promptEnd) + '\n' + helpers + '\n' + stop
    + '\n;this.__stop = stopActive; this.__announced = announcedPrompt; this.__sendNow = sendQueuedNow; this.__landed = markSentNowLanded; this.__settleSentNow = settleSentNow; this.__returnHeld = returnHeld;', ctx);
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

  // ── 1b. SEND NOW and STOP (0.13.5 merge): a line handed to the run that the run never read comes back on a CONFIRMED stop,
  //        and an answer arriving after that changes nothing — never a re-queue that would auto-send it behind the stop ──
  const tick = () => new Promise(res => setTimeout(res, 0));
  {
    const r = stopRig({ typed: 'draft' });
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    let answer = null; const flushed = [];
    r.ctx.fetch = () => new Promise(res => { answer = res; });
    r.ctx.flushQueued = id => flushed.push(id);
    r.ctx.queued.set('ws1', ['use the blue folder', 'and skip the tests']);
    r.ctx.__sendNow('ws1', 0, 'use the blue folder');   // the POST is still in flight
    A.eq(r.ctx.queued.get('ws1'), ['and skip the tests'], 'SEND NOW takes the line off the queue while it flies');
    r.ctx.__stop('click');
    A.eq(r.ctx.input.value, 'and skip the tests\ndraft', 'STOP gives the still-queued line back at once');
    r.confirm({ ok: true });
    await tick();
    A.eq(r.ctx.input.value, 'use the blue folder\nand skip the tests\ndraft', 'once the stop is confirmed the unread send-now line is back too, ahead of the rest');
    A.ok(r.lines.some(l => /stopped before the agent read your send-now message/i.test(l) && /message box/i.test(l)), 'one honest line says the agent never read it: ' + JSON.stringify(r.lines));
    answer({ status: 409, json: () => Promise.resolve({ ok: false }) });
    await tick(); await tick();
    A.eq(r.ctx.queued.has('ws1'), false, 'the late refusal never re-queues it behind the stop');
    A.eq(flushed, [], 'and never auto-sends it as a new turn');
    A.ok(!r.lines.some(l => /stays queued|Sent into the live run/i.test(l)), 'and prints no second claim about it');
  }
  {
    // lines the run DID read stay read: by the [steering] echo seen on the run's tokens, or found in the run's text
    const r = stopRig();
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
    r.ctx.queued.set('ws1', ['use the blue folder', 'say hi in French', 'make it short']);
    r.ctx.__sendNow('ws1', 0, 'use the blue folder'); r.ctx.__sendNow('ws1', 0, 'say hi in French'); r.ctx.__sendNow('ws1', 0, 'make it short');
    await tick(); await tick();
    A.eq(r.lines.filter(l => /Sent into the live run/.test(l)).length, 3, 'each accepted line says only that the run holds it');
    r.ctx.__landed('ws1', 'run-1', 'Working.\n[steering] use the blue folder\n');
    Channels.appendToken('ws1', 'Working.\n[steering] say hi in French\n');
    r.ctx.__stop('click');
    A.eq(r.ctx.input.value, '', 'nothing comes back before the stop is confirmed');
    r.confirm({ ok: true });
    await tick();
    A.eq(r.ctx.input.value, 'make it short', 'only the line the run never read comes back');
    A.eq(r.ctx.sentNow.has('ws1'), false, 'and the stopped run keeps no send-now lines');
  }
  {
    // a refused stop gives nothing back: the run may still read it
    const r = stopRig();
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
    r.ctx.queued.set('ws1', ['use the blue folder']);
    r.ctx.__sendNow('ws1', 0, 'use the blue folder');
    await tick(); await tick();
    r.ctx.__stop('click');
    r.confirm({ ok: false, error: 'refused' });
    await tick();
    A.eq(r.ctx.input.value, '', 'an unconfirmed stop takes back nothing the run holds');
    A.eq((r.ctx.sentNow.get('ws1') || []).length, 1, 'the line is still the run\'s');
    // the run then ends on its own: what it took is settled with it, one still in flight waits for its answer
    r.ctx.sentNow.get('ws1').push({ text: 'in flight', runId: 'run-1', accepted: false, landed: false });
    r.ctx.__settleSentNow('ws1', 'run-1');
    A.eq(r.ctx.sentNow.get('ws1').map(n => n.text), ['in flight'], 'a normal end settles the accepted line and keeps the one still in flight for its refusal path');
  }
  {
    // the wiring the sandbox injects: the live run's tokens mark echoes, and every teardown settles the run's lines
    A.ok(/onToken: d => \{ acc \+= d; Channels\.appendToken\(ws\.id, d\); if \(thisRunId && d && d\.indexOf\('\[steering\] '\) >= 0\) markSentNowLanded\(ws\.id, thisRunId, d\);/.test(src),
      'the run\'s own token stream marks a sent-now line read when its [steering] echo arrives');
    A.ok(/\} finally \{[\s\S]{0,600}Channels\.end\(ws\.id\);\s*if \(thisRunId\) settleSentNow\(ws\.id, thisRunId, acc\);/.test(src), 'send()\'s teardown settles the run\'s sent-now lines on every end, against the run\'s own text');
    A.ok(/if \(activeWs\) \{ returnHeld\(activeWs\.id\); flushQueued\(activeWs\.id\); \}/.test(src), 'returning to a session gives back what its confirmed STOP held, before its queue drains');
    A.ok(/queued\.clear\(\); sentNow\.clear\(\);/.test(src), 'a session switch starts with no sent-now lines, like the queue');
  }

  {
    // the run ends some OTHER way (an error, a budget or loop-guard stop, a phone STOP, the window after the loop's last drain):
    // a line the station took that the run never read goes back to the FRONT of the queue as the next message — the
    // teardown's deferred flush sends it, as a refusal would — never dropped while the loop's own line says "send it as a new message"
    const r = stopRig();
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
    r.ctx.queued.set('ws1', ['use the blue folder', 'say hi in French', 'make it short', 'later']);
    r.ctx.__sendNow('ws1', 0, 'use the blue folder'); r.ctx.__sendNow('ws1', 0, 'say hi in French'); r.ctx.__sendNow('ws1', 0, 'make it short');
    await tick(); await tick();
    r.ctx.__landed('ws1', 'run-1', '\n[steering] use the blue folder\n');
    Channels.end('ws1');
    r.ctx.__settleSentNow('ws1', 'run-1', 'Working.\n[steering] use the blue folder\nHola.\n[steering] say hi in French\n\n[steering] 1 steering note arrived as this run was ending and was NOT applied — send it as a new message.\n');
    A.eq(r.ctx.queued.get('ws1'), ['make it short', 'later'], 'only the line the run never read goes back, ahead of the queue');
    A.ok(r.lines.some(l => /ended before the agent read your send-now message/.test(l) && /next message/.test(l)), 'one line says it goes next: ' + JSON.stringify(r.lines));
    A.eq(r.ctx.sentNow.has('ws1'), false, 'the ended run keeps no send-now lines');
  }
  {
    // the STOP is confirmed while ANOTHER session is on screen: its message box is not the stopped one's
    const r = stopRig({ typed: 'for the other agent' });
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
    r.ctx.queued.set('ws1', ['use the blue folder']);
    r.ctx.__sendNow('ws1', 0, 'use the blue folder');
    await tick(); await tick();
    r.ctx.__stop('click');
    r.ctx.activeWs = { id: 'ws2', agentId: 'mira', conversationMode: 'chat' };
    const before = r.lines.length;
    r.confirm({ ok: true });
    await tick();
    A.eq(r.ctx.input.value, 'for the other agent', 'the other session\'s message box is left alone');
    A.eq(r.lines.length, before, 'and its log gets no line about another session\'s stop');
    A.eq(r.ctx.queued.has('ws1'), false, 'it is never queued either (a return would auto-send it behind the stop)');
    r.ctx.input.value = '';
    r.ctx.activeWs = { id: 'ws1', agentId: 'agent', conversationMode: 'chat' };
    r.ctx.__returnHeld('ws1');
    A.eq(r.ctx.input.value, 'use the blue folder', 'back on the stopped session, the unread line is in its message box, unsent');
    A.ok(r.lines.slice(before).some(l => /stopped before the agent read your send-now message/.test(l)), 'with its line, in its own log');
    r.ctx.__returnHeld('ws1');
    A.eq(r.ctx.input.value, 'use the blue folder', 'given back once');
  }

  // ── 1c. STOP on a send still waiting for its turn ("connecting": no run id yet) also stops the overseer's automatic
  //        report that holds this conversation (stall report 2026-10-13): the page never started that report, so its STOP
  //        never reached it, and every new message sat on "connecting" until the report finished. ──
  {
    const cancels = [], gets = [];
    const reviews = [
      { id: 'g1:report:1', status: 'reviewing', parentStreamId: 'ws1', reviewRunId: 'review-run-1' },
      { id: 'g2:report:1', status: 'reviewing', parentStreamId: 'ws-other', reviewRunId: 'review-run-2' },   // another conversation's
      { id: 'g3:report:1', status: 'done', parentStreamId: 'ws1', reviewRunId: 'review-run-0' }              // a finished one
    ];
    const r = stopRig({ Harness: { cancel: rid => { cancels.push(rid); return Promise.resolve({ ok: true, stopped: true }); }, api: { get: async p => { gets.push(p); return { reviews }; } } } });
    Channels.begin('ws1', Date.now());   // the send is out, the station has not started it: "connecting"
    A.eq(Channels.runIdOf('ws1'), null, 'fixture: the waiting send has no run id yet');
    r.ctx.__stop('click');
    A.eq(r.aborted, ['ws1'], 'the waiting send itself is let go at once (nothing to kill by id)');
    for (let i = 0; i < 5; i++) await new Promise(res => setTimeout(res, 0));
    A.eq(gets, ['/api/overseer'], 'the station\'s own list of reports is read fresh at STOP time');
    A.eq(cancels, ['review-run-1'], 'STOP reaches exactly the report holding THIS conversation — never another conversation\'s, never a finished one');
    A.eq(r.lines.filter(l => /also ended the report on your delegated work/i.test(l)).length, 1, 'one line says the report was stopped too: ' + JSON.stringify(r.lines));
  }
  {
    // a send that has its run id is stopped by that id alone: no report lookup, no extra stop
    const gets = [], cancels = [];
    const r = stopRig({ Harness: { cancel: rid => { cancels.push(rid); return Promise.resolve({ ok: true }); }, api: { get: async p => { gets.push(p); return { reviews: [{ status: 'reviewing', parentStreamId: 'ws1', reviewRunId: 'review-run-1' }] }; } } } });
    Channels.begin('ws1', Date.now()); Channels.setRunId('ws1', 'run-1', Date.now());
    r.ctx.__stop('click');
    for (let i = 0; i < 5; i++) await new Promise(res => setTimeout(res, 0));
    A.eq([gets.length, cancels], [0, ['run-1']], 'a started run is stopped by its own id only');
  }
  {
    // nothing holds the conversation (or the station refused): no claim that a report was stopped
    const r = stopRig({ Harness: { cancel: () => Promise.resolve({ ok: false, error: 'refused' }), api: { get: async () => ({ reviews: [{ status: 'reviewing', parentStreamId: 'ws1', reviewRunId: 'review-run-1' }] }) } } });
    Channels.begin('ws1', Date.now());
    r.ctx.__stop('click');
    for (let i = 0; i < 5; i++) await new Promise(res => setTimeout(res, 0));
    A.ok(!r.lines.some(l => /report/i.test(l)), 'a refused report stop claims nothing: ' + JSON.stringify(r.lines));
  }
  {
    // the line is said only for a stop the STATION proves (review 2026-10-14): /api/cancel answers 200 for an id it no longer
    // holds, so a report that finished between the read and the stop, or a 'reviewing' row left over from a restart, used to
    // print "STOP also ended the report…" over nothing. { stopped:false }, or an answer that does not say, claims nothing.
    for (const answer of [{ ok: true, stopped: false }, { ok: true }]) {
      const cancels = [];
      const r = stopRig({ Harness: { cancel: rid => { cancels.push(rid); return Promise.resolve(answer); }, api: { get: async () => ({ reviews: [{ status: 'reviewing', parentStreamId: 'ws1', reviewRunId: 'review-run-1' }] }) } } });
      Channels.begin('ws1', Date.now());
      r.ctx.__stop('click');
      for (let i = 0; i < 5; i++) await new Promise(res => setTimeout(res, 0));
      A.eq(cancels, ['review-run-1'], 'the stop is still asked for (' + JSON.stringify(answer) + ')');
      A.ok(!r.lines.some(l => /report/i.test(l)), 'a stop the station did not prove claims nothing (' + JSON.stringify(answer) + '): ' + JSON.stringify(r.lines));
    }
  }
  {
    // THE STATION HALF OF THE CONTRACT (review 2026-10-14). The page finds the report by reading GET /api/overseer for a row
    // { status:'reviewing', parentStreamId:<this conversation>, reviewRunId } and stops it by that id through /api/cancel.
    // Nothing above can see the station, so these pins break the moment either side stops matching.
    const idx = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');
    const ovs = fs.readFileSync(path.join(__dirname, '../sidecar/overseer.js'), 'utf8');
    const tick = A.fnBody(idx, 'async function tickOverseer');
    A.ok(tick.length > 1000, 'tickOverseer located');
    const thread = tick.indexOf('await overseer.withThread(parent.id, async () => {');
    const patch = tick.indexOf("overseer.patchReview(review.id, { status: 'reviewing', reviewRunId: runId");
    const reg = tick.indexOf('runs.set(runId, reviewAbort);');
    const run = tick.indexOf('signal: reviewAbort.signal, streamId: parent.id, runId,');
    A.ok(thread > 0 && patch > thread && reg > patch && run > reg, 'inside the conversation\'s turn, the report row reads reviewing + its run id, then that run id is registered in runs (what /api/cancel stops), then the report runs on that signal for that conversation');
    A.ok(!/await/.test(tick.slice(patch, reg)), 'nothing awaits between the row naming the run and the run becoming stoppable');
    A.ok(tick.slice(reg).includes('finally { runs.delete(runId);'), 'and it leaves runs when it ends (a stop after that proves nothing)');
    const routeAt = idx.indexOf("{ m: 'GET', exact: '/api/overseer', h:");
    A.ok(routeAt > 0 && idx.slice(routeAt, routeAt + 300).includes('respondJson(res, 200, { ...overseer.snapshot(),'), 'GET /api/overseer hands the page overseer.snapshot() as is (reviews included)');
    A.ok(A.fnBody(ovs, 'function snapshot').includes('reviews: copy(state.reviews)'), 'the snapshot lists every review row unchanged');
    A.ok(A.fnBody(ovs, 'function freshReviews').includes('parentStreamId: lead.parentStreamId,'), 'a report row carries the conversation it reports into');
    // and /api/cancel says whether it stopped anything: run the REAL handler against the real respond.js helpers
    const respond = require('../sidecar/respond.js');
    const cancelSrc = A.fnBody(idx, 'async function handleCancel');
    A.ok(cancelSrc.length > 100, 'handleCancel located');
    const call = async (body, runs, handles) => {
      const out = { code: 0, headers: null, body: '' };
      const res = { headersSent: false, writeHead(c, h) { out.code = c; out.headers = h || null; this.headersSent = true; }, end(b) { out.body = String(b == null ? '' : b); } };
      const readBody = async () => body;
      const fn = new Function('readJsonBody', 'readBody', 'respondJson', 'runs', 'runStopHandles', cancelSrc + ';return handleCancel;')(respond.readJsonBody, readBody, respond.json, runs, handles);
      await fn({}, res);
      return out;
    };
    const bodyOf = o => { try { return JSON.parse(o.body); } catch (e) { return 'not json: ' + o.body; } };
    const aborted = [];
    const live = new Map([['review-run-1', { abort: () => aborted.push('review-run-1') }]]);
    const hop = new Map([['hop-1', { abort: () => aborted.push('hop-1') }]]);
    let o = await call(JSON.stringify({ runId: 'review-run-1' }), live, new Map());
    A.eq([o.code, bodyOf(o), aborted], [200, { ok: true, stopped: true }, ['review-run-1']], 'a live run is aborted and the answer says it was stopped');
    o = await call(JSON.stringify({ runId: 'hop-1' }), new Map(), hop);
    A.eq([o.code, bodyOf(o)], [200, { ok: true, stopped: true }], 'a routine/line run reached by its stop handle is stopped too');
    o = await call(JSON.stringify({ runId: 'gone' }), live, hop);
    A.eq([o.code, bodyOf(o)], [200, { ok: true, stopped: false }], 'an id the station no longer holds still answers 200 (nothing to stop is not an error) but says nothing was stopped');
    o = await call('{not json', live, hop);
    A.eq(o.code, 400, 'bad json is still a 400');
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
