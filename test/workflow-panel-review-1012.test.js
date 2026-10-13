/* test/workflow-panel-review-1012.test.js — the Workflow panel / WORKFLOWS window findings of the 2026-10-12 release review
   (wave 2, agent lane). Each block drives the panel's OWN functions (sliced out of frontend/app/workflowpanel.js and
   frontend/app/windows/workflows.js with A.fnBody and run in a vm against stubs, the way conveyor-choices does) and asserts what
   the Commander reads:
     conveyor-ui-07  SPLIT THE JOB: ADD A BRANCH says the new step takes one more PART (never "a copy of every job"); the split
                     note says only TAKE TURNS swaps the JOINER for a MERGER
     conveyor-ui-08  paintPlain carries no unreachable OUTBOX copy (paintOutbox is the one place it is written)
     conveyor-ui-11  a BAY whose role the inserter does not offer (PLANNER) shows it as a pressed chip, never roleless
     conveyor-ui-12  a line / step NAME's answer is the panel's own line under its field — never the off-panel toast — and a name
                     saved while the panel closes still says why
     conveyor-ui-14  KEEP AS THE EXAMPLE claims the crew learned the style only when the station STORED it
     conveyor-ui-15  a job's steps are named by the step's NAME first, then its role, in the panel and in WORKFLOWS */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rd = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const panel = rd('frontend/app/workflowpanel.js'), windowSrc = rd('frontend/app/windows/workflows.js');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the named functions of `src`, run in one vm context over `globals` (each body bounded: a mis-scan fails loudly)
function load(src, headers, globals, extra) {
  const body = headers.map(h => { const b = A.fnBody(src, h); A.ok(b.length > 20 && b.length < 20000, 'sliced ' + h + ' (' + b.length + ' chars)'); return b; }).join('\n');
  const names = headers.map(h => /function (\w+)\(/.exec(h)[1]);
  const ctx = vm.createContext(Object.assign({ esc, console, JSON, Math, Date, String, Object, Array, Promise }, globals));
  return vm.runInContext((extra || '') + '\n' + body + '\n({ ' + names.join(', ') + ' })', ctx);
}
const stubEl = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, value: '', focus() {}, blur() {},
  setAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [] });
const body = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });

