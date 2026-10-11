/* sidecar/notebookrestore.js — pure helpers for restoring an agent's memory from a backup (M-save P2).

   A browser cache wipe does NOT touch the notebook (it lives on the sidecar's disk). But MOVING an agent to
   a fresh machine — export a backup on A, import it on B — needs the memory to come along, or the moved agent
   has identity + XP but amnesia. The export bundle (backup.js) carries a snapshot of the notebook; this module
   folds it back in.

   Two pure functions, no I/O (the route does the fs via notebookStore):
     sanitizeNotes(arr)            -> well-formed [{id,title,body,ts, ...}]   (drops junk, fills missing ids)
     mergeNotes(existing, incoming)-> existing ∪ incoming, keyed by id, ADDITIVE: an incoming note whose id is
                                      already present is IGNORED, never overwrites. So an import can only ADD
                                      memory the target lacks — it can never destroy or mutate notes the agent
                                      already formed. (Restore onto a fresh machine = empty target = full copy.)

   Deterministic: ids for note-without-id are derived from (ts, index), never rng — replays identically. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SK = root.SK || {}; root.SK.notebookrestore = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function sanitizeNotes(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (!n || typeof n !== 'object') continue;
      const title = typeof n.title === 'string' ? n.title : '';
      const body = typeof n.body === 'string' ? n.body : '';
      if (!title && !body) continue;   // an empty note carries nothing — drop it
      const ts = Number.isFinite(Number(n.ts)) ? Number(n.ts) : 0;
      const id = (typeof n.id === 'string' && n.id) ? n.id : ('mem_r' + ts + '_' + i);   // deterministic fallback id
      // preserve any richer cortex fields the bundle happens to carry, but normalize the four core ones
      out.push(Object.assign({}, n, { id: id, title: title, body: body, ts: ts }));
    }
    return out;
  }

  /* FORGOTTEN STAYS FORGOTTEN (memory-truth lane, 2026-10-11). Forget / veto / discard already write the belief's
     text to the agent's permanent declined list (declined:<agent>, visible + restorable in Memory Core) so reflection
     never re-mints it — but a backup import merged by id alone, so restoring an older backup quietly brought every
     forgotten memory back. The declined list IS the tombstone: an incoming note whose text matches an entry is
     skipped. The text is compared the way the forget route wrote it (content, else "title body"), whitespace- and
     case-folded. Removing the entry in Memory Core (Restore) is the explicit way back: the next import brings it in. */
  const fold = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  function forgottenTexts(n) {
    const out = [];
    if (n.content != null) out.push(fold(n.content));
    out.push(fold((n.title || '') + ' ' + (n.body || '')));
    if (n.body) out.push(fold(n.body));
    return out.filter(Boolean);
  }
  function isForgotten(n, declined) {
    if (!declined || !declined.size) return false;
    return forgottenTexts(n).some(t => declined.has(t));
  }

  // ADDITIVE union by id: existing always wins on a collision (never clobber memory formed since the backup).
  // opts.declined (the agent's declined texts) skips incoming notes the Commander forgot; opts.skipped (an array)
  // collects the ids skipped, so the route can report them instead of a silent count gap.
  function mergeNotes(existing, incoming, opts) {
    opts = opts || {};
    const declined = new Set((Array.isArray(opts.declined) ? opts.declined : []).map(fold).filter(Boolean));
    const ex = sanitizeNotes(existing);
    const inc = sanitizeNotes(incoming);
    const seen = new Set();
    const merged = [];
    for (const n of ex) { if (!seen.has(n.id)) { seen.add(n.id); merged.push(n); } }
    for (const n of inc) {
      if (seen.has(n.id)) continue;   // only ids the target lacks
      if (isForgotten(n, declined)) { if (Array.isArray(opts.skipped)) opts.skipped.push(n.id); continue; }
      seen.add(n.id); merged.push(n);
    }
    return merged;
  }

  return { sanitizeNotes, mergeNotes, isForgotten };
});
