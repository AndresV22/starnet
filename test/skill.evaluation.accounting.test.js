'use strict';
const assert = require('node:assert/strict');
const { makeAgentLoopCaseRunner } = require('../sidecar/skill-evaluation-runner.js');
const { makeCostEngine } = require('../sidecar/cost.js');
const { makeLedger } = require('../sidecar/ledger.js');
const { makeBudget } = require('../sidecar/budget.js');
const { makeEvaluationAccounting } = require('../sidecar/skill-evaluation-accounting.js');
const usage = { type: 'usage', usage: { prompt_tokens: 12, completion_tokens: 4, cost: 0.01 } };
const text = { type: 'text', delta: '{"answer":42}' };
const done = { type: 'done', finishReason: 'stop' };
const task = { id: 'accounting', prompt: 'Return only JSON {"answer":42}.' };
async function execute(stream, signal, options = {}) {
  let result, count = 0;
  const provider = { async *stream(request) { count++; assert.equal(request.preStreamRetries, 0); yield* stream(request, count); }, contextLimit: () => 8000 };
  const runner = makeAgentLoopCaseRunner({ provider, model: 'scripted/accounting', runIdPrefix: 'stream-accounting', clock: { now: () => 1 },
    cost: makeCostEngine({ priceOf: () => ({ in: 1, out: 1 }) }), limits: { maxIters: 2, grace: false, continueGuard: false, emptyRetry: false },
    ...options, beforeRun: async () => true, onRun: async row => { result = row.result; } });
  const observation = await runner({ task, skill: null, phase: 'after', signal });
  return { result, count, observation };
}
// A two-turn tool loop (read, then answer) on a model nothing can price, wired through the host's real
// evaluation accounting and ledger, as index.js wires it.
async function evaluateUnpriced(unmetered, script) {
  const pending = new Map(), rows = [], marked = [];
  const io = { readAll: () => rows.slice(), unsettled: () => [...pending.values()], beginRun: r => pending.set(r.runId, r), finishRun: e => pending.delete(e.runId), append: e => rows.push(e) };
  const ledger = makeLedger({ io, clock: { now: () => 1 } });
  const accounting = makeEvaluationAccounting({ ledger: Object.assign({}, ledger, { markUnsettled: runId => { marked.push(runId); return ledger.markUnsettled(runId); } }),
    agentId: 'owner', provider: unmetered ? 'ollama' : 'custom', model: 'local/unpriced', unmetered });
  let count = 0, result, error = null, observation;
  const provider = { async *stream() { count++; yield* script(count); }, contextLimit: () => 8000 };
  const runner = makeAgentLoopCaseRunner({ provider, model: 'local/unpriced', runIdPrefix: 'unpriced-' + (unmetered ? 'free' : 'metered'), clock: { now: () => 1 },
    cost: makeCostEngine({ priceOf: () => null }), unmetered, limits: { maxIters: 3, grace: false, continueGuard: false, emptyRetry: false },
    beforeRun: accounting.beforeRun, onStream: accounting.onStream, onRun: async row => { result = row.result; return accounting.onRun(row); } });
  const unpricedTask = { id: 'unpriced', prompt: 'Read input.json, then return only JSON {"answer":42}.', fixtures: { 'input.json': '{"answer":42}' } };
  try { observation = await runner({ task: unpricedTask, skill: null, phase: 'after' }); } catch (e) { error = e; }
  const strict = makeBudget({ ledger, caps: { day: 1 }, clock: { now: () => 1 } });
  return { count, result, error, observation, marked, rows, ledger, admission: strict.check(null, 'owner', 0) };
}
async function* readThenAnswer(attempt) {
  const freeUsage = { type: 'usage', usage: { prompt_tokens: 12, completion_tokens: 4 } };   // Ollama: tokens, no price
  if (attempt === 1) {
    yield { type: 'tool_start', index: 0, id: 'read', name: 'fs_read' };
    yield { type: 'tool_args', index: 0, chunk: '{"path":"input.json"}' };
    yield freeUsage; yield { type: 'done', finishReason: 'tool_calls' };
  } else { yield text; yield freeUsage; yield done; }
}
async function main() {
  // UNMETERED (Ollama, OAuth subscriptions): a complete attempt nothing could price is known $0, as runOnce books it.
  const free = await evaluateUnpriced(true, readThenAnswer);
  assert.equal(free.error, null, 'an unmetered evaluation run settles: ' + (free.error && free.error.message));
  assert.equal(free.count, 2, 'the tool loop second turn on an unmetered provider is not refused');
  assert.equal(free.result.reason, 'done');
  assert.equal(free.result.accountingIncomplete, false);
  assert.deepEqual(free.observation.value, { answer: 42 });
  assert.deepEqual(free.marked, [], 'a free local call never leaves an unsettled spend receipt');
  assert.equal(free.rows.length, 1); assert.equal(free.rows[0].unmetered, true); assert.equal(free.rows[0].usd, 0);
  assert.equal(free.ledger.health().complete, true);
  assert.equal(free.admission, null, 'paid dispatch under a strict cap is not blocked by a free evaluation');
  // An incomplete attempt stays unknown even on an unmetered provider.
  const freeBroken = await evaluateUnpriced(true, async function* () { yield text; throw new Error('connection reset after partial output'); });
  assert.match(String(freeBroken.error && freeBroken.error.message), /incomplete/);
  assert.ok(freeBroken.marked.length > 0); assert.equal(freeBroken.ledger.unsettledRuns().length, 1);
  // METERED but unpriced usage stays unknown: no second paid attempt, receipt left for the Commander to settle.
  const meteredUnpriced = await evaluateUnpriced(false, readThenAnswer);
  assert.equal(meteredUnpriced.count, 1, 'unknown metered spend refuses the next paid attempt');
  assert.match(String(meteredUnpriced.error && meteredUnpriced.error.message), /incomplete/);
  assert.ok(meteredUnpriced.marked.length > 0); assert.equal(meteredUnpriced.ledger.unsettledRuns().length, 1);
  assert.equal(meteredUnpriced.rows.length, 0);
  assert.equal(meteredUnpriced.admission.code, 'spend_history_unavailable');
  const good = await execute(async function* () { yield text; yield usage; yield done; });
  assert.equal(good.result.reason, 'done');
  assert.equal(good.result.accountingIncomplete, false);
  assert.equal(good.result.accountingStreams.complete, 1);
  const missing = await execute(async function* () { yield text; yield done; });
  assert.equal(missing.result.reason, 'done');
  assert.equal(missing.result.accountingIncomplete, true, 'a clean answer without usage cannot settle as zero');
  const emptyUsage = await execute(async function* () { yield text; yield { type: 'usage', usage: {} }; yield done; });
  assert.equal(emptyUsage.result.accountingIncomplete, true);
  const invalidFinal = await execute(async function* () { yield text; yield usage; yield { type: 'usage', usage: {} }; yield done; });
  assert.equal(invalidFinal.result.accountingIncomplete, true, 'earlier valid usage cannot authorize a malformed final snapshot');
  const shared = makeBudget({ ledger: makeLedger(), caps: { day: 0.005 }, clock: { now: () => 1 } });
  let concurrentAdmission;
  await execute(async function* () {
    yield usage;
    concurrentAdmission = shared.check('another-run', 'another-agent', 0);
    yield text; yield done;
  }, undefined, { onStream: ({ runId, spentUsd }) => shared.noteLive(runId, spentUsd) });
  assert.equal(concurrentAdmission.scope, 'day', 'observed usage blocks concurrent paid entry before the current stream ends');
  const broken = await execute(async function* () { yield text; throw new Error('invalid request after partial output'); });
  assert.equal(broken.result.accountingIncomplete, true);
  assert.equal(broken.result.accountingStreams.uncertain[0].errored, true);
  const controller = new AbortController();
  const cancelled = await execute(async function* () { yield text; controller.abort(); yield usage; yield done; }, controller.signal);
  assert.equal(cancelled.result.accountingIncomplete, true);
  assert.equal(cancelled.result.accountingStreams.uncertain[0].aborted, true);
  const retry = await execute(async function* (_, attempt) {
    yield text;
    if (attempt === 1) { const error = new Error('temporary connection reset'); error.code = 'ECONNRESET'; throw error; }
    yield usage; yield done;
  });
  assert.equal(retry.count, 1, 'unknown spend prevents the loop from dispatching another paid retry');
  assert.equal(retry.result.reason, 'policy-denied');
  assert.equal(retry.result.accountingIncomplete, true, 'unknown first-attempt spend stays unsettled');
  assert.ok(retry.result.accountingStreams.uncertain.some(row => row.attempt === 1 && !row.usageObserved));
  const length = await execute(async function* (_, attempt) { yield text; yield usage; yield { type: 'done', finishReason: attempt === 1 ? 'length' : 'stop' }; });
  assert.equal(length.result.accountingIncomplete, false, 'output length stop with complete usage is accounted');
  const entries = [], observed = [];
  const capped = await execute(async function* () {
    yield { type: 'tool_start', index: 0, id: 'read', name: 'fs_read' };
    yield { type: 'tool_args', index: 0, chunk: '{"path":"input.json"}' };
    yield usage; yield { type: 'done', finishReason: 'tool_calls' };
  }, undefined, {
    beforeStream: async ({ spentUsd }) => { entries.push(spentUsd); return spentUsd < 0.005; },
    onStream: async row => { observed.push(row); }
  });
  assert.deepEqual(entries, [0, 0.01], 'spending guard sees reconciled cost before each actual provider entry');
  assert.equal(capped.count, 1, 'policy stops the second tool-loop call');
  assert.equal(capped.result.reason, 'policy-denied');
  assert.equal(capped.result.accountingIncomplete, false, 'known charge is still safe to settle');
  assert.equal(capped.result.usd, 0.01);
  assert.equal(observed[0].spentUsd, 0.01);
  console.log('skill.evaluation.accounting: unmetered $0, metered unpriced, real loop usage, empty usage, partial throw, cancellation, retry uncertainty and billed length stop PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
