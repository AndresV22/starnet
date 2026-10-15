/* node test/rewind-health.test.js — the RESTORE lane never implies an undo point that was not saved.

   The lane's own paragraph promises a restore point before every command, and a snapshot is fail-open: when one
   cannot be saved (a killed checkpoint Git command's stale lock refused every later add for that agent — the P1 the
   GH#107 lane found) the run goes on with no undo point, and the list used to look exactly like a working one.
   GET /api/checkpoint now carries the store's health record (the LAST automatic attempt this boot); the lane shows
   a failing net in the alarm line, a recovered one's missed point as a dim line, and nothing when health is unknown
   or clean. Driven in a vm against stub StationUI/Harness, the real windows/rewind.js. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = path.join(__dirname, '..', 'frontend', 'app', 'windows', 'rewind.js');

function element() { return { innerHTML: '', className: '', textContent: '', listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } }; }
async function render(body) {
  const els = { '#rw-list': element(), '#rw-msg': element(), '#rw-refresh': element() };
  const host = { querySelector: sel => els[sel] || null };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, JSON, Date, encodeURIComponent,
    window: {},
    StationUI: { h: { esc, sfx: () => {}, notify: () => {}, fmtRel: iso => 'REL[' + iso + ']', present: [{ id: 'nova', name: 'NOVA' }], sel: 0 } },
    Harness: { api: { get: async url => { ctx.lastUrl = url; return body; }, post: async () => ({ j: { ok: true } }) } } });
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'rewind.js' });
  const lane = ctx.window.DossierLanes[0](host);
  const sec = element(); lane.sections[0].build(sec);
  lane.wire();
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  return { list: els['#rw-list'].innerHTML, about: sec.innerHTML, url: ctx.lastUrl };
}
const iso = ms => new Date(ms).toISOString();
const snap = (id, ts) => ({ id: id.repeat(40).slice(0, 40), ts, label: 'shell.exec', turn: 1, files: 3 });

(async () => {
  const t0 = 1792000000000;
  const snapshots = [snap('a', t0), snap('b', t0 + 60000)];

  // unknown (nothing attempted this boot) and clean: no claim either way, rows render as before
  let r = await render({ enabled: true, snapshots, health: null });
  A.eq(r.url, '/api/checkpoint?agent=nova', 'the lane reads the selected agent\'s checkpoints');
  A.ok(!/rw-health/.test(r.list) && (r.list.match(/class="mc-row"/g) || []).length === 2, 'no health yet: no note, both rows render');
  r = await render({ enabled: true, snapshots, health: { ok: true, at: t0 + 60000, since: null, failures: 0, lastFailure: null } });
  A.ok(!/rw-health/.test(r.list), 'a clean net shows no note');
  r = await render({ enabled: true, snapshots });
  A.ok(!/rw-health/.test(r.list), 'a backend that reports no health (remote) shows no note');

  // failing: the alarm line names the failure and what cannot be undone, above the rows
  const failing = { ok: false, at: t0 + 120000, since: t0 + 90000, failures: 2,
    lastFailure: { at: t0 + 120000, reason: 'Git add failed (exit 128): Unable to create \'<checkpoint repo>/index.lock\': File exists.' } };
  r = await render({ enabled: true, snapshots, health: failing });
  A.ok(/id="rw-health" data-state="failing"/.test(r.list) && /class="mc-detail"/.test(r.list), 'a failing net renders the alarm line');
  A.ok(/RESTORE POINTS ARE NOT SAVING/.test(r.list), 'it says plainly that restore points are not saving');
  A.ok(r.list.indexOf('REL[' + iso(t0 + 120000) + ']') >= 0, 'it says when the last attempt failed');
  A.ok(r.list.indexOf('&lt;checkpoint repo&gt;/index.lock') >= 0 && r.list.indexOf('<checkpoint repo>') < 0, 'the reason is shown, HTML-escaped');
  A.ok(r.list.indexOf('after the newest restore point (REL[' + iso(t0 + 60000) + '])') >= 0 && /cannot be rolled back until one saves/.test(r.list), 'it names the newest real point: changes after it cannot be undone');
  A.ok(r.list.indexOf('rw-health') < r.list.indexOf('mc-row'), 'the note sits above the restore points');
  A.eq((r.list.match(/data-act="restore"/g) || []).length, 2, 'the real restore points stay restorable');

  // failing with no restore point at all: the warning AND the honest empty state
  r = await render({ enabled: true, snapshots: [], health: failing });
  A.ok(/data-state="failing"/.test(r.list) && /No change can be rolled back/.test(r.list) && /NO RESTORE POINTS YET/.test(r.list), 'no points + failing: the warning says nothing can be undone, plus the empty state');

  // recovered after a miss: a dim line, never the alarm
  r = await render({ enabled: true, snapshots, health: { ok: true, at: t0 + 180000, since: null, failures: 1, lastFailure: { at: t0 + 120000, reason: 'Git add timed out' } } });
  A.ok(/id="rw-health" data-state="missed"/.test(r.list) && !/NOT SAVING/.test(r.list), 'a recovered net shows the missed point, not the alarm');
  A.ok(/Git add timed out/.test(r.list) && /no restore point of its own/.test(r.list), 'it says which change has no restore point of its own');

  A.report('rewind-health.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
