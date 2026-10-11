/* sidecar/earlier-conversation.js — THE TURNS THE WINDOW DROPPED STILL COUNT (consistency audit 2026-10-11).

   COMMS sends a bounded window of the conversation: the newest 120 messages, cut further to fit ~85% of the
   model's window (frontend/app/chat.js historyWindowFrom / modelFitHistory). Everything older was simply left out
   of the request — no summary, no marker — so an instruction the Commander gave on turn 3 of a long chat stopped
   existing for the model, and the server's compaction never saw it either (it only folds what it is sent). User
   report 10-11: "the longer I went back and forth the worse it got." The server still holds every turn in the
   durable transcript. This module finds where the client's window starts in that transcript and renders the part
   before it as ONE <conversation_summary> note:
     - every dropped Commander message VERBATIM, in the same length-prefixed section a compaction fold carries
       (compaction-fidelity.js) — instructions claim the budget first — so loop.js's compaction merges onto this
       note instead of stacking a second one;
     - the assistant's own replies from that part as short heads, newest first under a budget, tool use named;
     - a pointer to the conversation-search tool for anything cut.
   Deterministic and free (no model call): the same transcript renders the same note every turn, so nothing
   paraphrases differently from one turn to the next. ALIGNMENT is by the Commander's messages only — the transcript
   stores each as its own row, the client keeps them as sent, while one client reply can span several assistant
   rows. If any window message cannot be found, in order, nothing is injected (exactly the old behavior) rather
   than guessing. Pure: no IO, no clock. */
'use strict';

const fidelity = require('./compaction-fidelity.js');

const KEY_CHARS = 240;
const REPLY_HEAD_CHARS = 280;
const NOTE_MIN_CHARS = 4000;

function str(v) { return v == null ? '' : String(v); }
function squash(s) { return str(s).replace(/\s+/g, ' ').trim(); }

// a user message's text the way the transcript stored it (index.js userMsgText): string content, or text parts joined
function userText(m) {
  if (!m || m.role !== 'user') return null;
  if (typeof m.content === 'string') return m.content;
  if (!Array.isArray(m.content)) return null;
  const parts = [];
  for (const p of m.content) {
    if (typeof p === 'string') parts.push(p);
    else if (p && typeof p.text === 'string') parts.push(p.text);
  }
  return parts.join('');
}

// comparison key: whitespace-insensitive head of the (redacted) text; '' = not a usable anchor
function keyOf(text, redact) {
  const t = typeof redact === 'function' ? redact(str(text)) : str(text);
  return squash(t).slice(0, KEY_CHARS);
}

/* Where does the client's window begin in the stream's transcript rows?
   rows   — the stream's transcript rows, chronological ({ role, content, toolCalls?, ts, ... })
   window — the messages the client sent BEFORE the new directive (system messages ignored)
   Returns the index of the first row the window does NOT cover from below (rows[0..cut) were dropped), 0 when
   nothing was dropped, or -1 when the window cannot be placed (then the caller injects nothing). */
function windowCut(rows, window, redact) {
  const list = Array.isArray(rows) ? rows : [];
  const msgs = (Array.isArray(window) ? window : []).filter(m => m && (m.role === 'user' || m.role === 'assistant'));
  const wantKeys = [];
  for (const m of msgs) {
    if (m.role !== 'user') continue;
    const k = keyOf(userText(m), redact);
    if (k) wantKeys.push(k);
  }
  if (!wantKeys.length) return -1;
  // match the window's Commander messages newest-first against the rows, in order; every one must be found
  let w = wantKeys.length - 1, first = -1;
  for (let i = list.length - 1; i >= 0 && w >= 0; i--) {
    const r = list[i];
    if (!r || r.role !== 'user') continue;
    if (keyOf(r.content, null) === wantKeys[w]) { first = i; w--; }
  }
  if (w >= 0 || first < 0) return -1;
  // a window that opens on an assistant reply carries the tail of the exchange before its first user message:
  // that exchange's question is the last thing dropped, its tool rows and reply are (in substance) in the window
  if (msgs.length && msgs[0].role === 'assistant') {
    for (let i = first - 1; i >= 0; i--) if (list[i] && list[i].role === 'user') return i + 1;
    return 0;
  }
  return first;
}

function toolNames(row) {
  if (!row || !row.toolCalls) return [];
  let tc = row.toolCalls;
  if (typeof tc === 'string') { try { tc = JSON.parse(tc); } catch (_) { return []; } }   // a redacted/clipped call list is not names
  if (!Array.isArray(tc)) return [];
  const out = [];
  for (const c of tc) {
    const n = c && ((c.function && c.function.name) || c.name);
    if (n && out.indexOf(String(n)) < 0) out.push(String(n));
  }
  return out;
}

