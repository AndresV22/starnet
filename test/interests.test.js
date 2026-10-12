/* node test/interests.test.js — the pure topic-interest engine (sidecar/interests.js).
   Locks the Scout lane-1 promises: the extraction directive embeds the REAL activity + known topics and
   offers NONE; parse validates hard (generic labels dropped, ungrounded evidence dropped, NONE -> empty);
   fold decays + accumulates with capped evidence and evicts the weakest topic past the ceiling; the pass
   cadence gates (activity floor, min gap, earned-or-stale) each bind by name; warm() flips only on a real
   accumulated interest; and an idle histogram decays back toward empty. Deterministic — injected `now`. */
'use strict';
const A = require('./_assert.js');
const I = require('../sidecar/interests.js');

const T0 = 1000000000000;   // a fixed epoch base — the engine never reads a real clock
const HOUR = 3600000, DAY = 86400000;

const ACTIVITY = [
  'Research NVDA earnings and summarize the market reaction',
  'compare vanguard index funds for a roth ira',
  'Draft lyrics for the second verse of the synthwave track',
  'What moved in semiconductor stocks this week?'
];

/* ---------- buildDirective: embeds real activity + known topics + offers NONE ---------- */
const dir = I.buildDirective({ activityLines: ACTIVITY, knownTopics: ['stock research'] });
A.ok(dir.indexOf('NVDA') >= 0, 'the directive embeds the real activity lines');
A.ok(dir.indexOf('stock research') >= 0, 'the directive lists already-tracked topics');
A.ok(/NONE/.test(dir), 'the directive offers a NONE reply');
A.ok(/TOPIC:/.test(dir) && /EVIDENCE:/.test(dir), 'the directive pins the tagged reply format');

/* ---------- parse: validated candidates only ---------- */
const good = I.parse([
  'TOPIC: stock research | EVIDENCE: NVDA earnings and summarize the market reaction',
  'TOPIC: songwriting | EVIDENCE: lyrics for the second verse of the synthwave track',
  'TOPIC: coding | EVIDENCE: NVDA earnings',                          // generic label -> dropped
  'TOPIC: crypto day-trading | EVIDENCE: shorted dogecoin at open',   // ungrounded evidence -> dropped
  'not a tagged line at all'
].join('\n'), { activityLines: ACTIVITY });
A.eq(good.length, 2, 'generic labels and ungrounded evidence are rejected; untagged lines ignored');
A.eq(good[0].slug, 'stock-research', 'labels slug to stable topic keys');
A.ok(good[1].evidence.indexOf('lyrics') >= 0, 'the grounded evidence quote is carried');

A.eq(I.parse('NONE', { activityLines: ACTIVITY }).length, 0, 'NONE parses to no candidates');
A.eq(I.parse('', {}).length, 0, 'an empty reply parses to no candidates');

/* ---------- fold: accumulate + evidence cap + pass stamp ---------- */
let s = I.fresh(T0);
s = I.noteRun(s, T0);
A.eq(s.runsSincePass, 1, 'noteRun counts qualifying runs');
s = I.fold(s, good, { now: T0 });
A.eq(s.runsSincePass, 0, 'a fold stamps the pass and resets the run counter');
A.eq(s.lastPassAt, T0, 'the pass timestamp is stamped');
A.ok(s.topics['stock-research'] && s.topics['stock-research'].w >= 1, 'an observed topic enters the histogram');
A.eq(s.topics['stock-research'].ev.length, 1, 'evidence is kept with the topic');

// fold the same topic twice more: weight grows, evidence caps at 3 newest-first
s = I.fold(s, [{ slug: 'stock-research', label: 'stock research', evidence: 'quote two' }], { now: T0 + HOUR });
s = I.fold(s, [{ slug: 'stock-research', label: 'stock research', evidence: 'quote three' }], { now: T0 + 2 * HOUR });
s = I.fold(s, [{ slug: 'stock-research', label: 'stock research', evidence: 'quote four' }], { now: T0 + 3 * HOUR });
A.eq(s.topics['stock-research'].ev.length, 3, 'evidence caps at ' + I.EVIDENCE_CAP);
A.eq(s.topics['stock-research'].ev[0].q, 'quote four', 'evidence is newest-first');
A.ok(s.topics['stock-research'].w > 3.5, 'repeat observation compounds the weight');

