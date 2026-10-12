/* Independent behavioral suites and a provider-backed runner over an isolated,
   in-memory workspace. No host files, shell, network tools, or approval bypass. */
'use strict';
const { runAgentLoop: defaultLoop } = require('./loop.js');
const { digestSkill } = require('./skillevaluation.js');
const copy = v => JSON.parse(JSON.stringify(v));
function createArtifactWorkflowSuite(skillName) {
  const makeCase = (id, heldOut, rows, expected) => ({
    id, heldOut,
    prompt: 'Prepare a finance report from input.json. Group non-void invoices by account, sum amountCents (including negative credits), and sort account names ascending. Write report.json as {"accounts":[{"account":string,"totalCents":number}],"totalCents":number}. Read the saved report back before finishing. Do not change input.json.',
    fixtures: { 'input.json': JSON.stringify(rows) }, writablePaths: ['report.json'],
    checks: [
      { id: 'accurate-report', kind: 'artifact_json_equal', path: 'report.json', expected },
      { id: 'source-preserved', kind: 'artifact_json_equal', path: 'input.json', expected: rows },
      { id: 'verified-saved-report', kind: 'tool_call', name: 'fs.read', arguments: { path: 'report.json' } }
    ]
  });
  return { id: 'artifact-workflow:' + skillName, skillName, version: 1,
    description: 'Accounting transformation, preservation of the source, and observed verification of the saved artifact.',
    cases: [
      makeCase('group-and-exclude-void', false, [
        { account: 'Beta', amountCents: 140, void: false }, { account: 'Alpha', amountCents: 250, void: false },
        { account: 'Beta', amountCents: 60, void: false }, { account: 'Alpha', amountCents: 999, void: true }
      ], { accounts: [{ account: 'Alpha', totalCents: 250 }, { account: 'Beta', totalCents: 200 }], totalCents: 450 }),
      makeCase('credit-and-zero-balance', true, [
        { account: 'Cedar', amountCents: 400, void: false }, { account: 'Cedar', amountCents: -400, void: false },
        { account: 'Aster', amountCents: 310, void: false }, { account: 'Aster', amountCents: -15, void: false },
        { account: 'Birch', amountCents: 900, void: true }
      ], { accounts: [{ account: 'Aster', totalCents: 295 }, { account: 'Cedar', totalCents: 0 }], totalCents: 295 })
    ] };
}
function createTaskHandoffSuite(skillName) {
  return { id: 'task-handoff:' + skillName, skillName, version: 1,
    description: 'Preserve user corrections, scope, and observed task state in a structured continuation handoff.',
    cases: [
      { id: 'correction-and-unverified-work', heldOut: false,
        prompt: 'Return only a JSON handoff with keys objective, destination, verified, nextAction. User first requested a CSV export, then corrected the format to JSON and destination to reports/final.json. The file was written, but no read-back or test occurred. The objective remains exporting active accounts. Use objective="export active accounts"; destination is the current requested path; verified is a boolean; nextAction is "verify saved file" or "deliver verified file" according to observed evidence.',
        checks: [{ id: 'scope-and-proof', kind: 'json_equal', expected: { objective: 'export active accounts', destination: 'reports/final.json', verified: false, nextAction: 'verify saved file' } }] },
      { id: 'successful-check-and-later-pivot', heldOut: true,
        prompt: 'Return only a JSON handoff with keys objective, destination, verified, nextAction. A weekly report at reports/week.json was written and successfully verified. The user then changed the objective to exporting inactive accounts into reports/archive.json; that new file has not been written. Use objective="export inactive accounts"; destination is the latest requested path; verified is a boolean about the CURRENT task; nextAction is "write requested file" or "deliver verified file" according to observed evidence.',
        checks: [{ id: 'do-not-transfer-old-success', kind: 'json_equal', expected: { objective: 'export inactive accounts', destination: 'reports/archive.json', verified: false, nextAction: 'write requested file' } }] }
    ] };
}
function makeAgentLoopCaseRunner(options) {
  const o = options || {};
  if (!o.provider || typeof o.provider.stream !== 'function') throw new Error('evaluation provider required');
  const loop = o.runAgentLoop || defaultLoop;
  const clock = o.clock || { now: () => 0 };
  const tools = [
    { type: 'function', function: { name: 'fs_read', description: 'Read a file in the isolated evaluation workspace.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } },
    { type: 'function', function: { name: 'fs_write', description: 'Write an allowed output in the isolated evaluation workspace.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } } }
  ];
  return async function runCase({ task, skill, phase, signal }) {
    // The parent host must decide whether spending is allowed; this callback can
    // deny for budget/paused policy, but never expands the supplied tool surface.
    if (typeof o.authorize === 'function' && await o.authorize({ taskId: task.id, phase }) !== true) return { reason: 'policy-denied' };
    const files = new Map(Object.entries(task.fixtures || {}));
    const writable = new Set(task.writablePaths || []), toolCalls = [];
    const dispatch = async call => {
      const name = String(call.name || '').replace(/^fs_/, 'fs.');
      const args = call.args || {};
      let result;
      if (name === 'fs.read' && typeof args.path === 'string' && files.has(args.path)) result = { ok: true, isError: false, content: files.get(args.path) };
      else if (name === 'fs.write' && writable.has(args.path) && typeof args.content === 'string' && Buffer.byteLength(args.content) <= 65536) {
        files.set(args.path, args.content); result = { ok: true, isError: false, content: 'Saved ' + args.path };
      } else result = { ok: false, isError: true, content: 'Unavailable file, unsupported operation, or invalid output in the isolated evaluation workspace.' };
      toolCalls.push({ name, arguments: copy(args), ok: result.ok });
      return result;
    };
    const activeSkill = skill && skill.state !== 'archived' ? skill : null;
    const supportFiles = activeSkill && activeSkill.files ? (Array.isArray(activeSkill.files) ? activeSkill.files : Object.values(activeSkill.files)) : [];
    const skillContext = activeSkill ? '\nProcedure under evaluation:\n' + (activeSkill.body || '') + '\n' + (activeSkill.setup || '') +
      supportFiles.filter(f => f.encoding !== 'base64').map(f => '\nSupporting file ' + f.path + ':\n' + f.content).join('') : '';
    const runId = 'skill-eval-' + task.id + '-' + phase + '-' + digestSkill(skill).slice(0, 12);
    const result = await loop({
      messages: [{ role: 'system', content: 'Complete the task using the isolated workspace tools when needed. Report only work actually completed. The task supplies the required output contract.' + skillContext }, { role: 'user', content: task.prompt }],
      provider: o.provider, model: o.model, cost: o.cost, clock, signal, tools: tools.map(copy), dispatch,
      capCtx: { signal }, limits: { maxIters: 8, grace: false, ...(o.limits || {}) }, emit: o.emit || (() => {}),
      agentId: 'skill-evaluation', runId, trigger: 'event'
    });
    if (typeof o.onRun === 'function') await o.onRun({ result, runId, taskId: task.id, phase });
    let value;
    const final = (result.messages || []).filter(m => m.role === 'assistant' && typeof m.content === 'string').at(-1);
    if (final) { try { value = JSON.parse(final.content); } catch (_) { value = undefined; } }
    return { reason: result.reason, value, artifacts: Object.fromEntries(files), toolCalls };
  };
}
module.exports = { createArtifactWorkflowSuite, createTaskHandoffSuite, makeAgentLoopCaseRunner };
