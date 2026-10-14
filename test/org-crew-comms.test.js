/* test/org-crew-comms.test.js — ORG PASS 10-14 (crew + COMMS lines). Source locks for the copy and wiring each line
   changed, so a later edit can't quietly undo what the user now reads:
     P23 — PURPOSE and the house-rules card say they are THIS agent's only; standing orders say every agent follows them.
     P20 — the crew row's DOSSIER key is always shown at every crew size; the manual stops claiming a row click focuses. */
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

/* ---------- P20: the DOSSIER key on a crew row is always there ---------- */
const ICSS = read('frontend/css/interface.css'), CG = read('frontend/css/crew-glass.css');
const keyRule = (ICSS.match(/#crew \.crew-dossier \{[^}]*\}/) || [''])[0];
A.ok(keyRule && !/opacity:\s*0/.test(keyRule), 'P20: the DOSSIER key is visible without hover (no opacity:0 base)');
A.ok(!/:is\(:hover,:focus-within,\.filtering\) \.crew-dossier \{ opacity: 1; \}/.test(ICSS), 'P20: no hover-only reveal rule is left');
A.ok(/font: 14px\/1 'VT323'/.test(keyRule), 'P20: the key wears key metrics (14px), not the 12px faint chip');
A.ok(/#crew \.crew-row:has\(\.crew-dossier\) \.crew-step \{ padding-right: 66px; \}/.test(CG) && !/:is\(:hover, :focus-within, \.filtering\):has\(\.crew-dossier\) \.crew-step/.test(CG),
  'P20: EVERY row keeps its step text clear of the key (not just a hovered/filtering row)');
const MAN = require('../sidecar/manual.js').starnetManual();
A.ok(!/focuses it/.test(MAN) && !/click the row to focus/.test(MAN) && !/intended agent is focused/.test(MAN), 'P20: the manual never says a crew-row click focuses an agent');
A.ok(/None of these changes who COMMS talks to/.test(MAN) && /agent ON THE LINE/.test(MAN), 'P20: the manual says messages go to the agent ON THE LINE and a row click does not change that');

A.report();
