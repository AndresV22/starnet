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
  ['ada-aux', { name: 'Ada-Aux' }],
  ['night-shift', { name: 'Night Shift' }],
  ['james', { name: 'James' }],
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

for (const text of [
  "Use Ada's report to write the summary.", 'Use Ada’s report to write the summary.',
  "Have Ada's report ready by Monday.", 'Have Ada’s report ready by Monday.',
  "Use the researcher's report.", 'Ask the researcher’s assistant.',
  "Use Ada's and Quill's reports.", 'Use Ada’s and Quill’s reports.',
  "Have Ada and Quill's report ready.", 'Have Ada and Quill’s report ready.',
  "Use Ada, Quill's notes.", 'Use Ada & Quill’s notes.',
  "Have James' report ready.", 'Have James’ report ready.',
  "Use Night Shift's report.", 'Use night-shift’s report.',
  "Use Ada-Aux's draft.", 'Use Ada-Aux’s draft.',
  'Have Ada-Lovelace review it.',
  'Have Ada and Unknown review it.', 'Have Ada AND Unknown review it.',
  'Have Ada And Quill-Lovelace review it.',
  'Ada: no delegation; answer yourself.', 'Ask Ada? No, answer yourself.',
  'Have Ada review it. Cancel that; answer yourself.', 'Have Ada review it. No need to delegate.'
]) A.eq(crewCallNote(text, crew, 'chiefops'), '', 'no invented delegation for a target reference or reversal: ' + text);
for (const [text, expected] of [
  ["Have Ada review Quill's report.", ['researcher']],
  ['Ada, review Quill’s report.', ['researcher']],
  ['Use Ada as the reviewer.', ['researcher']],
  ['Have Ada and Quill review it.', ['researcher', 'writer']],
  ['Have Ada AND Quill review it.', ['researcher', 'writer']],
  ['Have Ada-Aux review the plan.', ['ada-aux']],
  ['Have Ada and Ada-Aux review the plan.', ['researcher', 'ada-aux']],
  ['Ask the night-shift to review it.', ['night-shift']]
]) A.eq(ids(text), expected, 'only the exact affirmative targets receive the directive: ' + text);
// a qualifier inside the TASK, or a polite opener, is still an ordinary delegation (10-11: 0/4 -> 4/4 needs the note)
for (const text of [
  'Have Ada check if the tests pass', 'Have Ada write the report, no rush', 'Have Ada research JWST, not Hubble',
  'Have Ada find out whether the API is down or not', 'Have Ada list facts about JWST that are not well known',
  'Ask Ada to compare "React" and "Vue"', 'Please have Ada run `npm test`', "Have Ada research JWST. Don't use tables.",
  "Have Ada research it, don't do it yourself", 'Have Ada see if the API works',
  'Can you have Ada research three facts about JWST?', 'Could you ask Ada to research three facts about JWST',
  'Could you get Ada to look into this?', 'Hey, ask Ada to summarize the paper', 'I want you to have Ada draft the summary'
]) A.eq(ids(text), ['researcher'], 'an ordinary delegation request still gets the note: ' + text);
// …while a qualifier on the DELEGATION itself, anywhere in the message, still vetoes it
for (const text of [
  'Ask Ada for help if needed.', 'Have Ada review it unless you already know.', 'Maybe ask Ada.',
  'Have Ada review it. Actually, no.', "Have Quill draft it. Don't ask Ada.", 'Have Ada review it, never mind.',
  'Have Ada research it," he said.', 'Should I ask Ada?', 'Did you ask Ada?', "Have Ada review it. Actually, I'll do it myself.",
  'Answer without asking Ada.', 'Have Ada review it, or just do it yourself.', 'Have Ada review it. Scratch that.'
]) A.eq(crewCallNote(text, crew, 'chiefops'), '', 'a negated, conditional or quoted delegation adds no directive: ' + text);

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
