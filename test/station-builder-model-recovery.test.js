'use strict';
/* test/station-builder-model-recovery.test.js — A REAL MODEL BUILDS A LINE IN ONE TRY (rc walk 10-14, A3).

   Asked in a group chat "set up a simple conveyor line for this workflow: draft the post, then review it", the lead
   (Haiku 4.5) sent station.plan TWELVE times and every one was refused: the first picked the right line (revision_loop,
   Writer → Reviewer) but named its steps "Draft" and "Review", and the refusal "This line has steps 1 to 2: 1 Writer,
   2 Reviewer." never said a step is a NUMBER; then it laid the line by hand and every belt it drew from one machine
   onto the next was "a prop is in the way", every piece it set on a plant "overlaps a prop", with no word of WHICH
   prop. It gave up and created a loop nobody asked for: 20 turns, $0.28.

   The walker's twelve requests are replayed here, verbatim, against the walker's own HOME room:
     · a step named for its work ("Draft", "Final review", "Tester") is read for the role it means; steps given in
       order with no number staff the line in that order; the plan says how it matched them;
     · every refusal says what was wrong, the exact shape that is accepted with a tiny example on THIS line's own
       steps, and which lines (or which shape) fit what was asked;
     · a refit belt drawn from one machine onto another connects them (StarNet lays the belt), a machine set on a
       taken tile stands on the nearest free one (the card says where, and why), and what still cannot be placed is
       refused by NAME and tile;
     · station.build's result tells the model it is DONE, so it reports and stops. */
const A = require('./_assert.js');
const M = require('../frontend/app/worldmodel.js'), P = require('../frontend/app/pipeline.js'), W = require('../frontend/app/workflowline.js');
const SB = require('../frontend/app/stationbuilder.js'), T = require('../frontend/app/stationtemplates.js'), Sprites = require('../frontend/app/propsprites.js');
const { makeStationTools } = require('../sidecar/tools/builtin/station.js');

M.setPropRules(t => { const s = Sprites.spec(t); return s ? { mount: s.mount || null, stack: !!s.stack, surface: !!s.surface, flat: !!s.flat } : null; });
const crew = [{ id: 'agent', name: 'NOVA' }, { id: 'copywriter', name: 'COPY' }, { id: 'strategist', name: 'STRATEGY' }];
const env = { WorldModel: M, Pipeline: P, WorkflowLine: W, crew, heroId: 'agent', StationTemplates: T, PropSprites: Sprites,
  RoomStyles: require('../frontend/app/roomstyles.js'), LineLayout: require('../frontend/app/linelayout.js'), LineEdit: require('../frontend/app/lineedit.js'),
  EquipmentHelp: require('../frontend/app/equipmenthelp.js') };

/* the walker's station: the starter HOME room (18 × 11) with three desks (NOVA, COPY, STRATEGY), as station.map showed it */
function walkerStation() {
  const st = M.create(M.starterDoc());
  for (const id of ['agent', 'copywriter', 'strategist']) A.ok(st.ensureWorkstation(id).ok, 'fixture: ' + id + ' has a desk');
  return st;
}
const snap = st => JSON.stringify(st.serialize());
const COPY_DRAFT = 'Write a sharp 2-sentence launch post for StarNet 0.13.5 based on the options discussed.';
const STRAT_REVIEW = 'Review the draft post. Approve if it is ready to ship, or send it back with specific cuts.';

