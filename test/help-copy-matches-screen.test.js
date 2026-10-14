/* node test/help-copy-matches-screen.test.js — org pass P30 (2026-10-14): help, glossary and the agent manual name the
   screens that actually exist.

   Every assertion here pairs the copy with the real place it now names:
     - a model failure points at SETTINGS › AI & MODELS (where model keys live), never CONNECT (tools + channels);
     - the glossary's overseer is the first agent (it leads and delegates), never "the station itself"; a capability
       readout points at CONNECT › ABILITIES, never a SKILLS tab the dossier does not have;
     - the FIELD MANUAL's CONTROLS calls BUILD MODE key 9 by build.js's own label (CONVEYOR LINES), lists the APPS
       dock and the keys that work anywhere — each backed by a real handler in the app;
     - the manual and the HELP chapter send waiting items to NEEDS YOU at the top of SESSIONS first;
     - START FRESH is not listed under APP & BACKUP (it lives only on the boot recovery screen);
     - MY WORK's display words read TASKS / AGENT DOSSIER while the window keys stay `tasks` / `agents`;
     - BROWSER settings never promise "your own Chrome" (outputbrowser.js does not offer it);
     - a stop line never names an E-STOP the desk does not show.
   Source-level and pure: no DOM, no sidecar. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const onboarding = read('frontend/app/onboarding.js');
const firstvalue = read('frontend/app/firstvalue.js');
const tutorial = read('frontend/app/tutorial.js');
const station = read('frontend/app/stationui.js');
const build = read('frontend/app/build.js');
const manualSrc = read('sidecar/manual.js');

// ---- model failures name the model door ----
A.ok(!/check CONNECT/.test(onboarding) && /check SETTINGS › AI & MODELS before starting a task/.test(onboarding),
  'the awakening\'s model-failure line points at SETTINGS › AI & MODELS');
A.ok(!/Open CONNECT/.test(firstvalue) && /Open SETTINGS › AI & MODELS to configure/.test(firstvalue),
  'FIRST VALUE\'s model fallback points at SETTINGS › AI & MODELS');

// ---- the glossary ----
const gsrc = read('frontend/app/glossary.js');
const entry = key => { const m = gsrc.match(new RegExp('\\n\\s+' + key + ':\\s+\'([^\']*)\'')); return m ? m[1] : ''; };
A.ok(/your first agent; it leads and delegates/.test(entry('overseer')) && !/station itself/.test(entry('overseer')),
  'the overseer is the first agent that leads and delegates: ' + entry('overseer'));
A.ok(/CONNECT › ABILITIES/.test(entry('capability')) && !/SKILLS tab/.test(entry('capability')),
  'a capability readout points at ABILITIES, not a SKILLS tab: ' + entry('capability'));
A.ok(/MY WORK › TASKS/.test(entry('workstream')) && /SESSIONS/.test(entry('workstream')) && !/TASK BOARD/.test(entry('workstream')),
  'a workstream is a SESSION, and planned ones show on MY WORK › TASKS: ' + entry('workstream'));

// ---- CONTROLS ----
const key9 = (build.match(/id: 'line', key: '9', label: '([^']+)'/) || [])[1];
A.eq(key9, 'CONVEYOR LINES', 'build.js names key 9 CONVEYOR LINES');
A.ok(/\['9', 'Conveyor lines'\]/.test(tutorial) && !/\['9', 'Layouts'\]/.test(tutorial), 'CONTROLS names key 9 the way BUILD does');
A.ok(/<div><b>APPS<\/b>/.test(tutorial), 'CONTROLS lists the APPS dock');
for (const [k, proof, where] of [
  ['F11', /ev\.key === 'F11'/, 'frontend/app/fullscreen.js'],
  ['Ctrl + Shift + H', /e\.ctrlKey && e\.shiftKey[\s\S]{0,80}KeyH/, 'frontend/app/hudmode.js'],
  ['Ctrl + / Ctrl -', /ev\.key === '=' \|\| ev\.key === '\+'/, 'frontend/app/stationui.js'],
  ['Ctrl + 0', /ev\.key === '0' \? 0/, 'frontend/app/stationui.js'],
  ['Esc', /ev\.key === 'Escape'[\s\S]{0,600}requestCloseTerm\(key\)/, 'frontend/app/stationui.js'],
  ['Shift + F10', /ev\.shiftKey && ev\.key === 'F10'/, 'frontend/app/stationui.js'],
]) {
  A.ok(tutorial.includes("['" + k + "', "), 'CONTROLS lists the anywhere key ' + k);
  A.ok(proof.test(read(where)), 'the ' + k + ' key it lists has a real handler in ' + where);
}
A.ok(!/\['Alt \+ H'/.test(tutorial), 'CONTROLS never lists Alt+H: no handler for it exists in the app');

// ---- NEEDS YOU first ----
A.ok(/NEEDS YOU at the top of SESSIONS lists every one still waiting \(also NOTIFICATIONS › NEEDS YOU\)/.test(manualSrc),
  'the manual sends waiting approvals to NEEDS YOU at the top of SESSIONS first');
A.ok(/<b>NEEDS YOU<\/b> at the top of SESSIONS lists every job waiting on you \(also <b>NOTIFICATIONS › NEEDS YOU<\/b>\)/.test(tutorial),
  'the HELP chapter\'s WAITING entry names NEEDS YOU');

// ---- START FRESH is a boot-screen door only ----
const Places = require('../frontend/app/places.js');
const app = Places.PLACES.find(p => p.id === 'settings-app');
A.ok(app && !/START FRESH/.test(app.about) && /ERASE EVERYTHING/.test(app.about), 'APP & BACKUP lists ERASE EVERYTHING and not START FRESH: ' + (app && app.about));

// ---- MY WORK display words; keys unchanged ----
A.ok(/const WORK_LABELS = \{ tasks: 'TASKS', deliverables: 'DELIVERABLES', agents: 'AGENT DOSSIER', notifs: 'NOTIFICATIONS' \}/.test(station),
  'MY WORK\'s trail words read TASKS / AGENT DOSSIER, keyed by the unchanged window ids');
A.ok(/tasks:\s+\['TASKS',\s+buildTasks,/.test(station) && /agents:\s+\['AGENT DOSSIER',\s+buildAgents,/.test(station), 'window titles: TASKS and AGENT DOSSIER');
A.ok(/Manage planned tasks under MY WORK › TASKS/.test(station) && !/on the TASK BOARD and saved/.test(station), 'ABOUT names MY WORK › TASKS');

// ---- BROWSER promises only what it offers ----
A.ok(!/or in your own Chrome/.test(station), 'BROWSER settings never promise "your own Chrome"');
A.ok(/YOUR CHROME[^\n]*not offered/.test(read('frontend/app/outputbrowser.js')), 'outputbrowser.js still withholds YOUR CHROME');

// ---- stop lines ----
const Friendly = require('../frontend/app/friendlyerror.js');
for (const o of [undefined, { cancelSource: 'estop_by_run' }]) {
  const line = Friendly.stopLine('cancelled', o);
  A.ok(!/E-STOP/.test(line) && /Pause Automation in the StarNet tray menu/.test(line), 'stop line names the tray\'s Pause Automation: ' + line);
}

/* ---- org P05: "where do I paste my key?" has one answer per kind of key ----
   SETTINGS' tip and dock subtitle say what is actually in there; ABILITIES' own copy names its real tabs; AI & MODELS'
   API KEYS points service keys at CONNECT › ABILITIES › SAVED API CONNECTIONS through the places.js target. */
{
  const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const sys = rd('frontend/app/systems.js'), idx = rd('frontend/index.html'), con = rd('frontend/app/windows/connectors.js');
  const ui = rd('frontend/app/stationui.js'), places = rd('frontend/app/places.js');
  A.ok(/tip: 'AI models & keys, permissions, spending, look & sound'/.test(sys), 'SETTINGS dock tip names what Settings holds');
  A.ok(/<small>AI models &amp; keys, permissions, spending, look &amp; sound<\/small>/.test(idx), 'the SETTINGS dock subtitle says the same line');
  A.ok(!/Keys, models, voice, data|keys, models, voice, data/.test(sys + idx), 'the old "keys, models, voice, data" line is gone');
  A.ok(!/in <b>MCP CONNECTORS<\/b>|in <b>KEYS<\/b>|in TOOLSETS:|'CATALOG' : 'MCP CONNECTORS'/.test(con), 'ABILITIES copy names no retired tab (MCP CONNECTORS, KEYS, TOOLSETS)');
  A.ok(/in <b>CONNECTED SERVICES<\/b>, or paste a custom platform key in <b>SAVED API CONNECTIONS<\/b>/.test(con), 'the catalog footer names CONNECTED SERVICES and SAVED API CONNECTIONS');
  A.ok(/\{ id: 'keys', label: 'SAVED API CONNECTIONS'/.test(con) && /\{ id: 'mcp', label: 'CONNECTED SERVICES'/.test(con) && /\{ id: 'toolsets', label: 'BUILT-IN ABILITIES'/.test(con), 'the names it uses are the real tab labels');
  A.ok(/Keys for Gmail, Notion and other services live in CONNECT › ABILITIES\. <button type="button" class="bb sm" data-act="to-service-keys">▸ SAVED API CONNECTIONS<\/button>/.test(ui), 'API KEYS points service keys at SAVED API CONNECTIONS with a glass key');
  A.ok(/toServiceKeys\.addEventListener\('click', \(\) => \{ sfx\('click'\); openTerm\('connectors', 'keys'\); \}\)/.test(ui), 'the key opens the connectors keys section');
  A.ok(/P\('api-connections', [^\n]*\{ term: 'connectors', section: 'keys' \}\)/.test(places), 'which is the places.js api-connections target');
}

A.report('help-copy-matches-screen.test');
