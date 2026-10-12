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
// provenance. Bound before filtering; legacy rows without an explicit clean stamp cannot supply that proof.
function cleanOwnerRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice(-400).filter(m => m && m.role === 'user' && m.taintKnown === true && !m.taint && !m.from &&
    typeof m.content === 'string' && m.content.trim() && !quotedMaterial(m.content));
}
function ownedBriefs(briefs, transcriptRows) {
  const clean = cleanOwnerRows(transcriptRows);
  return (Array.isArray(briefs) ? briefs : []).filter(b => b && b.agentId && b.originalDirective &&
    clean.some(m => m.agentId === b.agentId && m.streamId === (b.streamId || 'global') && m.content.trim().slice(0, 4000) === b.originalDirective));
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
  return !o.internal && !o.parentRunId && !o.delegatedBy && !o.groupTools && !o.recovery && !o.handoff &&
    !o.untrustedEntry && !o.syntheticTrigger && !o.hostPowerWithheld &&
    (o.source === 'interactive-owner' || (o.source === 'channel-owner' && o.channelSenderOwner === true));
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
    if (!/^(?:(?:please\s+)?remember(?:\s+that)?[,:]?\s+)?(?:(?:i|we)\s+(?:strongly\s+|generally\s+)?prefer\b|(?:from now on|going forward|by default|for (?:all|every) future (?:tasks?|chats?|conversations?))[,:]?\s|(?:always|never)\s)/i.test(content)) continue;
    if (/\b(?:passwords?|secrets?|credentials?|api.?keys?|access.?tokens?|auth|permissions?|approvals?|safety|guards?|polic(?:y|ies)|system.?prompts?|instruction.?hierarchy|full.?access|bypass(?:ing)?|overrides?|forget|do not (?:remember|save)|don't (?:remember|save))\b/i.test(content)) continue;
    const global = !projectRoot || /\b(?:across all (?:projects|tasks)|for (?:all|every) future (?:tasks?|chats?|conversations?))\b/i.test(content);
    out.push({ kind: 'profile', content, scope: global ? 'global' : 'project', projectRoot: global ? null : String(projectRoot), standing: true });
    if (out.length >= 5) break;
  }
  return out;
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
module.exports = { textOf, quotedMaterial, cleanOwnerRows, ownedBriefs, capture, eligible, preferences, checks, evidence };