/* ---- 1. the walker's FIRST plan: the right line, its steps named for their work — it plans, staffed in order ---- */
{
  const st = walkerStation(), before = snap(st);
  const r = SB.plan(st.serialize(), { line: 'revision_loop', name: 'Launch Post Workflow', steps: [
    { step: 'Draft', agent: 'COPY', instructions: COPY_DRAFT }, { step: 'Review', agent: 'STRATEGY', instructions: STRAT_REVIEW }] }, env);
  A.ok(r.ok, 'steps named "Draft" and "Review" plan on the Writer → Reviewer line (was: "This line has steps 1 to 2"): ' + (r.error || ''));
  if (r.ok) {
    A.eq(r.plan.steps.map(s => s.role + ':' + s.agent), ['Writer:COPY', 'Reviewer:STRATEGY'], 'COPY writes, STRATEGY reviews');
    A.eq(r.plan.steps.map(s => s.instructions), [COPY_DRAFT, STRAT_REVIEW], 'each step keeps the instructions the model wrote for it');
    A.ok(r.plan.ready, 'staffed, the line will be ready to run');
    A.ok(r.plan.notes.some(n => /"Draft" → step 1 \(Writer\)/.test(n) && /"Review" → step 2 \(Reviewer\)/.test(n)), 'the plan says how it read the step names: ' + JSON.stringify(r.plan.notes));
    A.ok(SB.apply(st, r.plan, env).ok, 'and it builds');
    A.ok(st.undo().ok); A.eq(snap(st), before, 'one undo takes it back');
  }
  // the same steps in order with no step at all, and a step named by its ROLE word, plan the same way
  const bare = SB.plan(st.serialize(), { line: 'revision_loop', steps: [{ agent: 'COPY' }, { agent: 'STRATEGY' }] }, env);
  A.ok(bare.ok && bare.plan.steps.map(s => s.agent).join() === 'COPY,STRATEGY', 'two steps listed in order with no number staff the two steps in order: ' + (bare.error || ''));
  const word = SB.plan(st.serialize(), { line: 'revision_loop', steps: [{ step: 'Final review', agent: 'STRATEGY' }] }, env);
  A.ok(word.ok && word.plan.steps[1].agent === 'STRATEGY' && word.plan.steps[0].agent == null, 'one step named "Final review" staffs the Reviewer, whatever its place: ' + (word.error || ''));
  const role = SB.plan(st.serialize(), { line: 'revision_loop', steps: [{ step: 'Reviewer', agent: 'STRATEGY' }, { step: 'Writer', agent: 'COPY' }] }, env);
  A.ok(role.ok && role.plan.steps.map(s => s.agent).join() === 'COPY,STRATEGY', 'a step named by its role ("Writer") finds that step in any order: ' + (role.error || ''));
  A.ok(SB.plan(st.serialize(), { line: 'revision_loop', steps: [{ step: '2', agent: 'STRATEGY' }] }, env).ok, 'a number sent as text still counts');
}

