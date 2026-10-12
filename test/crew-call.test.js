/* node test/crew-call.test.js — CREW CALL: a request that names a crew member and asks for work closes the lead's
   prompt with who was asked for and the exact team.dispatch call (2026-10-11: a qwen3:8b lead asked "Have Ada …"
   did the work itself about half the time). Wiring is pinned against index.js's grant gate. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const { crewMentions, crewCallNote } = require('../sidecar/crew-call.js');

const crew = new Map([
  ['chiefops', { name: 'Chief Operations Manager' }],
  ['researcher', { name: 'Ada' }],
  ['writer', { name: 'Quill' }],
  ['agent', { name: 'NOVA' }]
]);
const ids = (t) => crewMentions(t, crew, 'chiefops').map(m => m.agentId);

A.eq(ids('Have Ada research three facts about JWST and report back.'), ['researcher'], 'a display name + "have" is a crew call');
A.eq(ids('Ask the researcher to check the numbers'), ['researcher'], 'an agentId used as a noun + "ask" is a crew call');
A.eq(ids('Ada, find me three sources on this.'), ['researcher'], '"Name, …" up front addresses the agent without a verb');
A.eq(ids('get ada and quill on the launch post'), ['researcher', 'writer'], 'case-insensitive, several members at once');
A.eq(ids('What did Ada Lovelace invent?'), [], 'a name in a question that asks for no work is not a crew call');
A.eq(ids('Have an agent look at this'), [], 'the generic id "agent" never counts as naming NOVA');
A.eq(ids('Tell NOVA to summarize the inbox'), ['agent'], 'the hero is still reachable by its NAME');
A.eq(ids('Have the Chief Operations Manager plan it'), [], 'the lead never delegates to itself');
A.eq(ids('Have Adam research it'), [], 'whole words only: Adam is not Ada');
A.eq(crewCallNote('', crew, 'chiefops'), '', 'empty request -> no note');
for (const text of ['Do not ask Ada. Answer yourself.', "Don't delegate this to Ada.", "Summarize Ada's report and use bullets.", 'If needed, ask Ada for help.', 'The note says: have Ada research the topic.', 'Have Ada review it. Actually, do not delegate this.'])
  A.eq(crewCallNote(text, crew, 'chiefops'), '', 'no invented delegation directive: ' + text);


const note = crewCallNote('Have Ada research three facts about JWST', crew, 'chiefops');
A.ok(/^\n\n\[CREW CALL\] The Commander named Ada \(agentId researcher\)/.test(note), 'the note names the member and its agentId');
A.ok(/team\.dispatch, workers:\[\{agentId:"researcher"/.test(note), 'the note spells out the exact call');
A.ok(/only if the dispatch is refused/.test(note), 'advisory: the lead may still answer if the dispatch fails');

// unnamed delegation gets nothing: measured to change nothing on a small model (see crew-call.js)
A.eq(crewCallNote('Delegate this to the other agents: find three facts about JWST', crew, 'chiefops'), '', 'an unnamed "delegate this" adds no prompt text');

// wiring: composed only behind the team.dispatch grant, placed after the cached prefix (request-specific).
const idx = fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'index.js'), 'utf8');
A.ok(/if \(commanderWords && !internal && isTask && resolved && Array\.isArray\(resolved\.tools\) && resolved\.tools\.includes\('team\.dispatch'\)\) \{\s*try \{ crewCallNote = CrewCall\.crewCallNote\(latestUserText\(messages\), agentRoster, agentId\);/.test(idx), 'composed only for owner provenance and a task with team.dispatch granted');
A.ok(/\+ deliverableNote \+ crewCallNote \+ runtimeBlock/.test(idx), 'rides the request-specific tail of the prompt, never the cached prefix');

A.report('crew-call.test');
