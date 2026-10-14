/* node test/comms-render-seams.test.js — COMMS never shows machine syntax or harness chatter (rc walk 2026-10-14).

   A live walk on a real model (claude-haiku-4.5, Ask mode) found six seams in what COMMS draws. This file pins the ones
   that are not already pinned beside their engines (the marker grammar lives in fork.test.js, the marker-ended reply and
   the nudge wording in continuation-guard.test.js):
   A. THE BRIEF GATE'S PAUSE: a consequential call made before the Task Brief settles is HELD by the host and did not run.
      It drew a red "✗ team.dispatch failed" chip. The host stamps one shared summary (fork.js TaskIntent.GATE_HELD) and every
      surface draws that call as not-run: neutral chip, no red world pulse, no failed desk step. A station SETTING
      (station.control — group.add brought "MY READ" cards and the red chip) is setup like team.summon, never held.
   chat.js is browser-flow (DOM + streaming), not node-loadable, so — like comms-presence.test.js — its DOM-layer invariants
   are read from the source; the pure halves are executed. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const Fork = require('../frontend/app/fork.js');
const TaskIntent = Fork.TaskIntent;
const Policy = require('../sidecar/taskbrief-policy.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeStationControlTools } = require('../sidecar/tools/builtin/station-control.js');

/* ---------- A. the brief gate's pause is neutral, never a failure ---------- */
{
  const held = { isError: true, ok: false, summary: TaskIntent.GATE_HELD };
  A.ok(TaskIntent.isGateHeld(held), 'the host-stamped held result is recognised');
  A.ok(!TaskIntent.isGateHeld({ isError: true, summary: 'error' }), 'an ordinary failure is not a held call');
  A.ok(!TaskIntent.isGateHeld({ isError: false, summary: TaskIntent.GATE_HELD }), 'a success never reads as held');
  A.ok(/not run yet/.test(TaskIntent.GATE_HELD), 'the held summary says the call did not run: ' + TaskIntent.GATE_HELD);

  const idx = read('sidecar/index.js');
  const gate = /if \(!gate\.ok\) return \{[^\n]*\};/.exec(idx);
  A.ok(gate && /summary: TaskIntent\.GATE_HELD/.test(gate[0]), 'the host gate stamps the shared held summary (one source of truth)');
  A.ok(gate && /nothing ran/.test(gate[0]) && /make the brief call with no text before it and never mention the gate/.test(gate[0]), 'and tells the model nothing ran and not to narrate the gate');
  A.ok(gate && /isError: true/.test(gate[0]), 'the result stays an error for the model (the call really did not run)');

  const chat = read('frontend/app/chat.js');
  const rc = /function foldChipResult\(chip, ev\) \{[\s\S]*?\n  \}/.exec(chat);
  A.ok(rc && /TaskIntent\.isGateHeld\(ev\)/.test(rc[0]), 'the chip result fold (live rail and group rail) reads the held stamp');
  A.ok(/function resolveChip\(ev, fallbackName\) \{[\s\S]{0,500}foldChipResult\(chip, ev\);/.test(chat), 'the live rail folds results through it');
  A.ok(rc && /classList\.add\(heldCall \? 'held' : ev\.isError \? 'err' : 'ok'\)/.test(rc[0]), 'a held call draws the neutral .held chip, never .err');
  A.ok(rc && /heldCall \? 'not run yet'/.test(rc[0]) && !/heldCall \? '✗'/.test(rc[0]), 'its stat reads "not run yet", never ✗ failed');
  A.ok(/U\.bus\.emit\('agent\.tool_result', \{[^\n]*held: !!\(typeof TaskIntent !== 'undefined' && TaskIntent\.isGateHeld && TaskIntent\.isGateHeld\(ev\)\)/.test(chat), 'the bus copy carries held for the world');
  A.ok(/if \(tgt && !p\.held\) PropSprites\.pulseProp/.test(read('frontend/app/world.js')), 'the world never pulses a prop red for a call that did not run');
  A.ok(/s\.ok = \(typeof TaskIntent !== 'undefined' && TaskIntent\.isGateHeld && TaskIntent\.isGateHeld\(p\)\) \? null/.test(read('frontend/app/deskscreen.js')), 'the desk screen records no outcome (not a failed step)');
  const css = read('frontend/css/comms.css');
  A.ok(/\.tool-chip\.held \.tc-glyph,\s*\n\.tool-chip\.held \.tc-stat\s*\{ color: var\(--ph-dim\); \}/.test(css), 'the held chip is plain dim phosphor (no red)');

  // a station setting is setup, not the deliverable: station.control passes an unsettled brief; station.power still waits
  const reg = makeRegistry();
  makeStationControlTools({ station: { request: async () => ({ ok: true }) }, route: async () => ({ status: 200, json: { ok: true } }), surface: 'interactive' }).register(reg);
  A.eq(Policy.canMutate({ status: 'ready' }, reg.get('station.control')).ok, true, 'station.control (group.add, rename…) is never held behind the Task Brief');
  A.eq(Policy.canMutate({ status: 'ready' }, reg.get('station.power')).ok, false, 'station.power (an escalation) still waits for brief_proceed');
}

/* ---------- A2. the LIVE reply (chat.js streamingAgent, executed) never shows a choice marker, and keeps every prose line ---------- */
{
  const vm = require('vm');
  const chat = read('frontend/app/chat.js');
  const part = (start, end) => { const i = chat.indexOf(start), j = chat.indexOf(end, i + start.length); A.ok(i >= 0 && j > i, 'chat.js has ' + start.trim()); return chat.slice(i, j); };
  const renders = [];
  const row = () => ({ d: { classList: { add() {} }, appendChild() {}, remove() {} }, body: { textContent: 'x', addEventListener() {} } });
  const c = vm.createContext({ Fork, activeWs: { id: 's', agentId: 'agent' }, row, renderProse: (el, text) => { renders.push(text); el.textContent = text; },
    turnFileRefs: () => null, endToolRail() {}, autoscroll() {}, document: { hidden: true, createElement: () => ({ remove() {} }) } });
  vm.runInContext(part('  function streamingAgent(', '  // close the live paragraph (if any)'), c);
  const live = c.streamingAgent();
  live.append('One thing first. Is it:\n\n**FORK: which angle?** || local-first | pixel art');
  A.eq(renders.at(-1), 'One thing first. Is it:', 'a bold FORK never renders in the live reply');
  live.append('\n\nTASK_QUESTION: who is it fo');
  A.ok(!/TASK_QUESTION/.test(renders.at(-1)), 'a marker still being typed is held back: ' + JSON.stringify(renders.at(-1)));
  const prose = c.streamingAgent();
  prose.append('The FORK: in the road');
  A.eq(renders.at(-1), 'The', 'the last line waits while it could still become a marker');
  prose.done();
  A.eq(renders.at(-1), 'The FORK: in the road', 'and shows in full the moment the paragraph closes');
}

/* ---------- B. *italic* renders as italics in COMMS and group replies (one renderer: Chat.renderProse) ---------- */
{
  const src = read('frontend/app/chat.js');
  const extract = name => { const m = new RegExp('(  function ' + name + '\\([\\s\\S]*?\\n  \\})').exec(src); A.ok(m, 'chat.js defines ' + name + '()'); return m[1]; };
  const esc = /const HTML_ESC = \{[^}]*\};/.exec(src);
  // eslint-disable-next-line no-new-func
  const reportInline = new Function(esc[0] + '\n' + extract('escapeHtml') + '\n' + extract('linkify') + '\n' + extract('hostOf') + '\n'
    + extract('linkHostNote') + '\n' + extract('reportInline') + '\nreturn reportInline;')();
  A.eq(reportInline('- Lean on *speed* first'), '- Lean on <span class="md-i">speed</span> first', 'a single-asterisk word is italic, not raw');
  A.eq(reportInline('what a developer actually *does* with it'), 'what a developer actually <span class="md-i">does</span> with it', 'the walk\'s "*does*" renders italic');
  A.eq(reportInline('*Run* it twice'), '<span class="md-i">Run</span> it twice', 'italic at the start of a line');
  A.eq(reportInline('a *two word* phrase'), 'a <span class="md-i">two word</span> phrase', 'an italic phrase');
  A.ok(reportInline('**bold** and *soft*').includes('<span class="md-b">bold</span> and <span class="md-i">soft</span>'), 'bold and italic side by side');
  A.eq(reportInline('2*3*4 = 24'), '2*3*4 = 24', 'arithmetic keeps its asterisks (no word may open an italic)');
  A.eq(reportInline('5 * 3 * 2'), '5 * 3 * 2', 'spaced asterisks are not italics');
  A.eq(reportInline('glob *.js and *.md'), 'glob *.js and *.md', 'a glob is not italic (its close is followed by a word or nothing closes it)');
  A.eq(reportInline('*<b>x</b>*'), '<span class="md-i">&lt;b&gt;x&lt;/b&gt;</span>', 'italic text stays HTML-escaped');
  A.ok(/\\\*\[\^\\s\*\]\[\^\*\\n\]\*\\\*/.test(/const MD_MARKERS = (\/.*\/m);/.exec(src)[1]), 'the fast path sees *italic* (a reply with only italics still takes the markdown pass)');
  A.ok(/\.cmsg \.body \.md-i \{ font-style: italic; \}/.test(read('frontend/css/comms.css')), 'the italic span slants');
  A.ok(/Chat\.renderProse\(body, content/.test(read('frontend/app/group-chat.js')), 'group replies render through the same Chat.renderProse');
}

/* ---------- C. the goal-arc Dialogue never takes over COMMS while a delivery lands; its edit key has one ✎ ---------- */
{
  const src = read('frontend/app/chat.js');
  const dl = /function deliveryLanding\(runId\) \{[\s\S]*?\n  \}/.exec(src);
  A.ok(dl, 'chat.js defines deliveryLanding()');
  // execute it against stub run records
  const RUN = new Map(), WORK = new Map();
  // eslint-disable-next-line no-new-func
  const deliveryLanding = new Function('runMeta', 'runWork', dl[0] + '\nreturn deliveryLanding;')(id => RUN.get(id) || null, WORK);
  RUN.set('chat', { isTask: false }); WORK.set('chat', { toolsOk: 0, delivered: 0 });
  RUN.set('file', { isTask: true }); WORK.set('file', { toolsOk: 2, delivered: 1 });
  RUN.set('crew', { isTask: true, delegated: true }); WORK.set('crew', { toolsOk: 1, delivered: 0 });
  A.eq(deliveryLanding('chat'), false, 'a reply with nothing new to look at is a free moment for the arc');
  A.eq(deliveryLanding('file'), true, 'a run that delivered a file is a delivery landing');
  A.eq(deliveryLanding('crew'), true, 'a run whose crew handed results back is a delivery landing');
  A.eq(deliveryLanding('handback'), true, 'a run this page did not start (a background worker\'s hand-back) is a delivery landing');
  const ac = /function arcCandidate\(runId\) \{[\s\S]*?\n  \}/.exec(src);
  A.ok(ac && /if \(deliveryLanding\(runId\)\) return null;\s*\n[\s\S]*return \{ kind: 'arc', dim: 'goals', why:/.test(ac[0]), 'the arc Dialogue stands down on a delivery landing');
  A.ok(ac && ac[0].indexOf('deliveryLanding') > ac[0].indexOf('if (arcSeen(runId)) return null;'), 'standing down never spends the run\'s arc token (it is offered again at the next run end)');
  A.ok(/if \(!ev\.isError && \/\^\(\?:team\[\._\]dispatch\|group\[\._\]handoff\)\$\/\.test\(nm\)\) \{ const rm = runMeta\(thisRunId\); if \(rm\) rm\.delegated = true; \}/.test(src), 'a run that handed work to crew is marked delegated');
  A.ok(/customLabel: 'edit the milestones'/.test(src) && !/customLabel: '✎/.test(src), 'the arc edit key carries no ✎ of its own (Dialogue draws one: it read "✎✎")');
  A.ok(/num\.textContent = '✎';/.test(read('frontend/app/dialogue.js')), 'Dialogue draws the ✎ for every custom key');
}

/* ---------- D. the group transcript keeps the spaces between streamed turns and shows the lead's tool chips ---------- */
(async () => {
  const os = require('os');
  const { makeGroupSessions } = require('../sidecar/group-sessions.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-flow-'));
  let seq = 0, gate = null, snapshot = null;
  const api = makeGroupSessions({ fs, path, root, now: () => ++seq, id: () => 'id' + (++seq), log: () => {},
    roster: () => [{ id: 'agent', name: 'Lead' }, { id: 'copy', name: 'Copy' }],
    readFile: async () => null, decodeFile: () => null, uploadFile: (n, c) => ({ name: n, content: c, hash: 'h' }),
    execute: async o => {
      o.emit('agent.run.start', { runId: o.runId });
      o.emit('agent.token', { runId: o.runId, delta: 'Let me configure it:' });
      o.emit('agent.tool_call', { runId: o.runId, callId: 'c1', name: 'loop.create', argsSummary: '{"title":"draft then review"}' });
      o.emit('agent.tool_result', { runId: o.runId, callId: 'c1', ok: false, isError: true, summary: TaskIntent.GATE_HELD, ms: 0 });
      o.emit('agent.token', { runId: o.runId, delta: 'The steps are locked.' });
      o.emit('agent.tool_call', { runId: o.runId, callId: 'c2', name: 'loop.create', argsSummary: '{"title":"draft then review"}' });
      await new Promise(r => { gate = r; });   // hold mid-run so the DRAFT can be read
      o.emit('agent.tool_result', { runId: o.runId, callId: 'c2', ok: true, isError: false, summary: 'created', ms: 120 });
      o.emit('agent.token', { runId: o.runId, delta: 'Done — the line is set.' });
      return { reason: 'done', messages: [{ role: 'assistant', content: 'Done — the line is set.' }] };
    } });
  try {
    await api.ready;
    const g = await api.create({ members: ['agent', 'copy'] });
    await api.send(g.id, { key: 'k1', text: 'set up a conveyor line' });
    for (let n = 0; n < 200 && !gate; n++) await new Promise(r => setTimeout(r, 5));
    snapshot = await api.get(g.id);
    const dt = snapshot.turns.find(t => t.draft);
    A.ok(dt, 'a running reply exposes its draft');
    A.eq(dt.draft, 'Let me configure it:\n\nThe steps are locked.', 'the draft breaks the paragraph where a tool call cut it (no "it:The")');
    A.eq(dt.draftSteps.map(s => [s.at, s.name, s.done]), [[20, 'loop.create', true], [43, 'loop.create', false]], 'the draft carries each call at its place in the prose');
    gate();
    await api.idle(g.id);
    const done = await api.get(g.id);
    const m = done.messages.find(x => x.author === 'agent');
    A.eq(m.content, 'Done — the line is set.', 'the message content stays the final answer (what peers read and copy)');
    A.ok(m.flow && m.flow.text === 'Let me configure it:\n\nThe steps are locked.\n\nDone — the line is set.', 'the saved flow keeps every streamed sentence, spaced: ' + JSON.stringify(m.flow && m.flow.text));
    A.eq(m.flow.steps.map(s => [s.at, s.done, s.isError, s.summary]), [[20, true, true, TaskIntent.GATE_HELD], [43, true, false, 'created']], 'and every call with its outcome (the held one stays recognisable as held)');
  } finally { try { await api.close && api.close(); } catch (_) {} }

  const gc = read('frontend/app/group-chat.js');
  A.ok(/function renderFlow\(body, text, steps, files, clean, live\)/.test(gc), 'the group transcript draws a reply flow');
  A.ok(/body\.append\(Chat\.toolRailOf\(batch\)\)/.test(gc), 'with the one-on-one chips (Chat.toolRailOf)');
  A.ok(/m\.flow && Array\.isArray\(m\.flow\.steps\) && m\.flow\.steps\.length[\s\S]{0,120}renderFlow\(body, m\.flow\.text, m\.flow\.steps/.test(gc), 'a finished reply with calls renders its flow');
  A.ok(/renderFlow\(n\._gcBody, t\.draft \|\| '', t\.draftSteps \|\| \[\]/.test(gc) && !/n\._gcBody\.textContent = t\.draft/.test(gc), 'a streaming draft renders its flow (markdown + chips), never raw textContent');
  A.ok(/Fork\.liveText\(s\)/.test(gc), 'a draft never shows a choice marker being typed');
  const chat = read('frontend/app/chat.js');
  A.ok(/function toolRailOf\(steps\)[\s\S]{0,700}chipNode\([\s\S]{0,300}foldChipResult\(chip/.test(chat), 'toolRailOf builds the same chip DOM and folds the same result (held stays neutral)');
  A.ok(/head\.addEventListener\('click', \(\) => toggleChip\(head\)\)/.test(chat), 'a group chip toggles its own detail (#gc-log has no delegated handler)');
  A.ok(/renderProse, toolRailOf, openFile/.test(chat), 'Chat exports toolRailOf');

  A.report('comms-render-seams.test');
})().catch(e => { console.error(e); process.exit(1); });
