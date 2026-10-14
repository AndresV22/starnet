/* node test/page-closed-line.test.js — rc-walk FINDINGS #60 (2026-10-13): a page reload while a run waits on an approval
   cancels the run (the disconnect law) and denies the ask. The reloaded conversation used to show nothing at all — the
   run just vanished ("stops without saying why"). Now:
     · the host notes which of the run's OWN approvals were open when its stream closed (index.js notePageClosed),
     · the run record keeps it, bounded (runstore `pageClosed`),
     · the conversation projection turns it into ONE station line after that run's rows (transcriptstore
       projectConversation) — the same transcriptPending shape the interrupted-dispatch line uses, so the desk and phone
       merges take the station's copy on every read and never stack it.
   The real-sidecar proof (a real disconnect mid-approval, and STOP getting no such line) is
   test/e2e.approval-lifecycle.test.js; this pins the pure pieces and the host wiring. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const { makeRunStore } = require('../sidecar/runstore.js');
const { projectConversation } = require('../sidecar/transcriptstore.js');

function memIo() { const lines = []; return { lines, readAll() { return lines.slice(); }, append(e) { lines.push(e); } }; }
const clock = { now: () => 5000 };

// ---- runstore: the note is recorded bounded, and only when present ----
{
  const s = makeRunStore({ io: memIo(), clock });
  const e = s.record({ runId: 'r1', agentId: 'agent', reason: 'cancelled', pageClosed: { at: 4200, waitingOn: ['your approval to write a.md', '', '  x  '.repeat(80), 'b', 'c', 'd', 'e'] } });
  A.ok(e.pageClosed && e.pageClosed.at === 4200, 'the run record keeps when the page closed');
  A.eq(e.pageClosed.waitingOn.length, 4, 'waitingOn is capped at four entries (blanks dropped)');
  A.eq(e.pageClosed.waitingOn[0], 'your approval to write a.md', 'each entry is the plain words the host wrote');
  A.ok(e.pageClosed.waitingOn.every(w => w.length <= 200), 'each entry is bounded');
  const plain = s.record({ runId: 'r2', agentId: 'agent', reason: 'done' });
  A.ok(!('pageClosed' in plain), 'a run whose page never closed keeps its exact old shape');
  const junk = s.record({ runId: 'r3', agentId: 'agent', reason: 'cancelled', pageClosed: 'yes' });
  A.ok(!('pageClosed' in junk), 'a non-object note is dropped at the persistence boundary');
}

// ---- projection: one station line after the run's last row, only for a cancelled run that waited on an approval ----
const runs = {
  closed: { runId: 'closed', reason: 'cancelled', endedAt: 900, pageClosed: { at: 880, waitingOn: ['your approval to write opportunity-brief.md'] } },
  idle: { runId: 'idle', reason: 'cancelled', pageClosed: { at: 990, waitingOn: [] } },
  stopped: { runId: 'stopped', reason: 'cancelled' },
  finished: { runId: 'finished', reason: 'done', pageClosed: { at: 1, waitingOn: ['your approval to write x.md'] } }
};
const row = (id, role, content, ts) => ({ streamId: 'ws_a', agentId: 'agent', role, content, ts, sourceRunId: id });
{
  const turns = [
    row('closed', 'user', 'write the brief yourself', 100),
    row('closed', 'assistant', '', 110),
    row('closed', 'tool', 'ERROR: consent denied for fs.write: denied', 120),
    row('stopped', 'user', 'again please', 200),
    row('idle', 'user', 'and once more', 300),
    row('finished', 'user', 'last one', 400),
    row('finished', 'assistant', 'Done.', 410)
  ];
  const out = projectConversation(turns, id => runs[id] || null);
  const lines = out.filter(t => t.sys);
  A.eq(lines.length, 1, 'exactly one station line: the run that waited on an approval when its page closed');
  const line = lines[0] || {};
  A.eq(out.indexOf(line), 3, 'the line sits right after that run\'s last row (before the next request)');
  A.eq(line.content, '■ the run ended when this page closed or reloaded while it waited for your approval to write opportunity-brief.md — nothing was approved',
    'the line names what waited and that nothing was approved');
  A.eq(line.transcriptPending, true, 'the line is the station\'s copy (merges replace, never stack it)');
  A.eq(line.error, true, 'the line is a status row the model never reads back as its own words');
  A.eq(line.role, 'assistant', 'it renders where the run\'s reply would have been');
  A.eq(line.sourceRunId, 'closed', 'the line belongs to the run that ended');
  A.eq(line.ts, 880, 'stamped with when the page closed');
  A.eq(out.length, turns.length + 1, 'every original row is kept');
  // a second read of the same transcript yields the same single line (re-sent each read, never accumulated)
  A.eq(projectConversation(turns, id => runs[id] || null).filter(t => t.sys).length, 1, 'a re-read still carries one line');
}
{
  // two such runs in one conversation: each gets its own line after its own rows
  const runs2 = { a: Object.assign({}, runs.closed, { runId: 'a' }), b: Object.assign({}, runs.closed, { runId: 'b', pageClosed: { at: 5, waitingOn: ['your approval to run a command: npm test', 'your approval to write c.md'] } }) };
  const out = projectConversation([row('a', 'user', 'one', 1), row('b', 'user', 'two', 2), row('b', 'tool', 'x', 3)], id => runs2[id] || null);
  A.eq(out.map(t => t.sys ? 'LINE:' + t.sourceRunId : t.sourceRunId + ':' + t.role).join(','), 'a:user,LINE:a,b:user,b:tool,LINE:b', 'each run\'s line follows its own rows');
  A.ok(/run a command: npm test and your approval to write c\.md/.test(out[4].content), 'several open approvals are all named');
}

// ---- host wiring (sidecar/index.js; never require()d — it boots a real sidecar) ----
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'index.js'), 'utf8');
  const close = /res\.on\('close', \(\) => \{\s*if \(!leadOver && !ac\.signal\.aborted && !internal\) \{ try \{ notePageClosed\(runId, pending\); \}/.test(src);
  A.ok(close, 'handleRun notes the open approvals only when the CLOSE is what stops a live run (STOP / E-STOP abort the signal first)');
  A.ok(/leadOver = true;\s*pageClosedRuns\.delete\(runId\);/.test(src), 'the note never outlives its run (dropped in the finally, after the record read it)');
  A.ok(/pageClosed: pageClosedRuns\.get\(runId\) \|\| null \}\);/.test(src), 'runOnce writes the note into the run record');
  const note = src.slice(src.indexOf('function notePageClosed('), src.indexOf('function notePageClosed(') + 900);
  A.ok(/f\.detached/.test(note) && /brief\.ask/.test(note), 'a background worker\'s ask and a question are not counted (they outlive / restore on their own)');
  // a background worker's ask answered after its lead's turn ended: "full" still names the lead whose broker it rides
  A.ok(/const agentId = \(meta && meta\.agentId\) \|\| \(finish && finish\.detached && finish\.askRow && finish\.askRow\.agentId\) \|\| undefined;/.test(src),
    'POST /api/consent resolves the agent for a background ask whose lead run already ended');
}

A.report('page-closed-line.test');
