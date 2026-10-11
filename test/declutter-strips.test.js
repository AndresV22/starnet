/* node test/declutter-strips.test.js — the three "space thief" fixes of 2026-10-10 (Andrew: "wtf is this share BS … the user
   can't minimize that?"): the group chat's one-budget tray, the DELIVERABLES clear-from-library, and TO REVIEW's fold. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* ---- GROUP CHAT: one tray, one budget, the shelf folds, the preview is no longer the shelf's child ---- */
const gc = read('frontend/app/group-chat.js');
A.ok(/#gc-tray\{[^}]*max-height:45%/.test(gc), 'everything under the transcript shares ONE 45% budget');
A.ok(!/max-height:40%/.test(gc) && !/#gc-questions\{[^}]*max-height:50%/.test(gc) && !/#gc-states\{[^}]*max-height:45%/.test(gc),
  'the three old per-strip caps (40% + 50% + 45% = 135%) are gone');
A.ok(/trayScroll\.append\(questions, states, preview\); tray\.append\(trayScroll, files\)/.test(gc),
  'questions, turn rows and the open file scroll inside the tray; the shelf rides its foot');
A.ok(/root\.append\(transcript, tray, recipient/.test(gc), 'the transcript is followed by the tray, not three loose strips');
A.ok(!/files\.append\([^)]*gc-preview/.test(gc), 'the preview is NOT inside the shelf (an attachment previews in a group with no shared files)');
A.ok(/id: 'gc-files', hidden: ''/.test(gc), 'the shelf chips start folded');
A.ok(/'starnet\.gc\.filesOpen\.' \+ id/.test(gc), 'the fold is remembered per group');
A.ok(/#gc-files\{[^}]*max-height:132px;overflow-y:auto/.test(gc), 'an opened shelf scrolls inside its own cap (no chips spilling under the composer)');
A.ok(/gc-preview-head[\s\S]{0,400}button\('CLOSE FILE', closeFile\)/.test(gc), 'CLOSE FILE sits in the preview head, not after the whole file body');

/* ---- DELIVERABLES: clear from the library (files kept), undoable, scoped by the view's own filter ---- */
const idx = read('sidecar/index.js');
A.ok(/exact: '\/api\/deliverables\/clear', h: handleDeliverablesClear/.test(idx) && /exact: '\/api\/deliverables\/clear-undo', h: handleDeliverablesClearUndo/.test(idx),
  'clear + undo routes are registered');
const clearFn = idx.slice(idx.indexOf('async function handleDeliverablesClear('), idx.indexOf('async function handleDeliverablesClearUndo('));
A.ok(/r\.status !== 'pending'/.test(clearFn) && /skipped/.test(clearFn), 'a row that still needs a decision is never cleared, and is counted as skipped');
A.ok(/byIds === byFilter/.test(clearFn), 'an empty body clears nothing: a bulk clear must name ids or a filter');
A.ok(/deliverableFilter\(rows, deliverableFilterOf\(body\.filter\)\)/.test(clearFn) && /items = deliverableFilter\(items, filter\)/.test(idx),
  'the list and the bulk clear share ONE filter (clear these = exactly the rows in view, past the 500 the list ships)');
A.ok(/includeCleared \? await deliverableRows\(\) : await visibleDeliverableRows\(\)/.test(idx), 'the list hides cleared rows unless asked for the whole index');
const outbox = read('frontend/app/windows/outbox.js');
A.ok(/api\/deliverables\?includeCleared=1/.test(outbox), "TO REVIEW's FILES join still sees a crate whose library card was cleared");
const dlv = read('frontend/app/deliverables.js');
A.ok(/r\.status !== 'pending' \? '<button class="bb sm" data-act="clear"/.test(dlv), 'the drawer offers ✓ DONE · CLEAR on every row but an undecided build');
A.ok(/dataset.act === 'clear'\) return clearRows\(\{ ids: \[r\.id\] \}/.test(dlv), 'one card clears by its id');
A.ok(/class="dlv-bclear" data-bucket=/.test(dlv) && /bucketBounds\(bucket\)/.test(dlv), 'each time heading clears its own window');
A.ok(/ArmConfirm\.wire\(shown,/.test(dlv), 'CLEAR ALL / CLEAR THESE arms before it fires (station 2-step, no native confirm)');
A.ok(/data-undo-clear/.test(dlv) && /\/api\/deliverables\/clear-undo/.test(dlv), 'every clear offers UNDO in the message line');
A.ok(/The files stay on disk/.test(dlv), 'the copy says plainly that files are not deleted');
A.ok(/<details class="dlv-clean-list">/.test(dlv) && /dl-clean-cancel/.test(dlv), 'the CLEAN OLD RECORDS preview folds its list and can be cancelled');

/* ---- TO REVIEW: folds (remembered), shows a few until SHOW ALL, CLEAR ALL collects every crate ---- */
A.ok(/FOLD_KEY = 'starnet\.dlv\.review\.open', FEW = 3/.test(outbox), 'TO REVIEW folds (remembered) and shows the first 3 rows');
A.ok(/r\.hidden = !showAll && i >= FEW/.test(outbox), 'rows past the first few wait behind SHOW ALL');
A.ok(/RS\.resolveAll\(ids\)/.test(outbox) && /ArmConfirm\.wire\(clearAll,/.test(outbox), 'CLEAR ALL arms, then collects every crate in one go');
const rstore = read('frontend/app/returnstore.js');
A.ok(/function resolveAll\(runIds\)[\s\S]{0,300}save\(\);[\s\S]{0,200}OutboxView\.refresh\(\)/.test(rstore), 'resolveAll is one save + one refresh');
A.ok(/\bresolveAll\b/.test(rstore.slice(rstore.lastIndexOf('return {'))), 'ReturnStore exports resolveAll');

A.report('declutter-strips.test');
