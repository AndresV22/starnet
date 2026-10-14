/* node test/markdown-everywhere.test.js — one reading of an answer, everywhere it is shown (live walk 10-14, seams 2/3/11/17).

   The walker ran one line job whose answer was markdown ('## Findings', '- **Item one:**', '`code`') and found it printed raw
   in three places while WORKFLOWS and the Workflow panel drew it rendered. Locked here by EXECUTING the shipped functions
   (sliced with A.fnBody or required as UMD) over the real COMMS renderer built from chat.js:
     #2   DELIVERABLES › TO REVIEW › WHAT CAME BACK is drawn by Chat.renderProse (escape-first) — and so is the library card's
          WHAT CAME BACK below it, once its drawer opens; a fenced block's ⧉ key works outside COMMS
     #3   the COMMS INBOX "prove the line" card quotes the reply as plain words (Deliverables.plainLine), never markdown
     #11  the goal-arc confirm panel's milestones are plain words (no '**', no '`', no '## ' header as a step)
     #17  TO REVIEW's collapsed glance leaves no stray space where `code` was (the rest of #17: walk-consistency-1014.test.js) */
'use strict';
const A = require('./_assert.js');
let pending = 1;   // async checks still out (each calls finish())
function finish() { if (--pending === 0) A.report(); }
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const D = require('../frontend/app/deliverables.js');
const REPLY = '## Findings\n\n- **Item one:** the first point, plainly said.\n- **Item two:** a second point with `code`.\n\nDone — that is the answer.';
const PLAIN = 'Findings Item one: the first point, plainly said. Item two: a second point with code. Done — that is the answer.';

/* ---------- the real COMMS renderer, built from chat.js exactly as test/chat-code-copy.test.js does ---------- */
const chatSrc = rd('frontend/app/chat.js');
function extract(name) {
  const m = new RegExp('(  function ' + name + '\\([\\s\\S]*?\\n  \\})').exec(chatSrc);
  A.ok(m, 'chat.js still defines ' + name + '()');
  return m ? m[1] : '';
}
// eslint-disable-next-line no-new-func
const renderMarkdown = new Function(
  /const HTML_ESC = \{[^}]*\};/.exec(chatSrc)[0] + '\n' + /  const REL_PATH = [^\n]*;/.exec(chatSrc)[0] + '\n' +
  ['escapeHtml', 'linkify', 'mdInline', 'hostOf', 'linkHostNote', 'fileRefLink', 'fileRefImage', 'reportInline', 'renderFence', 'renderMarkdown'].map(extract).join('\n') +
  '\nreturn renderMarkdown;')();
// eslint-disable-next-line no-new-func
const renderProse = new Function('renderMarkdown', 'hydrateFileRefs', /const MD_MARKERS = [^;]+;/.exec(chatSrc)[0] + '\n' + extract('renderProse') + '\nreturn renderProse;')(renderMarkdown, () => {});
const Chat = { renderProse };
const el = () => { const cls = new Set(); return { textContent: '', innerHTML: '', classList: { add: c => cls.add(c), has: c => cls.has(c) }, cls }; };
const rendered = n => /<span class="md-h"[^>]*>Findings<\/span>/.test(n.innerHTML) && (n.innerHTML.match(/<li>/g) || []).length === 2
  && /<code class="md-code">code<\/code>/.test(n.innerHTML) && !/\*\*|## |`/.test(n.innerHTML);

