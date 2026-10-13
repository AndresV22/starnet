/* Publication boundary: model changes are candidates, never the active procedure.
   The evaluator implementation has its own suite. Here a host-issued receipt verifier is
   injected so persistence, races and every mutation frontdoor can be exercised deterministically. */
'use strict';
const A = require('./_assert.js');
const { makeSkillStore } = require('../sidecar/skillstore.js');
const { makeSkillGate, digestOf } = require('../sidecar/skills/gate.js');
const { makeSkillTools } = require('../sidecar/tools/builtin/skills.js');
const runtime = require('../sidecar/skills/runtime.js');
const guard = require('../sidecar/skills/guard.js');
function memIo() {
  const lines = []; return { lines, fail: false, readAll() { return lines.slice(); },
    append(e) { if (this.fail) throw new Error('test journal failure'); lines.push(JSON.parse(JSON.stringify(e))); },
    rewrite(rows) { lines.splice(0, lines.length, ...JSON.parse(JSON.stringify(rows))); } };
}
let time = 100; const clock = { now: () => ++time };
function fixture(extra) {
  const io = memIo(), receipts = new Map(), calls = [], mirrors = [];
  const options = Object.assign({ io, clock, guard, digest: digestOf,
    packageStore: { writePackage(s) { mirrors.push(s.body); return {}; }, hydrate(s) { return Object.assign({}, s, { body: 'stale mirror' }); } },
    validatePromotionReceipt(id, context) {
      calls.push(context); const r = receipts.get(typeof id === 'string' ? id : id && id.receiptId);
      return r && r.candidateDigest === context.candidateDigest && r.baselineDigest === context.baselineDigest
        ? { ok: true, receiptId: r.receiptId } : { ok: false, error: 'host receipt missing or stale' };
    }
  }, extra || {});
  let store = makeSkillStore(options);
  return { io, receipts, calls, mirrors, get s() { return store; },
    reload() { store = makeSkillStore(options); return store; },
    issue(c) { const id = 'host-' + receipts.size; receipts.set(id, { receiptId: id, candidateDigest: c.candidateDigest, baselineDigest: c.baseDigest }); return id; },
    promote(c, evaluation) { return store.approveCandidate({ agentId: 'a', candidateId: c.candidateId, candidateDigest: c.candidateDigest, approvedBy: 'user', evaluation }); }
  };
}
const BODY = '1. Read the source.\n2. Write a concise brief.';
function seed(f, name = 'Brief', agentId = 'a') { return f.s.write({ agentId, name, summary: 'Weekly brief procedure', body: BODY, createdBy: 'user' }).skill; }
function read(s, name = 'Brief', agentId = 'a') { return s.view(agentId, name, { bump: false, hydrate: false, includeArchived: true }); }
function proposal(s) { return s.candidates('a', { includeBody: true })[0]; }

// Every model-created procedure is pending. Names are discoverable, bytes are withheld.
for (const actor of ['agent', 'background-review', 'skill-review', 'curator']) {
  const f = fixture();
  const r = f.s.write({ agentId: 'a', name: 'Brief', summary: 'PRIVATE SUMMARY', body: BODY, createdBy: actor });
  A.ok(r.ok && r.pending && r.skill.pendingCandidate, actor + ' first creation is a candidate');
  A.eq(f.s.list('a').length, 0, 'no active record before promotion');
  A.eq(f.mirrors.length, 0, 'pending first creation writes no active package mirror');
  const rows = f.s.listAccessible('a');
  A.eq(rows.length, 1, 'owner can discover pending-only name');
  A.eq(f.s.listAccessible('b').length, 0, 'pending name is private to owner');
  const index = runtime.composeIndex(rows);
  A.ok(index.text.includes('Brief') && index.text.includes('WITHHELD') && !index.text.includes('PRIVATE SUMMARY'), 'pending metadata never injects summary');
  A.eq(index.ids, [], 'pending name is not a loaded/available procedure');
  const tools = makeSkillTools({ store: f.s });
  A.eq(tools.viewTool.run({ name: 'Brief' }, { agentId: 'a' }).summary, 'withheld', 'pending view fails closed even without guard dependency');
  A.ok(!runtime.composeLoaded([r.skill]), 'preload fails closed for pending full body');
  f.reload(); A.eq(proposal(f.s).skill.body, BODY, 'pending bytes survive restart');
}

