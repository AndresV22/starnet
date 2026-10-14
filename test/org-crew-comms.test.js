/* test/org-crew-comms.test.js — ORG PASS 10-14 (crew + COMMS lines). Source locks for the copy and wiring each line
   changed, so a later edit can't quietly undo what the user now reads:
     P23 — PURPOSE and the house-rules card say they are THIS agent's only; standing orders say every agent follows them. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SUI = read('frontend/app/stationui.js');

/* ---------- P23: say where each instruction applies ---------- */
A.ok(/desc: n => 'What your agent is for\.[^']*Only ' \+ n \+ ' · a workflow step’s DOES can add to it\.'/.test(SUI), 'P23: PURPOSE names the one agent it shapes and that a DOES can add to it');
A.ok(/desc: n => 'Only ' \+ n \+ ' follows these house rules[^']*rules for every agent live in YOU › PREFERENCES\.'/.test(SUI), 'P23: the house-rules card says only this agent follows it and where every-agent rules live');
A.ok(SUI.includes("typeof f.desc === 'function' ? f.desc(esc((a && a.name) || 'this agent'))"), 'P23: fileCard renders the reach with the agent name escaped');
A.ok(SUI.includes('your standing orders (every agent follows these)'), 'P23: YOU › PREFERENCES says every agent follows the standing orders');
A.ok(read('frontend/app/app.js').includes('DossierStore.composeBlock()') && read('sidecar/index.js').includes('withDossier(CRON_PERSONA'), 'P23: the "every agent" claim stays true — the dossier rides every browser prompt and cron runs');

A.report();
