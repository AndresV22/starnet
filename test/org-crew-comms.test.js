/* test/org-crew-comms.test.js — ORG PASS 10-14 (crew + COMMS lines). Source locks for the copy and wiring each line
   changed, so a later edit can't quietly undo what the user now reads:
     P23 — PURPOSE and the house-rules card say they are THIS agent's only; standing orders say every agent follows them.
     P20 — the crew row's DOSSIER key is always shown at every crew size; the manual stops claiming a row click focuses.
     P21 — the AGENT DOSSIER says where each per-agent setting lives, and station-wide switches say they are for every agent. */
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

/* ---------- P21: the dossier says where each per-agent setting lives ---------- */
const CONN = read('frontend/app/windows/connectors.js');
A.ok(!SUI.includes('title="change this in CONFIG"') && /data-goconfig="' \+ r\.go \+ '" data-tip="' \+ esc\(r\.tip\) \+ '"/.test(SUI), 'P21: each BRIEF setup row carries its own data-tip (no native title)');
A.ok(SUI.includes("tip: 'opens AUTOMATE › AWAY WORK'"), 'P21: AWAY WORK says it opens AUTOMATE › AWAY WORK');
A.ok(/lbl: 'VOICE',[^\n]*go: 'ag-voice'/.test(SUI) && /lbl: 'SKILLS',[^\n]*go: 'ag-skills'/.test(SUI), 'P21: the BRIEF strip has VOICE and SKILLS rows');
A.ok(/if \(anchor === 'ag-voice'\) \{ sfx\('click'\); openVoiceFor\(a\.id\); return; \}/.test(SUI) && /openTerm\('settings', 'appearance'\);/.test(SUI) && /pick\.value = agentId; if \(typeof pick\.onchange === 'function'\) pick\.onchange\(\);/.test(SUI),
  'P21: VOICE opens LOOK & SOUND with VOICE FOR preselected on this agent (and refreshes its voice list)');
A.ok(/if \(anchor === 'ag-skills'\) \{ sfx\('click'\); skillsPick = a\.id; openTerm\('connectors', 'agent'\); return; \}/.test(SUI), 'P21: SKILLS opens ABILITIES › AGENT SKILLS for this agent');
A.ok(SUI.includes('AWAY WORK ▸</button>') && !SUI.includes('WHILE I’M AWAY → AUTOMATE'), 'P21: CONFIG\'s away door reads AWAY WORK ▸');
A.ok(SUI.includes('REFLECTION (all agents)') && !SUI.includes('> REFLECTION ON <'), 'P21: the MEMORY reflection switch says it is station-wide');
A.ok(/function workshopCard\(a\)/.test(SUI) && /H\.workshopCard\(/.test(read('frontend/app/windows/automation.js')), 'P21: workshopCard stays — AUTOMATE › AWAY WORK renders with it');
A.ok(/'Reusable procedures ' \+ n \+ ' created or learned\./.test(SUI) && SUI.includes('id="sk-agent-pick" class="ab-agent-pick"'), 'P21: AGENT SKILLS names the agent shown and has an agent picker');
A.ok(/const a = \(skillsPick && present\.find\(x => x && x\.id === skillsPick\)\) \|\| present\[sel\]; const shownId/.test(SUI), 'P21: the live skills refresh follows the picked agent');
A.ok(SUI.includes("return (AP && AP.approval === 'ask') ? AP.label : 'custom'; };") && SUI.includes("authority.unrestricted ? 'FULL POWER · no prompts' : askingPosture() + ' · standing grants apply'"), 'P21: the ACCESS summary speaks the posture words, gated on the live authority');
A.ok(CONN.includes('id="ts-agent" class="ab-agent-pick"') && /select\.ab-agent-pick \{[^}]*appearance: none/.test(read('frontend/css/interface.css')), 'P21: the ABILITIES agent pickers are glass fields with a drawn chevron, not key-input/OS paint');
A.ok(/each switch turns a built-in ability on or off for every agent; CHECK WITH ME and LET IT WORK obey the switches, FULL POWER overrides them/i.test(CONN), 'P21: BUILT-IN ABILITIES says its switches are for every agent, in ONE ACCESS words');
A.ok(CONN.includes("data-tip=\"Turns ' + esc(t.label) + ' on or off for every agent\"") && CONN.includes("notify((tsLabels[id] || id) + (enabled ? ' on' : ' off') + ' for every agent'"),'P21: the switch tip and toast name the ability and say every agent');
A.ok(/toolsetDisabled/.test(read('sidecar/index.js')), 'P21: "for every agent" stays true — the toggle writes the station-wide toolsetDisabled map');

A.report();
