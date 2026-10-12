/* Behavioral skill comparisons. Test manifests and runners are HOST inputs, never
   supplied by a candidate. Receipts grant no tool authority and approve nothing. */
'use strict';
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const SCHEMA = 'starnet.skill-evaluation.v1';
const KEY = 'skill-evaluation-receipts';
const MAX_CASES = 12, MAX_CHECKS = 24, MAX_RECEIPTS = 200;
const clone = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function digestSkill(skill) {
  if (!skill) return digest(null);
  const s = skill.skill || skill;
  const files = Array.isArray(s.files) ? s.files : Object.entries(s.files || {}).map(([path, f]) => ({ path, ...f }));
  return digest({
    name: s.name || '', summary: s.summary || '', description: s.description || s.summary || '', category: s.category || '',
    body: s.body || '', setup: s.setup || '', requires: s.requires || [], platforms: s.platforms || [],
    state: s.state || 'active', absorbedInto: s.absorbedInto || '',
    scope: s.scope || 'agent', projectRoot: s.projectRoot || '',
    files: files.map(f => ({ path: f.path, encoding: f.encoding || 'utf8', content: f.content || '' })).sort((a, b) => a.path.localeCompare(b.path)),
    packageFiles: (s.packageFiles || []).map(f => ({ path: f.path, encoding: f.encoding || 'base64', content: f.content || '' })).sort((a, b) => a.path.localeCompare(b.path))
  });
}
function validateSuite(suite) {
  if (!suite || typeof suite.id !== 'string' || !suite.id || typeof suite.skillName !== 'string' || !suite.skillName.trim()) throw new Error('evaluation suite must identify its task family and skillName');
  if (!Array.isArray(suite.cases) || suite.cases.length < 2 || suite.cases.length > MAX_CASES) throw new Error('evaluation needs 2 to 12 independently declared cases');
  if (!suite.cases.some(c => c.heldOut === true)) throw new Error('evaluation needs a held-out case');
  const ids = new Set();
  for (const c of suite.cases) {
    if (!c.id || ids.has(c.id) || typeof c.prompt !== 'string' || !c.prompt.trim()) throw new Error('invalid or duplicate evaluation case');
    ids.add(c.id);
    if (!Array.isArray(c.checks) || !c.checks.length || c.checks.length > MAX_CHECKS) throw new Error('each case needs bounded independent task checks');
    const checkIds = new Set();
    for (const check of c.checks) {
      if (!check.id || checkIds.has(check.id) || !['json_equal', 'artifact_json_equal', 'artifact_sha256', 'tool_call', 'process_exit'].includes(check.kind)) throw new Error('invalid task check');
      checkIds.add(check.id);
      if (check.kind.endsWith('equal') && !Object.hasOwn(check, 'expected')) throw new Error('task equality check needs a declared expected value');
      if (check.kind === 'artifact_sha256' && !/^[a-f0-9]{64}$/.test(check.expected)) throw new Error('artifact check needs a SHA-256 digest');
      if (check.kind === 'process_exit' && !Number.isInteger(check.expected)) throw new Error('process check needs a declared exit code');
      if (check.kind === 'tool_call' && (!check.name || !Object.hasOwn(check, 'arguments'))) throw new Error('tool check needs exact arguments');
    }
  }
  return clone(suite);
}
function getPath(value, parts) {
  let v = value;
  for (const part of (Array.isArray(parts) ? parts : [])) {
    if (!v || typeof v !== 'object' || !Object.hasOwn(v, part)) return undefined;
    v = v[part];
  }
  return v;
}
function assessCheck(check, observation) {
  let actual, present = true;
  if (check.kind === 'json_equal') actual = getPath(observation.value, check.path);
  else if (check.kind === 'artifact_json_equal' || check.kind === 'artifact_sha256') {
    const artifact = observation.artifacts && observation.artifacts[check.path];
    present = typeof artifact === 'string';
    if (present && check.kind === 'artifact_json_equal') {
      try { actual = JSON.parse(artifact); } catch (_) { present = false; }
    } else if (present) actual = crypto.createHash('sha256').update(artifact).digest('hex');
  } else if (check.kind === 'process_exit') {
    const execution = (observation.executions || []).find(e => e.id === check.executionId && e.completed === true);
    actual = execution && execution.exitCode; present = !!execution;
  } else if (check.kind === 'tool_call') {
    actual = (observation.toolCalls || []).some(call => call.name === check.name && call.ok === true && isDeepStrictEqual(call.arguments, check.arguments));
    return { id: check.id, kind: check.kind, pass: actual, observed: actual, expected: true };
  }
  if (actual === undefined) present = false;
  return { id: check.id, kind: check.kind, pass: present && isDeepStrictEqual(actual, check.expected), observed: present ? actual : null, expected: check.expected, present };
}
function assessCase(c, observation) {
  if (!observation || observation.reason !== 'done') return { caseId: c.id, completed: false, pass: false, checks: [], reason: observation && observation.reason || 'missing-observation' };
  const checks = c.checks.map(check => assessCheck(check, observation));
  return { caseId: c.id, completed: true, pass: checks.every(check => check.pass), checks };
}
function compareCases(cases) {
  const incomplete = cases.some(c => !c.before.completed || !c.after.completed);
  // Detect check-level regression even when a case was already failing elsewhere.
  const regressions = cases.filter(c => c.before.checks.some((check, i) => check.pass && !(c.after.checks[i] && c.after.checks[i].pass))).map(c => c.caseId);
  const improvements = cases.filter(c => c.before.completed && c.after.completed && c.after.checks.some((check, i) => check.pass && !c.before.checks[i].pass)).map(c => c.caseId);
  const allCandidatePassed = cases.every(c => c.after.pass);
  const status = incomplete ? 'insufficient_evidence' : regressions.length ? 'regression' : !allCandidatePassed ? 'failed' : !improvements.length ? 'insufficient_evidence' : 'passed';
  return { status, regressions, improvements, allCandidatePassed };
}
function validatePromotionReceipt(receipt, options) {
  const o = options || {};
  if (!receipt || receipt.schemaVersion !== SCHEMA || receipt.status !== 'passed') return { ok: false, reason: 'behavioral evaluation has not passed' };
  if (!o.suite) return { ok: false, reason: 'trusted evaluation test set is unavailable' };
  let suite;
  try { suite = validateSuite(o.suite); } catch (_) { return { ok: false, reason: 'invalid evaluation test set' }; }
  if (receipt.candidateDigest !== o.candidateDigest || receipt.baselineDigest !== o.baselineDigest) return { ok: false, reason: 'skill contents changed after evaluation' };
  if (!o.runnerDigest || receipt.runnerDigest !== o.runnerDigest) return { ok: false, reason: 'evaluation runner or model changed' };
  if (receipt.testSetDigest !== digest(suite) || receipt.suiteId !== suite.id) return { ok: false, reason: 'evaluation test set changed' };
  if (!['provider', 'executable'].includes(receipt.evidenceClass)) return { ok: false, reason: 'fixture evidence cannot authorize promotion' };
  if (!Array.isArray(receipt.cases) || receipt.cases.length !== suite.cases.length) return { ok: false, reason: 'incomplete evaluation cases' };
  const rebuilt = [];
  for (let i = 0; i < suite.cases.length; i++) {
    const c = suite.cases[i], saved = receipt.cases[i];
    if (!saved || saved.caseId !== c.id || saved.heldOut !== !!c.heldOut) return { ok: false, reason: 'evaluation case mismatch' };
    if (!saved.before || !saved.after || saved.before.checks.length !== c.checks.length || saved.after.checks.length !== c.checks.length) return { ok: false, reason: 'incomplete evaluation checks' };
    for (const phase of ['before', 'after']) {
      const result = saved[phase];
      for (let j = 0; j < c.checks.length; j++) {
        const expected = c.checks[j].kind === 'tool_call' ? true : c.checks[j].expected;
        const observed = result.checks[j];
        if (observed.id !== c.checks[j].id || observed.kind !== c.checks[j].kind || !isDeepStrictEqual(observed.expected, expected)) return { ok: false, reason: 'evaluation check mismatch' };
        const pass = observed.present !== false && isDeepStrictEqual(observed.observed, expected);
        if (observed.pass !== pass) return { ok: false, reason: 'evaluation check verdict mismatch' };
      }
      if (result.pass !== (result.completed && result.checks.every(check => check.pass))) return { ok: false, reason: 'evaluation case verdict mismatch' };
    }
    rebuilt.push(saved);
  }
  if (compareCases(rebuilt).status !== 'passed') return { ok: false, reason: 'candidate did not improve without regression' };
  return { ok: true, receiptId: receipt.receiptId };
}
function makeSkillEvaluator(options) {
  const o = options || {}, suites = new Map((o.suites || []).map(s => { const suite = validateSuite(s); return [suite.id, suite]; }));
  if (typeof o.runCase !== 'function' || !o.io || typeof o.io.get !== 'function' || typeof o.io.set !== 'function') throw new Error('evaluation needs a host runner and durable receipt store');
  const now = typeof o.clock === 'function' ? o.clock : () => 0;
  const evidenceClass = o.evidenceClass || 'fixture';
  const runnerIdentity = clone(o.runnerIdentity || { kind: 'fixture' });
  if (evidenceClass === 'provider' && (!runnerIdentity.provider || !runnerIdentity.model)) throw new Error('provider evaluation requires exact provider and model identity');
  if (evidenceClass === 'executable' && (!runnerIdentity.implementation || !runnerIdentity.version)) throw new Error('executable evaluation requires versioned runner identity');
  const runnerDigest = digest(runnerIdentity);
  const active = new Set();
  async function evaluate(input) {
    const p = input || {}, suite = suites.get(p.suiteId);
    if (!suite) throw new Error('unknown host evaluation suite');
    const candidate = clone(p.candidate && (p.candidate.skill || p.candidate)), baseline = p.baseline ? clone(p.baseline.skill || p.baseline) : null;
    if (!candidate || candidate.name !== suite.skillName || (baseline && baseline.name !== candidate.name)) throw new Error('test set does not govern this skill');
    const candidateDigest = digestSkill(candidate), baselineDigest = digestSkill(baseline), testSetDigest = digest(suite);
    const key = candidateDigest + ':' + testSetDigest;
    if (active.has(key)) throw new Error('candidate evaluation already running');
    active.add(key);
    try {
      const cases = [];
      for (const c of suite.cases) {
        const row = { caseId: c.id, heldOut: !!c.heldOut };
        for (const [phase, skill] of [['before', baseline], ['after', candidate]]) {
          if (p.signal && p.signal.aborted) throw new Error('evaluation cancelled');
          // Checks, expected outputs, and held-out labels never enter the model input.
          const task = { id: c.id, prompt: c.prompt, fixtures: clone(c.fixtures || {}), writablePaths: clone(c.writablePaths || []) };
          let observation;
          try { observation = await o.runCase({ task, skill, phase, signal: p.signal }); }
          catch (_) { observation = { reason: 'runner-error' }; }
          row[phase] = assessCase(c, observation);
        }
        cases.push(row);
      }
      const comparison = compareCases(cases);
      const receipt = { schemaVersion: SCHEMA, suiteId: suite.id, skillName: candidate.name, candidateDigest, baselineDigest, testSetDigest,
        evidenceClass, runnerIdentity, runnerDigest, createdAt: now(), cases, ...comparison };
      receipt.receiptId = 'eval-' + digest(receipt).slice(0, 32);
      // Synchronous durable get/set keeps concurrent evaluations from losing receipts.
      const rows = o.io.get(KEY) || [];
      if (!Array.isArray(rows)) throw new Error('evaluation receipt store is invalid');
      o.io.set(KEY, rows.filter(r => r.receiptId !== receipt.receiptId).concat([receipt]).slice(-MAX_RECEIPTS));
      return clone(receipt);
    } finally { active.delete(key); }
  }
  function getReceipt(id) { const rows = o.io.get(KEY); return Array.isArray(rows) ? clone(rows.find(r => r.receiptId === id) || null) : null; }
  function verifyReceipt(value, expected) {
    const supplied = typeof value === 'string' ? null : value;
    const id = typeof value === 'string' ? value : value && value.receiptId;
    if (!id) return { ok: false, reason: 'host evaluation receipt required' };
    const stored = getReceipt(id);
    if (!stored || (supplied && !isDeepStrictEqual(supplied, stored))) return { ok: false, reason: 'unknown or altered host evaluation receipt' };
    return validatePromotionReceipt(stored, { ...expected, runnerDigest, suite: suites.get(stored.suiteId) });
  }
  function registerSuite(value) { const suite = validateSuite(value); suites.set(suite.id, suite); return suite.id; }
  return { evaluate, verifyReceipt, getReceipt, registerSuite, listSuites: () => Array.from(suites.values()).map(s => ({ id: s.id, skillName: s.skillName, cases: s.cases.length })) };
}
module.exports = { SCHEMA, digestSkill, digestTestSet: digest, validateSuite, assessCase, compareCases, validatePromotionReceipt, makeSkillEvaluator };
