/* node test/steer-history-merge.test.js — a steered reply survives the canonical transcript merge ONCE, with its note.

   A steering note folded mid-run (/steer or a queued pill's SEND NOW) streams into the local reply as a
   '\n[steering] …\n' line; the sidecar's durable transcript stores only the model's own turns. The merge matched
   twins on exact bytes, so the steered local row never found its durable twin and a reload showed the reply TWICE
   (live walk 2026-10-14). Twins now match without the steering lines, and the local row — which still carries the
   note so renderHistory can redraw it as its own dim row — is the one kept. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../frontend/app/chat.js'), 'utf8');
const merge = new Function(A.fnBody(source, 'function mergeCanonicalHistory(local, turns)') + '; return mergeCanonicalHistory;')();

// single durable turn: one row, steer line kept, durable identity enriched onto it
{
  const out = merge([
    { role: 'user', content: 'run the slow job', sourceRunId: 'r1' },
    { role: 'assistant', content: '\n[steering] use the blue folder\nDone with the blue folder.', sourceRunId: 'r1' }
  ], [
    { role: 'user', content: 'run the slow job', sourceRunId: 'r1', rowId: 'u1' },
    { role: 'assistant', content: 'Done with the blue folder.', sourceRunId: 'r1', rowId: 'a1', ts: 5 }
  ]);
  const replies = out.filter(m => m.role === 'assistant');
  A.eq(replies.length, 1, 'a steered reply and its durable twin merge into ONE row');
  A.ok(/\[steering\] use the blue folder/.test(replies[0].content), 'the merged row keeps the steering note');
  A.eq(replies[0].rowId, 'a1', 'the durable identity enriches the local row');
}

// several durable turns (prose before a tool call, then the final answer): still one row, no re-inserts
{
  const out = merge([
    { role: 'user', content: 'go', sourceRunId: 'r2' },
    { role: 'assistant', content: 'Looking now.\n[steering] skip the tests\nFinished, tests skipped.', sourceRunId: 'r2' }
  ], [
    { role: 'user', content: 'go', sourceRunId: 'r2' },
    { role: 'assistant', content: 'Looking now.', sourceRunId: 'r2' },
    { role: 'assistant', content: 'Finished, tests skipped.', sourceRunId: 'r2' }
  ]);
  const replies = out.filter(m => m.role === 'assistant');
  A.eq(replies.length, 1, 'a steered multi-turn reply stays one row (its durable parts do not re-insert)');
  A.ok(/\[steering\] skip the tests/.test(replies[0].content), 'the aggregate row keeps the steering note');
}

// an unsteered aggregate still defers to the durable turns (unchanged behavior)
{
  const out = merge([
    { role: 'user', content: 'go', sourceRunId: 'r3' },
    { role: 'assistant', content: 'Looking now.Finished.', sourceRunId: 'r3' }
  ], [
    { role: 'user', content: 'go', sourceRunId: 'r3' },
    { role: 'assistant', content: 'Looking now.', sourceRunId: 'r3' },
    { role: 'assistant', content: 'Finished.', sourceRunId: 'r3' }
  ]);
  A.eq(out.filter(m => m.role === 'assistant').map(m => m.content), ['Looking now.', 'Finished.'], 'an unsteered aggregate still yields the durable turns');
}

// renderHistory redraws the note as its own steer-echo row, never as agent prose
const rh = A.fnBody(source, 'function renderHistory(onlyTurns)');
A.ok(/\(\?:\^\|\\n\)\\\[steering\\\] \(\[\^\\n\]\*\)\\n\?/.test(rh), 'renderHistory splits steering lines out of the reply');
A.ok(/classList\.add\('tool', 'steer-echo'\)/.test(rh), 'a replayed steering note is a steer-echo row');

A.report('steer-history-merge.test');
