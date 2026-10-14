/* node test/queued-send-now.test.js — source-lock: a queued follow-up's SEND NOW key steers the LIVE run.

   Andrew 2026-10-14: "user sends prompt, user wants to send new messages that steers the last prompt". Enter
   while busy keeps QUEUEING (type-ahead pills); each pill carries a `send now` key that POSTs its text to the
   run's steer buffer (/api/run/steer → loop.js folds it before the next step). The promise that must hold:
     · the pill leaves the queue while the POST flies, so flushQueued can never ALSO send it as a new turn;
     · every refusal (no confirmed runId, 404/409 run ended, 429 full, network) puts it back at the FRONT of the
       queue with a line saying why — a send-now is never silently dropped;
     · success claims only what a 200 proves (the sidecar holds it), never that the agent already acted on it.

   chat.js is browser-flow (DOM + streaming), not node-loadable — locked by reading the source (the
   steer-idle-honesty mold). */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../frontend/app/chat.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../frontend/css/app.css'), 'utf8');

const render = /function\s+renderQueued\s*\(\)\s*\{([\s\S]*?)\n  \}/.exec(src);
A.ok(render, 'renderQueued exists in chat.js');
const rb = render ? render[1] : '';
A.ok(/className = 'queued-now'/.test(rb), 'every queued pill gets a queued-now key');
A.ok(/sendQueuedNow\(/.test(rb), 'the key calls sendQueuedNow');

const fn = /function\s+sendQueuedNow\s*\(id, i, text\)\s*\{([\s\S]*?)\n  \}/.exec(src);
A.ok(fn, 'sendQueuedNow exists in chat.js');
const body = fn ? fn[1] : '';

A.ok(/\/api\/run\/steer/.test(body), 'send now POSTs to the live run steer buffer');
A.ok(/Channels\.runIdOf\(id\)/.test(body), 'it addresses the run by its confirmed runId only');
A.ok(/if \(!rid[^\n]*return back\(/.test(body), 'no confirmed runId → back to the queue, never a blind POST');

// the pill leaves the queue BEFORE the POST (so flushQueued can't double-send it)
const spliceAt = body.indexOf('a.splice(at, 1)');
const fetchAt = body.indexOf("fetch('/api/run/steer'");
A.ok(spliceAt > 0 && fetchAt > spliceAt, 'the pill is taken off the queue before the steer POST');

// every refusal path re-queues at the FRONT and flushes (the run may have ended mid-request)
A.ok(/const back = [\s\S]*?a\.unshift\(text\)[\s\S]*?flushQueued\(id\)/.test(body), 'refusal: unshift back to the front + flushQueued');
A.ok(/status === 409/.test(body) && /status === 429/.test(body), 'refusal lines name 409 (run ended) and 429 (buffer full)');
A.ok(/\.catch\(\(\) => back\(/.test(body), 'a network failure re-queues too');

// success line promises the next step only — the [steering] transcript row is the proof it landed
A.ok(/j && j\.ok/.test(body), 'success is read from the sidecar body, not just the HTTP status');
A.ok(/before its next step/.test(body), 'success line promises only the next step');

// Enter while busy still QUEUES (Andrew's call: send now is opt-in per pill)
const soq = /function\s+sendOrQueue\s*\(text\)\s*\{([\s\S]*?)\n  \}/.exec(src);
A.ok(soq && /if \(isBusy\(\)\) \{\s*enqueue\(value\)/.test(soq[1]), 'Enter while busy still queues');

A.ok(/\.queued-now\s*\{[^}]*border: 1px solid var\(--ph-dim\)/.test(css), 'the key is skinned station hardware (no OS paint)');

A.report('queued-send-now.test');
