/* sidecar/voice-chat-route.js — the PURE planner behind SETTINGS › Models › VOICE CHAT MODEL (Hermes parity:
   auxiliary.voice_chat, hermes-agent 6cc1efd8f9 + 98a6dcf586, 2026-10-07).

   THE PROBLEM: a spoken reply came from the agent's own model, so a heavy model made every spoken answer slow. A
   voice turn (COMMS with the speaker on, a Telegram voice note) can now run on its own, faster model, and with
   reasoning OFF by default — the typed turns, the agent's saved model and everything after the turn keep the
   agent's own route, because the swap lives on that ONE run's options and nowhere else.

   THE RULES (each one is Hermes' rule, and each one is tested):
   • Only the spoken turn moves. Nothing is written to the roster, the dock or the session; the next typed message
     runs on the agent's model because it never carried the voice options.
   • Switching to voice never compacts the conversation to fit a smaller model: a turn whose prompt would already
     cross the voice model's compaction threshold stays on the agent's model, and the run says why (voiceRoute).
   • A voice model with no working credential is not used — the turn stays on the agent's model, and says why.
   • The agent's own route rides as the FIRST provider fallback, so a voice model that fails mid-turn hands the
     turn back to the model that would have answered anyway (an ordinary provider.fallback receipt).
   • Reasoning: the slot's effort ('none' by default) applies even when the slot follows the agent's model. A model
     whose catalog says it cannot switch reasoning off gets its LOWEST offered level instead; '' = keep the typed
     turn's effort.

   No IO, no clock — the host (sidecar/index.js applyVoiceTurnRoute) reads credentials and the catalog and hands the
   facts in. */
'use strict';

const EFFORT_LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const DEFAULT_EFFORT = 'none';
const MAX_MODEL_LEN = 200;
// the prompt the run sends is bigger than the transcript: the manual, capability and memory blocks plus the tool
// schemas. A fixed allowance keeps the fit check honest without composing the whole prompt twice.
const PROMPT_OVERHEAD_TOKENS = 12000;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

function cleanProvider(v) {
  const s = str(v).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,47}$/.test(s) ? s : '';
}
function cleanModel(v) {
  const s = str(v);
  return (s && s.length <= MAX_MODEL_LEN && !/[\u0000-\u001f\u007f]/.test(s)) ? s : '';
}
// '' = keep the typed turn's effort; any ladder value; anything else = the shipped default
function cleanEffort(v) {
  if (v === '') return '';
  const s = str(v).toLowerCase();
  if (s === 'off') return 'none';
  return EFFORT_LADDER.indexOf(s) >= 0 ? s : DEFAULT_EFFORT;
}

/* A stored/incoming setting -> { provider, model, reasoningEffort }. provider '' = the agent's own provider;
   model '' = the agent's own model (the slot then only changes reasoning). Never throws; junk reads as default. */
function cleanSetting(v) {
  const o = (v && typeof v === 'object') ? v : {};
  const model = cleanModel(o.model);
  return {
    provider: model ? cleanProvider(o.provider) : '',
    model,
    reasoningEffort: Object.prototype.hasOwnProperty.call(o, 'reasoningEffort') ? cleanEffort(o.reasoningEffort) : DEFAULT_EFFORT
  };
}
function defaultSetting() { return { provider: '', model: '', reasoningEffort: DEFAULT_EFFORT }; }
function isDefault(s) {
  const c = cleanSetting(s);
  return !c.model && c.reasoningEffort === DEFAULT_EFFORT;
}

