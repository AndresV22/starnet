/* node test/create-access-answers.test.js — ONE ACCESS on the create screen (org pass 10-14, P08).

   The create screen used to ask "Working style: ASK FOR APPROVAL / FULL POWER", and ASK silently wrote LET IT WORK's
   fields, so what the Commander picked never matched a name they could find again. It now asks the dossier's and
   SETTINGS › PERMISSIONS' question — "How much can it do?" — with the SAME three answers, read from StationUI's one
   table. This test evaluates the real app.js helpers against that real table: each answer writes exactly its own
   approval + reach profile, a resumed agent is seeded from BOTH fields (a custom mix selects no card and is written
   back unchanged), FULL POWER keeps a two-press arm, and the access pick never touches the unattended level. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = read('frontend/app/app.js');
const ui = read('frontend/app/stationui.js');
const html = read('frontend/index.html');

const slice = (src, start, end) => {
  const i = src.indexOf(start); A.ok(i >= 0, 'found: ' + start.slice(0, 50));
  const j = src.indexOf(end, i + start.length); A.ok(j > i, 'found end: ' + end.slice(0, 50));
  return src.slice(i, j);
};

// the REAL posture table, evaluated out of stationui.js
const posturesSrc = slice(ui, '  const STATION_POSTURES = [', '\n  ];\n') + '\n  ];\n';
const POSTURES = new Function(posturesSrc + 'return STATION_POSTURES;')();
A.eq(POSTURES.map(P => P.id), ['careful', 'balanced', 'open'], 'the three answers');

// the REAL create helpers, evaluated out of app.js against that table
const faceSrc = slice(app, '  const POSTURE_FACE = Object.freeze({', '  // THE ACCESS PICKER');
const createSrc = slice(app, '  function createAccess() {', '  // the live nameplate under the agent');
const execSrc = slice(app, '  const EXECUTION_PROFILE_IDS = ', '\n  function approvalClause');
const make = (picked, mix) => new Function('StationUI', 'el', 'pickedPosture', 'pickedAccessMix',
  execSrc + '\n' + faceSrc + '\n' + createSrc + '\nreturn { createAccess, postureOfAgent, POSTURE_FACE };')(
  { accessPostures: () => POSTURES.map(P => Object.assign({}, P)) }, () => null, picked, mix);

A.eq(make('careful', null).createAccess(), { approvalMode: 'ask', executionProfile: 'station-gear' }, 'CHECK WITH ME writes ask + station-gear');
A.eq(make('balanced', null).createAccess(), { approvalMode: 'ask', executionProfile: 'trusted-project' }, 'LET IT WORK writes ask + trusted-project (today\'s default)');
A.eq(make('open', null).createAccess(), { approvalMode: 'full', executionProfile: 'this-computer' }, 'FULL POWER writes full + this-computer');
const custom = { approvalMode: 'full', executionProfile: 'trusted-project' };
A.eq(make(null, custom).createAccess(), custom, 'a resumed custom mix is written back unchanged, never relabelled');

const h = make('balanced', null);
A.eq(h.postureOfAgent({ approvalMode: 'ask', executionProfile: 'station-gear' }).id, 'careful', 'resume seeds CHECK WITH ME from both fields');
A.eq(h.postureOfAgent({ approvalMode: 'full', executionProfile: 'this-computer' }).id, 'open', 'resume seeds FULL POWER from both fields');
A.eq(h.postureOfAgent({ approvalMode: 'full', executionProfile: 'trusted-project' }), null, 'a /yolo agent (full + project folders) is a custom mix — no card claims it');
A.eq(h.postureOfAgent({ approvalMode: 'ask' }).id, 'careful', 'a legacy save with no profile resolves through the same station-gear default as the dossier');
A.eq(Object.keys(h.POSTURE_FACE), POSTURES.map(P => P.id), 'every answer has its card icon + nameplate words');

// wiring + copy
A.ok(/let pickedPosture = 'balanced';/.test(app) && /pickedPosture = 'balanced'; pickedAccessMix = null;/.test(app), 'LET IT WORK is preselected on a fresh create screen');
A.ok(/const heldPosture = postureOfAgent\(savedAgent\);/.test(app) && !/pickedApproval/.test(app), 'resume seeds from agentPosture rules, never approvalMode alone');
A.ok(/'custom — change it in the dossier'/.test(app), 'a custom mix reads custom on the nameplate');
A.ok(/ds\.textContent = P\.agentBlurb;/.test(app) && /c\.dataset\.tip = P\.who;/.test(app) && !/c\.title = /.test(slice(app, '  function buildApproval() {', '  // what the access pick WRITES')),
  'cards show the per-agent agentBlurb (not the station blurb that promises away drafts) and tip via data-tip');
A.ok(/nm\.textContent = 'SURE\? WHOLE COMPUTER';/.test(app) && /armTimer = setTimeout\(disarm, 4000\);/.test(app), 'FULL POWER keeps the two-press arm on the create screen');
const pick = slice(app, '  function buildApproval() {', '  // what the access pick WRITES');
A.ok(!/AutonomyStore|PermissionsStore|setLevel|applyPreset/.test(pick + createSrc), 'the access pick never writes ON ITS OWN (the awakening question does)');
A.ok(/<label>How much can it do\?/.test(html) && !/Working style/.test(html), 'the create screen asks "How much can it do?"');
A.ok(/<span id="np-mode">lets it work<\/span>/.test(html), 'the nameplate opens on the preselected answer');
A.ok(/\.ov-cards\.ov-approve \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/.test(read('frontend/css/app.css')) && /\.ov-card\.armed \{/.test(read('frontend/css/app.css')),
  'three cards side by side, with an armed warn face');

A.report('create-access-answers.test');
