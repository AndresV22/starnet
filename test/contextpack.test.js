/* node test/contextpack.test.js — the PURE recency-weighted CONTEXT PACK (NS-2).

   Locks the guarantees the propose step's magic depends on, all as deterministic transforms over injected inputs +
   a fake `now` (no Date.now — passes lint-determinism):
     · BOUNDS — total text ≤ maxChars; each section capped in item count; per-line length clamped.
     · EXCLUSIONS — internal streamIds (nightshift-/cron-/workshop-) never appear; out-of-window rows dropped.
     · DETERMINISM — same inputs → byte-identical output (twice).
     · REDACTION — a secret in a chat body never reaches the pack (redact injected, applied to first-lines).
     · EVIDENCE POOL — activityLines carries the real run/chat/goal/landed lines (the veto's extended pool) + is bounded. */
'use strict';
const A = require('./_assert.js');
const CP = require('../sidecar/contextpack.js');

const T = 1700000000000;              // fixed "now"
const DAY = 86400000;
const ago = (d) => T - d * DAY;
A.eq(CP.assemble({ runs: [{ title: 'INTERNAL recommendation reasoning', ts: T, internal: true, streamId: '' }] }, { now: T }).counts.runs, 0,
  'Internal recommendation generation must never become evidence of user work');

// a fake redact that strips a known secret shape (stands in for context.js's redact).
const redact = (s) => String(s == null ? '' : s).replace(/sk-secret-[A-Za-z0-9]+/g, '[redacted]');

function baseInputs(over) {
  return Object.assign({
    runs: [
      { title: 'Ship the StarNet beta', ts: ago(1), streamId: '' },            // user run (empty stream = default)
      { title: 'Refactor the belt router', ts: ago(2), streamId: 'ws-main' },  // user run (named workstream)
      { title: 'night-shift: Busywork', ts: ago(0), streamId: 'nightshift-abc' }, // INTERNAL — must be excluded
      { title: 'cron digest', ts: ago(0), streamId: 'cron-xyz' },              // INTERNAL — must be excluded
      { title: 'workshop build', ts: ago(0), streamId: 'workshop-1' },         // INTERNAL — must be excluded
      { title: 'Ancient task', ts: ago(30), streamId: '' }                     // OUT OF WINDOW (>7d) — dropped
    ],
    chats: [
      { role: 'user', content: 'help me automate release notes\nsecond line', ts: ago(1), streamId: '' },
      { role: 'assistant', content: 'sure', ts: ago(1), streamId: '' },        // not a user turn — dropped
      { role: 'user', content: 'internal beat prompt', ts: ago(0), streamId: 'nightshift-x' }, // internal — dropped
      { role: 'user', content: 'my key is sk-secret-ABC123 keep it safe', ts: ago(2), streamId: '' } // secret — redacted
    ],
    briefs: [
      { originalDirective: 'Audit the recommendation system\nFocus on evidence provenance and replay evaluation', ts: ago(1) }
    ],
    goal: { text: 'Launch to 100 users', done: 2, total: 5, next: 'write onboarding' },
    landed: [
      { title: 'Release checklist tool', verdict: 'kept', ts: ago(1) },
      { title: 'A rambling essay', verdict: 'discarded', ts: ago(2) }
    ],
    beliefs: { goals: ['ship the beta'], stack: ['node', 'canvas'] },
    learn: { 'advance-goal': { up: 3, down: 0 }, 'scout': { up: 0, down: 2 } },
    redact
  }, over || {});
}

/* ---------- exclusions: internal streams + out-of-window ---------- */
(function exclusions() {
  const pack = CP.assemble(baseInputs(), { now: T });
  const worked = (pack.sections.find(s => s.label === 'What they worked on recently') || {}).lines || [];
  A.ok(worked.some(l => /Ship the StarNet beta/.test(l)), 'a user run appears');
  A.ok(worked.some(l => /Refactor the belt router/.test(l)), 'a named-workstream user run appears');
  A.ok(!worked.some(l => /Busywork|cron digest|workshop build/.test(l)), 'internal-stream runs are excluded');
  A.ok(!worked.some(l => /Ancient task/.test(l)), 'out-of-window (>7d) run is excluded');
  // and the excluded ones are not in the evidence pool either:
  A.ok(!pack.activityLines.some(l => /Busywork|cron digest/.test(l)), 'internal runs are not in the evidence pool');
})();