/* ---- 2. every refusal is actionable in one read: what was wrong, the accepted shape with an example, what fits ---- */
{
  const st = walkerStation(), before = snap(st);
  const plan = req => SB.plan(st.serialize(), req, env);
  // the walker's second plan: a ONE-step line given two steps
  const two = plan({ line: 'ship_out', where: 'HOME', name: 'Post Draft & Review', steps: [{ step: 'Draft', agent: 'COPY', instructions: 'x' }, { step: 'Review', agent: 'STRATEGY', instructions: 'y' }] });
  A.ok(!two.ok, 'two steps on a one-step line are refused');
  A.ok(/ship_out has 1 step \(1 Shipper\), and the request gives 2/.test(two.error), 'it says the count is what is wrong: ' + two.error);
  A.ok(/revision_loop \(Writer → Reviewer\)/.test(two.error) && /"shape": \["WRITER", "REVIEWER"\]/.test(two.error), 'and names the line that has exactly those steps, and the shape that lays them: ' + two.error);
  A.ok(/"step": 1, "agent": "COPY"/.test(two.error), 'with the accepted step shape as a tiny example: ' + two.error);
  // a step NUMBER out of range
  const nine = plan({ line: 'build_test', steps: [{ step: 9 }] });
  A.ok(!nine.ok && /This line has steps 1 to 2: 1 Engineer, 2 Tester/.test(nine.error) && /step is the step's NUMBER in run order/.test(nine.error) && /\{ "step": 1, "agent": "NOVA", "instructions": "…" \}/.test(nine.error), 'a number out of range says what step is, with an example: ' + nine.error);
  // the walker's tenth: steps named for work this line does not do
  const ten = plan({ line: 'research_line', steps: [{ step: 'Draft Post', agent: 'COPY' }, { step: 'Final Review', agent: 'STRATEGY' }] });
  A.ok(!ten.ok && /"Final Review" reads as a Reviewer step, and research_line has none \(its steps: 1 Researcher, 2 Writer\)/.test(ten.error), 'a step named for a role the line lacks is refused, never staffed on the wrong role: ' + (ten.error || 'PLANNED'));
  A.ok(/revision_loop \(Writer → Reviewer\)/.test(ten.error), '…and it names the line that has it: ' + ten.error);
  // the walker's eleventh: three named steps on a Writer → Reviewer → Fixer line, the third named for shipping
  const eleven = plan({ line: 'fire_escape', steps: [{ step: 'Draft', agent: 'COPY' }, { step: 'Review', agent: 'STRATEGY' }, { step: 'Ship', agent: 'agent' }] });
  A.ok(!eleven.ok && /"Ship" reads as a Shipper step, and fire_escape has none/.test(eleven.error) && /crucible \(Writer → Reviewer → Shipper → Reviewer\)|"shape": \["WRITER", "REVIEWER", "SHIPPER"\]/.test(eleven.error), 'a third step named for shipping says which line or shape has a Shipper: ' + (eleven.error || 'PLANNED'));
  // the old refusals keep their words (and now say how to fix them)
  const pilot = plan({ line: 'build_test', steps: [{ role: 'PILOT' }] });
  A.ok(!pilot.ok && /This line has no PILOT step\. Its steps are: 1 Engineer, 2 Tester/.test(pilot.error) && /"step": 1/.test(pilot.error), 'an unknown role: ' + pilot.error);
  const none = plan({ line: 'build_test', steps: [{ instructions: 'hi' }] });
  A.ok(!none.ok && /Each step needs "step" \(a number\) or "role"/.test(none.error) && /"step": 1/.test(none.error), 'a step with neither: ' + none.error);
  A.eq(snap(st), before, 'no refusal changed anything');
  // the suggested shape really plans
  const shaped = plan({ shape: ['WRITER', 'REVIEWER'], steps: [{ step: 1, agent: 'COPY' }, { step: 2, agent: 'STRATEGY' }] });
  A.ok(shaped.ok, 'the shape a refusal suggests plans: ' + (shaped.error || ''));
  /* the live re-run's (after the step fix) two refusals: a line name that is no line beside a shape, and crew in the shape */
  const DRAFT = 'Draft the launch post based on the refined version agreed in chat. Keep it exactly 2 sentences.', REVIEW = 'Review the draft post for clarity, impact and positioning.';
  const crewShape = plan({ line: 'review_loop', shape: [{ role: 'copywriter' }, { role: 'strategist' }], steps: [{ step: 1, agent: 'COPY', instructions: DRAFT }, { step: 2, agent: 'STRATEGY', instructions: REVIEW }] });
  A.ok(!crewShape.ok && /^"copywriter" is not a step: COPY is a crew member\. A shape lists ROLES in run order/.test(crewShape.error), 'crew named in a shape is refused as crew: ' + (crewShape.error || 'PLANNED'));
  A.ok(/For this request: \{ "shape": \["WRITER", "REVIEWER"\], "steps": \[\{ "step": 1, "agent": "COPY" \}, \{ "step": 2, "agent": "STRATEGY" \}\] \}/.test(crewShape.error), '…with the shape its own steps describe, ready to send ("Review the draft" reads as Reviewer): ' + crewShape.error);
  const names = plan({ shape: ['COPY', 'STRATEGY'], steps: [{ step: 1, agent: 'COPY', instructions: DRAFT }, { step: 2, agent: 'STRATEGY', instructions: REVIEW }] });
  A.ok(!names.ok && /^"COPY" is not a step: COPY is a crew member/.test(names.error) && /"shape": \["WRITER", "REVIEWER"\]/.test(names.error), 'crew names as stages, the same: ' + (names.error || 'PLANNED'));
  const noLine = plan({ line: 'review_loop', shape: ['WRITER', 'REVIEWER'], steps: [{ step: 1, agent: 'COPY', instructions: DRAFT }, { step: 2, agent: 'STRATEGY', instructions: REVIEW }] });
  A.ok(noLine.ok && noLine.plan.notes.some(n => /there is no line called "review_loop", so the shape was laid/.test(n)), 'a line name that is no line beside a shape: the shape is laid, and the notes say so: ' + (noLine.error || JSON.stringify(noLine.plan.notes)));
  if (noLine.ok) A.ok(/Writer \(COPY\) → Reviewer \(STRATEGY\) → Outbox/.test(noLine.plan.summary), 'COPY writes, STRATEGY reviews: ' + noLine.plan.summary);
  const roleObj = plan({ shape: [{ role: 'WRITER' }, { role: 'REVIEWER' }] });
  A.ok(roleObj.ok, 'a stage { "role": "WRITER" } is the role: ' + (roleObj.error || ''));
  const both = plan({ line: 'revision_loop', shape: ['WRITER'] });
  A.ok(!both.ok && /not both: \{ "line": "revision_loop", "steps": \[…\] \} builds that ready-made line \(Writer → Reviewer\); \{ "shape": \["WRITER", "REVIEWER"\], "steps": \[…\] \} lays your own/.test(both.error), 'a real line beside a shape writes both forms out: ' + (both.error || 'PLANNED'));
  A.eq(snap(st), before, 'planning changed nothing');
}

/* ---- 3. the walker's hand-laid refits: belts drawn machine onto machine connect, a taken tile moves to a free one ---- */
{
  const ops = (x0, y0, dx, dy) => {
    const at = k => [x0 + dx * k, y0 + dy * k];
    return [
      { op: 'place', t: 'intake', x: at(0)[0], y: at(0)[1], as: 'draft_inbox' }, { op: 'place', t: 'bay', x: at(1)[0], y: at(1)[1], as: 'draft_bay' },
      { op: 'place', t: 'bay', x: at(2)[0], y: at(2)[1], as: 'review_bay' }, { op: 'place', t: 'outbox', x: at(3)[0], y: at(3)[1], as: 'final_outbox' },
      // the walker's belts: from a tile of one machine onto a tile of the next
      { op: 'belt', from: [at(0)[0] + (dx ? 1 : 0), at(0)[1] + (dy ? 1 : 0)], to: at(1) }, { op: 'belt', from: [at(1)[0] + (dx ? 1 : 0), at(1)[1] + (dy ? 1 : 0)], to: at(2) },
      { op: 'belt', from: [at(2)[0] + (dx ? 1 : 0), at(2)[1] + (dy ? 1 : 0)], to: at(3) },
      { op: 'role', prop: 'draft_bay', role: 'WRITER' }, { op: 'agent', prop: 'draft_bay', agent: 'COPY' },
      { op: 'role', prop: 'review_bay', role: 'REVIEWER' }, { op: 'agent', prop: 'review_bay', agent: 'STRATEGY' }];
  };
  const st = walkerStation(), before = snap(st);
  // the walker's fourth plan: a column at x 12, each machine touching the next
  const col = SB.planEdit(st.serialize(), { refit: ops(12, 3, 0, 2) }, env);
  A.ok(col.ok, 'a belt drawn from one machine onto the next is a connect (was: "Edit 5 (belt): a prop is in the way"): ' + (col.error || ''));
  if (col.ok) {
    A.ok(/5\. the INBOX at \(12, 3\) belted to the bay at \(12, 5\) \(a belt drawn from one machine onto another connects them\)/i.test(col.plan.summary), 'the card says the belt became a connect: ' + col.plan.summary.slice(0, 600));
    A.ok(SB.apply(st, col.plan, env).ok, 'and it builds');
    const g = st.projectGeometry(), comp = P.lineComponents(g).find(c => c.bays.length === 2);
    A.ok(comp && P.compileRoutingPlan(g).errors.filter(e => !e.warn).length === 0, 'one line of two staffed bays, no routing error');
    A.ok(st.undo().ok); A.eq(snap(st), before, 'one undo takes it back');
  }
  // the walker's third plan: a row along the top wall, the INBOX on the plant in the corner
  const row = SB.planEdit(st.serialize(), { refit: ops(0, 0, 2, 0) }, env);
  if (row.ok) A.ok(/moved from \(0, 0\)/.test(row.plan.summary), 'a machine set on a taken tile stands on the nearest free one, and the card says so: ' + row.plan.summary.slice(0, 500));
  else A.ok(/the (plant|intel cab|workbench|desk) at \(\d+, \d+\)/.test(row.error), 'what cannot be placed is named by piece and tile: ' + row.error);
  // a machine that would overlap a piece moves to the nearest free tile, and the card names what stood there
  const moved = SB.planEdit(st.serialize(), { refit: [{ op: 'place', t: 'bay', x: 14, y: 8, as: 'b' }] }, env);
  A.ok(moved.ok && /a bay at \(\d+, \d+\) in HOME \(moved from \(14, 8\): the studio at \(14, 8\) stands there\)/.test(moved.plan.summary), 'a bay on the studio moves next to it: ' + (moved.error || moved.plan.summary));
  // a later edit naming the tile the moved piece was ASKED for still means that piece, never what stood there
  const byTile = SB.planEdit(st.serialize(), { refit: [{ op: 'place', t: 'bay', x: 14, y: 8 }, { op: 'role', prop: [14, 8], role: 'REVIEWER' }, { op: 'agent', prop: [15, 9], agent: 'STRATEGY' }] }, env);
  A.ok(byTile.ok && /3\. the bay at \(\d+, \d+\) is STRATEGY's/.test(byTile.plan.summary) && /2\. the bay at \(\d+, \d+\) is Reviewer/.test(byTile.plan.summary), 'the asked tile still names the moved bay: ' + (byTile.error || byTile.plan.summary));
  // a belt run across a piece that is no machine is refused by name, with the way to join two machines
  const across = SB.planEdit(st.serialize(), { refit: [{ op: 'belt', from: [13, 9], to: [16, 9] }] }, env);
  A.ok(!across.ok && /Edit 1 \(belt\): the tile \(14, 9\) is under the studio at \(14, 8\)/.test(across.error) && /\{ op: "connect", from, to \}/.test(across.error), 'a belt across the studio names it and says how to connect machines: ' + (across.error || 'PLANNED'));
  // a chair AIMED at something keeps its exact tile: an overlap is refused by name, never moved off its aim
  const chair = SB.planEdit(st.serialize(), { refit: [{ op: 'place', t: 'chair', x: 14, y: 8, toward: [10, 8] }] }, env);
  A.ok(!chair.ok && /overlaps the studio at \(14, 8\)/.test(chair.error) && /nearest free spot/.test(chair.error), 'an aimed piece on a taken tile is refused by name, with a free spot: ' + (chair.error || 'PLANNED'));
  A.eq(snap(st), before, 'planning changed nothing');
}

/* ---- 4. station.build tells the model it is DONE (and what is still to do, when anything is) ---- */
(async () => {
  let reply = null;
  const bridge = { request: async verb => verb === 'station.build' ? { ok: true, result: reply } : { ok: false, error: 'unknown verb' } };
  const tools = makeStationTools({ station: bridge, now: () => 1000, planMemo: new Map(), lineMenu: () => [], styleMenu: () => [], roomMenu: () => [], kitMenu: () => [], presetMenu: () => [] });
  reply = { built: true, summary: 'Draft + review ("LAUNCH POST") in a new room east of HOME: Writer (COPY) → Reviewer (STRATEGY) → Outbox.', line: { name: 'Draft + review' }, ready: true, blocking: [] };
  const done = JSON.parse((await tools.buildTool.run({ planId: 'p1' }, {})).content);
  A.ok(/^DONE: it is built and ready to run\. Tell the Commander what was built in a sentence or two, and stop: there is nothing left to build or check for this\./.test(done.next || ''), 'a ready build says DONE and to stop: ' + done.next);
  reply = { built: true, summary: 'Build + test …', line: { name: 'Build + test' }, ready: false, blocking: ['BAY 2 (TESTER) needs an agent'] };
  const todo = JSON.parse((await tools.buildTool.run({ planId: 'p2' }, {})).content);
  A.ok(/^DONE: it is built\. Still to do before it runs: BAY 2 \(TESTER\) needs an agent\. Tell the Commander exactly that, and stop/.test(todo.next || ''), 'a build with work left says DONE and names exactly what is left: ' + todo.next);
  reply = { built: true, summary: 'Restyle HOME.', where: 'HOME' };
  const room = JSON.parse((await tools.buildTool.run({ planId: 'p3' }, {})).content);
  A.ok(/^DONE: it is built\. If you laid it out by hand, look at it once \(station\.map \{ look: the room \}\) and fix only what is wrong; then tell the Commander what was built in a sentence or two, and stop\./.test(room.next || ''), 'a room build says DONE, keeping its one look for a hand-laid design: ' + room.next);
  reply = { ok: false };
  const refusedBuild = await tools.buildTool.run({ planId: 'p4' }, {});
  A.ok(!/DONE/.test(refusedBuild.content), 'a reply that is no build never says DONE: ' + refusedBuild.content.slice(0, 120));
  // the planner's own schema says a step is a NUMBER (so the model need not learn it from a refusal)
  const steps = tools.planTool.schema.properties.steps;
  A.eq(steps.items.properties.step.type, 'integer', 'station.plan\'s schema types step as an integer');
  A.ok(steps.items.properties.agent.type === 'string' && steps.items.properties.instructions.type === 'string' && steps.items.properties.role.type === 'string', 'and agent, instructions and role as text');
  A.ok(/\[ \{ "step": 1, "agent": "lead", "instructions": "…" \} \] \(step = the step's NUMBER in run order\)/.test(tools.planTool.description), 'its description shows a step as a number');
  A.report('station-builder-model-recovery');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
