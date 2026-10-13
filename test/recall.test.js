/* node test/recall.test.js — agent-callable conversation recall (H1.3).
   Proves transcriptStore.search() ranks the row containing a query phrase first (BM25-ish: distinct terms, then
   frequency, then recency), is stream-scoped, and that the recall_conversation tool returns the match / guards an
   empty query / degrades gracefully. Pure + deterministic (injected clock, in-memory io). */
'use strict';
const A = require('./_assert.js');
const { makeTranscriptStore } = require('../sidecar/transcriptstore.js');
const { makeRecallTool } = require('../sidecar/tools/builtin/recall.js');

function memIo() { const lines = []; return { lines, readAll() { return lines.slice(); }, append(e) { lines.push(e); } }; }
let clk = 1000; const clock = { now: () => clk };

(async () => {
  // ---- A. search(): a phrase from turn #3 ranks that turn FIRST among 50 ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    for (let i = 0; i < 50; i++) { clk = 1000 + i; s.append({ streamId: 's1', role: 'user', content: 'message number ' + i + ' about ' + (i === 3 ? 'the quarterly budget reconciliation plan' : 'misc topic ' + i) }); }
    const hits = s.search('s1', 'quarterly budget reconciliation', { limit: 5 });
    A.ok(hits.length >= 1, 'search returns matches');
    A.ok(hits[0].content.indexOf('number 3 ') >= 0, 'the turn containing the phrase ranks FIRST');
  }

  // ---- B. search() is stream-scoped (never leaks another workstream's dialogue) ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    s.append({ streamId: 'a', role: 'user', content: 'alpha secret pumpkin' });
    s.append({ streamId: 'b', role: 'user', content: 'beta pumpkin elsewhere' });
    const hits = s.search('a', 'pumpkin', { limit: 5 });
    A.eq(hits.length, 1, 'only the queried stream is searched');
    A.ok(hits[0].content.indexOf('alpha') >= 0, 'returns stream a, not stream b');
  }

  // ---- C. search(): empty/no-match queries are safe ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    s.append({ streamId: 'x', role: 'user', content: 'hello world' });
    A.eq(s.search('x', '', { limit: 5 }), [], 'empty query -> no matches');
    A.eq(s.search('x', 'zzzznomatch', { limit: 5 }), [], 'no-overlap query -> no matches');
  }

  // ---- D. the recall_conversation tool: returns matches, scoped by ctx.streamId ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    s.append({ streamId: 's9', role: 'user', content: 'we agreed to ship the airlock fix on friday' });
    s.append({ streamId: 's9', role: 'assistant', content: 'confirmed, airlock fix friday' });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    A.eq(recallTool.name, 'recall_conversation', 'tool name');
    A.eq(recallTool.capability, 'memory', 'joins the NOTEBOOK (memory) capability');
    A.eq(recallTool.requiresConsent, false, 'read-only, no consent');
    const r = await recallTool.run({ query: 'airlock friday' }, { streamId: 's9' });
    A.ok(r.content.indexOf('airlock') >= 0, 'tool surfaces the matching dialogue');
    A.ok(/match/.test(r.summary), 'summary reports match count');
    s.append({ streamId: 's9', role: 'user', content: '\u041f\u0440\u0438\u0432\u0435\u0442 \u043a\u043e\u043c\u0430\u043d\u0434\u0438\u0440 \u6771\u4eac\u8a08\u753b' });
    const unicode = await recallTool.run({ query: '\u041f\u0440\u0438\u0432\u0435\u0442' }, { streamId: 's9' });
    A.ok(unicode.content.indexOf('\u041f\u0440\u0438\u0432\u0435\u0442') >= 0, 'tool surfaces a matching Cyrillic dialogue turn');
    const cjk = await recallTool.run({ query: '\u6771\u4eac' }, { streamId: 's9' });
    A.ok(cjk.content.indexOf('\u6771\u4eac\u8a08\u753b') >= 0, 'tool surfaces a matching unspaced CJK phrase');
  }

  // ---- E. the tool guards an empty transcript + a missing store ----
  {
    const { recallTool } = makeRecallTool({ transcriptStore: makeTranscriptStore({ io: memIo(), clock }) });
    // an argument-less call is now BROWSE (list workstreams), so on an EMPTY store it must say there is no
    // recorded conversation — never invent one.
    const empty = await recallTool.run({ query: '   ' }, { streamId: 's1' });
    A.ok(/no recorded conversation/i.test(empty.content), 'empty store + no query -> honest "nothing recorded"');
    const noStore = makeRecallTool({}).recallTool;
    const r = await noStore.run({ query: 'x' }, { streamId: 's1' });
    A.ok(/unavailable/i.test(r.content), 'missing transcriptStore -> graceful "unavailable"');
  }

  // ---- F. store: scope:'all' spans every workstream, and every hit is ATTRIBUTED ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    clk = 2000; s.append({ streamId: 'a', role: 'user', content: 'alpha secret pumpkin' });
    clk = 2001; s.append({ streamId: 'b', role: 'user', content: 'beta pumpkin elsewhere' });
    const scoped = s.search('a', 'pumpkin', { limit: 5 });
    A.eq(scoped.length, 1, 'default scope is still ONE stream (no behaviour drift)');
    A.eq(scoped[0].streamId, 'a', 'a hit carries its own streamId');
    const all = s.search('a', 'pumpkin', { limit: 5, scope: 'all' });
    A.eq(all.length, 2, "scope:'all' searches every workstream");
    A.eq(all.map(h => h.streamId).sort(), ['a', 'b'], 'cross-stream hits are attributable to their workstream');
  }

  // ---- G. store: streams() browse + around() scroll ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    clk = 3000; s.append({ streamId: 'old', role: 'user', content: 'the docking clamp question' });
    clk = 4000; s.append({ streamId: 'new', role: 'user', content: 'the reactor question' });
    clk = 4001; s.append({ streamId: 'new', role: 'assistant', content: 'reactor answer' });
    const list = s.streams({ limit: 10 });
    A.eq(list.length, 2, 'browse lists every workstream');
    A.eq(list[0].streamId, 'new', 'most recently active workstream leads');
    A.eq(list[0].turns, 2, 'turn count is real');
    A.ok(list[0].preview.indexOf('reactor') >= 0, 'preview shows the last USER line (the topic)');
    A.ok(list[1].preview.indexOf('docking clamp') >= 0, 'each stream keeps its own preview');
    // scroll: anchored on a ts, returns the surrounding window of THAT stream only
    const win = s.around('new', 4001, { window: 5 });
    A.eq(win.length, 2, 'scroll returns the stream window around the anchor');
    A.ok(win.every(r => r.streamId === 'new'), 'scroll never leaks another workstream');
    A.eq(s.around('nope', 4001, { window: 5 }), [], 'scroll on an unknown stream -> empty, not a throw');
  }

  // ---- H. the tool: AUTO-WIDENS a zero-hit stream search instead of claiming it never happened ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    clk = 5000; s.append({ streamId: 'other', role: 'user', content: 'we decided to use postgres for the ledger' });
    clk = 5001; s.append({ streamId: 'here', role: 'user', content: 'unrelated chatter' });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    const r = await recallTool.run({ query: 'postgres ledger' }, { streamId: 'here' });
    A.ok(r.content.indexOf('postgres') >= 0, 'the answer one workstream over is FOUND, not denied');
    A.ok(/searched all of them/i.test(r.content), 'and the widening is stated, not silent');
    A.ok(r.content.indexOf('[other') >= 0, 'the cross-stream hit names its workstream');
    // an EXPLICIT stream scope is honoured — no surprise widening when the caller pinned it
    const pinned = await recallTool.run({ query: 'postgres ledger', scope: 'stream' }, { streamId: 'here' });
    A.ok(/no messages/i.test(pinned.content), "scope:'stream' does not auto-widen");
  }

  // ---- I. the tool: browse + scroll shapes ----
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    clk = 6000; s.append({ streamId: 'w1', role: 'user', content: 'first topic' });
    clk = 6001; s.append({ streamId: 'w1', role: 'assistant', content: 'first answer' });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    const browse = await recallTool.run({}, { streamId: 'w1' });
    A.ok(browse.content.indexOf('w1') >= 0, 'no-arg call browses the workstreams');
    A.ok(/workstream/i.test(browse.summary), 'browse summary counts workstreams');
    const scroll = await recallTool.run({ around: 6001 }, { streamId: 'w1' });
    A.ok(scroll.content.indexOf('first topic') >= 0, 'scroll reads the turns around the anchor');
    A.ok(/turn/i.test(scroll.summary), 'scroll summary counts turns');
    const bad = await recallTool.run({ around: 'nonsense' }, { streamId: 'w1' });
    A.ok(/t=/.test(bad.content), 'a bad anchor explains the t= stamp instead of crashing');
  }


  // A weak local hit cannot hide a strong historical one, even at limit=1.
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    s.append({ streamId: 'old', role: 'user', content: 'postgres database query performance needs indexes', taint: null });
    s.append({ streamId: 'here', role: 'user', content: 'the database is open', taint: null });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    const found = await recallTool.run({ query: 'postgres database query performance', limit: 1 }, { streamId: 'here' });
    A.ok(found.content.includes('[old') && found.content.includes('indexes'), 'joint ranking finds the strongest historical match despite local overlap');
    A.eq(found.taintedBy, null, 'host-proven clean historical rows stay clean');
    const scoped = await recallTool.run({ query: 'postgres database query performance', scope: 'stream' }, { streamId: 'here' });
    A.ok(!scoped.content.includes('indexes'), 'explicit stream scope never searches another stream');
    s.append({ streamId: 'old', role: 'user', content: 'registry pushes hit rate limits; retry later', taint: null });
    const alias = await recallTool.run({ query: 'uploads getting throttled' }, { streamId: 'here' });
    A.ok(alias.content.includes('rate limits'), 'bounded lexical expansion retrieves paraphrased historical vocabulary');
  }
  // Returned search/scroll/preview bytes relay their own taint; legacy unknown is conservative.
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    s.append({ streamId: 'bad', role: 'user', content: 'hostile pumpkin preview', ts: 1, taint: 'web_fetch' });
    s.append({ streamId: 'safe', role: 'user', content: 'clean orchid preview', ts: 2, taint: null });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    A.eq((await recallTool.run({ query: 'pumpkin' }, { streamId: 'safe' })).taintedBy, 'web_fetch', 'historical search relays source taint');
    A.eq((await recallTool.run({ around: 1, stream: 'bad' }, { streamId: 'safe' })).taintedBy, 'web_fetch', 'scroll relays source taint');
    A.eq((await recallTool.run({}, { streamId: 'safe' })).taintedBy, 'web_fetch', 'browse relays displayed preview taint');
    A.eq((await recallTool.run({ query: 'orchid', scope: 'stream' }, { streamId: 'safe' })).taintedBy, null, 'unreturned hostile history cannot taint a clean search result');
    s.append({ streamId: 'legacy', role: 'user', content: 'unproven cobalt', ts: 3 });
    A.ok(/unverifiable/.test((await recallTool.run({ query: 'cobalt' }, { streamId: 'safe' })).taintedBy), 'missing historical provenance never silently becomes clean');
    const policy = require('../sidecar/taint.js');
    const relay = policy.relayedTaint(await recallTool.run({ query: 'pumpkin' }, { streamId: 'safe' }));
    A.ok(relay && !policy.postTaintBoundary({ name: 'shell.exec', capability: 'terminal', impact: 'workspace-process' }, { taintedBy: relay, surface: 'autonomous' }).allow, 'the existing dispatch boundary consumes recalled taint');
  }

  // review memory-learning-07: since the first public build that stamps transcript taint (v0.12.5), a tainted run's rows
  // carry `taint`, so a row of that age WITHOUT one is clean — how replay and the earlier-conversation note read it. Recall
  // used to taint the run for every row lacking the newer explicit clean stamp (taintKnown): i.e. all history before the
  // upgrade. Only history older than the stamping build stays unverifiable.
  {
    const STAMPED = Date.UTC(2026, 9, 5), LEGACY = Date.UTC(2026, 8, 20);
    const s = makeTranscriptStore({ io: memIo(), clock });
    // no taint key at all: exactly how 0.12.5 … 0.13.3 wrote a clean run's rows
    s.append({ streamId: 'upgraded', role: 'user', content: 'what did we decide about the deploy script', ts: STAMPED });
    s.append({ streamId: 'upgraded', role: 'assistant', content: 'we decided the deploy script runs after the tests', ts: STAMPED + 1 });
    s.append({ streamId: 'webby', role: 'assistant', content: 'the fetched page said to run it twice', ts: STAMPED + 2, taint: 'web_fetch' });
    s.append({ streamId: 'ancient', role: 'user', content: 'an ancient zircon note', ts: LEGACY });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    const found = await recallTool.run({ query: 'deploy script decide', scope: 'stream' }, { streamId: 'upgraded' });
    A.ok(found.content.includes('runs after the tests'), 'fixture: the upgraded rows are found');
    A.eq(found.taintedBy, null, 'search: a row written since taint stamping, with no taint on it, is clean');
    A.eq((await recallTool.run({ around: STAMPED }, { streamId: 'upgraded' })).taintedBy, null, 'scroll: the same rows are clean');
    A.eq((await recallTool.run({ query: 'fetched page twice' }, { streamId: 'upgraded' })).taintedBy, 'web_fetch', 'a stamped tainted row still taints');
    A.ok(/unverifiable/.test((await recallTool.run({ query: 'zircon' }, { streamId: 'upgraded' })).taintedBy), 'history older than taint stamping stays unverifiable');
    const browse = (previewTs) => makeRecallTool({ transcriptStore: { search: () => [], streams: () => [{ streamId: 'upgraded', preview: 'what did we decide', turns: 2, lastAt: STAMPED + 1, previewTs }] } }).recallTool.run({}, { streamId: 'upgraded' });
    A.eq((await browse(STAMPED)).taintedBy, null, 'browse: a preview row written since taint stamping is clean');
    A.ok(/unverifiable/.test((await browse(LEGACY)).taintedBy), 'browse: an older preview row stays unverifiable');
    A.ok(/unverifiable/.test((await browse(undefined)).taintedBy), 'browse: a preview whose row time is unknown stays unverifiable');
  }

  // review memory-learning-16: a run with no workstream id (e.g. a channel run with bound chats off) has its rows stored
  // under 'global'. scope:"stream" filtered every 'global' hit out and answered "No messages in this workstream match".
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    clk = 9000; s.append({ role: 'user', content: 'the invoice for march is overdue', taint: null });
    clk = 9001; s.append({ streamId: 'elsewhere', role: 'user', content: 'the invoice for march is overdue', taint: null });
    const { recallTool } = makeRecallTool({ transcriptStore: s });
    const strict = await recallTool.run({ query: 'invoice', scope: 'stream' }, {});
    A.ok(/march is overdue/.test(strict.content) && !/No messages/.test(strict.content), 'scope:"stream" with no workstream id finds the rows stored under global: ' + strict.content.slice(0, 80));
    A.ok(!strict.content.includes('elsewhere'), 'and still never another workstream');
    const tie = await recallTool.run({ query: 'invoice march overdue', limit: 1 }, {});
    A.ok(tie.content.includes('[global'), 'an equal match in this run\'s own (global) history outranks a newer one elsewhere: ' + tie.content.slice(0, 80));
  }

  // Failed provenance lookup is observable without disclosing exception/row bytes, and stays untrusted.
  {
    const failopen = require('../sidecar/failopen.js');
    const policy = require('../sidecar/taint.js');
    const tag = 'recall.taint-provenance';
    const before = failopen.counts()[tag] || 0;
    const privateText = 'private-cobalt-transcript';
    const row = { streamId: 'private-stream', role: 'user', content: privateText, ts: 7000 };
    const preview = { streamId: row.streamId, preview: privateText, turns: 1, lastAt: row.ts };
    let lookups = 0;
    const store = {
      search: () => [row], around: () => [row], streams: () => [preview],
      taintOf: () => {
        lookups++;
        const e = new Error('private-exception C:/private/history: ' + privateText);
        e.code = 'private-error-code';
        throw e;
      }
    };
    const { recallTool } = makeRecallTool({ transcriptStore: store });
    const calls = [{ query: 'cobalt', scope: 'stream' }, { around: 7000 }, {}];
    const warnings = [], originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      for (const args of calls) {
        const result = await recallTool.run(args, { streamId: row.streamId });
        A.ok(result.content.includes(privateText), 'provenance failure preserves the requested recall result');
        A.ok(/unverifiable/.test(result.taintedBy), 'provenance lookup failure remains untrusted in every recall shape');
        const relay = policy.relayedTaint(result);
        A.ok(relay && !policy.postTaintBoundary({ name: 'shell.exec', capability: 'terminal', impact: 'workspace-process' },
          { taintedBy: relay, surface: 'autonomous' }).allow, 'failed historical provenance still blocks autonomous shell');
      }
      A.eq(lookups, 3, 'search, scroll and browse each attempted provenance resolution');
      A.eq(failopen.counts()[tag], before + 3, 'every failed provenance lookup is counted');
      A.eq(warnings, [1, 2, 3].map(n => '[failopen] ' + tag + ' (x' + (before + n) + '): TAINT_LOOKUP_FAILED'),
        'diagnostics contain only the fixed category/code, never private errors, paths, rows or streams');

      row.taintKnown = true; preview.previewTaintKnown = true;
      for (const args of calls) {
        A.eq((await recallTool.run(args, { streamId: row.streamId })).taintedBy, null,
          'explicit host-proven clean provenance remains clean');
      }
      A.eq(lookups, 3, 'known provenance needs no fallback lookup');
      A.eq(failopen.counts()[tag], before + 3, 'known provenance adds no false failure diagnostic');
    } finally { console.warn = originalWarn; }
  }

  // A non-owner / group / delegated-worker run (host-minted ownStreamOnly) never reads the Commander's OTHER
  // workstreams in ANY shape: default search, scope:'all', a zero-local-hit auto-widen, browse, scroll. Owner runs keep it.
  {
    const s = makeTranscriptStore({ io: memIo(), clock });
    clk = 8000; s.append({ streamId: 'private-stream', role: 'user', content: 'the private budget is forty thousand', taint: null });
    clk = 8001; s.append({ streamId: 'group-chat', role: 'user', content: 'what has andrew said about the budget', taint: null });
    const owner = makeRecallTool({ transcriptStore: s, ownStreamOnly: () => false }).recallTool;
    A.ok((await owner.run({ query: 'budget' }, { streamId: 'group-chat' })).content.includes('forty thousand'), 'an owner run keeps cross-conversation recall');
    const { recallTool } = makeRecallTool({ transcriptStore: s, ownStreamOnly: () => true });
    const leaks = r => r.content.includes('forty thousand') || r.content.includes('private-stream');
    const shapes = [
      [{ query: 'budget' }, 'default search'],
      [{ query: 'budget', scope: 'all' }, "scope:'all'"],
      [{ query: 'private' }, 'a zero-local-hit search (no auto-widen)'],
      [{}, 'browse'],
      [{ around: 8000, stream: 'private-stream' }, 'scroll into a foreign stream']
    ];
    for (const [args, label] of shapes) {
      A.ok(!leaks(await recallTool.run(args, { streamId: 'group-chat' })), 'pinned run, ' + label + ': no row from the private workstream');
      A.ok(!leaks(await recallTool.run(args, {})), 'pinned run with no chat id, ' + label + ': no row from any workstream');
    }
    const own = await recallTool.run({ query: 'budget', scope: 'all' }, { streamId: 'group-chat' });
    A.ok(own.content.includes('what has andrew said'), "a pinned run still searches its own chat");
    A.ok(/limited to this chat/i.test(own.content), 'and says recall is limited to this chat (never implies it searched everything)');
    A.ok((await recallTool.run({}, { streamId: 'group-chat' })).content.includes('group-chat'), 'pinned browse shows only this chat');
    A.ok((await recallTool.run({ around: 8001 }, { streamId: 'group-chat' })).content.includes('what has andrew said'), 'pinned scroll reads this chat');
    const idx = require('fs').readFileSync(require('path').join(__dirname, '../sidecar/index.js'), 'utf8');
    A.ok(/makeRecallTool\(\{ transcriptStore, ownStreamOnly: \(\) => tasteWithheld \}\)/.test(idx),
      'the host pins recall to the run\'s own chat exactly when it withholds the Commander\'s taste (non-owner, group, their workers)');
  }

  A.report('recall.test');
})();