// Foreground patch/write/support-file/archive cannot evict the approved active bytes.
for (const action of ['edit', 'patch', 'write_file', 'remove_file', 'archive']) {
  const f = fixture(); seed(f);
  const r = f.s.manage({ agentId: 'a', target: 'Brief', action, body: BODY + '\n3. Check totals.', find: 'concise', replace: 'checked', path: 'references/check.txt', content: 'Check each number.', createdBy: 'agent' });
  A.ok(r.ok && r.pending, action + ' stages');
  A.eq(read(f.s).body, BODY, action + ' preserves current body');
  A.eq(read(f.s).state, 'active', action + ' preserves current lifecycle');
  A.eq(f.mirrors.length, 1, action + ' does not rewrite active mirror');
}
{
  const f = fixture(); seed(f);
  const r = f.s.write({ agentId: 'a', name: 'Brief', body: BODY + '\n3. Check.', createdBy: 'agent' });
  A.ok(r.pending, 'legacy write wrapper also stages'); A.eq(read(f.s).body, BODY, 'legacy write preserves current');
  const c = proposal(f.s); const gate = makeSkillGate({ guard, approvals: { get() { return { digest: c.skill.contentDigest }; } } });
  A.eq(gate.decide(Object.assign({}, c.skill, { pendingCandidate: true })).visible, false, 'content approval alone cannot activate a candidate');
  A.eq(gate.verifyDraft(f.s.pendingView('a', 'Brief')).visible, true, 'clean pending draft may be inspected by reviewer');
  A.eq(f.promote(c, { status: 'pass', receiptId: 'forged' }).ok, false, 'caller-supplied passing JSON cannot certify itself');
  const receipt = f.issue(c);
  f.io.fail = true; A.throws(() => f.promote(c, receipt), 'failed promotion append is reported'); f.io.fail = false;
  A.eq(read(f.s).body, BODY, 'failed append leaves current active bytes');
  A.eq(f.mirrors.length, 1, 'failed append never writes candidate to active mirror');
  f.reload(); A.eq(read(f.s).body, BODY, 'failed append is safe across restart');
  A.eq(proposal(f.s).status, 'pending', 'failed append preserves pending decision');
  A.ok(f.promote(c, receipt).ok, 'valid host receipt plus Commander approval promotes');
  A.eq(f.calls.at(-1).baseline.body, BODY, 'host verifier receives full baseline');
  A.eq(f.calls.at(-1).candidate.body, c.skill.body, 'host verifier receives full candidate');
  A.eq(f.s.view('a', 'Brief', { bump: false }).body, c.skill.body, 'canonical promoted body beats stale package mirror');
  f.reload(); A.eq(f.s.view('a', 'Brief', { bump: false }).body, c.skill.body, 'restart keeps promoted canonical bytes');
  A.eq(f.s.candidates('a').length, 0, 'promoted candidate no longer pending');
  A.eq(read(f.s).promotionReceiptId, receipt, 'host receipt retained on active version');
  A.eq(f.io.lines.at(-1).recordType, 'skill-promotion', 'active bytes and decision persisted in one envelope');
}

