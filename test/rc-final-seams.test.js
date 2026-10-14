/* node test/rc-final-seams.test.js — the open RC-walk seams (qa/evidence/rc-walk-1013/FINDINGS.md), each locked where the
   Commander reads it. The panels' OWN functions are sliced out of the shipped files (A.fnBody) and run in a vm over stubs, or
   the UMD module is required directly:
     #30  the Workflow panel's ✓ DELIVERED says when the job was NOT counted in SHIPPED (the server's per-job answer), and a
          settled job re-reads TODAY at once, so the card and the plate agree
     #44  "Delegated to RESEARCH, COPY and COPY" — each agent is named once in the card header
     #48  DELIVERABLES: a summary reads as plain words (no **marks**), WHAT CAME BACK is rendered, and an unnamed file carries
          no "the agent did not name this one" apology
     ---  only the General home reads "General" in the session rail; an untitled other session is a "New session"
     #29  a toast never covers an open dock menu: the rack seats above a menu that reaches into its column
     #21  the world RUN x:xx tag reads CREW's clock (approval waits excluded)
     #41  the lead hands over the deliverable as a thing to OPEN, never a list of file names or an offer to fetch it
   The live proof of each is in the lane report (isolated station, scripted model). */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rd = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = h => String(h).replace(/<[^>]+>/g, '');
