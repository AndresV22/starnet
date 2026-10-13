/* Host-only learning input. A tool transcript is evidence, never owner authority.
   The composition root captures the current user message before attachments expand.
   No model-provided provenance fields, prior conversation turns, or quoted documents
   are accepted as proof that a standing preference came from the owner. */
'use strict';

function textOf(message) {
  if (!message || message.role !== 'user') return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content.filter(p => p && p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n');
}
function quotedMaterial(text) {
  return /```|~~~|(?:^|\n)\s*>|<\/?(?:document|email|untrusted|script)\b|[“"][^“”"]{20,}[”"]/i.test(String(text || '')) || /\b(?:examples?|samples?|transcript|following (?:document|email|message)|(?:document|attachment|website|webpage|email|message|article)\s+(?:says?|said|states?|reads?|instructs?))[^\n]*[:\n]/i.test(String(text || ''));
}
// Ambient activity and repeat-work claims require the original owner text, not the completion run's later
// provenance. Legacy rows without an explicit clean stamp cannot supply that proof.
function originsOf(runRecords) {
  return runRecords === undefined ? null : new Map((Array.isArray(runRecords) ? runRecords : []).filter(r => r && r.runId).map(r => [r.runId, r]));
}
function cleanOwnerRow(m, origins) {
  if (!m || m.role !== 'user' || m.taintKnown !== true || m.taint || m.from ||
    typeof m.content !== 'string' || !m.content.trim() || quotedMaterial(m.content)) return false;
  if (!origins) return false;   // no run records, no proof of who gave the directive
  // A clean row can still be station self-talk, or a channel GROUP GUEST's message: a guest's row is as clean as
  // the owner's, and surface/streamId cannot tell them apart. Resolve its original run independently of the recent
  // title window; only the host's ownerDirective stamp (runstore) proves the Commander gave it. A missing origin, an
  // unknown internal flag, or a legacy run without the stamp is not evidence of an owner request.
  const r = origins.get(m.sourceRunId);
  return !!(r && r.ownerDirective === true && r.internal === false && !r.parentRunId && !r.delegatedBy && !r.cronJobId && !r.recoveryOf &&
    r.agentId === m.agentId && (r.streamId || 'global') === m.streamId && !/^(?:nightshift-|cron-|workshop-)/i.test(r.streamId || ''));
}
// Ambient activity reads only the recent tail: bound before filtering.
function cleanOwnerRows(rows, runRecords) {
  const origins = originsOf(runRecords);
  return (Array.isArray(rows) ? rows : []).slice(-400).filter(m => cleanOwnerRow(m, origins));
}
function ownedBriefs(briefs, transcriptRows, runRecords) {
  const list = (Array.isArray(briefs) ? briefs : []).filter(b => b && b.agentId && b.originalDirective);
  // New briefs retain an immutable originalRunId. Older host briefs already encode that identity in
  // tb_<original-run-id>; never substitute completion's mutable runId or a later identical request.
  const originalOf = b => b.originalRunId || (typeof b.id === 'string' && b.id.startsWith('tb_') ? b.id.slice(3) : '');
  // A brief's proof is its ORIGINAL directive row, and the repeat-work detector reaches back 60 days: a recency tail
  // (every assistant and tool row counts toward it) drops a two-week-old occasion of a weekly task. Look the proof
  // up by run id across every row the caller holds; each row still has to pass the same clean-owner check.
  const wanted = new Set(list.map(originalOf).filter(Boolean)), origins = originsOf(runRecords);
  const clean = (Array.isArray(transcriptRows) ? transcriptRows : []).filter(m => m && wanted.has(m.sourceRunId) && cleanOwnerRow(m, origins));
  const seen = new Set();
  return list.filter(b => {
    const original = originalOf(b);
    if (!original) return false;
    const stream = b.streamId || 'global', key = JSON.stringify([b.agentId, stream, original]);
    if (seen.has(key) || !clean.some(m => m.sourceRunId === original && m.agentId === b.agentId && m.streamId === stream &&
      m.content.trim().slice(0, 4000) === b.originalDirective)) return false;
    seen.add(key); return true;
  });
}
// Quoted material in any of these user turns. Callers pass the context a run REPLAYS (a server-seeded or re-seeded
// transcript, a recovery checkpoint, the earlier-conversation rows): a pasted document there is data the learning
// passes must not read as the Commander's words, whoever sent the history.
function quotedTurns(messages) {
  return (Array.isArray(messages) ? messages : []).some(m => m && m.role === 'user' && quotedMaterial(textOf(m)));
}
function capture(messages, source) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i] || list[i].role !== 'user') continue;
    const content = textOf(list[i]);
    // Do not silently truncate a directive and mistake its incomplete prefix for the owner's instruction.
    if (!content.trim() || content.length > 16000 || quotedMaterial(content)) return null;
    return { index: i, role: 'user', source: source || 'interactive-owner', content };
  }
  return null;
}
function eligible(origin) {
  const o = origin || {};
  // A recipe launch sends the recipe author's template (built-in or an imported file), not the owner's wording.
  return !o.internal && !o.parentRunId && !o.delegatedBy && !o.groupTools && !o.recovery && !o.handoff &&
    !o.untrustedEntry && !o.syntheticTrigger && !o.hostPowerWithheld && !o.recipeId && !o.fromRecipe &&
    (o.source === 'interactive-owner' || (o.source === 'channel-owner' && o.channelSenderOwner === true));
}
/* A PICK IS NOT A STANDING PREFERENCE (2026-10-12). "I prefer X" is standing only when X names a KIND of thing
   ("tabs over spaces", "a dark theme", "it when replies are short", "that you use tabs"), not one of the items in
   front of the Commander right now. Structure decides, not a word list of candidate nouns:
     - any statement that points back at the current item (", ship it", ", go with that", "Never do that again.")
       cannot stand on its own later, whatever its anchor (POINTS_BACK, checked for every anchor below);
     - a "one"-headed item ("the blue one", "a shorter one") is a pick;
     - a clause about how things should go ("it when …", "that you …", "to …", "using …") stays standing;
     - a pronoun/demonstrative object ("this layout", "that one", "the latter") is a pick;
     - a labelled candidate ("option B", "version 2", "B") or a definite/possessive item ("the second option",
       "your draft") is a pick unless the sentence names the general case it covers ("the first person voice in
       essays", "Python 3 for scripts").
   When in doubt it is a pick, and nothing is saved. */
const POINTS_BACK = /\b(?:it|this|that|these|those|them)(?:\s+(?:again|instead|anymore|too|now|then|here|there|later|first|yet))?\s*(?:[,;:!.]|$)/i;
const GENERAL_CASE = /\b(?:(?:in|for|on|across|with)\s+(?!(?:this|that|these|those|its|his|us|yours|ours|theirs)\b)(?:(?:all|every|any|future|new|my|our)\s+){0,3}[a-z][a-z-]*s\b|when(?:ever)?\b|every\s+time\b)/i;
function onePick(lead) {
  const m = /^(?:i|we)\s+(?:strongly\s+|generally\s+)?prefer\s+([\s\S]*?)[\s.!]*$/i.exec(lead);
  if (!m) return false;
  const object = m[1];
  if (/\bones?\b(?!-)\s*(?:[,;:!.]|$|\b(?:over|instead|rather|better|more|than|in|for|on|of|from|with|because)\b)/i.test(object)) return true;
  if (/^(?:it\s+(?:when|if|whenever)|that\s+(?:you|we|i|they|he|she|it|there|the|all|every|each|any|no|our|my|your)|to|when|whenever|if)\b|^\w+ing\b/i.test(object)) return false;
  if (/^(?:it|its|this|that|these|those|them|either|neither|both|yours|mine|ours|theirs|the\s+(?:latter|former|other|rest))\b/i.test(object)) return true;
  const labelled = /^(?:#?\d+|[a-z])$/i.test(object) || /^[A-Za-z][\w-]*\s+(?:#?\d+(?:\.\d+)*|(?!I\b)[A-Z])(?![\w'])/.test(object);
  const definite = /^(?:the|your|my|our|his|her|their)\b/i.test(object);
  return (labelled || definite) && !GENERAL_CASE.test(object);
}
function preferences(input, projectRoot) {
  if (!input || !['interactive-owner', 'channel-owner'].includes(input.source)) return [];
  const text = String(input.content || '').replace(/[‘’]/g, "'");
  // An opt-out applies to the whole message, including a preference in an earlier sentence.
  if (/\b(?:do not|don't|never)\s+(?:(?:automatically|ever)\s+)?(?:save|store|remember|retain|memorize)\b|\b(?:no|without)\s+(?:persistent\s+)?memor(?:y|ies)\b/i.test(text)) return [];
  // Preserve exact words; do not infer polarity or reorder a comparison. Quoted/code material and reports of
  // somebody else's instructions are data even when a user pasted them into a user-role message.
  if (/[`<>“”"]|(?:^|\n)\s*>/.test(text) || /\b(?:examples?|samples?|transcript|following|says?|said|asked|told|quotes?)[^\n]*[:\n]/i.test(text) || /\b(?:quoted?|document|attachment|website|webpage|email|message|article)\s+(?:says?|said|states?|reads?|instructs?)\b/i.test(text)) return [];
  const out = [];
  for (const raw of text.split(/\n|(?<=[.!?])\s+/)) {
    const content = raw.trim();
    if (content.length < 8 || content.length > 600 || /\?$/.test(content)) continue;
    // STANDING = an explicit standing marker. A bare "I prefer …" is not one: it is as often a pick between the drafts in
    // front of the Commander ("I prefer the second option", "I prefer option two") as a lasting taste, and two review
    // rounds of pick/taste word lists opened new holes both ways (2026-10-12). Fail closed: without a marker nothing is
    // auto-saved here — the agent can still save a real preference with notebook.write, whose provenance is proven
    // against the Commander's own words.
    if (!/^(?:(?:please\s+)?remember(?:\s+that)?[,:]?\s+)?(?:(?:from now on|going forward|by default|for (?:all|every) future (?:tasks?|chats?|conversations?))[,:]?\s|(?:always|never)\s)/i.test(content)) continue;
    // An anchor word alone is not a standing preference: an idiom ("Never mind", "Never again"), a one-off pick
    // between drafts ("I prefer the second option") or a description of current behavior ("By default the app opens
    // to settings", "Going forward the API returns 404") is task wording. A described subject must still say what
    // should happen. When in doubt, nothing is saved.
    const lead = content.replace(/^(?:please\s+)?remember(?:\s+that)?[,:]?\s+/i, '');
    // a narrative, not an instruction: "Never mind", "Never again", "Never once has this worked", "Always was"
    if (/^(?:always|never)[,]?\s+(?:(?:once|ever|yet|even|really|truly|actually|quite)\s+)?(?:mind|again|before|been|was|were|is|are|am|had|has|did|does|will|would|could|can|gonna)\b/i.test(lead)) continue;
    if (POINTS_BACK.test(lead) || onePick(lead)) continue;
    if (/^(?:always|never|from now on|going forward|by default|for (?:all|every) future (?:tasks?|chats?|conversations?))[,:]?\s+(?:the|a|an|this|that|these|those|it|its|there|they|he|she|his|her|our|their|my)\b/i.test(lead) &&
      !/\b(?:should|must|shall|needs?\s+to|ha(?:s|ve)\s+to|ought\s+to|(?:is|are)\s+to|please)\b/i.test(lead)) continue;
    if (/\b(?:passwords?|secrets?|credentials?|api.?keys?|access.?tokens?|auth|permissions?|approvals?|safety|guards?|polic(?:y|ies)|system.?prompts?|instruction.?hierarchy|full.?access|bypass(?:ing)?|overrides?|forget|do not (?:remember|save)|don't (?:remember|save))\b/i.test(content)) continue;
    const global = !projectRoot || /\b(?:across all (?:projects|tasks)|for (?:all|every) future (?:tasks?|chats?|conversations?))\b/i.test(content);
    out.push({ kind: 'profile', content, scope: global ? 'global' : 'project', projectRoot: global ? null : String(projectRoot), standing: true });
    if (out.length >= 5) break;
  }
  return out;
}
// Every captured statement is a standing instruction by construction, so the reflection deck's generic
// always/never/from-now-on tier would hold all of them. Ask its remaining tiers (a credential, personal data, an
// instruction carrying authority) with the standing marker rewritten as the modal it stands for, so "Never ask before
// deleting files" still reads as an authority-shaped "do not ask ... delete". No deck predicate: never auto-save.
function needsReview(content, highStakes) {
  if (typeof highStakes !== 'function') return true;
  return highStakes(String(content || '').replace(/[‘’]/g, "'").replace(/\bnever\b/gi, 'do not')
    .replace(/\b(?:always|from now on|going forward|by default|for (?:all|every) future (?:tasks?|chats?|conversations?))\b/gi, 'must'));
}
function checks(evidence) {
  const e = evidence || {};
  const requirements = e.contract && Array.isArray(e.contract.requirements) ? e.contract.requirements : [];
  return (Array.isArray(e.checks) ? e.checks : []).slice(0, 20).map(c => {
    const requirement = requirements.find(r => r.id === c.id);
    return { id: String(c.id || '').slice(0, 80), type: String(c.type || '').slice(0, 60), status: c.status === 'passed' ? 'passed' : 'failed', code: String(c.code || '').slice(0, 80),
      ...(requirement && requirement.type === 'verification_passed' ? { command: String(requirement.command || '').slice(0, 1000) } : {}) };
  });
}
function evidence(input) {
  const o = input || {};
  return { version: 1, source: 'host', runId: String(o.runId || ''), trigger: String(o.trigger || ''), tainted: !!o.tainted,
    trustedUserMessages: o.trustedInput ? [o.trustedInput] : [], checks: checks(o.completion), loadedSkills: o.loadedSkills || [] };
}
module.exports = { textOf, quotedMaterial, quotedTurns, cleanOwnerRows, ownedBriefs, capture, eligible, preferences, needsReview, checks, evidence };