/* ---------- redaction ---------- */
(function redaction() {
  const pack = CP.assemble(baseInputs(), { now: T });
  const all = pack.text + '\n' + pack.activityLines.join('\n');
  A.ok(all.indexOf('sk-secret-ABC123') < 0, 'the raw secret never reaches the pack');
  A.ok(all.indexOf('[redacted]') >= 0, 'the secret was redacted (backstop applied to chat first-lines)');
  // first-line only: the second line of the multi-line chat must not appear.
  A.ok(all.indexOf('second line') < 0, 'only the FIRST line of a chat is carried (not the whole body)');
})();

/* ---------- goal + landed + learn sections ---------- */
(function sections() {
  const pack = CP.assemble(baseInputs(), { now: T });
  const goalSec = pack.sections.find(s => s.label === 'Their current goal');
  A.ok(goalSec && /Launch to 100 users/.test(goalSec.lines[0]) && /2\/5 done/.test(goalSec.lines[0]) && /onboarding/.test(goalSec.lines[0]), 'goal line carries text + progress + next');
  const landedSec = pack.sections.find(s => s.label === 'Recent work they kept vs discarded');
  A.ok(landedSec && landedSec.lines.some(l => /Release checklist tool.*kept/.test(l)) && landedSec.lines.some(l => /rambling essay.*discarded/.test(l)), 'landed section marks kept vs discarded');
  const learnSec = pack.sections.find(s => s.label === 'What they tend to keep');
  A.ok(learnSec && /advance-goal/.test(learnSec.lines[0]) && /scout/.test(learnSec.lines[0]), 'learn line names up/down archetypes');
  // the goal + landed lines are in the evidence pool (candidates may ground on them):
  A.ok(pack.activityLines.some(l => /Launch to 100 users/.test(l)), 'goal line is in the evidence pool');
  A.ok(pack.activityLines.some(l => /Release checklist tool/.test(l)), 'a landed line is in the evidence pool');
  const briefSec = pack.sections.find(s => s.label === 'Completed task evidence');
  A.ok(briefSec && /evidence provenance and replay evaluation/.test(briefSec.lines[0]), 'completed briefs retain evidence beyond the first directive line');
  A.eq(pack.counts.briefs, 1, 'completed brief evidence is counted explicitly');
})();

/* ---------- determinism: same inputs → byte-identical ---------- */
(function determinism() {
  const a = CP.assemble(baseInputs(), { now: T });
  const b = CP.assemble(baseInputs(), { now: T });
  A.eq(a.text, b.text, 'text is deterministic');
  A.eq(a.activityLines.join('|'), b.activityLines.join('|'), 'evidence pool is deterministic');
  A.eq(JSON.stringify(a.counts), JSON.stringify(b.counts), 'counts are deterministic');
})();

/* ---------- bounds: char cap, item caps, line clamp ---------- */
(function bounds() {
  // a firehose: many runs + a giant title.
  const bigRuns = [];
  for (let i = 0; i < 50; i++) bigRuns.push({ title: 'Task number ' + i + ' ' + 'x'.repeat(400), ts: ago(1) - i, streamId: '' });
  const pack = CP.assemble(baseInputs({ runs: bigRuns }), { now: T, maxChars: 500 });
  A.ok(pack.text.length <= 500, 'total text respects maxChars (got ' + pack.text.length + ')');
  const worked = (pack.sections.find(s => s.label === 'What they worked on recently') || {}).lines || [];
  A.ok(worked.length <= CP.MAX_RUNS, 'run section capped to MAX_RUNS (' + worked.length + ')');
  A.ok(worked.every(l => l.length <= CP.LINE_MAX + 20), 'each run line is clamped near LINE_MAX');
  A.ok(pack.activityLines.length <= CP.ACTIVITY_POOL_MAX, 'evidence pool capped to ACTIVITY_POOL_MAX');
})();

/* ---------- empty night: honest empty pack ---------- */
(function empty() {
  const pack = CP.assemble({ runs: [], chats: [], goal: null, landed: [], beliefs: {}, learn: {} }, { now: T });
  A.eq(pack.text, '', 'a truly empty night yields empty text (nothing fabricated)');
  A.eq(pack.activityLines.length, 0, 'an empty night yields an empty evidence pool');
  A.eq(pack.counts.runs, 0, 'zero runs counted');
})();