function load(src, headers, globals, extra) {
  const body = headers.map(h => { const b = A.fnBody(src, h); A.ok(b.length > 20 && b.length < 20000, 'sliced ' + h + ' (' + b.length + ' chars)'); return b; }).join('\n');
  const names = headers.map(h => /function (\w+)\(/.exec(h)[1]);
  const ctx = vm.createContext(Object.assign({ esc, console, JSON, Math, Date, String, Object, Array, Promise, Number, isFinite }, globals));
  return vm.runInContext((extra || '') + '\n' + body + '\n({ ' + names.join(', ') + ' })', ctx);
}

/* ---------- #30: DELIVERED and SHIPPED say one thing ---------- */
{
  const panel = rd('frontend/app/workflowpanel.js'), build = rd('frontend/app/build.js');
  const tipLine = (/\n  const NOT_SHIPPED_TIP = [^\n]*\n/.exec(panel) || [''])[0];
  A.ok(/text only/.test(tipLine) && /tool succeeded or a file was saved/.test(tipLine), 'the not-shipped tip states the SHIPPED rule');
  const fns = load(panel, ['function jobResultHTML(mine, f)', 'function loopNotes(text)'], {
    prop: () => null, nameOf: a => String(a).toUpperCase(), stepText: () => 'reply', stepOut: {}, H: { sampleHTML: () => '', plan: () => ({}) }, WL: () => null,
    S: {}, exampleKept: () => false, notRightHTML: () => '', Pipeline: undefined, runEnd: r => r
  }, "const LOOP_NOTE = /^\\[LOOP — (exhausted|escalated): (\\d+) pass(?:es)? round the gate[^\\n]*\\]\\s*/gm;" + tipLine);
  const runs = [{ runId: 'r1', agentId: 'agent', reason: 'done', usd: 0.04 }];
  const card = shipped => fns.jobResultHTML({ view: { ok: true, usd: 0.0405 }, runs, output: '**TEASER 1:** hi', stamp: 1, folded: true, shipped }, null);
  const talk = card(false);
  A.ok(/✓ DELIVERED · 1 step · \$0\.0405 · in the OUTBOX · a text answer: not counted in SHIPPED/.test(strip(talk)), 'a job the server says was not shipped says so beside DELIVERED: ' + strip(talk).slice(0, 120));
  A.ok(/class="wf-noship" data-tip="NOT IN SHIPPED/.test(talk), '…with the SHIPPED rule as its tip');
  A.ok(!/not counted/.test(strip(card(true))), 'a shipped job adds nothing (DELIVERED and SHIPPED already agree)');
  A.ok(!/not counted/.test(strip(card(null))) && !/not counted/.test(strip(card(undefined))), 'an unknown answer is never said as "not counted"');
  A.ok(!/not counted/.test(strip(fns.jobResultHTML({ view: { ok: false, usd: 0.01 }, runs: [{ runId: 'r1', agentId: 'agent', reason: 'error', usd: 0.01 }], output: 'x', stamp: 2, shipped: false }, null))), 'a job with a problem is not a delivered job: no SHIPPED words');
  A.ok(/shipped: response && typeof response\.shipped === 'boolean' \? response\.shipped : null/.test(build), 'the panel keeps the server\'s own per-job answer (never guessed from the reply)');
  const upd = A.fnBody(panel, 'function jobUpdate()');
  A.ok(/paint\(false\)/.test(upd) && /!sr\.pending && sr\.view\) refreshToday\(\)/.test(upd), 'a settled job re-reads TODAY at once, so RUNS / SHIPPED match the card');
  A.eq((panel.match(/onUpdate: jobUpdate/g) || []).length, 3, 'every way the panel sends a job (SEND, RUN AGAIN, TEST) settles through jobUpdate');
  A.ok(!/onUpdate: \(\) => paint\(false\)/.test(panel), '…none still repaints without re-reading TODAY');
}

/* ---------- #44: each agent named once ---------- */
{
  global.Channels = { pendingOf: () => null, pendingAllOf: () => [], isBusy: () => false, elapsedOf: () => NaN, runIdOf: () => '' };
  global.Overseer = { snapshot: () => ({ workers: [], threads: [] }), fresh: () => true };
  global.App = { agentName: id => ({ researcher: 'RESEARCH', copywriter: 'COPY' })[id] || id };
  global.document = undefined;
  const D = require('../frontend/app/delegated.js');
  const ws = o => Object.assign({ history: [], runIds: ['r'], lastRunReason: 'done' }, o);
  const rows = [{ ws: ws({ id: 'k1', agentId: 'researcher', title: 'Find 3 competitor launch emails' }), worker: null },
    { ws: ws({ id: 'k2', agentId: 'copywriter', title: 'Draft the launch email' }), worker: null },
    { ws: ws({ id: 'k3', agentId: 'copywriter', title: 'Draft a short variant' }), worker: null }];
  D._internals.opened.add('dup1');
  const html = D._internals.lineHtml({ lead: 'dup1', rows }, 'home');
  A.ok(/Delegated to <b>RESEARCH and COPY<\/b>/.test(html), 'a re-dispatch names its agent once: ' + (/Delegated to <b>[^<]*<\/b>/.exec(html) || [''])[0]);
  A.eq((html.match(/data-dg-row=/g) || []).length, 3, '…and still lists every task as its own row');
  A.ok(/all 3 done/.test(html), 'the header count is still every task');
}

/* ---------- #48: DELIVERABLES read as words ---------- */
{
  const D = require('../frontend/app/deliverables.js');
  A.eq(D.plainLine('**TEASER 1:** Your _agents_ never sleep. ## Subject - [Read more](https://x.test) and `code`'), 'TEASER 1: Your agents never sleep. Subject - Read more and code', 'a summary loses its markdown marks, keeps its words');
  A.eq(D.plainLine('# Launch email\n\n- one-line subjects\n- a single call to action'), 'Launch email one-line subjects a single call to action', 'headings and list marks drop on a multi-line summary');
  A.eq(D.plainLine(''), '', 'nothing stays nothing');
  const src = rd('frontend/app/deliverables.js');
  const fns = load(src, ['function cardHtml(r, i, now)', 'function detailHtml(r)'], {
    plainLine: D.plainLine, safeMarkdown: D.safeMarkdown, pillOf: s => ({ cls: s, label: String(s).toUpperCase() }), crewHtml: () => '', agoOf: () => 'now',
    fmtSize: n => n + ' B', fileHref: () => '#'
  });
  const job = fns.cardHtml({ title: 'Launch kit — write it', authored: false, summary: '**TEASER 1:** a text-only answer ## Notes Nothing was saved.', status: 'produced', files: [], output: '**TEASER 1:** a text-only answer\n\n## Notes\nNothing was saved.', jobId: 'job-1' }, 0, 0);
  A.ok(/<p class="dlv-sum">TEASER 1: a text-only answer Notes Nothing was saved\.<\/p>/.test(job), 'a workflow job\'s glance is plain words: ' + (/<p class="dlv-sum">[^<]*/.exec(job) || [''])[0]);
  A.ok(/<div class="dlv-said md"><p><strong>TEASER 1:<\/strong> a text-only answer<\/p><h2>Notes<\/h2><p>Nothing was saved\.<\/p><\/div>/.test(job), 'WHAT CAME BACK is rendered (bold, heading, paragraphs) through the safe renderer');
  const file = fns.cardHtml({ title: 'competitor-launch-emails.md', authored: false, summary: '', status: 'produced', files: [{ path: 'competitor-launch-emails.md', bytes: 120, openUrl: '/api/file?path=x' }] }, 1, 0);
  A.ok(!/did not name/.test(file) && !/dlv-sum/.test(file), 'an unnamed file says nothing under its name (no apology line)');
  A.ok(/dlv-title plain">competitor-launch-emails\.md</.test(file), '…its name is the plain fact');
  A.ok(!/<script>/.test(fns.cardHtml({ title: 'x', authored: true, summary: '<script>alert(1)</script>', status: 'produced', files: [], output: '<script>alert(1)</script>' }, 2, 0)), 'agent text is still escaped on the glance and in the drawer');
}

/* ---------- session titles: one "General" ---------- */
{
  const W = require('../frontend/app/workstreams.js');
  W.init({ generalId: 'home', activeId: 'home', workstreams: [
    { id: 'home', title: null, agentId: 'agent', history: [] },
    { id: 'blank', title: null, agentId: 'agent', history: [], kind: 'chat' },
    { id: 'named', title: 'Launch prep', agentId: 'agent', history: [{ role: 'user', content: 'Launch prep' }] }] });
  A.eq(['home', 'blank', 'named'].map(id => W.titleOf(id)), ['General', 'New session', 'Launch prep'], 'only the General home reads "General"; an untitled other session is a "New session"');
  const fresh = W.startSession({ reuseActive: false });
  A.eq(W.titleOf(fresh), 'New session', '+ NEW reads "New session", never a second "General"');
  A.ok(W.autoTitle(fresh.id, 'Draft the launch email') && W.titleOf(fresh) === 'Draft the launch email', '…until its first message names it');
  W.init({});
  const app = rd('frontend/app/app.js');
  A.ok(!/w\.title \|\| 'General'/.test(app) && !/\(hit\.title \|\| 'General'\)/.test(app), 'the session rail never falls back to "General" for any untitled session');
  A.ok(/const title = Workstreams\.titleOf\(w\)/.test(A.fnBody(app, 'function renderRail()')), 'the rail row reads Workstreams.titleOf');
  A.ok(/Workstreams\.titleOf\(w\)/.test(A.fnBody(app, 'function railRowTip(w, st, project = false)')) && /Workstreams\.titleOf\(w\)/.test(A.fnBody(app, 'function railRowLabel(w, st, project = false)')), '…and so do its tip and its spoken label');
}

/* ---------- #29: a toast never covers an open dock menu ---------- */
{
  const ui = rd('frontend/app/stationui.js'), nav = rd('frontend/app/navdock.js');
  const rect = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
  function seat(menuRect) {
    const props = {};
    const stack = { style: { setProperty: (k, v) => { props[k] = v; } } };
    const els = { 'screen-game': { classList: { contains: () => true } }, bottombar: { getBoundingClientRect: () => rect(11, 846, 1418, 46) }, 'stage-wrap': { getBoundingClientRect: () => rect(11, 40, 1418, 796) } };
    const menus = menuRect ? [{ getBoundingClientRect: () => menuRect }] : [];
    const fns = load(ui, ['function seatToastRack(stack)'], {
      document: { getElementById: id => els[id] || null, querySelector: () => null, querySelectorAll: sel => (/\.bb-group\.open \.bb-menu/.test(sel) ? menus : []) },
      window: { innerHeight: 900 }, uiZoom: () => 1
    });
    fns.seatToastRack(stack);
    return parseFloat(props['--toast-b']);
  }
  const base = seat(null);
  A.eq(base, 64, 'no menu open: the rack sits on the stage floor line (900 - 836)');
  const raised = seat(rect(220, 560, 300, 280));   // the BUILD menu opening upward into the rack's 356px column
  A.eq(raised, 900 - 560 + 6, 'an open dock menu in the rack\'s column lifts the rack above the menu\'s top (6px clear)');
  A.eq(seat(rect(900, 560, 300, 280)), base, 'a menu clear of the rack\'s column leaves it where it was');
  A.ok(/registerWindow, h, motionRestState, reseatToasts \}/.test(ui), 'StationUI exposes reseatToasts');
  const toggle = A.fnBody(nav, 'function toggle(g, viaKeyboard)'), closeAll = A.fnBody(nav, 'function closeAll(except)');
  A.ok(/requestAnimationFrame\(reseatToasts\)/.test(toggle) && /else reseatToasts\(\)/.test(toggle), 'a dock menu opening or closing re-seats a toast already up');
  A.ok(/reseatToasts\(\);\s*\}$/.test(closeAll.trim()), 'closing every menu (an item picked, a click away) re-seats it too');
}

