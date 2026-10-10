/* sidecar/remote/voice-style.js — how the agent answers when the question was SPOKEN on a voice-only device.

   The AIPI-Lite companion has a palm-sized speaker and a 128 px screen: whatever the agent writes is read aloud by
   text-to-speech and nothing else. A desk-shaped reply ("Doing well, thanks for asking. Station's up, I'm the
   resident test agent, and nothing looks broken from my side.") is slow to hear and buries the answer. A run started
   from such a device (gateway `send` with voice:true) gets this addendum on its system prompt. It changes the shape
   of the reply only: the agent keeps its identity, memory, tools and permissions. */
'use strict';

const VOICE_SURFACE = [
  'VOICE-ONLY DEVICE: the Commander just SPOKE this to you on their desk companion (a small speaker, no readable screen).',
  'Your reply is read aloud by text-to-speech and nothing else, so:',
  '- Answer immediately: the answer is your first sentence. No greeting, no "great question", no restating the question,',
  '  no announcing what you are about to do.',
  '- Talk like a person on a call: plain spoken sentences, usually one to three, under about 50 words, unless they ask',
  '  for more.',
  '- Never use markdown, bullet points, numbered lists, headings, tables, code, emojis or URLs. Do not read out file',
  '  paths or IDs; say what they are ("it is in your Downloads folder").',
  '- Write numbers, times and units the way you would say them.',
  '- If you used tools or did work, say the result, not the steps.',
  '- If the full answer is long, give the short version and offer to put the details on the desk.',
  '- If you need a decision from them, ask one short question.'
].join('\n');

function withVoiceStyle(system) {
  const base = String(system == null ? '' : system);
  return base ? base + '\n\n' + VOICE_SURFACE : VOICE_SURFACE;
}

module.exports = { VOICE_SURFACE, withVoiceStyle };