/* POST body -> { ok, setting|null, error? }. { clear:true } or { setting:null } = back to the shipped default. */
function validatePatch(body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (!b) return { ok: false, error: 'expected a JSON object' };
  if (b.clear === true || b.setting === null) return { ok: true, setting: null };
  const src = (b.setting && typeof b.setting === 'object') ? b.setting : b;
  if (src.model != null && src.model !== '' && !cleanModel(src.model)) return { ok: false, error: 'model must be a model id of at most ' + MAX_MODEL_LEN + ' characters' };
  if (src.provider != null && src.provider !== '' && !cleanProvider(src.provider)) return { ok: false, error: 'unknown provider id' };
  if (src.reasoningEffort != null && src.reasoningEffort !== '' && EFFORT_LADDER.indexOf(str(src.reasoningEffort).toLowerCase()) < 0 && str(src.reasoningEffort).toLowerCase() !== 'off') {
    return { ok: false, error: 'reasoningEffort must be one of: ' + EFFORT_LADDER.join(', ') + ' (or "" to keep the typed effort)' };
  }
  return { ok: true, setting: cleanSetting(src) };
}

/* The effort a voice turn sends. want '' -> null (no override). allowed = the model's offered levels when the
   catalog knows them; an unknown list sends `want` and the adapter clamps it as it does for every run. */
function voiceEffort(want, allowed) {
  if (want === '' || want == null) return null;
  const list = Array.isArray(allowed) ? allowed.map(e => str(e).toLowerCase()).filter(e => EFFORT_LADDER.indexOf(e) >= 0) : [];
  if (!list.length || list.indexOf(want) >= 0) return want;
  if (want === 'none') {
    // cannot switch reasoning off: its weakest level
    const lowest = list.slice().sort((a, b) => EFFORT_LADDER.indexOf(a) - EFFORT_LADDER.indexOf(b))[0];
    return lowest || want;
  }
  return want;
}

/* The decision. Inputs are facts the host already read:
     setting      — cleanSetting() output
     main         — { provider, model }: what this run would use without the slot
     target       — the slot's model: { credentialOk, contextLimit (0 = unknown), efforts (its levels, or null) }
     mainEfforts  — the agent's own model's levels (or null), for a turn that stays on it
     promptTokens — the estimated prompt this turn sends (transcript + system), before PROMPT_OVERHEAD_TOKENS
     compactAt    — the run's compaction share of the window (context.js RUN_CONTEXT_DEFAULTS.compactAt)
   Returns { route: 'voice'|'main', provider, model, reasoningEffort (null = keep), reason ('' when the voice model
   answers or none is set) }. */
function planVoiceRoute(input) {
  const i = input || {};
  const setting = cleanSetting(i.setting);
  const main = { provider: cleanProvider(i.main && i.main.provider), model: cleanModel(i.main && i.main.model) };
  const target = i.target || {};
  const onMain = (reason) => ({
    route: 'main', provider: main.provider, model: main.model,
    reasoningEffort: voiceEffort(setting.reasoningEffort, i.mainEfforts), reason: reason || ''
  });
  if (!setting.model) return onMain('');
  const provider = setting.provider || main.provider;
  if (provider === main.provider && setting.model === main.model) return onMain('');
  if (!target.credentialOk) return onMain('not_configured');
  const limit = Number(target.contextLimit) || 0;
  const share = (Number(i.compactAt) > 0 && Number(i.compactAt) < 1) ? Number(i.compactAt) : 0.65;
  const tokens = (Number(i.promptTokens) || 0) + PROMPT_OVERHEAD_TOKENS;
  if (limit > 0 && tokens >= Math.floor(limit * share)) return onMain('too_large');
  return { route: 'voice', provider, model: setting.model, reasoningEffort: voiceEffort(setting.reasoningEffort, target.efforts), reason: '' };
}

// the words a reason reads as, in the COMMS notice and the run record
const REASON_TEXT = {
  not_configured: 'its provider is not connected',
  too_large: 'this conversation is larger than its context window'
};
function reasonText(reason) { return REASON_TEXT[reason] || ''; }

module.exports = {
  EFFORT_LADDER, DEFAULT_EFFORT, PROMPT_OVERHEAD_TOKENS,
  cleanSetting, defaultSetting, isDefault, validatePatch, voiceEffort, planVoiceRoute, reasonText
};
