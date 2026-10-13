'use strict';
/* test/helpers/host-notes.js — read the host notes out of a captured Chat Completions request, wherever the wire put them.

   The per-run <run_context> note, <recalled-memory> and the earlier-conversation <conversation_summary> are host notes.
   On a Claude route they ride as their own messages; on every other Chat Completions route (provider 'custom',
   OpenRouter non-Claude models such as the fixtures' 'test/model', hosted openai-compatible profiles, Ollama) they are
   the fenced leading text of the NEWEST user message (provider.js userSideHostNotes — strict chat templates refuse a
   system message after index 0). Tests that read the run identity or recall from a request, or route a mock on the
   Commander's own words, use these instead of assuming one placement. */

const TAGS = ['run_context', 'recalled-memory', 'conversation_summary'];
const text = c => typeof c === 'string' ? c : (Array.isArray(c) ? c.map(p => (typeof p === 'string' ? p : ((p && p.text) || ''))).join('') : (c == null ? '' : String(c)));

// every fenced <tag>…</tag> block in the request's messages (system notes and user-side notes alike), in order
function hostNotes(messages, tag) {
  const tags = tag ? [tag] : TAGS;
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || (m.role !== 'system' && m.role !== 'user')) continue;
    const t = text(m.content);
    for (const name of tags) {
      const re = new RegExp('<' + name + '>[\\s\\S]*?</' + name + '>', 'g');
      let hit;
      while ((hit = re.exec(t))) {
        // a user message only carries a host note as its LEADING text (anything later is the Commander's own words)
        if (m.role === 'user' && !leadingNoteSpan(t, hit.index)) continue;
        out.push(hit[0]);
      }
    }
  }
  return out;
}
// is `at` inside the run of host-note blocks that opens this user text?
function leadingNoteSpan(t, at) {
  let i = 0;
  for (;;) {
    while (i < t.length && /\s/.test(t[i])) i++;
    if (i === at) return true;
    const m = /^<(run_context|recalled-memory|conversation_summary)>[\s\S]*?<\/\1>/.exec(t.slice(i));
    if (!m) return false;
    i += m[0].length;
  }
}
const runContextOf = messages => hostNotes(messages, 'run_context').join('\n');
const recallOf = messages => hostNotes(messages, 'recalled-memory').join('\n');
// the Commander's own words of a user message: its text without the leading host notes
function userWords(message) {
  let t = text(message && message.content);
  for (;;) {
    const m = /^\s*<(run_context|recalled-memory|conversation_summary)>[\s\S]*?<\/\1>\s*/.exec(t);
    if (!m) return t;
    t = t.slice(m[0].length);
  }
}
// a copy of a user message without its leading host notes (string content -> the own words; a parts array loses its
// leading host-note text parts), so a test that inspects "what the Commander sent" keeps reading exactly that
function withoutHostNotes(message) {
  if (!message || message.role !== 'user') return message;
  const c = message.content;
  if (typeof c === 'string') return Object.assign({}, message, { content: userWords(message) });
  if (!Array.isArray(c)) return message;
  let i = 0;
  const allNotes = t => /^\s*<(run_context|recalled-memory|conversation_summary)>/.test(t) && !userWords({ role: 'user', content: t }).trim();
  while (i < c.length && c[i] && typeof c[i].text === 'string' && allNotes(c[i].text)) i++;
  return i ? Object.assign({}, message, { content: c.slice(i) }) : message;
}
// the newest user message's own words
function lastUserWords(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].role === 'user') return userWords(list[i]);
  return '';
}

// every host-authored prompt text of a request: the system messages, then the host notes that ride user-side. Tests that
// read "the prompt the host sent" (the [RUNTIME] block, the run's skill index, recall) read this, not one placement.
function hostText(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const sys = list.filter(m => m && m.role === 'system').map(m => text(m.content));
  const userSide = [];
  for (const m of list) if (m && m.role === 'user') for (const n of hostNotes([m])) userSide.push(n);
  return sys.concat(userSide).join('\n\n');
}

module.exports = { TAGS, text, hostNotes, runContextOf, recallOf, userWords, withoutHostNotes, lastUserWords, hostText };
