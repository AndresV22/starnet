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
const ASK = /\b(have|ask|get|tell|let|send|delegate|assign|hand|give|use|put|dispatch|loop in|bring in|task)\b/i;
// Ids that are ordinary words in a sentence, never on their own a reference to one agent ("ask an agent").
const GENERIC_IDS = new Set(['agent']);
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = s => new RegExp('(^|[^A-Za-z0-9_])' + esc(s) + '($|[^A-Za-z0-9_])', 'i');

/* crewMentions(text, crew, leadId) -> [{ agentId, name }]
   crew: Map/iterable of [agentId, { name }]. A member counts when its display name or (non-generic) agentId
   appears as a whole word AND the request asks for work (a delegation verb, or "Name, …" / "Name: …" up front). */
function crewMentions(text, crew, leadId) {
  const t = String(text || '');
  if (!t.trim() || !crew) return [];
  const out = [];
  for (const [agentId, ident] of crew) {
    if (!agentId || agentId === leadId) continue;
    const name = String((ident && ident.name) || '').trim();
    const cues = [];
    if (name.length >= 3) cues.push(name);
    if (agentId.length >= 3 && !GENERIC_IDS.has(agentId.toLowerCase()) && agentId.toLowerCase() !== name.toLowerCase()) cues.push(agentId);
    const hit = cues.find(c => wordRe(c).test(t));
    if (!hit) continue;
    const addressed = new RegExp('^\\s*' + esc(hit) + '\\s*[,:]', 'i').test(t);
    if (addressed || ASK.test(t)) out.push({ agentId, name: name || agentId });
  }
  return out;
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
