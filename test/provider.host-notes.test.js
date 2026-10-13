/* node test/provider.host-notes.test.js — HOST NOTES ON A GENERIC CHAT WIRE (lean-prompt review, 2026-10-12).

   The per-run <run_context> note, <recalled-memory> and the earlier-conversation <conversation_summary> ride the loop's
   messages as their own system messages after the system prompt. A strict chat template ("System message must be at
   the beginning", #102) or a role-order validator (no system after an assistant/tool turn) refuses that, and the run
   context is on EVERY message. Every Chat Completions route that is not a Claude model must send exactly ONE leading
   system message and carry the notes as the fenced leading text of the NEWEST user message (never a separate message,
   so alternation holds); nativeOllama keeps system[0] byte-stable by leaving the notes out of its merged slot. Claude
   routes keep their structural placement. Real adapters, captured request bodies, no network. */
'use strict';
const A = require('./_assert.js');
const provider = require('../sidecar/providers/provider.js');
const { makeOpenRouterProvider } = require('../sidecar/providers/openrouter.js');
const { makeOpenAICompatibleProvider } = require('../sidecar/providers/openai-compatible.js');
const N = require('../sidecar/providers/ollama-native.js');

const text = c => typeof c === 'string' ? c : (Array.isArray(c) ? c.map(p => (p && p.text) || '').join('') : '');
async function collect(p, req) { const out = []; for await (const e of p.stream(req)) out.push(e); return out; }
// the strict validator the review named: one system message, at index 0 only; none after an assistant or tool turn
function strictProblems(messages) {
  const problems = [];
  messages.forEach((m, i) => {
    if (m.role !== 'system') return;
    if (i > 0) problems.push('system at index ' + i);
    if (i > 0 && messages[i - 1] && (messages[i - 1].role === 'assistant' || messages[i - 1].role === 'tool')) problems.push('system after ' + messages[i - 1].role);
  });
  return problems;
}

const SYS = 'SYSTEM_PROMPT: you are the lead.';
const SUMMARY = '<conversation_summary>\nEARLIER: the Commander said never use tables.\n</conversation_summary>';
const RECALL = '<recalled-memory>\nRECALL: prefers bullet lists.\n</recalled-memory>';
const conversation = runId => [
  { role: 'system', content: SYS },
  { role: 'system', content: SUMMARY },
  { role: 'user', content: 'q1' },
  { role: 'assistant', content: 'a1' },
  { role: 'system', content: provider.runContextNote('[RUNTIME]\nRun id: ' + runId) },
  { role: 'system', content: RECALL },
  { role: 'user', content: 'q2' }
];

