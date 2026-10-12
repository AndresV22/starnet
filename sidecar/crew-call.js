/* sidecar/crew-call.js — CREW CALL: when the Commander's request NAMES a crew member and asks for work, say so at
   the END of the lead's prompt.

   Why (2026-10-11 user report, "if only I could get my chief operations manager to delegate"): reproduced live on
   Ollama qwen3:8b. Asked "Have Ada research three facts about JWST", a custom lead with team.dispatch granted and
   Ada listed under YOUR TEAM did the research itself about half the time. The delegation briefing sits ~7.5k
   characters into a ~24k system prompt, the part of the prompt a small local model weighs least. This note is
   short, request-specific, and last: it names who was asked for and the exact call, nothing more.

   Advisory only: it never dispatches anything and never blocks the lead from answering itself. It composes only
   when the caller has verified team.dispatch is in this run's granted tools (a prompt must not demand a tool the
   model does not have). Pure: no I/O, no clock. */
'use strict';

// "have Ada …", "ask the researcher to …", "get Quill on this", "delegate to Ada", "loop in the analyst".
const ASK = '(?:have|ask|get|tell|let|send|use|put|dispatch|task|loop in|bring in|(?:delegate|assign|hand|give)(?:\\s+(?:this|it|the task))?\\s+to)';
// This note is an unconditional SYSTEM directive. Negated, conditional and quoted requests cannot prove it.
const QUALIFIED = /\b(?:no|not|never|cancel(?:led|ed)?|don['’]?t|doesn['’]?t|won['’]?t|without|unless|if|maybe|perhaps)\b|["“”`]/i;
// Ids that are ordinary words in a sentence, never on their own a reference to one agent ("ask an agent").
const GENERIC_IDS = new Set(['agent']);
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* crewMentions(text, crew, leadId) -> [{ agentId, name }]
   crew: Map/iterable of [agentId, { name }]. A member counts when its display name or (non-generic) agentId
   appears as a whole word AND the request asks for work (a delegation verb, or "Name, …" / "Name: …" up front). */
function crewMentions(text, crew, leadId) {
  const t = String(text || '').trim();
  if (!t || !crew || QUALIFIED.test(t)) return [];
  const members = [];
  for (const [agentId, ident] of crew) {
    if (!agentId || agentId === leadId) continue;
    const name = String((ident && ident.name) || '').trim();
    const cues = [];
    if (name.length >= 3) cues.push(name);
    if (agentId.length >= 3 && !GENERIC_IDS.has(agentId.toLowerCase()) && agentId.toLowerCase() !== name.toLowerCase()) cues.push(agentId);
    if (cues.length) members.push({agentId, name: name || agentId, cues});
  }
  if (!members.length) return [];
  const names = members.flatMap(m => m.cues).sort((a,b) => b.length-a.length).map(esc).join('|');
  const target = '(?:the\\s+)?(' + names + ')(?=$|[^A-Za-z0-9_-])';
  const separator = '\\s*(?:,|and|&)\\s*';
  const list = target + '(?:' + separator + target + ')*';
  // Match the whole target span before rejecting possession, so regex backtracking cannot
  // turn "Have Ada and Quill's report" into a directive for just Ada.
  const action = new RegExp('^(?:please\\s+)?' + ASK + '\\s+(' + list + ')', 'i').exec(t);
  const tail = action ? t.slice(action[0].length) : '';
  const targets = new Set(action && !/^(?:['’]|\s*(?:,|&|and\b))/.test(tail)
    ? Array.from(action[1].matchAll(new RegExp('(?:^|' + separator + ')' + target, 'ig')), m => m[1].toLowerCase())
    : []);
  // Resolve exact captured cues: Ada is not the Ada prefix inside another member's Ada-Aux name.
  return members.filter(m => m.cues.some(c =>
    targets.has(c.toLowerCase()) || new RegExp('^' + esc(c) + '\\s*[,:]\\s*\\S', 'i').test(t)
  )).map(({agentId, name}) => ({agentId, name}));
}

/* Only a NAMED crew call gets a note. Measured 2026-10-11 on qwen3:8b (Ollama): "Have Ada research…" went from
   0/4 delegated (trunk) to 4/4 with this note. An unnamed "delegate this to the other agents" was already ~50%
   (4/8), and neither a generic note (3/7) nor one spelling out the call (3/6) moved it, so none is sent: prompt
   text that changes nothing is not worth its tokens. */
function crewCallNote(text, crew, leadId) {
  const named = crewMentions(text, crew, leadId).slice(0, 4);
  if (!named.length) return '';
  const who = named.map(m => m.name === m.agentId ? m.agentId : m.name + ' (agentId ' + m.agentId + ')').join(', ');
  const workers = named.map(m => '{agentId:"' + m.agentId + '", prompt:"<their part of the task>"}').join(', ');
  return '\n\n[CREW CALL] The Commander named ' + who + ' in this request. Hand that part to them with team.dispatch, '
    + 'workers:[' + workers + '], and build your answer from what they return. '
    + 'Do it yourself only if the dispatch is refused.';
}

module.exports = { crewMentions, crewCallNote };