/* ---------- #2 TO REVIEW › WHAT CAME BACK ---------- */
{
  const ob = rd('frontend/app/windows/outbox.js');
  const answerInto = A.fnBody(ob, '  function answerInto(out, text)');
  A.ok(answerInto.length > 20 && answerInto.length < 2000, 'outbox.js has answerInto (one reading of an answer)');
  const run = globals => vm.runInContext(answerInto + '\nanswerInto;', vm.createContext(Object.assign({}, globals)));
  const out = el();
  run({ Chat })(out, REPLY);
  A.ok(rendered(out), 'WHAT CAME BACK draws the heading, the two bullets and the code span — no raw ** / ## / `: ' + out.innerHTML.slice(0, 200));
  A.ok(out.cls.has('wf-md'), 'on the panel scale COMMS prose uses elsewhere (wf-md)');
  const bad = el();
  run({ Chat })(bad, '<img src=x onerror=alert(1)>\n**bold** [x](javascript:alert(1))');
  A.ok(/&lt;img src=x onerror=alert\(1\)&gt;/.test(bad.innerHTML) && !/<img|href="javascript/i.test(bad.innerHTML), 'a reply’s markup never runs (escape-first): ' + bad.innerHTML);
  const bare = el();
  run({})(bare, REPLY);
  A.eq([bare.textContent, bare.innerHTML], [REPLY, ''], 'where COMMS’ renderer is not loaded the answer is plain text, never innerHTML');
  const build = A.fnBody(ob, '  function buildOutbox(body)');
  A.ok(/answerInto\(out, /.test(build) && !/out\.textContent = lastReply/.test(build), 'readResult draws the reply through answerInto');
  A.ok(/\.ob-out\.wf-md \{ white-space: normal; \}/.test(rd('frontend/css/app.css')), 'the rendered answer drops the plain-text pre-wrap (its blocks wrap themselves)');

  /* the collapsed glance (#17): the library's one plain line — no '## ', no list dashes, no stray space where `code` was */
  const plain = A.fnBody(ob, '  function plain(s)');
  A.ok(plain.length > 20 && plain.length < 1000, 'outbox.js has plain(s)');
  const glance = vm.runInContext(plain + '\nplain;', vm.createContext({ Deliverables: D, String }));
  A.eq(glance(REPLY), PLAIN, 'the TO REVIEW glance reads as words: “…with code.” (not “with code .”)');
  A.ok(!/const plain = s =>/.test(build), 'no second markdown stripper inside buildOutbox');
}

/* ---------- #2 the library card's WHAT CAME BACK (same window, same renderer) ---------- */
{
  const dl = rd('frontend/app/deliverables.js');
  const proseSaid = A.fnBody(dl, '    function proseSaid(more, r)');
  A.ok(proseSaid.length > 20 && proseSaid.length < 2000, 'deliverables.js has proseSaid');
  const said = el(); said.__prose = false;
  const more = { querySelector: s => (s === '.dlv-said' ? said : null) };
  const fn = vm.runInContext(proseSaid + '\nproseSaid;', vm.createContext({ Chat }));
  fn(more, { run: { deliveryText: REPLY } });
  A.ok(rendered(said) && said.cls.has('wf-md'), 'the library drawer’s WHAT CAME BACK is drawn by the same renderer as TO REVIEW');
  said.innerHTML = 'kept'; fn(more, { run: { deliveryText: REPLY } });
  A.eq(said.innerHTML, 'kept', 'drawn once per drawer');
  const toggle = A.fnBody(dl, '    function toggleCard(headBtn)');
  A.ok(/proseSaid\(more, rows\[Number\(card\.dataset\.i\)\]\)/.test(toggle), 'opening a library drawer draws its answer');
  // the ⧉ key of a fenced block drawn outside COMMS copies that block (one document-level handler in chat.js) — executed
  const wire = A.fnBody(chatSrc, "    if (typeof document !== 'undefined' && !document.__proseCopyWired)");
  A.ok(wire.length > 40 && wire.length < 2000, 'chat.js wires one document-level copy handler for .wf-md code blocks');
  const handlers = [], copied = [], shown = [];
  const ctx = vm.createContext({ document: { addEventListener: (t, fn) => { if (t === 'click') handlers.push(fn); } },
    copyText: t => { copied.push(t); return Promise.resolve(true); }, showCopyResult: (b, ok) => shown.push([b.id, ok]) });
  vm.runInContext(wire, ctx); vm.runInContext(wire, ctx);
  A.eq(handlers.length, 1, 'wired once, however often COMMS re-inits');
  const pre = { textContent: 'npm run dev' }, wrapEl = { querySelector: s => (s === '.md-pre' ? pre : null) };
  const key = { id: 'k', closest: s => (s === '.md-pre-wrap' ? wrapEl : null) };
  handlers[0]({ target: { closest: s => (s === '.wf-md .md-copy' ? key : null) } });
  handlers[0]({ target: { closest: () => null } });
  Promise.resolve().then(() => {
    A.eq([copied, shown], [['npm run dev'], [['k', true]]], 'the ⧉ key copies exactly its own block and confirms; any other click is ignored');
    finish();
  });
  pending++;
  const wfcss = rd('frontend/css/workflow-panel.css');
  A.ok(/\.wf-md \.md-pre \{[^}]*white-space: pre;/.test(wfcss) && /\.wf-md \.md-copy \{[^}]*position: absolute;/.test(wfcss) && /\.wf-md \.md-table th, \.wf-md \.md-table td/.test(wfcss), 'code blocks keep their lines, the copy key sits on the block, tables are ruled (wf-md)');
  A.ok(/\.wf-md \.md-code \{ font-family: inherit;/.test(wfcss), 'a code span keeps the station face (live: it fell back to the browser monospace, bigger than its line)');
}

/* ---------- #3 the COMMS INBOX card's quote ---------- */
{
  const pq = A.fnBody(chatSrc, '  function plainQuote(raw, max)');
  A.ok(pq.length > 20 && pq.length < 1000, 'chat.js has plainQuote');
  const plainQuote = vm.runInContext(pq + '\nplainQuote;', vm.createContext({ Deliverables: D, String }));
  A.eq(plainQuote(REPLY, 220), '“' + PLAIN + '”', 'the delivered card quotes the reply as plain words');
  A.eq(plainQuote('**' + 'x'.repeat(300) + '**', 220), '“' + 'x'.repeat(220) + '…”', 'a long reply is cut with an ellipsis');
  A.eq(plainQuote('', 220), '', 'no reply, no quote');
  const card = A.fnBody(chatSrc, '  function sampleCard(opts)');
  A.ok(/plainQuote\(j\.replies\[j\.replies\.length - 1\], 220\)/.test(card), 'the INBOX card quotes through plainQuote');
}

/* ---------- #17 the one plain line itself ---------- */
{
  A.eq(D.plainLine(REPLY), PLAIN, 'plainLine: headings, list dashes, bold and code marks drop; words stay');
  A.eq(D.plainLine('Run this:\n```js\nconst a = 1;\n```\nthen\n\n| a | b |\n|---|:---:|\n| 1 | 2 |\n\n---\nend'), 'Run this: then a b 1 2 end', 'plainLine: a fenced block, a table’s rule row and pipes, a --- rule drop');
  A.eq(D.plainLine('**TEASER 1:** Your _agents_ never sleep. ## Subject - [Read more](https://x.test) and `code`'), 'TEASER 1: Your agents never sleep. Subject - Read more and code', 'a server-folded one-line summary still reads as before');
}

/* ---------- #11 the goal-arc milestones ---------- */
{
  const G = require('../frontend/app/goals.js');
  const reply = '## Launch roadmap for the harness\n1. **Ship** the `cli` MVP to ten users\n2. Write the **launch** post for [HN](https://news.ycombinator.com)\n3. Collect feedback from `beta` testers';
  A.eq(G.parseDecomposition(reply, { plain: D.plainLine }), ['Ship the cli MVP to ten users', 'Write the launch post for HN', 'Collect feedback from beta testers'],
    'milestones are plain words, and a markdown header is not a step');
  A.eq(G.parseDecomposition('1. Set up the runtime\n2. Wire the event bus\n3. Build the first agent loop'), ['Set up the runtime', 'Wire the event bus', 'Build the first agent loop'], 'a plain numbered reply parses as before');
  // the live wiring: GoalStore hands the parser the library's plain line
  const mem = {};
  global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  global.Goals = G; global.Deliverables = D;
  global.DossierStore = { beliefs: dim => (dim === 'goals' ? [{ id: 'cd_9', text: 'launch the harness to real users' }] : []) };
  global.fetch = () => Promise.resolve({ ok: true });
  global.Harness = { chat: async () => ({ text: reply, error: false }) };
  const { GoalStore } = require('../frontend/app/goalstore.js');
  GoalStore.init({ now: () => 1000, getSystem: () => '' });
  GoalStore.proposeDecomposition().then(p => {
    A.eq(p && p.texts, ['Ship the cli MVP to ten users', 'Write the launch post for HN', 'Collect feedback from beta testers'], 'the confirm panel is offered plain milestones');
    finish();
  }, e => { A.ok(false, 'proposeDecomposition threw: ' + (e && e.message)); finish(); });
}

