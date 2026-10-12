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
// LEARNING TAIL: the most transcript any durable learning pass can read, counted back from the newest turn. The review
// stash (verdictreview.js PERSIST_CHARS, each turn clipped to PER_MESSAGE_CHARS) is the widest; reflection, study,
// thread mining, failure review and the skill review's raw transcript all read a shorter tail (its structured evidence
// leaves quoted turns out on its own: learningevidence.js). test/trusted-learning.test.js locks these bounds.
const LEARNING_TAIL_CHARS = 16000;
const LEARNING_TAIL_MESSAGE_CHARS = 4000;
const RECALL_FENCE = /<recalled-memory>[\s\S]*?<\/recalled-memory>|<\/?recalled-memory>/gi;
// quotedInLearningTail: is there quoted material in a user turn a learning pass can still read? A quote that scrolled
// past every pass's tail must not keep learning off for the rest of a long conversation. Each later turn counts the
// LEAST any pass would count it, so a quote is never called out of reach too early: tool and block-content turns
// count nothing (reflection reads string user/agent text only), recalled-memory fences count nothing (stripped),
// a turn counts at most its per-turn clip, and the newest agent answer counts nothing (the stash keeps it whole).
// The newest user turn is always read (reflection and the stash keep the directive even when the tail cut it).
function quotedInLearningTail(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let used = 0, sawUser = false, sawAnswer = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (sawUser && used >= LEARNING_TAIL_CHARS) return false;
    if (m.role === 'user') {
      if (quotedMaterial(textOf(m))) return true;
      sawUser = true;
    }
    const raw = typeof m.content === 'string' ? m.content : '';
    if (m.role === 'assistant' && !sawAnswer && raw.trim()) { sawAnswer = true; continue; }
    used += Math.min(raw.replace(RECALL_FENCE, '').length, LEARNING_TAIL_MESSAGE_CHARS);
  }
  return false;
}
// Ambient activity and repeat-work claims require the original owner text, not the completion run's later
// provenance. Bound before filtering; legacy rows without an explicit clean stamp cannot supply that proof.
function cleanOwnerRows(rows, runRecords) {
  const origins = runRecords === undefined ? null : new Map((Array.isArray(runRecords) ? runRecords : []).filter(r => r && r.runId).map(r => [r.runId, r]));
  return (Array.isArray(rows) ? rows : []).slice(-400).filter(m => {
    if (!m || m.role !== 'user' || m.taintKnown !== true || m.taint || m.from ||
      typeof m.content !== 'string' || !m.content.trim() || quotedMaterial(m.content)) return false;
    if (!origins) return true;
    // A clean row can still be station self-talk. Resolve its original run independently of the recent
    // title window; missing origin or an unknown internal flag is not evidence of an owner request.
    const r = origins.get(m.sourceRunId);
    return !!(r && r.internal === false && !r.parentRunId && !r.delegatedBy && !r.cronJobId && !r.recoveryOf &&
      r.agentId === m.agentId && (r.streamId || 'global') === m.streamId && !/^(?:nightshift-|cron-|workshop-)/i.test(r.streamId || ''));
  });
}
function ownedBriefs(briefs, transcriptRows, runRecords) {
  const clean = cleanOwnerRows(transcriptRows, runRecords), seen = new Set();
  return (Array.isArray(briefs) ? briefs : []).filter(b => {
    if (!b || !b.agentId || !b.originalDirective) return false;
    // New briefs retain an immutable originalRunId. Older host briefs already encode that identity in
    // tb_<original-run-id>; never substitute completion's mutable runId or a later identical request.
    const original = b.originalRunId || (typeof b.id === 'string' && b.id.startsWith('tb_') ? b.id.slice(3) : '');
    if (!original) return false;
    const stream = b.streamId || 'global', key = JSON.stringify([b.agentId, stream, original]);
    if (seen.has(key) || !clean.some(m => m.sourceRunId === original && m.agentId === b.agentId && m.streamId === stream &&
      m.content.trim().slice(0, 4000) === b.originalDirective)) return false;
    seen.add(key); return true;
  });
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
    // Always/Never only opens an order when an instruction follows; "Never mind, …", "Never seen it this bad" and
    // "Always worked before" are remarks, and saving them would hand every agent a standing order nobody gave.
    // ever/again/before/once are adverbs, judged by what follows them: "Never again push to main." is an order,
    // while "Never again.", "Never before have I seen this" and "Never once worked" are not.
    if (/^(?:(?:please\s+)?remember(?:\s+that)?[,:]?\s+)?(?:never\s+mind\b|(?:always|never)\s+(?:(?:ever|again|before|once)\s+)*(?:(?:seen|been|had|heard|knew|known|got|gotten|did|done|was|were|is|are|am|has|does|thought|felt|happened|happens|worked|works|liked|loved|expected|imagined|managed|understood|occurred|would|could|might|will|can|shall|should|must|gets|seems|fails|goes|breaks|noticed|tried|used|wanted|needed|realized|said|told|saw|went|came|made|took)\b(?!-)|(?:do|have)\s+(?:i|we|you|they)\b)|(?:always|never)\s+(?:(?:ever|again|before|once)\b\s*)+(?:[.!,;:—–…-]|$))/i.test(content)) continue;
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
  // trustedOnly: quoted material the owner typed. Not taint (tools keep owner authority), but learning reads only
  // the captured directive and host checks, never the raw transcript. Present only when set: clean shape unchanged.
  return { version: 1, source: 'host', runId: String(o.runId || ''), trigger: String(o.trigger || ''), tainted: !!o.tainted,
    ...(o.trustedOnly ? { trustedOnly: true } : {}),
    trustedUserMessages: o.trustedInput ? [o.trustedInput] : [], checks: checks(o.completion), loadedSkills: o.loadedSkills || [] };
}
module.exports = { textOf, quotedMaterial, quotedInLearningTail, LEARNING_TAIL_CHARS, LEARNING_TAIL_MESSAGE_CHARS, cleanOwnerRows, ownedBriefs, capture, eligible, preferences, checks, evidence };
