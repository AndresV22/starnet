'use strict';
const assert = require('node:assert/strict');
const { makeAgentLoopCaseRunner } = require('../sidecar/skill-evaluation-runner.js');
const { makeCostEngine } = require('../sidecar/cost.js');
const { makeLedger } = require('../sidecar/ledger.js');
const { makeBudget } = require('../sidecar/budget.js');
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
async function main() {
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
  console.log('skill.evaluation.accounting: real loop usage, empty usage, partial throw, cancellation, retry uncertainty and billed length stop PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
