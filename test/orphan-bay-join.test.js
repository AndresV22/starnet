/* test/orphan-bay-join.test.js — A BAY ON NO LINE SAYS HOW TO PUT IT ON ONE (2026-10-09 P0).

   The floor called a lone BAY "NOT ON THE LINE": what was wrong, never what to do, and the hover card said nothing more. Its
   Workflow panel offered only MAKE IT A LINE (a line of its own), never a place on a line that already stands. Locked here:
     THE LABEL      — ORPHAN_BAY reads "NOT ON A LINE — BELT INTO IT" in REFIT and in the live world (parity kept), and its
                      hover card says the whole fix: BELT, the machine that should hand it work, then this BAY.
     JOIN A LINE    — the lone BAY's panel offers JOIN A LINE beside MAKE IT A LINE: it arms the BELT tool with this BAY already
                      chosen as the DESTINATION (connectTo), so the next machine clicked is the one that hands it work.
     WHAT IT DOES   — that click is station.connectBelt(clicked, bay): the BAY joins the clicked machine's line and the finding
                      clears; a refused machine (an OUTBOX) leaves the BAY armed for another try. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const P = require('../frontend/app/pipeline.js');
const WM = require('../frontend/app/worldmodel.js');
const LE = require('../frontend/app/lineedit.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', f), 'utf8');
const build = read('build.js'), world = read('world.js'), panel = read('workflowpanel.js');

/* ---------- THE LABEL ---------- */
A.ok(/ORPHAN_BAY: 'NOT ON A LINE — BELT INTO IT'/.test(build) && /ORPHAN_BAY: 'NOT ON A LINE — BELT INTO IT'/.test(world), 'ORPHAN_BAY names its fix on the floor, in REFIT and in the live world');
A.ok(!/ORPHAN_BAY: 'NOT ON THE LINE'/.test(build + world), '…the old label that named no fix is gone');
const why = /\n    ORPHAN_BAY: '([^']*)',\n/.exec(build.slice(build.indexOf('const VAL_WHY = {')));
A.ok(!!why && /isn’t on any line, so it only works when you message it directly/.test(why[1]) && /pick BELT, click the machine that should hand it work, then this BAY/.test(why[1]), 'its hover card says the whole fix: ' + (why && why[1]));

/* ---------- JOIN A LINE: the panel offers it, the host arms BELT with the BAY as the destination ---------- */
const shape = panel.slice(panel.indexOf('  function shapeHTML(p) {'), panel.indexOf('  /* ---------- the footer'));
A.ok(/editBtn\('wrapLine'/.test(shape) && /id="wf-join"[^>]*>⊕ JOIN A LINE</.test(shape), 'a lone BAY\'s panel offers JOIN A LINE beside MAKE IT A LINE');
A.ok(/const join = \$\('#wf-join'\);\s*if \(join\) join\.onclick = \(\) => \{\s*const ok = H\.joinLine\(p\.id\);/.test(panel), '…and its click asks the host to arm BELT for THIS bay');
A.ok(/note\('BELT is armed with this BAY as the destination: click the machine on the floor that should hand it work/.test(panel), '…saying in the panel what to click next');
A.ok(/joinLine: id => armJoin\(id\),/.test(build), 'the Build host offers joinLine');
const arm = build.slice(build.indexOf('  function armJoin(bayId) {'), build.indexOf('  function openWorkflowPanel('));
A.ok(/selectTool\('belt', \{ keepKit: true, silent: true \}\);\s*connectTo = bayId;/.test(arm), 'armJoin arms BELT (the Build Library stays out of the panel\'s way) with the BAY as the destination');
A.ok(/if \(\(id !== 'select' \|\| !wasSelect\) && !\(o && o\.keepKit\)\) toggleKit\(false\);/.test(build), 'selectTool honours keepKit');
const down = build.slice(build.indexOf('    if (tool === \'belt\') {'), build.indexOf('    } else if (tool === \'prop\') {'));
A.ok(/if \(connectTo\) \{\s*if \(pid === connectTo\) \{ connectTo = null; hideTip\(\); return; \}\s*const res = station\.connectBelt\(pid, connectTo\);/.test(down), 'with a destination armed, the click on a machine belts THAT machine into the BAY');
A.ok(/if \(res && res\.ok\) \{\s*connectTo = null;/.test(down) && /else \{ sfx\('bad'\); flashTip\(ev, \(res && res\.msg\) \|\| 'no clear route between those machines', false\); \}/.test(down), '…a refusal keeps the BAY armed (another machine can be tried) and says why');
A.ok(/if \(connectFrom \|\| connectTo\) \{ connectFrom = null; connectTo = null; flashTip\(ev, 'connect cancelled', false\); return; \}/.test(down), 'empty floor cancels it');
A.ok(/tool = id; drag = null; connectFrom = null; connectTo = null;/.test(build) && /if \(drag \|\| connectFrom \|\| connectTo \|\| dupe\) \{ selectTool\('select'\); return; \}/.test(build), 'another tool and ESC drop it');
A.ok(/const role = isFrom \? \(connectTo \? 'TO ▸ NOW CLICK THE MACHINE THAT HANDS IT WORK' : 'FROM ▸ NOW CLICK A DESTINATION'\)/.test(build) && /beltPreview\(hoverPropId, connectTo\)/.test(build), 'the floor captions the armed BAY and previews each lane INTO it before the click');

/* ---------- WHAT THE CLICK DOES: the BAY joins that line and the finding clears ---------- */
{
  const d = WM.starterDoc();
  for (const id in d.rooms) for (const r of d.rooms[id].rects) { r.x2 = 40; r.y2 = 30; }
  const st = WM.create(d);
  const ln = LE.placeBlueprint(st, 'research_line', { x: 8, y: 4 });
  A.ok(ln.ok, 'a research line stands on the floor');
  const lone = st.addProp({ t: 'bay', x: 10, y: 16, w: 2, h: 2 });
  for (const p of st.props()) if (p.t === 'bay' && !p.agentId) st.assignPropAgent(p.id, 'ag_' + p.id);
  let plan = P.compileRoutingPlan(st.projectGeometry());
  A.ok(plan.errors.some(e => e.code === 'ORPHAN_BAY' && e.propId === lone.id), 'a crewed BAY on no line beside a line is ORPHAN_BAY');
  const bays = ln.ids.filter(id => st.propById(id).t === 'bay'), outbox = ln.ids.find(id => st.propById(id).t === 'outbox');
  const no = st.connectBelt(outbox, lone.id);
  A.ok(no.ok === false && no.error === 'FROM_OUTBOX', 'JOIN armed, a click on the OUTBOX is refused (an OUTBOX hands nothing on)');
  const r = st.connectBelt(bays[bays.length - 1], lone.id);
  A.ok(r.ok, 'JOIN armed, a click on the line\'s last BAY belts it into the lone BAY — ' + JSON.stringify(r));
  plan = P.compileRoutingPlan(st.projectGeometry());
  A.ok(!plan.errors.some(e => e.code === 'ORPHAN_BAY'), '…and it is on that line now: NOT ON A LINE clears');
  A.eq(plan.lineOfProp[lone.id], plan.lineOfProp[bays[0]], '…the same line as the steps before it');
  A.ok((plan.dockChains[bays[bays.length - 1]].next || []).indexOf(lone.id) >= 0, '…and the last step hands it work');
}

A.report('orphan-bay-join.test');