/* ---------- conveyor-ui-07 / -08: the SPLITTER card says what each mode does ---------- */
{
  function splitter(mode) {
    const b = body();
    const fns = load(panel, ['function paintPlain(body, f, p)', 'function laneName(f, l, arrow)'], {
      H: { junctionInfo: () => ({ cfg: { fanout: mode !== 'turns' }, lanes: [] }), machineDiagram: () => '', lineEdit: true,
        splitModeInfo: () => ({ mode, toCopy: { ok: true }, toDivide: { ok: true }, toTurns: { ok: true } }) },
      editBtn: (op, id, args, label, tip) => '<button data-edit="' + op + '" data-tip="' + esc(tip) + '">' + esc(label) + '</button>',
      branchLabel: () => 'BAY 2', wireEdits() {}, $: () => null, paintFilter() {}, paintOutbox() {}
    });
    fns.paintPlain(b, { order: [], docks: {} }, { id: 's1', t: 'splitter' });
    return b.innerHTML;
  }
  const div = splitter('divide'), copy = splitter('copy'), turns = splitter('turns');
  const tipOf = html => ((/data-edit="addArm" data-tip="([^"]*)"/.exec(html) || [])[1] || '');
  A.ok(/one more step takes one more part of the job/.test(tipOf(div)) && !/copy of every job/.test(tipOf(div)), 'SPLIT THE JOB: ADD A BRANCH says the new step takes one more PART of the job — ' + tipOf(div));
  A.ok(/gets a copy of every job/.test(tipOf(copy)), 'COPY TO EACH: ADD A BRANCH still says the new step gets a copy');
  A.ok(/takes its turn with the others/.test(tipOf(turns)), 'TAKE TURNS: ADD A BRANCH still says it takes its turn');
  const note = html => ((/id="split-note">([^<]*)</.exec(html) || [])[1] || '');
  A.ok(/TAKE TURNS swaps the JOINER or MERGER/.test(note(div)) && /COPY TO EACH and SPLIT THE JOB share the JOINER/.test(note(div)), 'the split note says only TAKE TURNS swaps the junction — ' + note(div));
  const plain = A.fnBody(panel, 'function paintPlain(body, f, p)');
  A.ok(plain.length > 0 && !/outbox: \['OUTBOX'/.test(plain) && !/browse delivered work in the Logbook/.test(plain), 'paintPlain carries no unreachable OUTBOX copy (conveyor-ui-08)');
  const b = body(), fns = load(panel, ['function paintPlain(body, f, p)', 'function laneName(f, l, arrow)'], { H: { junctionInfo: () => null, machineDiagram: () => '' }, paintFilter() {}, paintOutbox() {} });
  fns.paintPlain(b, null, { id: 'x', t: 'gizmo' });
  A.ok(/GIZMO/.test(b.innerHTML) && /Part of the line/.test(b.innerHTML), 'any other machine still gets the plain card');
}

/* ---------- conveyor-ui-11: an off-list role is a pressed chip ---------- */
{
  function bayHTML(role) {
    const b = body();
    const fns = load(panel, ['function paintBay(body, f, p)'], {
      WL: () => ({ starters: () => [] }), H: { roleInfo: () => null, agents: () => [], canSummon: () => false, stepPositionOf: () => 'chain', station: () => ({ setPropRole() {} }), sfx() {}, flashTip() {} },
      contractRows: () => ({ gets: 'x', to: 'y' }), tryInfo: () => ({ html: '', wire() {} }), computeHTML: () => '', addsOnTopHTML: () => '', shapeHTML: () => '',
      agentStatus: () => ({ txt: 'free' }), thumb: () => '', wireEdits() {}, wireLive() {}, S: { drafts: {} }, $: () => stubEl(), $$: () => [], nameOf: x => x, el: {}, paint() {}
    }, "const STEP_ROLES = ['RESEARCHER', 'WRITER', 'REVIEWER', 'ENGINEER', 'TESTER', 'ANALYST', 'SHIPPER', 'GENERALIST'];");
    fns.paintBay(b, null, { id: 'b1', t: 'bay', role, label: '' });
    return b.innerHTML;
  }
  const planner = bayHTML('PLANNER'), writer = bayHTML('WRITER');
  A.ok(/data-role="PLANNER" aria-pressed="true">PLANNER</.test(planner), 'a PLANNER BAY shows PLANNER as its pressed role chip');
  A.eq((planner.match(/aria-pressed="true"/g) || []).length, 1, '…and only that chip is pressed');
  A.ok(!/data-role="PLANNER"/.test(writer) && /data-role="WRITER" aria-pressed="true"/.test(writer), 'a listed role adds no extra chip (the inserter list is unchanged)');
  A.ok(!/PLANNER/.test(A.fnBody(panel, 'function inserterHTML(from, to, f)')), 'the + inserter still never offers PLANNER (it needs a dividing splitter)');
}

/* ---------- conveyor-ui-12: a NAME's answer is said under its field ---------- */
{
  const tips = [], sounds = [];
  const S = { note: null };
  const input = Object.assign(stubEl(), { tagName: 'INPUT', id: 'wf-name', dataset: {}, closest: () => null, parentNode: { insertBefore() {} }, nextSibling: null });
  const el = { querySelectorAll: sel => (String(sel).split(',').map(x => x.trim()).indexOf('input') >= 0 ? [input] : []), querySelector: () => null, insertBefore() {} };
  const H = { sfx: s => sounds.push(s), flashTip: (m, ok) => tips.push([m, ok]) };
  const fns = load(panel, ['function note(t, bad, anchor)', 'function placeNote()', 'function findAnchor(k)', 'function refuse(msg, anchor)', 'function said(msg, bad, anchor)'], {
    S, H, el, $: () => null, $$: q => el.querySelectorAll(q), clearTimeout() {}, setTimeout: () => 0, document: { createElement: () => Object.assign(stubEl(), { classList: { add() {} } }) }
  }, "const NOTE_MS = 9000; let noteTimer = 0; const anchorKey = b => { if (!b || !b.dataset) return ''; if (b.dataset.edit) return 'edit:' + b.dataset.edit; return b.id ? 'id:' + b.id : ''; };");
  fns.said('A line called RESEARCH is already on the floor', true, input);
  A.ok(S.note && S.note.bad === true && S.note.at === 'id:wf-name' && /already on the floor/.test(S.note.t), 'a refused line name is the panel\'s own answer line, keyed to its field — ' + JSON.stringify(S.note));
  A.eq(tips.length, 0, '…never the off-panel toast');
  A.ok(sounds.indexOf('bad') >= 0, '…with the refusal sound');
  A.ok(fns.findAnchor('id:wf-name') === input, 'the answer finds its INPUT again after a repaint (findAnchor reads inputs too)');
  fns.said('line named — LINE RESEARCH', false, input);
  A.ok(S.note && S.note.bad === false && /line named/.test(S.note.t) && tips.length === 0, 'a saved name is said in the panel too');
  S.closing = true; S.note = null;
  fns.said('A line called RESEARCH is already on the floor', true, input);
  A.ok(!S.note && tips.length === 1 && tips[0][1] === false, 'a name refused while the panel closes still says why (the floor tip) — it is never lost');
  const head = A.fnBody(panel, 'function paintHead(f)'), bay = A.fnBody(panel, 'function paintBay(body, f, p)');
  A.ok(/else \{ nameIn\.value = saved; said\(\(res && res\.msg\) \|\| 'name not saved', true, nameIn\); \}/.test(head), 'the line name\'s refusal goes through said() under #wf-name');
  A.ok(/else \{ bayName\.value = savedName; said\(\(r && r\.msg\) \|\| 'name not saved', true, bayName\); \}/.test(bay), 'the step name\'s refusal goes through said() under #wf-bay-name');
  A.ok(!/H\.flashTip\([^;]*name not saved/.test(head + bay), 'no name refusal is a toast any more');
  const close = A.fnBody(panel, 'function close()');
  A.ok(/S\.closing = true;\s*try \{ saveOpenFields\(\); \} finally \{ S\.closing = false; \}/.test(close), 'close() marks the closing save so its answer reaches the floor tip');
}

/* ---------- conveyor-ui-14: the crew learned the style only when the station stored it ---------- */
{
  (async () => {
    // the immediate toast says only the step's fact
    const kx = A.fnBody(panel, 'function keepExample(mine)');
    A.ok(kx.length > 0 && !/the crew learns/.test(kx) && /will match this example · UNDO takes it back/.test(kx), 'KEEP AS THE EXAMPLE says only that the step will match it before the station answers');
    const cases = [
      [{ status: 200, j: { ok: true, feedbackMemory: { stored: true, created: true } } }, /the crew learned this style/, true],
      [{ status: 200, j: { ok: true, feedbackMemory: { stored: true, created: false } } }, /the crew already knew this style/, true],
      [{ status: 200, j: { ok: true, feedbackMemory: { stored: false, reason: 'personalization-paused' } } }, /learning is paused/, false],
      [{ status: 200, j: { ok: true, feedbackMemory: { stored: false, reason: 'could not save' } } }, /did not learn the style: could not save/, false],
      [{ status: 200, j: { ok: true, feedbackMemory: { stored: false, reason: 'nothing to learn' } } }, /did not learn the style: nothing to learn/, false],
      [{ status: 500, j: { ok: false, error: 'boom' } }, /could not learn the style: boom/, false]
    ];
    for (const [reply, said, stored] of cases) {
      const tips = [];
      const ctx = { S: {}, H: { flashTip: (m, ok) => tips.push([m, ok]) }, api: () => Promise.resolve(reply) };
      const fns = load(panel, ['function keepTaste(mine, runId)'], ctx);
      fns.keepTaste({ stamp: 7 }, 'run-7');
      const got = await ctx.S.tasteKept.sent.then(v => v, () => 'threw');
      A.eq(got, stored, 'keep-style ' + JSON.stringify(reply.j) + ' resolves stored=' + stored + ' (only a stored style is taken back by UNDO)');
      A.ok(tips.length === 1 && said.test(tips[0][0]) && tips[0][1] === stored, 'and says ' + said + ' — ' + JSON.stringify(tips));
      A.ok(stored || !/learned|already knew/.test((tips[0] || [''])[0]), '…never "learned" when nothing was stored');
    }

    /* ---------- conveyor-ui-15: steps go by their NAME ---------- */
    {
      const st = { 'b1': { id: 'b1', t: 'bay', label: 'Fact checker', role: 'REVIEWER' }, 'b0': { id: 'b0', t: 'bay', label: '', role: 'WRITER' } };
      const fns = load(panel, ['function jobResultHTML(mine, f)', 'function loopNotes(text)'], {
        prop: id => st[id] || null, nameOf: a => a.toUpperCase(), stepText: () => 'reply', stepOut: {}, H: { sampleHTML: () => '', plan: () => ({}) }, WL: () => require('../frontend/app/workflowline.js'),
        S: {}, exampleKept: () => false, notRightHTML: () => '', Pipeline: undefined, runEnd: r => 'ran out of turns'
      }, "const LOOP_NOTE = /^\\[LOOP — (exhausted|escalated): (\\d+) pass(?:es)? round the gate[^\\n]*\\]\\s*/gm;");
      const runs = [{ runId: 'r2', dockId: 'b1', agentId: 'nova', reason: 'max_iters', usd: 0.01 }, { runId: 'r1', dockId: 'b0', agentId: 'ada', reason: 'done', usd: 0.01 }];
      const html = fns.jobResultHTML({ view: { ok: false, usd: 0.02 }, runs, output: 'x', stamp: 1 }, null);
      A.ok(/2 · Fact checker · NOVA/.test(html) && !/REVIEWER · NOVA/.test(html), 'a named step is listed by its NAME in HOW EACH STEP DID IT');
      A.ok(/1 · WRITER · ADA/.test(html), '…an unnamed one by its role, as before');
      A.ok(/The Fact checker step \(NOVA\) ran out of turns/.test(html), 'the problem line names the step the way the strip does');
      const live = A.fnBody(panel, 'function liveNow(f)');
      A.ok(/w\.p\.label \|\| w\.p\.role \|\| 'STEP'/.test(live) && /q\.p\.label \|\| q\.p\.role \|\| 'STEP'/.test(live), 'the riding job\'s "Now: step n" names it the same way');
      A.ok(/p\.label \|\| p\.role \|\| 'STEP'/.test(A.fnBody(panel, 'function fixCardHTML(x, i, f)')), 'a suggested fix names its step the same way');
    }
    {
      const st = { propById: id => ({ b1: { id: 'b1', t: 'bay', label: 'Fact checker', role: 'REVIEWER' } })[id] || null };
      const fns = load(windowSrc, ['function resultHTML(l, job)', 'function workOf(text)'], {
        stationOf: () => st, S: { stepOut: {}, prev: {}, fix: null }, ReturnStore: undefined, secs: () => '1s', usd: () => '$0.01', NAME: a => a.toUpperCase(),
        lineWord: () => 'LINE A', ago: () => 'now', styleKept: () => false, runningJob: () => null, fixHTML: () => '', P: () => null, Pipeline: undefined
      }, "const LOOP_NOTE = /^\\[LOOP — (exhausted|escalated): (\\d+) pass(?:es)? round the gate[^\\n]*\\]\\s*/gm;");
      const html = fns.resultHTML({ key: 'L', steps: [] }, { id: 'j1', status: 'problem', text: 'job', output: 'out', usd: 0.01,
        runs: [{ runId: 'r2', dockId: 'b1', agentId: 'nova', reason: 'max_iters', usd: 0.01 }],
        notes: [{ kind: 'fix', role: 'Fact checker', field: 'does', at: 1 }] });
      A.ok(/The Fact checker step \(NOVA\) ran out of turns/.test(html), 'WORKFLOWS names the failing step by its NAME');
      A.ok(/1 · Fact checker · NOVA/.test(html), 'WORKFLOWS lists each step by its NAME');
      const notes = ['function useFix(job, i, back)', 'function keepStyle(job)', 'function putStyleBack(job)'].map(h => A.fnBody(windowSrc, h)).join('\n');
      A.eq((notes.match(/role: p\.label \|\| p\.role \|\| ''/g) || []).length, 3, 'every job note (fix, example, put back) stores the step\'s NAME first');
      const map = A.fnBody(windowSrc, 'function mapHTML(l, workingId)'), step = A.fnBody(windowSrc, 'function stepHTML(l, s)'), setup = A.fnBody(windowSrc, 'function setupHTML(l)'), lv = A.fnBody(windowSrc, 'function liveNow(line)');
      A.ok(/s\.label \|\| s\.role/.test(map) && /s\.label \|\| s\.role/.test(step) && /s\.label \|\| s\.role/.test(setup) && /st\.label \|\| st\.role \|\| 'STEP'/.test(lv), 'the map tip, the opened step, the setup rows and "Now: step n" all say the NAME first');
      A.ok(/p\.label \|\| p\.role \|\| 'STEP'/.test(A.fnBody(windowSrc, 'function fixHTML(job, l)')), 'a suggested change names its step the same way');
    }
    A.report('workflow-panel-review-1012.test');
  })().catch(e => { console.error(e); process.exit(1); });
}