/* The dropped rows -> exchanges: { user: text|null, replies: [head], tools: [name] } in order. */
function exchanges(rows) {
  const out = [];
  let cur = null;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r) continue;
    if (r.role === 'user') { cur = { user: str(r.content), replies: [], tools: [] }; out.push(cur); continue; }
    if (r.role !== 'assistant') continue;
    if (!cur) { cur = { user: null, replies: [], tools: [] }; out.push(cur); }
    for (const n of toolNames(r)) if (cur.tools.indexOf(n) < 0) cur.tools.push(n);
    const t = squash(fidelity.contentText(r.content));
    if (t) cur.replies.push(t);
  }
  return out;
}

// one line per exchange that produced something: the reply's head and the tools it used
function replyLine(ex) {
  const reply = ex.replies.length ? ex.replies[ex.replies.length - 1] : '';
  const head = reply.length > REPLY_HEAD_CHARS ? reply.slice(0, REPLY_HEAD_CHARS - 1) + '…' : reply;
  const used = ex.tools.length ? ' [used ' + ex.tools.slice(0, 6).join(', ') + (ex.tools.length > 6 ? ', …' : '') + ']' : '';
  if (!head && !used) return '';
  return '- ' + (head || '(no reply text)') + used;
}

/* Render the note for the dropped rows. opts: { windowTokens, searchTool } -> { note, users, replies, omittedReplies }
   or null when the dropped part holds nothing worth carrying. The whole note stays within ~20% of the window
   (floor NOTE_MIN_CHARS): the Commander's words have their own fidelity budget (~5% of the window); the reply heads
   take what is left of their own ~4% share, newest first, older ones counted. */
function render(dropped, opts) {
  opts = opts || {};
  const windowTokens = Math.max(0, Math.floor(Number(opts.windowTokens) || 0));
  const rows = Array.isArray(dropped) ? dropped : [];
  if (!rows.length) return null;
  const exs = exchanges(rows);
  const userItems = [];
  for (const ex of exs) {
    if (ex.user != null && ex.user.trim()) userItems.push({ kind: 'user', text: ex.user, fullChars: ex.user.length });
  }
  const section = fidelity.mergeUserMessages(null, userItems, fidelity.userBudgetChars(windowTokens));
  const usersText = fidelity.renderUserSection(section);
  const noteMax = Math.max(NOTE_MIN_CHARS, Math.floor(windowTokens * 4 * 0.2));
  const replyBudget = Math.max(1200, Math.min(Math.floor(windowTokens * 4 * 0.04) || 1200, noteMax - usersText.length - 600));
  const lines = [];
  let used = 0, omitted = 0;
  for (let i = exs.length - 1; i >= 0; i--) {
    const line = replyLine(exs[i]);
    if (!line) continue;
    if (used + line.length + 1 > replyBudget) { omitted++; continue; }
    lines.unshift(line); used += line.length + 1;
  }
  if (!usersText && !lines.length) return null;
  const turns = userItems.length;
  let prose = 'EARLIER IN THIS CONVERSATION: ' + (turns ? turns + ' earlier message' + (turns === 1 ? '' : 's') + ' from the Commander' : 'earlier turns')
    + ' and your replies to them no longer fit the context window, so they are carried here instead of being lost. The Commander\'s own words are below, verbatim — any instruction, preference or decision in them still holds unless a later message changed it.';
  if (lines.length) prose += '\n\nYour replies in that part (shortened, oldest first):\n' + (omitted ? '- [' + omitted + ' earlier repl' + (omitted === 1 ? 'y' : 'ies') + ' not shown]\n' : '') + lines.join('\n');
  if (opts.searchTool) prose += '\n\nTo read any of that part in full, search this conversation with ' + opts.searchTool + '.';
  const note = '<conversation_summary>\n' + fidelity.joinSummary(prose, usersText) + '\n</conversation_summary>';
  return { note, users: section.items.length, omittedUsers: section.omitted, replies: lines.length, omittedReplies: omitted };
}

/* The rows the window dropped carry outside content when any of them was written by a run that read it. */
function taintOf(rows) {
  for (const r of (Array.isArray(rows) ? rows : [])) if (r && typeof r.taint === 'string' && r.taint) return r.taint;
  return null;
}

module.exports = { windowCut, render, taintOf, keyOf, userText, exchanges, _internals: { replyLine, toolNames, KEY_CHARS, REPLY_HEAD_CHARS } };