/* ---------- #21 #27: the world's RUN tag reads CREW's clock ---------- */
{
  const world = rd('frontend/app/world.js');
  const clocks = A.fnBody(world, 'function drawRunClocks(now)');
  A.ok(/CrewClock\.elapsedOf\(aid, Date\.now\(\)\)/.test(clocks), 'the desk tag asks CrewClock for this agent\'s run, in wall-clock ms (the frame clock is performance.now)');
  A.ok(/typeof crewMs === 'number' && isFinite\(crewMs\) \? crewMs : \(now - t0\)/.test(clocks), '…and falls back to the run\'s own start only when CREW has no live run for it');
  const crew = rd('frontend/app/crewcards.js');
  A.ok(/window\.CrewClock = \{ elapsedOf:/.test(crew), 'CrewClock is the one clock CREW, the DELEGATED row and the world read');
}

/* ---------- #41: a deliverable is a thing to OPEN ---------- */
{
  const host = rd('sidecar/index.js');
  A.ok(/name the deliverable and say it is ready to open on its card \(every file a worker saved is one\) — never answer with only a list of file names, and never ask whether to show or fetch it/.test(host), 'the lead\'s YOUR TEAM line hands over the deliverable to open');
  A.ok(/A saved file is ready to open on its card; never offer to fetch, pull or paste it\. /.test(A.fnBody(host, 'function delegatedReportPrompt(live, waiting, followUp)')), 'the background report says the same');
}

A.report();