// Receipt invalidation covers changed body, support bytes, metadata, user baseline and pin races.
for (const change of ['body', 'files', 'summary', 'baseline', 'pin']) {
  const f = fixture(); seed(f); f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: BODY + '\n3. Check.' });
  const c = proposal(f.s), receipt = f.issue(c);
  if (change === 'body') f.s.manage({ agentId: 'a', action: 'patch', target: 'Brief', find: 'Check.', replace: 'Check twice.' });
  if (change === 'files') f.s.manage({ agentId: 'a', action: 'write_file', target: 'Brief', path: 'scripts/check.js', content: 'return 1;' });
  if (change === 'summary') f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', summary: 'new tasks' });
  if (change === 'baseline') f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: 'Commander correction', createdBy: 'user' });
  if (change === 'pin') f.s.manage({ agentId: 'a', action: 'pin', target: 'Brief', createdBy: 'user' });
  A.eq(f.promote(c, receipt).ok, false, change + ' race refuses old approval');
  A.eq(f.promote(proposal(f.s), receipt).ok, false, change + ' cannot reuse receipt for current candidate');
}
{
  const f = fixture({ validatePromotionReceipt: null }); seed(f); f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: 'new' });
  A.eq(f.promote(proposal(f.s), { status: 'pass' }).ok, false, 'missing evaluator fails closed');
}
{
  const f = fixture(); seed(f); f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: 'proposal' }); const c = proposal(f.s);
  A.ok(f.s.rejectCandidate({ agentId: 'a', candidateId: c.candidateId, candidateDigest: c.candidateDigest }).ok, 'reject accepts current candidate');
  f.s.compact(); f.reload(); A.eq(read(f.s).body, BODY, 'rejection and compaction preserve active content');
  A.eq(f.s.candidates('a').length, 0, 'rejected candidate stays resolved after restart');
}

// Both old and future digest approvals can coexist: a failed promotion must not revoke active approval.
{
  const f = fixture(); const sk = seed(f); const keys = new Map();
  const original = Object.assign({}, sk, { guardAction: 'ask' });
  const proposed = Object.assign({}, original, { body: 'new bytes', contentDigest: 'new-digest' });
  keys.set(sk.id + ':' + original.contentDigest, { digest: original.contentDigest });
  keys.set(sk.id + ':new-digest', { digest: 'new-digest' });
  const gate = makeSkillGate({ approvals: { get(a, id, digest) { return keys.get(id + ':' + digest); } } });
  A.eq(gate.decide(original).visible, true, 'old exact digest approval survives preparation');
  A.eq(gate.decide(proposed).visible, true, 'new exact digest approval can coexist');
  A.eq(gate.decide(Object.assign({}, proposed, { contentDigest: 'third' })).visible, false, 'unknown digest remains withheld');
}

// Explicit sharing: old records remain private, project roots do not bleed, owner identity disambiguates.
{
  const f = fixture(); const a = seed(f);
  A.eq(f.s.listAccessible('b').length, 0, 'default existing skill is private');
  A.eq(f.s.share({ agentId: 'a', target: a.id, scope: 'station', actor: 'agent' }).ok, false, 'model cannot share');
  A.eq(f.s.share({ agentId: 'a', target: a.id, scope: 'project', projectRoot: '../x', actor: 'user' }).ok, false, 'relative project root refused');
  A.ok(f.s.share({ agentId: 'a', target: a.id, scope: 'project', projectRoot: 'C:\\Work\\A', actor: 'user' }).ok, 'explicit project sharing');
  A.eq(f.s.listAccessible('b', { projectRoot: 'c:/work/a/' }).length, 1, 'matching Windows project path resolves');
  A.eq(f.s.listAccessible('b', { projectRoot: 'C:/Work/B' }).length, 0, 'other project withheld');
  f.s.share({ agentId: 'a', target: a.id, scope: 'station', actor: 'user' }); seed(f, 'Brief', 'c'); f.s.share({ agentId: 'c', target: a.id, scope: 'station', actor: 'user' });
  A.eq(f.s.viewAccessible('b', 'Brief', { bump: false }), null, 'same-name shared skills require owner');
  A.eq(f.s.viewAccessible('b', 'Brief', { ownerAgentId: 'a', bump: false, hydrate: false }).agentId, 'a', 'explicit owner reads intended skill');
  A.eq(f.s.manage({ agentId: 'b', target: a.id, action: 'edit', body: 'overwrite' }).ok, false, 'shared reads grant no foreign edit');
  f.reload(); A.eq(f.s.listAccessible('b').length, 2, 'explicit sharing survives restart');
}

