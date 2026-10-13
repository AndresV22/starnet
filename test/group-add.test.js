/* node test/group-add.test.js — AN AGENT BRINGS CREW INTO A CHAT (station.control group.add, 2026-10-13).

   Andrew: "add 2 agents into this chat … it actually refused to do it, I have to manually add it myself". The overseer had
   no tool for it (group.configure edits an EXISTING group only) and the + Add agents key refuses while a reply runs in
   that chat — and the agent asking is always that reply. Pins:
   A. THE TOOL (sidecar/tools/builtin/station-control.js): an ordinary station.control action; the card names exactly who
      joins and what they see; "NOVA and SAM ALTMAN" reads as two names; no session = THIS conversation; the asking run is
      stamped by the HOST (a model-supplied caller is dropped); a join that waits for the reply reads "QUEUED, NOT DONE
      YET", never done; group.configure's card says its members REPLACE the roster.
   B. THE PAGE (frontend/app/group-chat.js, executed): an idle chat converts now; the chat whose reply is running takes the
      join only from THAT run, saved on the conversation; the join lands when the reply ends with the dialogue only (no
      local status lines become the lead's words); a stop / failed reply / reload drops it and SAYS so in the chat; a group
      invites only the new members. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeStationControlTools, cardFor, ACTIONS } = require('../sidecar/tools/builtin/station-control.js');

(async () => {
  /* ---- A. the tool ---- */
  A.ok(ACTIONS['group.add'] && !ACTIONS['group.add'].power({}), 'group.add is an ordinary station.control action (the same change the + key makes)');
  const card = cardFor({ action: 'group.add', args: { agents: 'NOVA and SAM ALTMAN' } });
  A.ok(/^bring "NOVA", "SAM ALTMAN" into this conversation: they see the whole conversation and its files/.test(card), 'the card names who joins and what they see: ' + card);
  A.ok(/becomes a group chat/.test(card) && /beside it/.test(card) && /join the moment my reply ends/.test(card), 'the card says the chat changes shape, General opens beside it, and when it lands');
  A.ok(/beside it with just this request in it/.test(card) && /I then hand them their parts there/.test(card), 'and it is truthful about General (only the request goes with it) and about what happens once they join');
  A.ok(/WHOLE member list becomes nova \(anyone not listed leaves\)/.test(cardFor({ action: 'group.configure', args: { group: 'Launch', members: ['nova'] } })),
    'group.configure says its members REPLACE the roster (an "add NOVA" sent there cannot quietly remove everyone)');

  const pages = [];
  let answer = { ok: true, result: { added: ['nova'], members: ['agent', 'nova'] } };
  const t = makeStationControlTools({ station: { request: async (verb, args) => { pages.push({ verb, args }); return answer; } }, route: async () => ({ status: 200, json: { ok: true } }), surface: 'interactive' });
  const ctx = { streamId: 'ws_chat', runId: 'run_1' };
  let r = await t.controlTool.run({ action: 'group.add', args: { agents: ['NOVA'], caller: { streamId: 'ws_other', runId: 'run_forged' } } }, ctx);
  A.eq(pages[0].verb, 'station.control', 'it runs on the page (the + key\'s own path)');
  A.eq(pages[0].args.session, 'ws_chat', 'no session named = THIS conversation');
  A.eq(JSON.stringify(pages[0].args.caller), JSON.stringify({ streamId: 'ws_chat', runId: 'run_1' }), 'the asking run is the HOST\'s stamp; a model-supplied caller is dropped');
  A.ok(/"done":"group.add"/.test(r.content), 'an applied join reads as done');
  answer = { ok: true, result: { joining: true, agents: ['NOVA'], note: 'NOVA joins this chat (it becomes a group chat, its history kept) the moment your reply ends.' } };
  r = await t.controlTool.run({ action: 'group.add', args: { agents: 'NOVA' } }, ctx);
  A.ok(/once they join you get a turn in the group chat to hand them their parts/.test(r.content), 'the asking agent knows it gets a turn once they join (so it neither hands off early nor promises what will not happen)');
  A.ok(/^QUEUED, NOT DONE YET: NOVA joins this chat/.test(r.content) && /not in the chat yet/.test(r.content) && !/"done"/.test(r.content), 'a join waiting for the reply is never reported as done: ' + r.content);
  r = await t.controlTool.run({ action: 'group.add', args: { agents: [] } }, ctx);
  A.ok(/^REFUSED: group.add named no crew member/.test(r.content), 'naming nobody is refused before the page is asked');
  r = await t.controlTool.run({ action: 'group.add', args: { agents: ['NOVA'] } }, {});
  A.ok(/^REFUSED: this run has no conversation of its own/.test(r.content), 'a run with no conversation must name one');
  answer = { ok: false, error: 'no agent called "Nobody" (crew: NOVA, ROOK)' };
  r = await t.controlTool.run({ action: 'group.add', args: { agents: ['Nobody'] } }, ctx);
  A.ok(/^REFUSED: no agent called "Nobody"/.test(r.content), 'the page\'s refusal reaches the model as REFUSED');
  A.ok(/group\.add \(bring crew into this chat/.test(t.controlTool.description) && /BEFORE you say anything changed/.test(t.controlTool.description),
    'the tool names group.add (tool.search finds it) and says to call before claiming');

  /* ---- B. the page (group-chat.js executed with a small DOM) ---- */
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.events = {}; this.value = ''; this.style = { setProperty() {} }; this.classList = { add() {}, toggle() {}, contains: () => false }; }
    get isConnected() { return true; }
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
    removeAttribute(k) { delete this.attrs[k]; }
    querySelectorAll() { return []; } querySelector() { return null; }
    addEventListener(k, fn) { this.events[k] = fn; }
    append(...n) { for (const e of n) { const x = typeof e === 'string' ? Object.assign(new El('#text'), { textContent: e }) : e; x.parentElement = this; this.children.push(x); } }
    replaceChildren(...n) { this.children = []; this.append(...n); }
    before(n) { this.parentElement && this.parentElement.append(n); }
    insertBefore(n) { this.append(n); return n; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(e => e !== this); }
  }
  const settle = async () => { for (let n = 0; n < 60; n++) await Promise.resolve(); };
  function boot(opts) {
    opts = opts || {};
    const body = new El('body'), head = new El('head');
    for (const id of ['comms-idbar', 'chat-input', 'chat-log', 'chat-queued', 'chat-inputrow']) { const e = new El('div'); e.id = id; body.append(e); }
    const all = e => [e, ...e.children.flatMap(all)];
    const sent = [], notes = [], lines = [];
    const busy = new Map(Object.entries(opts.busy || {}));   // wsId -> runId
    const ws = new Map((opts.chats || []).map(w => [w.id, w]));
    let groupResult = null;
    const fetch = async (url, init) => {
      const b = init && init.body ? JSON.parse(init.body) : null; sent.push({ url, body: b });
      if (b && b.op === 'create') { groupResult = { id: b.id, title: b.title, members: b.members, leadId: b.leadId, revision: 1, paused: false, messages: (b.history || []).map((m, i) => ({ id: 'm' + i, author: m.role === 'user' ? 'user' : b.leadId, text: m.content })), turns: [], artifacts: [], questions: [] }; return { status: 200, ok: true, json: async () => ({ ok: true, result: groupResult }) }; }
      if (b && b.op === 'invite') { groupResult = Object.assign({}, opts.group, { members: [...(groupResult || opts.group).members, b.agentId] }); return { status: 200, ok: true, json: async () => ({ ok: true, result: groupResult }) }; }
      if (/\?id=/.test(url)) return { status: 200, ok: true, json: async () => ({ ok: true, result: groupResult || opts.group }) };
      return { status: 200, ok: true, json: async () => ({ ok: true, result: { roster: [], groups: [] } }) };
    };
    const c = vm.createContext({
      document: { body, head, createElement: tag => new El(tag), createTextNode: t => Object.assign(new El('#text'), { textContent: t }), getElementById: id => all(body).find(e => e.id === id) },
      console, crypto: { randomUUID: () => 'uuid-1234' }, clearTimeout() {}, setTimeout() {}, queueMicrotask, fetch,
      Chat: { localLine: t => lines.push(t), load() {} },
      Channels: { isBusy: id => busy.has(id), runIdOf: id => busy.get(id) || null },
      App: { pushRoster: async () => {}, agents: () => [{ id: 'agent', name: 'ULTRON' }, { id: 'nova', name: 'NOVA' }, { id: 'sam', name: 'SAM ALTMAN' }], persist() {}, refreshRail() {}, openWorkstream() {} },
      StationUI: { notify: (t, cls) => notes.push([cls, t]), toggleTerm() {}, closeTerm() {} },
      Workstreams: { get: id => ws.get(id), list: () => [...ws.values()], activeId: () => opts.activeId || null, adopt: o => { const w = Object.assign(ws.get(o.id) || {}, o); ws.set(o.id, w); return w; }, generalId: () => opts.generalId || 'general-home' }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/app/group-chat.js'), 'utf8') + '\nglobalThis.GroupChat = GroupChat;', c);
    return { c, sent, notes, lines, busy, ws, GC: c.GroupChat };
  }
  const chat = extra => Object.assign({ id: 'ws_chat', agentId: 'agent', title: 'Launch', conversationMode: 'direct', history: [
    { role: 'user', content: 'add 2 agents into this chat' }, { role: 'assistant', content: 'Bringing them in when I finish.' },
    { role: 'system', sys: true, content: 'routine ran, nothing to report' }, { role: 'assistant', content: '■ RUN FAILED', error: true }] }, extra || {});

  // the chat whose reply is running: ONLY that run may queue, and the join is saved on the conversation
  {
    const b = boot({ chats: [chat()], busy: { ws_chat: 'run_1' } });
    let threw = '';
    try { await b.GC.addAgents(b.ws.get('ws_chat'), ['nova'], { streamId: 'ws_chat', runId: 'run_other' }); } catch (e) { threw = e.message; }
    A.ok(/still answering in that chat/.test(threw), 'another run cannot queue a change on a chat it is not running');
    const out = await b.GC.addAgents(b.ws.get('ws_chat'), ['nova', 'sam'], { streamId: 'ws_chat', runId: 'run_1' });
    A.eq(out.joining, true, 'the asking run\'s join is queued');
    A.ok(/^NOVA and SAM ALTMAN join this chat \(it becomes a group chat, its history kept\) the moment this reply ends/.test(out.note), 'its note says when, in plain words: ' + out.note);
    A.eq(JSON.stringify(b.ws.get('ws_chat').pendingJoin.ids), '["nova","sam"]', 'the join is saved on the conversation');
    A.ok(!b.sent.some(s => s.body && s.body.op === 'create'), 'nothing converts while the reply runs');
    // the reply ends well: the join lands with the dialogue only
    b.busy.delete('ws_chat'); b.ws.get('ws_chat').lastRunOk = true;
    await b.GC.drainAfterRun('ws_chat', 'run_1', { stopped: false }); await settle();
    const create = b.sent.find(s => s.body && s.body.op === 'create');
    A.ok(create && JSON.stringify(create.body.members) === '["agent","nova","sam"]', 'the conversion seats the lead and both new members');
    A.eq(create.body.history.map(m => m.content).join(' | '), 'add 2 agents into this chat | Bringing them in when I finish.', 'the group gets the dialogue, never a status or run-failed line as the lead\'s words');
    A.eq(b.ws.get('ws_chat').pendingJoin, null, 'the join is settled');
    A.ok(b.notes.some(([cls, t]) => cls === 'good' && /NOVA and SAM ALTMAN joined/.test(t)), 'the Commander is told they joined');
    A.eq(create.body.kickoff, 'NOVA and SAM ALTMAN have joined this chat at your request. Carry on with the Commander\'s request: give each of them their part (group.handoff) and do your own.',
      'the lead gets the first turn in the group to hand them their parts (nothing idles after they join)');
  }
  // from General: the new group carries the request it was made for — and only that (General's history stays in General)
  {
    const general = chat({ id: 'general-home', title: null, history: [
      { role: 'user', content: 'what did we decide yesterday?' }, { role: 'assistant', content: 'We picked the blue logo.' },
      { role: 'user', content: 'add 2 agents to research and build the landing page', ts: 7 }, { role: 'assistant', content: 'Bringing them in.' }] });
    const b = boot({ chats: [general], busy: { 'general-home': 'run_g' }, generalId: 'general-home' });
    await b.GC.addAgents(b.ws.get('general-home'), ['nova', 'sam'], { streamId: 'general-home', runId: 'run_g' });
    b.busy.delete('general-home'); b.ws.get('general-home').lastRunOk = true;
    await b.GC.drainAfterRun('general-home', 'run_g', { stopped: false }); await settle();
    const create = b.sent.find(s => s.body && s.body.op === 'create');
    A.ok(create && create.body.id !== 'general-home' && !create.body.conversionKey, 'from General a NEW group chat opens beside it');
    A.eq(JSON.stringify(create.body.history), JSON.stringify([{ role: 'user', content: 'add 2 agents to research and build the landing page', ts: 7 }]), 'it carries the request it was made for, and nothing else of General');
    A.ok(/^NOVA and SAM ALTMAN have joined this chat at your request/.test(create.body.kickoff), 'and its lead picks that request up');
  }
  // a stopped reply drops the join and SAYS so in the chat (saved), never a silent no-op
  {
    const b = boot({ chats: [chat({ pendingJoin: { runId: 'run_2', ids: ['nova'], at: 1 } })], activeId: 'ws_chat' });
    b.ws.get('ws_chat').lastRunOk = true;
    await b.GC.drainAfterRun('ws_chat', 'run_2', { stopped: true });
    A.ok(!b.sent.some(s => s.body && s.body.op === 'create'), 'a stopped reply converts nothing');
    const last = b.ws.get('ws_chat').history.slice(-1)[0];
    A.ok(last.sys && /^NOVA was not added to this chat: the reply was stopped before it finished\.$/.test(last.content), 'a saved line says what did not happen: ' + last.content);
    A.ok(b.lines.length === 1 && b.notes.some(([cls]) => cls === 'bad'), 'and it shows in the open chat and the bell');
  }
  // a failed reply too; and another run's end never drains this run's join
  {
    const b = boot({ chats: [chat({ pendingJoin: { runId: 'run_3', ids: ['nova'], at: 1 } })] });
    A.eq(await b.GC.drainAfterRun('ws_chat', 'run_9', { stopped: false }), null, 'a different run ending leaves the join waiting');
    A.ok(b.ws.get('ws_chat').pendingJoin, '…still saved');
    b.ws.get('ws_chat').lastRunOk = false;
    await b.GC.drainAfterRun('ws_chat', 'run_3', { stopped: false });
    A.ok(/was not added to this chat: the reply failed before it finished/.test(b.ws.get('ws_chat').history.slice(-1)[0].content), 'a failed reply drops it and says so');
  }
  // a reload kills the reply: the waiting join is settled at once as "not added", never left hanging
  {
    const b = boot({ chats: [chat({ pendingJoin: { runId: 'run_4', ids: ['sam'], at: 1 } })] });
    b.GC.bind(b.ws.get('ws_chat'));
    A.eq(b.ws.get('ws_chat').pendingJoin, null, 'a reloaded page settles a join no reply can land any more');
    A.ok(/^SAM ALTMAN was not added to this chat: the reply was interrupted before it finished/.test(b.ws.get('ws_chat').history.slice(-1)[0].content), 'and says why');
  }
  // an idle chat converts now, exactly as the + key does
  {
    const b = boot({ chats: [chat()] });
    const out = await b.GC.addAgents(b.ws.get('ws_chat'), ['nova'], null);
    A.ok(out.added && out.added[0] === 'nova' && b.sent.some(s => s.body && s.body.op === 'create'), 'an idle chat becomes a group now');
    let threw = ''; try { await b.GC.addAgents(Object.assign(chat(), { id: 'ws_x' }), ['agent'], null); } catch (e) { threw = e.message; }
    A.ok(/already this chat's agent/.test(threw), 'adding the chat\'s own agent is refused, never a no-op "done"');
  }
  // a group: only the new members are invited (safe while a group turn runs)
  {
    const g = { id: 'ws_grp', title: 'War room', members: ['agent', 'nova'], leadId: 'agent', revision: 4, paused: false, messages: [], turns: [], artifacts: [], questions: [] };
    const b = boot({ chats: [{ id: 'ws_grp', agentId: 'agent', title: 'War room', conversationMode: 'group', history: [] }], group: g });
    const out = await b.GC.addAgents(b.ws.get('ws_grp'), ['nova', 'sam'], null);
    const invites = b.sent.filter(s => s.body && s.body.op === 'invite').map(s => s.body.agentId);
    A.eq(invites.join(','), 'sam', 'only the member not already there is invited');
    A.ok(out.added.join(',') === 'sam', 'and the result names who was added');
    let threw = ''; try { await b.GC.addAgents(b.ws.get('ws_grp'), ['nova'], null); } catch (e) { threw = e.message; }
    A.ok(/already in this chat/.test(threw), 'someone already there is refused, never reported as added');
  }
  // the + key's own guard: it is THIS chat's reply that blocks a conversion, not whichever chat is on screen
  const gc = fs.readFileSync(path.join(__dirname, '../frontend/app/group-chat.js'), 'utf8');
  A.ok(/if \(!general && typeof Channels !== 'undefined' && Channels\.isBusy && Channels\.isBusy\(origin\.id\)\) throw/.test(gc), 'startGroup guards the chat it converts');
  const chatSrc = fs.readFileSync(path.join(__dirname, '../frontend/app/chat.js'), 'utf8');
  A.ok(/const joining = typeof GroupChat !== 'undefined' && GroupChat\.drainAfterRun \? GroupChat\.drainAfterRun\(ws\.id, thisRunId, \{ stopped: stoppedHere \}\) : null;\s*\n\s*\/\/ TYPE-AHEAD[^\n]*\n\s*setTimeout\(\(\) => \{ Promise\.resolve\(joining\)\.catch\(\(\) => null\)\.then\(\(\) => flushQueued\(ws\.id\)\); \}, 0\);/.test(chatSrc),
    'the reply\'s teardown lands the join BEFORE a queued follow-up is sent (it then goes to the new group)');
  A.ok(/const stoppedHere = interrupted\.has\(ws\.id\);[^\n]*\n\s*interrupted\.delete\(ws\.id\);/.test(chatSrc), 'the stop flag is read before the teardown consumes it');
  // a group turn keeps the agent's own room gear (its dish = web search), as its one-on-one chat does (gap review G2)
  const idx = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');
  A.ok(/lead: t\.agentId === g\.leadId, groupTools: tools, askCommander,\s*\n\s*station: router\.stationFor\(t\.agentId\) \|\| undefined,[\s\S]{0,400}extraObjects: require\('\.\/capability\/saved-placement\.js'\)\.savedPlacement\(saveStore\.load\('agent'\), t\.agentId\),/.test(idx),
    'a group participant\'s run carries its saved room gear (a researcher can search in a group)');
  A.report('group-add.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