/* ---------- isInternalStream unit ---------- */
A.eq(CP.isInternalStream('nightshift-abc'), true, 'nightshift- is internal');
A.eq(CP.isInternalStream('cron-1'), true, 'cron- is internal');
A.eq(CP.isInternalStream('workshop-9'), true, 'workshop- is internal');
A.eq(CP.isInternalStream(''), false, 'empty stream (default browser run) is NOT internal');
A.eq(CP.isInternalStream('ws-main'), false, 'a user workstream is NOT internal');

/* ---------- dayTag unit ---------- */
A.eq(CP.dayTag(T, T), 'today', 'same day → today');
A.eq(CP.dayTag(ago(1), T), 'yesterday', '1 day → yesterday');
A.eq(CP.dayTag(ago(3), T), '3d ago', '3 days → Nd ago');
A.eq(CP.dayTag(0, T), '', 'undated → empty tag');

// USER-STUDY LOOP — the station's own reason-only calls are not the Commander's activity: the internal run is
// excluded AND its directive row (which the transcript files as a 'user' line on the Commander's stream) drops too.
{
  const selfTalk = 'INTERNAL — GOAL DECOMPOSITION. Do not run any tools. Reason only, then reply in the exact format below.';
  const p = CP.assemble({
    runs: [{ title: selfTalk.slice(0, 120), ts: ago(0), streamId: 'ws-main', internal: true }, { title: 'Draft the launch post', ts: ago(0), streamId: 'ws-main' }],
    chats: [{ role: 'user', content: selfTalk + '\nYour Commander has this goal: …', ts: ago(0), streamId: 'ws-main' },
            { role: 'user', content: 'Can you draft the launch post for Friday?', ts: ago(0), streamId: 'ws-main' }]
  }, { now: T });
  A.ok(!p.activityLines.some(l => /GOAL DECOMPOSITION/.test(l)), 'an internal call never reads as the Commander\'s recent work or asks');
  A.ok(p.activityLines.some(l => /Draft the launch post/.test(l)) && p.activityLines.some(l => /launch post for Friday/.test(l)), 'the Commander\'s own runs and asks on the same stream are kept');
}
// Exercise the real host projection, then the real pure pack: a source regex cannot prove that private
// provenance survives filtering or that a completed brief actually belongs to a clean owner's directive.
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '../sidecar/index.js'), 'utf8');
  const fn = A.fnBody(src, 'function nightshiftContextPack()');
  A.ok(fn.startsWith('function nightshiftContextPack()') && fn.length < 10000 && /return pack;\s*}$/.test(fn),
    'extract exactly the host context-pack function, not neighbouring code');
  const vm = require('vm');
  const TrustedLearning = require('../sidecar/trusted-learning.js');
  function host(input) {
    input = input || {};
    let projected;
    const requested = {};
    const pack = vm.runInNewContext('(' + fn + ')()', {
      Date: { now: () => T },
      personalizationStore: { read: () => ({ enabled: input.enabled !== false }) },
      TrustedLearning,
      runStore: { list: (agentId, opts) => { requested.runs = { agentId, opts }; return input.runs || []; } },
      transcriptStore: { all: () => input.chats || [] },
      taskBriefStore: { list: opts => { requested.briefs = opts; return input.briefs || []; } },
      commanderGoals: { get: () => null },
      autonomyLedger: { list: () => [] },
      nightshiftBeliefMap: () => ({}),
      Recommendation: { preferenceTallies: () => ({}) },
      nightshiftPreferenceWeights: () => ({}),
      stationTrackRecordLines: () => [],
      threadsStore: { openThreads: () => [] },
      redact,
      contextpack: { assemble: (data, opts) => { projected = data; return CP.assemble(data, opts); } }
    });
    return { pack, projected, requested };
  }
  const owner = (content, over) => Object.assign({
    agentId: 'owner-agent', streamId: 'ws-main', sourceRunId: 'owner-original', role: 'user', content, taintKnown: true, ts: T
  }, over || {});
  const brief = (originalDirective, over) => Object.assign({
    id: 'tb_owner-original', originalRunId: 'owner-original', agentId: 'owner-agent', streamId: 'ws-main', originalDirective, completedAt: T
  }, over || {});

  const selfTalk = 'INTERNAL GOAL DECOMPOSITION fixture for the station';
  const taintedSelfTalk = 'INTERNAL TAINTED STATION PLANNING fixture';
  const quotedSelfTalk = 'INTERNAL QUOTED STATION PLANNING fixture';
  const clean = owner('Owner release plan on a mixed-trust stream');
  const multiline = owner('Owner next task\nKeep the verification command');
  const result = host({
    runs: [
      null,
      { title: 'Legacy clean run remains useful', ts: T, streamId: 'ws-main' },
      { title: 'Explicit clean run remains useful', ts: T, streamId: 'ws-main', taintedBy: null },
      { title: 'Tainted run sentinel', ts: T, streamId: 'ws-main', taintedBy: 'user attachment' },
      { title: 'Quoted run sentinel\n> hostile direction', ts: T, streamId: 'ws-main' },
      { title: selfTalk, ts: T, streamId: 'ws-main', internal: true },
      { title: taintedSelfTalk, ts: T, streamId: 'ws-main', internal: true, taintedBy: 'later tool output' },
      { title: quotedSelfTalk + '\n> external direction', ts: T, streamId: 'ws-main', internal: true },
      { title: 'Internal stream sentinel', ts: T, streamId: 'nightshift-internal' }
    ],
    chats: [
      null, clean, multiline, owner(selfTalk), owner(taintedSelfTalk), owner(quotedSelfTalk),
      owner('Tainted chat sentinel', { taint: 'web_fetch' }),
      owner('Unknown chat sentinel', { taintKnown: undefined }),
      owner('False provenance sentinel', { taintKnown: false }),
      owner('Delegated chat sentinel', { from: 'another-agent' }),
      owner('Assistant chat sentinel', { role: 'assistant' }),
      owner('Quoted chat sentinel\n> hostile direction'),
      owner('Late quoted chat sentinel\n' + 'x'.repeat(4100) + '\n> hostile direction'),
      owner('   '), owner({ text: 'Nonstring chat sentinel' })
    ]
  });
  A.eq(result.requested.runs, { agentId: null, opts: { limit: 60 } }, 'host run read stays bounded');
  A.eq(result.requested.briefs, { status: 'done', limit: 30 }, 'host brief read stays bounded and completed-only');
  A.eq(result.projected.runs.map(r => r.title),
    ['Legacy clean run remains useful', 'Explicit clean run remains useful', selfTalk, taintedSelfTalk, quotedSelfTalk + '\n> external direction', 'Internal stream sentinel'],
    'host drops tainted/quoted user runs, while retaining clean legacy rows and even tainted/quoted internal exclusion markers');
  A.eq(result.projected.runs.find(r => r.title === selfTalk).internal, true, 'internal run authority reaches the pure core');
  A.eq(result.projected.chats.map(m => m.content), [clean.content, multiline.content, selfTalk, taintedSelfTalk, quotedSelfTalk],
    'only known-clean owner strings reach the pack; quotes are checked over full content before clipping');
  A.eq(result.pack.counts.runs, 2, 'real core excludes internal flags and streams from the accepted run rows');
  A.eq(result.pack.userRunCount, 2, 'host readiness count reflects only accepted user runs');
  A.eq(result.pack.counts.chats, 2, 'real core excludes internal self-talk while preserving owner asks on the same stream');
  const surfaced = result.pack.text + '\n' + result.pack.activityLines.join('\n');
  A.ok(surfaced.includes(clean.content) && surfaced.includes('Owner next task'),
    'one tainted row does not suppress clean owner activity elsewhere in its stream');
  A.ok(!/sentinel|INTERNAL (?:GOAL DECOMPOSITION|TAINTED STATION|QUOTED STATION)/.test(surfaced), 'rejected and internal content never enters the prompt or evidence pool');

  for (const enabled of [true, false]) {
    const alwaysFiltered = host({
      enabled,
      runs: [{ title: 'TAINTED MODE RUN', ts: T, taintedBy: 'web_fetch' }],
      chats: [clean, owner('TAINTED MODE CHAT', { taint: 'web_fetch' })],
      briefs: [brief('TAINTED MODE CHAT')]
    });
    A.eq(alwaysFiltered.projected.runs.length, 0, 'tainted runs remain excluded with personalization enabled=' + enabled);
    A.eq(alwaysFiltered.projected.chats.map(m => m.content), [clean.content], 'owner provenance filtering remains active with personalization enabled=' + enabled);
    A.eq(alwaysFiltered.projected.briefs.length, 0, 'unsupported briefs remain excluded with personalization enabled=' + enabled);

    // The general Commander evidence reader must consume this filtered host pack in either preference mode.
    // No raw run/transcript stores are provided here: a private bypass cannot satisfy the activity assertion.
    const evidenceFn = A.fnBody(src, 'function commanderEvidenceInputs()');
    A.ok(evidenceFn.length < 4000 && /return \{ dossier:/.test(evidenceFn), 'extract the shared Commander evidence reader');
    let packReads = 0;
    const evidence = vm.runInNewContext('(' + evidenceFn + ')()', {
      Date: { now: () => T },
      personalizationStore: { read: () => ({ enabled }) },
      nightshiftContextPack: () => { packReads++; return result.pack; },
      threadsStore: { openThreads: () => [] },
      Interests: { summary: () => [] }, interestsState: {},
      scoutState: { context: {} }, commanderGoals: { get: () => null },
      recommendationLedger: { summary: () => null },
      stationTrackRecordLines: () => [], commanderDossier: { get: () => ({}) }
    });
    A.eq(packReads, 1, 'general evidence reads the shared filtered host pack with personalization enabled=' + enabled);
    A.eq(evidence.activity, result.pack.activityLines.slice(0, 8), 'general evidence preserves filtered activity with personalization enabled=' + enabled);
  }

  const ordered = host({ chats: Array.from({ length: 9 }, (_, i) => owner('Ordered owner request ' + i, { ts: T - (8 - i) })) });
  const orderedLines = ordered.pack.sections.find(section => section.label === 'What they asked recently').lines;
  A.eq(orderedLines.length, CP.MAX_CHATS, 'host-proven owner asks still respect the pure core item cap');
  A.eq(orderedLines.map(line => Number(line.match(/request (\d+)/)[1])), [8, 7, 6, 5, 4, 3],
    'eligible asks are ordered newest-first before the section cap');

  const poisonCrowd = host({
    chats: [owner('Older clean owner ask survives', { ts: ago(1) }),
      ...Array.from({ length: CP.MAX_CHATS + 3 }, (_, i) => owner('Newer tainted ask ' + i, { ts: T - i, taint: 'attachment' }))],
    runs: [
      { title: 'Duplicate task title', ts: T, streamId: 'ws-main', taintedBy: 'attachment' },
      { title: 'Duplicate task title', ts: ago(1), streamId: 'ws-main' }
    ]
  });
  A.eq(poisonCrowd.pack.sections.find(section => section.label === 'What they asked recently').lines,
    ['"Older clean owner ask survives" (yesterday)'], 'newest tainted asks beyond the item cap cannot evict an older clean owner ask');
  A.eq(poisonCrowd.pack.sections.find(section => section.label === 'What they worked on recently').lines,
    ['Duplicate task title (yesterday)'], 'a newer tainted duplicate cannot replace the older clean run or its date');

  const directive = 'Finish the release checklist\nVerify the version number';
  const cases = [
    ['same owner and stream', owner(directive), brief(directive), 1],
    ['different original occurrence cannot borrow identical words', owner(directive, { sourceRunId: 'other-original' }), brief(directive), 0],
    ['missing transcript source run cannot prove an occurrence', owner(directive, { sourceRunId: undefined }), brief(directive), 0],
    ['host brief ID supplies the legacy original identity', owner(directive), brief(directive, { originalRunId: undefined }), 1],
    ['arbitrary legacy ID and no original identity fail closed', owner(directive), brief(directive, { id: 'legacy-brief', originalRunId: undefined }), 0],
    ['explicit original identity outranks a conflicting legacy ID', owner(directive), brief(directive, { id: 'tb_wrong-origin' }), 1],
    ['completion ID cannot substitute for original identity', owner(directive, { sourceRunId: 'completion-run' }), brief(directive, { runId: 'completion-run' }), 0],
    ['different completion run IDs are not required to match', owner(directive, { runId: 'owner-run' }), brief(directive, { runId: 'later-run' }), 1],
    ['different agent cannot borrow the directive', owner(directive), brief(directive, { agentId: 'other-agent' }), 0],
    ['different stream cannot borrow the directive', owner(directive), brief(directive, { streamId: 'other-stream' }), 0],
    ['shared run ID cannot authorize a cross-agent brief', owner(directive, { runId: 'same' }), brief(directive, { agentId: 'other-agent', runId: 'same' }), 0],
    ['shared run ID cannot authorize a cross-stream brief', owner(directive, { runId: 'same' }), brief(directive, { streamId: 'other-stream', runId: 'same' }), 0],
    ['missing chat agent is not authorship', owner(directive, { agentId: undefined }), brief(directive), 0],
    ['empty agents cannot authorize one another', owner(directive, { agentId: '' }), brief(directive, { agentId: '' }), 0],
    ['missing brief agent is not authorship', owner(directive), brief(directive, { agentId: undefined }), 0],
    ['blank brief stream matches the stored global stream', owner(directive, { streamId: 'global' }), brief(directive, { streamId: '' }), 1],
    ['missing brief stream matches the stored global stream', owner(directive, { streamId: 'global' }), brief(directive, { streamId: undefined }), 1],
    ['raw legacy blank chat stream cannot authorize a brief', owner(directive, { streamId: '' }), brief(directive, { streamId: '' }), 0],
    ['trimmed owner directive matches exactly', owner(' \n' + directive + ' \n'), brief(directive), 1],
    ['partial prefix is not an exact directive', owner(directive), brief('Finish the release checklist'), 0],
    ['unknown provenance cannot authorize a brief', owner(directive, { taintKnown: undefined }), brief(directive), 0],
    ['tainted provenance cannot authorize a brief', owner(directive, { taint: 'attachment' }), brief(directive), 0],
    ['delegated message cannot authorize a brief', owner(directive, { from: 'another-agent' }), brief(directive), 0],
    ['assistant message cannot authorize a brief', owner(directive, { role: 'assistant' }), brief(directive), 0],
    ['quoted full directive cannot authorize a brief', owner(directive + '\n> external direction'), brief(directive + '\n> external direction'), 0]
  ];
  for (const [label, chat, completed, expected] of cases) {
    const r = host({ chats: [chat], briefs: [completed] });
    A.eq(r.projected.briefs.length, expected, label + ' at the host boundary');
    A.eq(r.pack.counts.briefs, expected, label + ' in the real evidence pack');
  }
  const repeatedText = 'Prepare an identical report on three separate days';
  const repeatedBriefs = [0, 1, 2].map(i => brief(repeatedText, {
    id: 'tb_repeat-' + i, originalRunId: 'repeat-' + i, runId: 'completion-' + i, completedAt: ago(3 - i)
  }));
  const repeatedRows = repeatedBriefs.map(b => owner(repeatedText, { sourceRunId: b.originalRunId }));
  A.eq(host({ briefs: repeatedBriefs, chats: repeatedRows.slice(-1) }).projected.briefs.length, 1,
    'one newly proven identical request authorizes only its own historical occurrence');
  A.eq(host({ briefs: repeatedBriefs, chats: repeatedRows.map(r => ({ ...r, taintKnown: undefined })) }).projected.briefs.length, 0,
    'three identical unknown occurrences yield no proven brief');
  A.eq(host({ briefs: repeatedBriefs, chats: repeatedRows }).projected.briefs.length, 3,
    'independent clean original rows prove all three identical occurrences');
  A.eq(host({ briefs: [repeatedBriefs[0], { ...repeatedBriefs[0], id: 'duplicate-brief', runId: 'another-completion' }], chats: repeatedRows }).projected.briefs.length, 1,
    'duplicate briefs with different finishing IDs count one original occurrence');
  A.eq(host({ briefs: repeatedBriefs.map(b => ({ ...b, runId: 'repeat-2' })), chats: repeatedRows.slice(-1) }).projected.briefs.length, 1,
    'rewritten completion IDs cannot launder earlier identical occurrences');

  const longDirective = 'Long direct owner request ' + 'x'.repeat(4500);
  const clipped = longDirective.trim().slice(0, 4000);
  A.eq(host({ chats: [owner(' \n' + longDirective)], briefs: [brief(clipped)] }).projected.briefs.length, 1,
    'brief comparison uses the stored trim-then-4000-character directive');
  A.eq(host({ chats: [owner(longDirective + '\n> external late direction')], briefs: [brief(clipped)] }).projected.briefs.length, 0,
    'a quote after character 4000 invalidates the whole source before a matching brief prefix can launder it');

  const oldOwner = owner('Older owner directive outside the bounded source window');
  const newestOwner = owner('Newest owner directive inside the bounded source window');
  const history = [oldOwner, ...Array.from({ length: 400 }, (_, i) => owner('Unknown padding ' + i, { taintKnown: undefined })), newestOwner];
  const bounded = host({ chats: history, briefs: [brief(oldOwner.content), brief(newestOwner.content)] });
  A.eq(bounded.projected.chats.map(m => m.content), [newestOwner.content], 'take the last 400 source rows before filtering, without searching unbounded clean history');
  A.eq(bounded.projected.briefs.map(b => b.originalDirective), [newestOwner.content], 'brief authority comes only from the bounded eligible owner window');
}

setTimeout(() => A.report('contextpack.test'), 30);