// Real overflow remains discoverable without unbounded prompt growth.
{
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: 's' + i, name: 'Procedure ' + i, summary: 'descriptive details '.repeat(15), agentId: 'a', state: 'active' }));
  rows[499].name = 'Unique reconciliation';
  const index = runtime.composeIndex(rows);
  A.ok(index.omitted > 0 && index.compacted > 0, 'large library uses compact names then honest omission');
  A.ok(index.text.length < 9500 && index.text.includes('skill.list {query, offset, limit}'), 'prompt remains bounded and gives exhaustive discovery path');
  A.eq(runtime.searchIndex(rows, 'Unique reconciliation')[0].id, 's499', 'query discovers a skill beyond injected index');
  const f = fixture(); for (let i = 0; i < 45; i++) seed(f, 'Skill ' + i);
  const tools = makeSkillTools({ store: f.s });
  A.ok(tools.listTool.run({ limit: 20 }, { agentId: 'a' }).content.includes('offset:20'), 'skill.list offers pagination');
  A.ok(tools.listTool.run({ query: 'Skill 44' }, { agentId: 'a' }).content.includes('Skill 44'), 'tool search uses complete accessible library');
}

// Tool telemetry reports proposal, never learning/application; schemas cannot request approval or sharing.
{
  const f = fixture(), actions = [], events = [];
  const tools = makeSkillTools({ store: f.s, onManage: (s, c, action) => actions.push(action) });
  const r = tools.manageTool.run({ action: 'create', name: 'Brief', body: BODY, createdBy: 'user', scope: 'station', approvedBy: 'user' }, { agentId: 'a', emit: (type, value) => events.push(value) });
  A.eq(r.summary, 'proposed', 'new model skill described as proposed');
  A.eq(actions, ['propose'], 'observer sees proposal action');
  A.ok(events[0].title.startsWith('Proposed revision:'), 'deliverable is labeled proposal');
  A.eq(proposal(f.s).skill.scope, 'agent', 'unadvertised model sharing ignored');
  A.eq(f.s.list('a').length, 0, 'spoofed user fields do not bypass candidate publication');
}
// Reviewers can continue a pending draft, without publishing it or recording active use.
{
  const f = fixture(), used = [], managed = [];
  const gate = makeSkillGate({ guard });
  const tools = makeSkillTools({ store: f.s, gate, readBeforeWrite: true, countViews: false,
    onView: s => used.push(s.id), onManage: (s, ctx, action) => managed.push(action) });
  const ctx = { agentId: 'a', skillReview: true };
  A.eq(tools.manageTool.run({ action: 'create', name: 'Brief', body: BODY }, ctx).summary, 'proposed', 'review creation is proposed');
  A.eq(tools.manageTool.run({ action: 'patch', target: 'Brief', find: 'concise', replace: 'verified' }, ctx).summary, 'unread', 'pending mutation still requires reading draft');
  A.ok(tools.viewTool.run({ name: 'Brief' }, ctx).content.includes('Pending review draft'), 'reviewer sees draft explicitly marked pending');
  A.eq(tools.manageTool.run({ action: 'patch', target: 'Brief', find: 'concise', replace: 'verified' }, ctx).summary, 'proposed', 'read draft can be revised');
  A.eq(used, [], 'draft maintenance never reports an active skill load');
  A.eq(managed, ['propose', 'propose'], 'review observes proposals only');
  A.eq(f.s.list('a').length, 0, 'review chain never publishes active skill');
  A.ok(proposal(f.s).skill.body.includes('verified'), 'latest pending bytes retained');
}
// A new skill binds to the evaluator's canonical null digest, never an ad-hoc empty string.
{
  const hash = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const behaviorDigest = skill => hash(skill ? [skill.name, skill.body, skill.state, skill.scope, skill.files] : null);
  const f = fixture({ digestCandidate: behaviorDigest });
  f.s.write({ agentId: 'a', name: 'New skill', body: BODY });
  const c = proposal(f.s);
  A.eq(c.baseDigest, behaviorDigest(null), 'initial baseline matches injected evaluator canonical null');
  A.ok(c.baseDigest !== '', 'null baseline is a real digest');
  A.ok(f.promote(c, f.issue(c)).ok, 'new skill promotion verifies receipt with canonical null baseline');
  A.eq(f.calls.at(-1).baseline, null, 'host verifier receives null baseline for initial skill');
}
// Age-based retirement cannot remove an approved procedure or clobber its pending replacement.
{
  const f = fixture(); f.s.write({ agentId: 'a', name: 'Brief', body: BODY });
  let c = proposal(f.s); A.ok(f.promote(c, f.issue(c)).ok, 'precondition: active learned procedure');
  const result = f.s.curate('a', { now: 100000, staleMs: 10, archiveMs: 20 });
  A.eq(result.archived, 0, 'curator never reports active archive without promotion');
  A.eq(result.proposedArchives, 1, 'aged learned skill produces a retirement proposal');
  A.eq(read(f.s).state, 'active', 'aged active procedure remains available');
  c = proposal(f.s); A.eq(c.skill.state, 'archived', 'retirement candidate carries proposed lifecycle');
  f.s.curate('a', { now: 200000, staleMs: 10, archiveMs: 20 });
  A.eq(proposal(f.s).candidateDigest, c.candidateDigest, 'repeated aging cannot replace current proposal');
  f.s.rejectCandidate({ agentId: 'a', candidateId: c.candidateId, candidateDigest: c.candidateDigest });
  A.eq(f.s.curate('a', { now: 300000, staleMs: 10, archiveMs: 20 }).proposedArchives, 0, 'explicit rejected retirement is respected');
  f.s.manage({ agentId: 'a', target: 'Brief', action: 'edit', body: BODY + ' Improved.' });
  c = proposal(f.s);
  f.s.curate('a', { now: 400000, staleMs: 10, archiveMs: 20 });
  A.eq(proposal(f.s).candidateDigest, c.candidateDigest, 'pending replacement is not overwritten by retirement');
  A.eq(read(f.s).state, 'active', 'pending replacement keeps active procedure available');
}
// "No measurable improvement" is the Commander's explicit acknowledgement: it reaches the host verifier
// only when sent, and the promotion record says it was acknowledged rather than measured.
{
  const seen = [];
  const f = fixture({ validatePromotionReceipt(id, context) {
    seen.push(context);
    return context.acknowledgedNoImprovement === true ? { ok: true, receiptId: id, acknowledged: true } : { ok: false, error: 'the evaluation showed no measurable improvement' };
  } });
  seed(f); f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: BODY + '\n3. Same steps, reworded.' });
  const c = proposal(f.s);
  const refused = f.promote(c, 'host-tie');
  A.eq(refused.ok, false, 'a tie is refused without the owner acknowledgement');
  A.ok(/no measurable improvement/.test(refused.error), 'refusal names the missing improvement');
  A.eq(seen.at(-1).acknowledgedNoImprovement, false, 'no acknowledgement is ever assumed');
  A.eq(read(f.s).body, BODY, 'refused tie leaves the active bytes');
  const r = f.s.approveCandidate({ agentId: 'a', candidateId: c.candidateId, candidateDigest: c.candidateDigest, approvedBy: 'user', evaluation: 'host-tie', acknowledgedNoImprovement: true });
  A.ok(r.ok, 'acknowledged tie promotes');
  A.eq(seen.at(-1).acknowledgedNoImprovement, true, 'host verifier receives the acknowledgement');
  A.eq(r.candidate.acknowledgedNoImprovement, true, 'promotion records the owner acknowledgement');
  f.reload();
  A.eq(f.s.candidates('a', { includeResolved: true }).find(x => x.candidateId === c.candidateId).acknowledgedNoImprovement, true, 'acknowledgement survives restart');
  const g = fixture(); seed(g); g.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: BODY + '\n3. Check totals.' });
  const measured = proposal(g.s);
  A.eq(g.promote(measured, g.issue(measured)).candidate.acknowledgedNoImprovement, false, 'a measured improvement is not recorded as acknowledged');
}
// A consolidation's archive waits for its heir: approving the archive alone must not point at an umbrella
// that does not carry the merged content yet (CONSOLIDATION MUST NAME ITS HEIR).
{
  const f = fixture(); seed(f, 'Reports'); seed(f, 'Weekly brief');
  A.ok(f.s.manage({ agentId: 'a', target: 'Reports', action: 'edit', body: BODY + '\n3. Weekly brief steps.', createdBy: 'curator' }).pending, 'curator merge is proposed');
  A.ok(f.s.manage({ agentId: 'a', target: 'Weekly brief', action: 'archive', absorbedInto: 'Reports', createdBy: 'curator' }).pending, 'curator archive is proposed');
  const rows = f.s.candidates('a', { includeBody: true });
  const heir = rows.find(c => c.name === 'Reports'), sibling = rows.find(c => c.name === 'Weekly brief');
  const early = f.promote(sibling, f.issue(sibling));
  A.eq(early.ok, false, 'archive cannot be approved while its heir is still a proposal');
  A.ok(/Reports/.test(early.error || ''), 'refusal names the heir to approve first');
  A.eq(read(f.s, 'Weekly brief').state, 'active', 'sibling stays active while its heir waits');
  A.ok(f.promote(heir, f.issue(heir)).ok, 'heir merge approves');
  A.ok(f.promote(sibling, f.issue(sibling)).ok, 'archive approves once the heir carries the content');
  A.eq(read(f.s, 'Weekly brief').absorbedInto, 'Reports', 'archived sibling points at the live heir');
  const g = fixture(); seed(g, 'Weekly brief');
  A.ok(g.s.manage({ agentId: 'a', action: 'create', name: 'All reports', body: BODY, createdBy: 'curator' }).pending, 'new umbrella is proposed');
  A.ok(g.s.manage({ agentId: 'a', target: 'Weekly brief', action: 'archive', absorbedInto: 'All reports', createdBy: 'curator' }).pending, 'archive into the new umbrella is proposed');
  const into = g.s.candidates('a', { includeBody: true }).find(c => c.name === 'Weekly brief');
  A.eq(g.promote(into, g.issue(into)).ok, false, 'archive into an umbrella that is not active yet is refused');
}
// A foreground run only sees the active version, so it never builds on (or silently discards) a review draft it
// cannot see. Its own run's draft and the review passes (which read drafts through pendingView) still continue one.
{
  const f = fixture(); seed(f); seed(f, 'Other');
  A.ok(f.s.manage({ agentId: 'a', target: 'Brief', action: 'patch', find: 'concise', replace: 'reviewed', createdBy: 'background-review', sourceRunId: 'run-1' }).pending, 'review proposes a revision');
  const review = proposal(f.s);
  const patch = f.s.manage({ agentId: 'a', target: 'Brief', action: 'patch', find: 'concise', replace: 'short', createdBy: 'agent', sourceRunId: 'run-2' });
  A.eq(patch.ok, false, 'foreground patch of a skill with an unseen proposal is refused');
  A.ok(/awaiting/.test(patch.error || '') && !/not found/.test(patch.error || ''), 'refusal names the waiting proposal, not missing patch text');
  const edit = f.s.manage({ agentId: 'a', target: 'Brief', action: 'edit', body: BODY + '\n3. Foreground fix.', createdBy: 'agent', sourceRunId: 'run-2' });
  A.eq(edit.ok, false, 'foreground full edit cannot overwrite the unseen proposal');
  A.eq(f.s.candidates('a', { includeBody: true }).find(c => c.name === 'Brief').candidateDigest, review.candidateDigest, 'review proposal is kept intact');
  A.ok(f.s.manage({ agentId: 'a', target: 'Other', action: 'edit', body: 'Other steps.', createdBy: 'agent', sourceRunId: 'run-2' }).pending, 'an unrelated proposal never blocks another skill');
  A.ok(f.s.manage({ agentId: 'a', target: 'Brief', action: 'patch', find: 'reviewed', replace: 'reviewed twice', createdBy: 'skill-review', sourceRunId: 'run-3' }).pending, 'a review pass continues the draft it can read');
  const g = fixture(); seed(g);
  A.ok(g.s.manage({ agentId: 'a', target: 'Brief', action: 'patch', find: 'concise', replace: 'short', createdBy: 'agent', sourceRunId: 'run-4' }).pending, 'foreground run proposes a revision');
  A.ok(g.s.manage({ agentId: 'a', target: 'Brief', action: 'patch', find: 'short', replace: 'very short', createdBy: 'agent', sourceRunId: 'run-4' }).pending, 'the same run continues its own draft');
  A.ok(proposal(g.s).skill.body.includes('very short'), 'own draft carries both patches');
  A.eq(g.s.write({ agentId: 'a', name: 'Brief', body: 'Rewritten.', createdBy: 'agent', sourceRunId: 'run-5' }).ok, false, 'legacy write wrapper is held to the same rule');
}
// Approving a revision keeps the live usage counters. Rolling useCount/lastUsedAt back to stage time made a
// skill used all fortnight look idle, so the next curate pass could mark it stale or propose retiring it.
{
  const f = fixture(); seed(f); f.s.manage({ agentId: 'a', action: 'edit', target: 'Brief', body: BODY + '\n3. Check totals.' });
  const c = proposal(f.s);
  f.s.markUsed('a', 'Brief'); f.s.markUsed('a', 'Brief'); f.s.view('a', 'Brief', { hydrate: false });
  const live = read(f.s);
  A.ok(f.promote(c, f.issue(c)).ok, 'precondition: revision promotes');
  const promoted = read(f.s);
  A.eq(promoted.body, c.skill.body, 'promoted bytes are the evaluated candidate');
  A.eq([promoted.useCount, promoted.viewCount, promoted.lastUsedAt], [live.useCount, live.viewCount, live.lastUsedAt], 'promotion carries the live usage counters');
  f.reload(); A.eq(read(f.s).useCount, live.useCount, 'carried usage survives restart');
}
// A lifecycle click is not an approval. Archiving and restoring a withheld review-written version, or attaching or
// removing a support file on it, must not relabel its writer and so un-withhold bytes nobody approved.
{
  const f = fixture();
  f.io.lines.push({ id: 'legacy', agentId: 'a', name: 'Legacy', summary: 'Legacy procedure', body: BODY, createdBy: 'agent',
    writtenBy: 'background-review', guardAction: 'ask', state: 'active', createdAt: 1, updatedAt: 1 });
  f.reload();
  const gate = makeSkillGate({ guard, approvals: { get() { return null; } } });
  A.eq(gate.decide(read(f.s, 'Legacy')).visible, false, 'precondition: legacy review-written version is withheld');
  A.ok(f.s.manage({ agentId: 'a', target: 'Legacy', action: 'archive', createdBy: 'user' }).ok, 'Commander archives it');
  A.ok(f.s.manage({ agentId: 'a', target: 'Legacy', action: 'restore', createdBy: 'user' }).ok, 'Commander restores it');
  A.eq(read(f.s, 'Legacy').writtenBy, 'background-review', 'archive and restore keep the writer of these bytes');
  A.eq(gate.decide(read(f.s, 'Legacy')).visible, false, 'archive and restore do not approve review-written bytes');
  A.ok(f.s.manage({ agentId: 'a', target: 'Legacy', action: 'write_file', path: 'references/note.txt', content: 'A note.', createdBy: 'user' }).ok, 'Commander attaches a support file');
  A.eq(gate.decide(read(f.s, 'Legacy')).visible, false, 'a support file attached by the Commander keeps the review stamp');
  A.ok(f.s.manage({ agentId: 'a', target: 'Legacy', action: 'remove_file', path: 'references/note.txt', createdBy: 'user' }).ok, 'Commander removes it again');
  A.eq(gate.decide(read(f.s, 'Legacy')).visible, false, 'removing a support file keeps the review stamp');
  const approved = read(f.s, 'Legacy');
  const blessed = makeSkillGate({ guard, approvals: { get(a, id, d) { return d === approved.contentDigest ? { digest: d } : null; } } });
  A.eq(blessed.decide(approved).visible, true, 'only an approval of these exact bytes shows it');
}
A.report('skills.review-approval');
