/* test/workflow-panel-inline-refusals.test.js — THE WORKFLOW PANEL ANSWERS WHERE IT WAS CLICKED (2026-10-09 P0).

   A line edit the panel refused ("there is not enough clear floor round this line for that…", "no room … click it again to
   TIDY") was a toast drawn at the last FLOOR pointer spot — for a click in the panel that is the far-left edge of the screen,
   outside the panel, where nobody looking at the panel saw it. A disabled + said why only to a screen reader. Locked here
   (the DOM is driven live in the lane's proof):
     · every refusal of a line edit, a +, a role chip or an OFF key is the panel's own answer line (note), under the row of
       the control that was clicked — never an off-panel toast; the answer survives the repaint the edit causes;
     · a refused step keeps the + inserter open (its chips are still there to try again), and a step with no room where the
       line stands ARMS its role chip like every edit key: a second click lays the line out afresh round it (one UNDO);
     · a disabled + says why on hover (the station tip, data-tip) and when clicked — in words that name the way round. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const panel = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'workflowpanel.js'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'css', 'workflow-panel.css'), 'utf8').replace(/\r\n/g, '\n');
const fn = (name, end) => { const a = panel.indexOf('  function ' + name + '('); return a < 0 ? '' : panel.slice(a, panel.indexOf(end, a)); };

/* ---------- the answer line ---------- */
const placeNote = fn('placeNote', '  function note(');
const note = fn('note', '\n  }\n');
A.ok(/S\.note = \{ t: String\(t \|\| ''\), bad: !!bad, at: anchorKey\(anchor\), ts: Date\.now\(\) \};/.test(note) && /placeNote\(\);/.test(note), 'note() remembers the answer and the control it answers');
A.ok(/const a = findAnchor\(n\.at\)/.test(placeNote) && /a\.closest\('\.wf-chips, \.wf-row, \.wf-toolong, \.wf-inserter \.h'\)/.test(placeNote), 'placeNote() puts it under the clicked control\'s own row');
A.ok(/if \(a && map && map\.contains\(a\)\) \{ after\(map, 'top'\); return; \}/.test(placeNote) && /if \(a && foot && foot\.contains\(a\)\) \{ p\.classList\.add\('top'\); el\.insertBefore\(p, foot\); return; \}/.test(placeNote), '…under the line diagram for a +, just above the footer for a footer key');
A.ok(/p\.setAttribute\('role', n\.bad \? 'alert' : 'status'\);/.test(placeNote), '…announced (a refusal is an alert)');
const paintAll = fn('paintAll', '\n  }\n'), paintStrip = fn('paintStrip', '\n  /* THE LINE');
A.ok(/placeNote\(\);/.test(paintAll) && /placeNote\(\);/.test(paintStrip), 'it survives the repaint an edit causes (re-placed after every paint)');
A.ok(/\.wf-note \{/.test(css) && /\.wf-note\.bad \{ color: var\(--warn\); \}/.test(css), 'it is styled in the panel\'s own sheet');

/* ---------- every line-edit refusal goes there ---------- */
const lineEdit = fn('lineEdit', '\n  function disarmBtn(');
const insertStep = fn('insertStep', '\n  /* ---------- SHAPE THE LINE');
const wireEdits = fn('wireEdits', '\n  function shapeHTML(');
for (const [name, body] of [['lineEdit', lineEdit], ['insertStep', insertStep], ['wireEdits', wireEdits], ['paintStrip', paintStrip]]) {
  A.ok(body.length > 50, name + ' found');
  A.ok(!/H\.flashTip\([^;]*,\s*false\)/.test(body), name + ': no refusal is an off-panel toast any more');
}
A.ok(/refuse\('no room for that with the line where it stands — click it again to TIDY the line round it \(every machine may move · one UNDO\)', anchor\);/.test(lineEdit), 'NO ROOM where the line stands is said under the key that was clicked');
A.ok(/\} else \{ paint\(true\); refuse\(\(res && res\.msg\) \|\| 'that change cannot be made here', anchor\); \}/.test(lineEdit), '…and so is every other refusal ("not enough clear floor…")');
A.ok(/if \(res && res\.ok\) \{\s*S\.insertAt = null;/.test(lineEdit) && !/S\.insertAt = null; S\.armTidy = null;/.test(lineEdit), 'a refused step keeps the + inserter open (only a made edit closes it)');
A.ok(/lineEdit\(b\.dataset\.edit, b\.dataset\.editId, args, null, tidy \? \{ tidy: true \} : null, b\);/.test(wireEdits) && /if \(b\.classList\.contains\('off'\)\) \{ refuse\(b\.dataset\.tip, b\); return; \}/.test(wireEdits), 'an edit key hands itself in as the anchor; an OFF key says its reason there');
A.ok(/function refuse\(msg, anchor\) \{ H\.sfx\('bad'\); note\(msg, true, anchor\); \}/.test(panel), 'refuse() = the bad sound + the answer line');

/* ---------- the + and its inserter ---------- */
A.ok(/if \(b\.dataset\.plusOff\) \{ refuse\(b\.dataset\.plusOff, b\); return; \}/.test(paintStrip), 'a disabled + clicked says why, in the panel');
A.ok(/class="wf-plus off" aria-disabled="true" data-plus-at="' \+ i \+ '" data-plus-off="' \+ esc\(plusWhy\(chk\)\) \+ '" aria-label="' \+ esc\('Adding a step here is not possible: ' \+ plusWhy\(chk\)\) \+ '" data-tip="' \+ esc\(plusWhy\(chk\)\) \+ '"/.test(paintStrip), '…and on hover: the station tip carries the same reason (its label too, for a screen reader)');
A.ok(/const plusWhy = chk => \(chk && chk\.msg\) \|\| 'a step cannot be added on this belt automatically — add a BAY by hand \(Conveyors › MACHINES › BAY\) and connect it with BELT';/.test(panel), 'a + with no reason of its own still names the way round');
A.ok(/insertStep\(from, to, role, b, tidy\);/.test(paintStrip) && /armKey\('insertStep', from, \{ from, to, role \}\)/.test(paintStrip), 'a role chip is the anchor of its answer, and its second click (armed) tidies round the step');
const ins = fn('inserterHTML', '\n  function nodeHTML(');
A.ok(/armKey\('insertStep', from, \{ from, to, role: r \|\| null \}\)/.test(ins) && /'⌗ TIDY LINE TO FIT IT\?'/.test(ins), 'the armed role chip says what its second click does');
A.ok(/return lineEdit\('insertStep', fromId, \{ from: fromId, to: toId, role: role \|\| null \}, 'step added', tidy \? \{ tidy: true \} : null, anchor\);/.test(insertStep), 'insertStep keys the arm on the same args the chip reads');

A.report('workflow-panel-inline-refusals.test');