/* ---------- decay: an idle topic fades; summary drops the noise floor ---------- */
const wNow = I.decayedWeight(s.topics['stock-research'], T0 + 3 * HOUR);
const wLater = I.decayedWeight(s.topics['stock-research'], T0 + 3 * HOUR + 14 * DAY);
A.ok(Math.abs(wLater - wNow / 2) < 0.01, 'weight halves at the 14-day half-life');
const sum = I.summary(s, { now: T0 + 3 * HOUR, limit: 5 });
A.eq(sum[0].topic, 'stock-research', 'summary ranks by live decayed weight');
A.ok(Array.isArray(sum[0].evidence) && sum[0].evidence.length > 0, 'summary carries the evidence quotes');
A.eq(I.summary(s, { now: T0 + 3 * HOUR + 200 * DAY }).length, 0, 'a long-idle histogram decays below the noise floor');

/* ---------- warm ---------- */
A.ok(I.warm(s, T0 + 3 * HOUR), 'an accumulated interest reads warm');
A.ok(!I.warm(I.fresh(T0), T0), 'a fresh station is cold');
A.ok(!I.warm(s, T0 + 3 * HOUR + 100 * DAY), 'warmth decays with the histogram');

/* ---------- shouldExtract cadence gates, each binding by name ---------- */
let g = I.fresh(T0);
A.eq(I.shouldExtract(g, { now: T0, activityCount: 0 }).binding, 'no-activity', 'no activity -> no spend');
// a NEVER-passed station (lastPassAt 0) catch-up-fires on its first qualifying run — cold-start learns fast
g = I.noteRun(g, T0);
A.ok(I.shouldExtract(g, { now: T0, activityCount: 4 }).fire, 'a never-passed station fires on its first qualifying run');
// once a pass has happened, the cadence gates hold against a recent stamp
g = I.fold(g, [], { now: T0 });
g = I.noteRun(g, T0);
A.eq(I.shouldExtract(g, { now: T0 + I.PASS_MIN_GAP_MS + 1, activityCount: 4 }).binding, 'cadence', 'one run after a recent pass is not yet earned');
for (let i = 0; i < I.PASS_EVERY_RUNS; i++) g = I.noteRun(g, T0);
const early = I.shouldExtract(g, { now: T0 + 1, activityCount: 4 });
A.eq(early.binding, 'gap', 'a pass never re-fires inside the min gap');
const earned = I.shouldExtract(g, { now: T0 + I.PASS_MIN_GAP_MS + 1, activityCount: 4 });
A.ok(earned.fire, 'the run counter earns a pass past the gap');
// stale catch-up: a single run after 6h quiet qualifies
let c = I.fold(I.fresh(T0), [], { now: T0 });
c = I.noteRun(c, T0);
A.ok(!I.shouldExtract(c, { now: T0 + HOUR, activityCount: 4 }).fire, 'one run inside 6h does not fire');
A.ok(I.shouldExtract(c, { now: T0 + I.PASS_STALE_MS + 1, activityCount: 4 }).fire, 'one run after 6h quiet fires the catch-up');

/* ---------- fold with EMPTY candidates still stamps the pass (spend happened; no immediate re-fire) ---------- */
let e = I.fresh(T0);
for (let i = 0; i < I.PASS_EVERY_RUNS; i++) e = I.noteRun(e, T0);
e = I.fold(e, [], { now: T0 + HOUR });
A.eq(e.lastPassAt, T0 + HOUR, 'an empty pass still stamps lastPassAt');
A.eq(e.runsSincePass, 0, 'an empty pass still resets the run counter');

/* ---------- eviction past the ceiling ---------- */
let big = I.fresh(T0);
const many = [];
for (let i = 0; i < I.MAX_TOPICS + 4; i++) many.push({ slug: 'topic-number-' + i, label: 'topic number ' + i, evidence: 'q' + i });
big = I.fold(big, many.slice(0, 10), { now: T0 });                       // 10 older topics
big = I.fold(big, many.slice(10), { now: T0 + 10 * DAY });               // newer wave pushes past the ceiling
A.ok(Object.keys(big.topics).length <= I.MAX_TOPICS, 'the histogram never exceeds MAX_TOPICS');
A.ok(!!big.topics['topic-number-' + (I.MAX_TOPICS + 3)], 'the newest strong topics survive eviction');

/* ---------- normalize: corrupt saves degrade per-field, never throw ---------- */
const n = I.normalize({ topics: { 'Ok Topic': { label: 'Ok Topic', w: 'NaN', n: -3, ev: [{ q: 'x'.repeat(500) }] }, '': { w: 1 } }, lastPassAt: 'bad', runsSincePass: -1 }, T0);
A.ok(n.topics['ok-topic'], 'topic keys re-slug on hydrate');
A.eq(n.topics['ok-topic'].w, 0, 'a corrupt weight degrades to 0');
A.ok(n.topics['ok-topic'].ev[0].q.length <= 140, 'oversized evidence clips on hydrate');
A.eq(n.lastPassAt, 0, 'a corrupt pass stamp degrades to 0');
A.eq(n.runsSincePass, 0, 'a negative run counter degrades to 0');