(async () => {
  // ---- the pure projection ----
  {
    const msgs = conversation('r1');
    const before = JSON.stringify(msgs);
    const out = provider.userSideHostNotes(msgs);
    A.eq(out.map(m => m.role), ['system', 'user', 'assistant', 'user'], 'notes leave their system messages; alternation is untouched');
    A.eq(out[0], msgs[0], 'the system prompt is the same object (byte-stable)');
    A.eq(strictProblems(out), [], 'one system message, at index 0');
    const last = text(out[3].content);
    A.ok(last.indexOf(SUMMARY) === 0, 'the newest user message opens with the earlier-conversation note');
    A.ok(last.indexOf('<run_context>') > last.indexOf(SUMMARY) && last.indexOf(RECALL) > last.indexOf('</run_context>'), 'notes keep their order: summary, run context, recall');
    A.ok(/\n\nq2$/.test(last), 'the Commander\'s own words close the turn, unchanged');
    A.eq(out[1], msgs[2], 'an older user turn is untouched');
    A.eq(JSON.stringify(msgs), before, 'the durable history is never rewritten');
    const plain = [{ role: 'system', content: SYS }, { role: 'user', content: 'hi' }];
    A.ok(provider.userSideHostNotes(plain) === plain, 'no host note: identity (bytes unchanged)');
    const steering = [{ role: 'system', content: SYS }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'x' }, { role: 'system', content: '<steering_note>s</steering_note>' }];
    A.ok(provider.userSideHostNotes(steering) === steering, 'other host system messages keep their pre-existing placement');
    const parts = [{ role: 'system', content: SYS }, { role: 'system', content: provider.runContextNote('ctx') },
      { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }] }];
    const p2 = provider.userSideHostNotes(parts);
    A.eq(p2[1].content.map(p => p.type), ['text', 'text', 'image_url'], 'a parts user message gains ONE leading text part');
    A.ok(p2[1].content[0].text.indexOf('<run_context>') === 0, 'the leading part is the fenced note');
    A.eq(provider.chatRoleProjection(conversation('r1'), 'anthropic/claude-sonnet-4.6').map(m => m.role), ['system', 'system', 'user', 'assistant', 'user', 'user', 'user'], 'a Claude model keeps its structural placement (preserveClaudeContinuations)');
  }

  // ---- OpenRouter: non-Claude models get the projection; Claude keeps its continuations ----
  {
    const bodies = [];
    const fetch = async (url, init) => {
      if (!String(url).endsWith('/chat/completions')) return new Response('{"data":[]}');
      bodies.push(JSON.parse(init.body));
      return new Response('data: [DONE]\n\n');
    };
    for (const model of ['openai/gpt-4o', 'meta-llama/llama-3.1-70b-instruct', 'mistralai/mistral-large']) {
      bodies.length = 0;
      await collect(makeOpenRouterProvider({ fetch, key: 'k' }), { model, messages: conversation('r1') });
      await collect(makeOpenRouterProvider({ fetch, key: 'k' }), { model, messages: conversation('r2') });
      const [b1, b2] = bodies;
      A.eq(strictProblems(b1.messages), [], model + ': exactly one leading system message, none later');
      A.eq(b1.messages.map(m => m.role), ['system', 'user', 'assistant', 'user'], model + ': user/assistant alternation');
      A.eq(JSON.stringify(b1.messages[0]), JSON.stringify(b2.messages[0]), model + ': system[0] byte-identical across two messages');
      A.ok(text(b1.messages[3].content).indexOf('Run id: r1') > 0 && text(b2.messages[3].content).indexOf('Run id: r2') > 0, model + ': each request carries its own run context in the newest user turn');
    }
    bodies.length = 0;
    await collect(makeOpenRouterProvider({ fetch, key: 'k' }), { model: 'anthropic/claude-sonnet-4.6', messages: conversation('r1') });
    A.eq(bodies[0].messages.map(m => m.role), ['system', 'system', 'user', 'assistant', 'user', 'user', 'user'], 'OpenRouter Claude: structural placement unchanged');
  }

  // ---- openai-compatible (provider 'custom', hosted profiles): the projection ----
  {
    const bodies = [];
    const fetch = async (url, init) => {
      if (String(url).endsWith('/models')) return new Response('{"data":[]}');
      bodies.push(JSON.parse(init.body));
      return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    };
    const p = makeOpenAICompatibleProvider({ fetch, baseUrl: 'http://custom-fixture.local/v1' });
    await collect(p, { model: 'qwen2.5-14b-instruct', messages: conversation('r1') });
    await collect(p, { model: 'qwen2.5-14b-instruct', messages: conversation('r2') });
    const [b1, b2] = bodies;
    A.eq(strictProblems(b1.messages), [], 'custom: exactly one leading system message, none later');
    A.eq(b1.messages.map(m => m.role), ['system', 'user', 'assistant', 'user'], 'custom: alternation');
    A.eq(b1.messages[0].content, SYS, 'custom: system[0] is the plain system prompt string');
    A.eq(JSON.stringify(b1.messages[0]), JSON.stringify(b2.messages[0]), 'custom: system[0] byte-identical across two messages');
    A.ok(text(b1.messages[3].content).indexOf('<run_context>') >= 0 && text(b1.messages[3].content).indexOf(RECALL) >= 0, 'custom: run context + recall ride the newest user turn');
    bodies.length = 0;
    await collect(p, { model: 'claude-sonnet-4-6', messages: conversation('r1') });
    A.eq(bodies[0].messages.map(m => m.role), ['system', 'system', 'user', 'assistant', 'user', 'user', 'user'], 'custom Claude: structural placement unchanged');
  }

  // ---- nativeOllama: system[0] excludes the notes and stays byte-stable; native and /v1 fallback alike ----
  for (const fallback of [false, true]) {
    const chats = [];
    const fetch = async (url, init) => {
      if (url.endsWith('/api/show')) return new Response(JSON.stringify({ model_info: { 'qwen3.context_length': 65536 }, capabilities: ['completion', 'tools'] }));
      if (url.endsWith('/api/ps')) return new Response('{"models":[]}');
      if (url.endsWith('/models')) return new Response('{"data":[]}');
      if (url.endsWith('/api/chat') && fallback) return new Response('route not found', { status: 404 });
      chats.push(JSON.parse(init.body));
      return url.endsWith('/api/chat')
        ? new Response(JSON.stringify({ message: { role: 'assistant', content: 'OK' }, done: true, done_reason: 'stop' }) + '\n')
        : new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    };
    const p = makeOpenAICompatibleProvider({ fetch, baseUrl: 'http://ollama-fixture.local/v1', nativeOllama: true });
    const withSteer = runId => conversation(runId).slice(0, 4).concat([{ role: 'system', content: '<steering_note>HOST_STEERING</steering_note>' }], conversation(runId).slice(4));
    await collect(p, { model: 'qwen3:8b', messages: withSteer('r1'), preStreamRetries: 0 });
    await collect(p, { model: 'qwen3:8b', messages: withSteer('r2'), preStreamRetries: 0 });
    const [b1, b2] = chats.slice(-2);
    const label = fallback ? 'nativeOllama /v1 fallback' : 'nativeOllama native';
    A.eq(strictProblems(b1.messages), [], label + ': one system message at index 0');
    A.eq(b1.messages[0].content, SYS + '\n\n<steering_note>HOST_STEERING</steering_note>', label + ': system[0] = the system prompt + host policy (#102), no host note');
    A.eq(JSON.stringify(b1.messages[0]), JSON.stringify(b2.messages[0]), label + ': system[0] byte-identical across two messages');
    const last = text(b1.messages[b1.messages.length - 1].content);
    A.ok(last.indexOf(SUMMARY) === 0 && last.indexOf('Run id: r1') > 0 && last.indexOf(RECALL) > 0 && /\n\nq2$/.test(last), label + ': the notes lead the newest user turn');
    A.eq(b1.messages.map(m => m.role), ['system', 'user', 'assistant', 'user'], label + ': alternation');
  }
  const direct = N.leadingSystemMessages(conversation('r1'));
  A.eq(direct.filter(m => m.role === 'system').length, 1, 'leadingSystemMessages itself excludes the notes from the merged slot');
  A.eq(direct[0].content, SYS, 'leadingSystemMessages: system[0] is the system prompt alone when no other host policy rides');

  A.report('provider.host-notes');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
