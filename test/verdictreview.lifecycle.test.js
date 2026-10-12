'use strict';
const assert = require('node:assert/strict');
const { makeVerdictReview } = require('../sidecar/verdictreview.js');
const { buildLearningEvidence } = require('../sidecar/learningevidence.js');
const clone = value => JSON.parse(JSON.stringify(value));
async function main() {
  let time = 1000, disk = [], timers = [];
  const opts = { now: () => time, graceMs: 5000, retryMs: 100, maxAttempts: 3,
    setTimeout: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; },
    clearTimeout: h => { if (h) h.live = false; },
    onChange: rows => { disk = clone(rows); } };
  const runTimers = async () => { const jobs = timers; timers = []; for (const h of jobs) if (h.live) h.fn(); await Promise.resolve(); await Promise.resolve(); };
  const packet = { agentId: 'a', learningEvidence: { version: 1, source: 'host', tainted: true }, messages: [] };
  const longCorrection = 'Always use CSV. ' + 'x'.repeat(700) + ' Correction: use JSON instead.';
  const a = makeVerdictReview(opts);
  a.stash('r1', packet); a.arm('r1', 'miss', () => { throw new Error('old process must not launch'); }, longCorrection);
  assert.equal(disk[0].state, 'held');
  assert.equal(disk[0].correctionTruncated, true);
  assert.equal(disk[0].correctionOriginalChars, longCorrection.length);
  assert.equal(disk[0].packet.learningEvidence.correction.durableInstructionEligible, false);
  const saved = clone(disk); timers = []; time += 2000;
  const fired = [], b = makeVerdictReview(opts);
  assert.equal(b.restore(saved), 1); assert.equal(b.holding('r1'), true);
  assert.equal(b.resumeHeld(job => { fired.push(job); }), 1);
  assert.equal(timers[0].ms, 3000, 'remaining grace is retained across restart');
  time += 3000; await runTimers();
  assert.equal(fired.length, 1); assert.equal(fired[0].restored, true);
  assert.equal(buildLearningEvidence(fired[0]).correction.durableInstructionEligible, false, 'restored truncated prefix never becomes a complete correction');
  assert.equal(b.holding('r1'), false);
  const completedSnapshot = clone(disk), c = makeVerdictReview(opts);
  assert.equal(c.restore(completedSnapshot), 0, 'persisted completion does not relaunch after restart');
  const corrected = [];
  b.stash('r2', packet); b.arm('r2', 'miss', job => corrected.push(job));
  assert.equal(b.correct('r2', longCorrection, true, 'message').fired, true);
  assert.equal(buildLearningEvidence(corrected[0]).correction.durableInstructionEligible, false, 'correct() preserves late reversal truncation evidence too');
  b.stash('retry', packet);
  let calls = 0;
  b.arm('retry', 'miss', async () => { calls++; return calls > 1; });
  time += 5000; await runTimers();
  assert.equal(calls, 1); assert.equal(b.holding('retry'), true);
  assert.equal(disk.find(r => r.runId === 'retry').reviewStatus, 'pending');
  const retrySnapshot = clone(disk); timers = [];
  const d = makeVerdictReview(opts); d.restore(retrySnapshot);
  assert.equal(d.resumeHeld(() => { calls++; return true; }), 1);
  time += 100; await runTimers();
  assert.equal(calls, 2); assert.equal(d.holding('retry'), false, 'failed launcher retained and resumed exactly once after restart');
  const e = makeVerdictReview(opts); e.stash('exhaust', packet); let attempts = 0;
  e.arm('exhaust', 'miss', () => { attempts++; return false; });
  for (let i = 0; i < 4; i++) { time += 5000; await runTimers(); }
  assert.equal(attempts, 3); assert.equal(disk.find(r => r.runId === 'exhaust').reviewStatus, 'retry-exhausted');
  const many = buildLearningEvidence({ learningEvidence: { version: 1, source: 'host', tainted: true,
    trustedUserMessages: Array.from({ length: 70 }, (_, i) => ({ source: 'interactive-owner', index: i, content: i === 69 ? 'Correction: use JSON.' : 'earlier instruction ' + i })) } });
  assert.equal(many.directives[0].messageIndex, 0);
  assert.equal(many.directives.at(-1).messageIndex, 69);
  assert.equal(many.directives.at(-1).durableInstructionEligible, true);
  assert.ok(many.omissions.directives > 0);
  const mixed = buildLearningEvidence({ learningEvidence: { version: 1, source: 'host', trustedUserMessages: Array.from({ length: 70 }, (_, i) => ({ source: 'interactive-owner', index: i, content: 'trusted-' + i })) },
    messages: Array.from({ length: 100 }, (_, i) => ({ role: 'user', content: 'unattributed-' + i })) });
  assert.equal(mixed.directives.at(-1).text, 'trusted-69', 'unattributed messages cannot evict the newest host correction');
  console.log('verdictreview.lifecycle: held snapshot/restart, remaining grace, late reversal, launcher retry/restart, bounded attempts, latest host correction PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