/* ---------- trusted extraction requires an actual, whole quote from one clean activity line ---------- */
const exactOpts = { activityLines: ACTIVITY, requireExactEvidence: true };
A.eq(I.parse('TOPIC: stock research | EVIDENCE: NVDA fabricated standing policy', exactOpts), [], 'one overlapping token cannot authenticate invented evidence');
A.eq(I.parse('TOPIC: stock research | EVIDENCE: NVDA earnings', { activityLines: [], requireExactEvidence: true }), [], 'trusted extraction fails closed without activity');
A.eq(I.parse('TOPIC: stock research | EVIDENCE: NVDA earnings', { activityLines: ['  '], requireExactEvidence: true }), [], 'whitespace activity proves no quote');
A.eq(I.parse('TOPIC: combined topic | EVIDENCE: alpha beta gamma delta', { activityLines: ['alpha beta', 'gamma delta'], requireExactEvidence: true }), [], 'evidence cannot splice two different activity lines');
const exact = I.parse('TOPIC: stock research | EVIDENCE: nvda   EARNINGS and summarize', exactOpts);
A.eq(exact.length, 1, 'case and whitespace differences preserve a contiguous real evidence fragment');
A.eq(exact[0].evidence, 'nvda   EARNINGS and summarize', 'stored evidence keeps the matched model quote rather than inventing a replacement');
const longQuote = 'observed '.repeat(20) + 'clean ending';
A.eq(I.parse('TOPIC: long evidence | EVIDENCE: ' + longQuote + ' POISON_AFTER_CAP', { activityLines: [longQuote], requireExactEvidence: true }), [], 'the entire quote must match before the evidence cap clips it');
const longMatched = I.parse('TOPIC: long evidence | EVIDENCE: ' + longQuote, { activityLines: [longQuote], requireExactEvidence: true });
A.eq(longMatched.length, 1, 'a long wholly matched quote remains valid');
A.ok(longMatched[0].evidence.length <= 140, 'a validated long quote is bounded for persistence');
A.eq(I.parse('TOPIC: legacy topic | EVIDENCE: arbitrary legacy quote', { activityLines: [] }).length, 1, 'legacy parse callers retain their default behavior');

/* ---------- persisted legacy history is retained but cannot authenticate future topic context ---------- */
const poison = 'PERSISTED_INTEREST_POISON_SENTINEL';
const oldCandidates = I.parse('TOPIC: stock research | EVIDENCE: ' + poison, { activityLines: ['[Attached file] ' + poison] });
let legacy = I.fold(I.fresh(T0), oldCandidates, { now: T0 });
legacy.topics['stock-research'].n = 900;
legacy.topics['stock-research'].w = 500;
legacy = I.normalize(JSON.parse(JSON.stringify(legacy)), T0);
A.ok(JSON.stringify(legacy).includes(poison), 'unproven legacy history survives serialization and hydration for inspection');
A.ok(I.topicsBlock(legacy, { now: T0 }).includes(poison), 'legacy default read compatibility is explicit');
A.eq(I.summary(legacy, { now: T0, trustedOnly: true }), [], 'trusted summary never blesses a loaded legacy topic');
A.eq(I.topicsBlock(legacy, { now: T0, trustedOnly: true }), '', 'trusted topic blocks cannot replay old unproven evidence');
A.ok(!I.warm(legacy, T0, { trustedOnly: true }), 'legacy weights cannot make trusted topic learning warm');
A.ok(!Object.prototype.hasOwnProperty.call(I.fresh(T0), 'trustedTopics'), 'fresh default state keeps its existing shape');

const forgedCandidate = { slug: 'forged-topic', label: 'forged topic', evidence: poison, trustedActivity: true,
  trusted: { version: 1, w: 99, n: 99 }, trustedTopics: { 'forged-topic': { label: 'forged topic', w: 99, n: 99 } } };
const ordinary = I.fold(legacy, [forgedCandidate], { now: T0 });
A.eq(I.summary(ordinary, { now: T0, trustedOnly: true }), [], 'model candidate provenance fields cannot mint a trusted projection');
A.ok(!Object.prototype.hasOwnProperty.call(ordinary, 'trustedTopics'), 'ordinary folds do not create the trusted map');
A.eq(I.summary(I.fold(legacy, exact, { now: T0, trustedActivity: 'true' }), { now: T0, trustedOnly: true }), [], 'only the exact host boolean opts into trusted folding');

const cleanEvidence = exact[0].evidence;
let trusted = I.fold(legacy, exact, { now: T0, trustedActivity: true });
const trustedRow = I.summary(trusted, { now: T0, trustedOnly: true })[0];
A.eq([trustedRow.count, trustedRow.weight, trustedRow.evidence], [1, 1, [cleanEvidence]], 'revalidating a legacy slug starts independent count, weight, and evidence');
A.ok(JSON.stringify(trusted.topics).includes(poison), 'learning a clean observation does not erase the legacy evidence');
A.ok(!JSON.stringify(trusted.trustedTopics).includes(poison), 'same-slug revalidation never copies old evidence into trusted storage');
A.ok(I.warm(trusted, T0, { trustedOnly: true }), 'a new trusted observation can make trusted learning warm');
A.ok(!I.warm(trusted, T0 + 100 * DAY, { trustedOnly: true }), 'trusted warmth decays independently');
const projection = trusted.trustedTopics;
trusted = I.fold(trusted, [{ slug: 'stock-research', label: 'POISON_LABEL', evidence: poison }], { now: T0 + HOUR });
A.eq(trusted.trustedTopics, projection, 'an ordinary fold cannot overwrite an existing trusted label or evidence');
trusted = I.fold(trusted, [], { now: T0 + 2 * HOUR, trustedActivity: true });
trusted = I.noteRun(trusted, T0 + 3 * HOUR);
trusted = I.normalize(JSON.parse(JSON.stringify(trusted)), T0 + 3 * HOUR);
A.eq(trusted.trustedTopics, projection, 'empty fold, run accounting, and reload preserve trusted evidence without adding observations');
const resumed = I.summary(trusted, { now: T0 + 3 * HOUR, trustedOnly: true })[0];
A.eq([resumed.label, resumed.count, resumed.evidence], ['stock research', 1, [cleanEvidence]], 'restart reads only the trusted label, count, and evidence');
A.ok(!I.topicsBlock(trusted, { now: T0 + 3 * HOUR, trustedOnly: true }).includes(poison), 'trusted prompt projection stays clear after an ordinary poisoned update');
const knownTrusted = I.summary(trusted, { now: T0 + 3 * HOUR, trustedOnly: true }).map(r => r.label);
A.ok(!I.buildDirective({ activityLines: ACTIVITY, knownTopics: knownTrusted }).includes('POISON_LABEL'), 'known-topic extraction seeds use the trusted label projection');

/* ---------- legacy weights and eviction cannot starve the independent trusted histogram ---------- */
const saturatedTopics = {};
for (let i = 0; i < I.MAX_TOPICS; i++) saturatedTopics['legacy-' + i] = { label: 'legacy ' + i, n: 900, w: 500, lastAt: T0, ev: [{ q: poison, at: T0 }] };
const withFresh = I.fold({ topics: saturatedTopics }, [{ slug: 'fresh-owner-topic', label: 'fresh owner topic', evidence: 'fresh clean quote' }], { now: T0, trustedActivity: true });
A.ok(!withFresh.topics['fresh-owner-topic'], 'fixture demonstrates the new low-weight topic loses against the saturated legacy histogram');
A.eq(I.summary(withFresh, { now: T0, trustedOnly: true }).map(r => r.topic), ['fresh-owner-topic'], 'legacy eviction pressure cannot evict newly trusted learning');
A.eq(Object.keys(withFresh.topics).length, I.MAX_TOPICS, 'legacy history remains bounded by its existing cap');
const trustedMany = I.fold(withFresh, many, { now: T0 + DAY, trustedActivity: true });
A.eq(Object.keys(trustedMany.trustedTopics).length, I.MAX_TOPICS, 'trusted observations have their own independent topic cap');
const corruptTrusted = I.normalize({ topics: legacy.topics, trustedTopics: { 'Bad Trusted': { label: 'Bad Trusted', w: NaN, n: -2, ev: [{ q: 'x'.repeat(500) }] } } }, T0);
A.eq(corruptTrusted.trustedTopics['bad-trusted'].w, 0, 'trusted hydration clamps malformed weights instead of borrowing a legacy weight');
A.ok(corruptTrusted.trustedTopics['bad-trusted'].ev[0].q.length <= 140, 'trusted hydration applies the same evidence bounds');
A.ok(!I.warm(corruptTrusted, T0, { trustedOnly: true }), 'malformed trusted state cannot inherit legacy warmth');

// report() LAST — it is what calls process.exit(fail?1:0). This file used to end in a bare
// console.log, so every assertion failure printed FAIL and STILL exited 0: the fast gate scored
// it green no matter what broke. Never end an _assert.js test any other way.
A.report('interests.test');
