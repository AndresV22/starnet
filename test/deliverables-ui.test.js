'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const D = require('../frontend/app/deliverables.js');
const Tickets = require('../sidecar/apitickets.js');

const md = D.safeMarkdown('# Hello\n<script>alert(1)</script>\n**bold**');
A.ok(md.indexOf('<h1>Hello</h1>') >= 0 && md.indexOf('<strong>bold</strong>') >= 0, 'bounded Markdown formatting renders');
A.ok(md.indexOf('<script>') < 0 && md.indexOf('&lt;script&gt;') >= 0, 'Markdown HTML is escaped before formatting');

const csv = D.safeCsv('a,b,c\n1,"two, too",3\n4,5,6', 2, 2);
A.ok(csv.indexOf('<table') >= 0 && csv.indexOf('two, too') >= 0, 'quoted CSV cells parse into a table');
A.ok(csv.indexOf('<td>3</td>') < 0 && csv.indexOf('<td>4</td>') < 0, 'CSV preview obeys row and column bounds');

// open URLs carry a SCOPED TICKET, never the launch token (2026-09-25 — these reach OS-browser history/Referer)
global.window = { __STARNET_API_TOKEN__: 'secret', crypto: require('node:crypto').webcrypto };
global.ApiTicket = require('../frontend/app/apiticket.js');
const runOpen = D.openUrl('/workshop-run/a/r/index.html');
const runSplit = Tickets.splitRunTicket(runOpen);
A.ok(runSplit && runSplit.rest === 'a/r/index.html' && runOpen.indexOf('secret') < 0, 'sandboxed HTML navigation gets a run ticket in the path, no launch token: ' + runOpen.slice(0, 40));
A.ok(Tickets.verify('secret', runSplit.ticket, 'run', Tickets.scopeRun('a', 'r'), { now: Date.now() }).ok, 'that run ticket verifies for run a/r');
const fileOpen = D.openUrl('/api/file?agent=a&path=x.md');
const fq = new URL(fileOpen, 'http://127.0.0.1').searchParams;
A.ok(fileOpen.indexOf('secret') < 0 && !fq.has('token') && Tickets.verify('secret', fq.get('ticket'), 'file', Tickets.scopeFile('a', 'x.md'), { now: Date.now() }).ok, 'file preview gets a file ticket for exactly x.md, no launch token');
delete global.ApiTicket; delete global.window;

/* ---- the organized library's display helpers (2026-08-13) ---- */
const NOW = new Date('2026-08-13T15:00:00').getTime();
A.eq(D.bucketOf(new Date('2026-08-13T00:30:00').getTime(), NOW), 'TODAY', 'anything since local midnight is TODAY');
A.eq(D.bucketOf(NOW - 2 * 86400000, NOW), 'THIS WEEK', 'two days back is THIS WEEK');
A.eq(D.bucketOf(NOW - 30 * 86400000, NOW), 'EARLIER', 'a month back is EARLIER');
A.eq(D.bucketOf(0, NOW), 'EARLIER', 'a row with no timestamp falls to EARLIER rather than claiming TODAY');

A.eq(D.agoOf(NOW - 30000, NOW), 'just now', 'sub-minute reads as just now');
A.eq(D.agoOf(NOW - 3 * 3600000, NOW), '3h ago', 'hours read as hours');
A.eq(D.agoOf(0, NOW), '', 'no timestamp produces no relative stamp, never a fabricated one');


// the status pill vocabulary, including the prototype-key trap that bit this repo before
A.eq(D.pillOf('pending').label, 'NEEDS A DECISION', 'pending is the only status that asks the user for something');
A.eq(D.pillOf('produced').cls, 'ok', 'a finished run reads as good');
A.eq(D.pillOf('failed').cls, 'bad', 'a failed run reads as bad');
A.eq(D.pillOf('constructor').cls, 'off', 'a prototype key cannot resolve through Object.prototype into a fake pill');

const runRows = [{runId:'run-1',title:'First draft'}, {runId:'run-10',title:'First draft'}, {runId:'elsewhere',summary:'run-1'}, {runId:'run-1',ask:'Review feedback'}];
A.eq(D.rowsForRun(runRows, 'run-1', '').length, 2, 'step output filtering requires exact run identity, never prefix or text matches');
A.eq(D.rowsForRun(runRows, 'run-1', 'FEEDBACK')[0].ask, 'Review feedback', 'search within a step retains exact provenance');
A.eq(D.rowsForRun(runRows, 'missing', '').length, 0, 'a missing run never falls back to unrelated output');
/* ---- FILES rows can find their file on disk (org pass 10-14, P24): the path comes off the backend's own openUrl ---- */
{
  const loc = (url, project, extra) => D.savedLocation(Object.assign({ agentId: 'agent' }, extra || {}), { path: 'shown.md', openUrl: url }, project);
  const ws = loc('/api/file?agent=ultron&path=' + encodeURIComponent('out/report.md'), 'C:\\work\\acme');
  A.eq([ws.agentId, ws.path, ws.inProject], ['ultron', 'out/report.md', false], 'a workspace file of a project item is proven OUTSIDE that project (relative = the agent workspace)');
  const pr = loc('/api/file?agent=ultron&path=' + encodeURIComponent('src/a.js') + '&project=' + encodeURIComponent('C:\\work\\acme'), 'C:\\work\\acme');
  A.eq([pr.path, pr.inProject], ['C:\\work\\acme\\src\\a.js', true], 'a project-scoped file resolves inside the project folder');
  const nop = loc('/api/file?agent=a&path=x.md', '');
  A.eq(nop.inProject, null, 'an item with no project makes no outside/inside claim');
  const wsr = loc('/workshop-run/cypher/run-7/site/index.html', '');
  A.eq([wsr.agentId, wsr.path], ['cypher', 'workshop/run-7/site/index.html'], 'a sandboxed workshop page maps to its real workshop folder, not the bare display path');
  const abs = loc('/api/file?agent=a&path=' + encodeURIComponent('D:/elsewhere/out.txt'), 'C:\\work\\acme');
  A.eq([abs.path, abs.inProject], ['D:/elsewhere/out.txt', false], 'an absolute path outside the project is proven outside');
  A.eq(D.savedLocation({ agentId: 'a' }, { path: '', openUrl: '' }, ''), null, 'no path = no key');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'frontend', 'app', 'deliverables.js'), 'utf8');
  A.ok(/OPEN<\/a><span class="dlv-floc" data-floc="' \+ fi \+ '"><\/span><span class="dlv-fname">/.test(src), 'every openable FILES row carries a key slot beside OPEN');
  A.ok(/Chat\.folderButton\(loc\.agentId, loc\.path\)/.test(src) && /if \(tauriCore\(\)\) keys\.push\(Chat\.copyPathButton\(loc\.agentId, loc\.path\)\)/.test(src), 'the slot gets the COMMS folder key, plus copy path on desktop');
  A.ok(/k\.removeAttribute\('title'\); k\.setAttribute\('data-tip', lead \+ p\)/.test(src) && /'saved in ' \+ agentLabel\(loc\.agentId\) \+ ' workspace, not in ' \+ projLeaf\(r\.project\)/.test(src), 'the full path rides a data-tip (not title=), led by the outside-the-project note');
  A.ok(!/use its session or workspace folder/.test(src) && /folderKey\.click\(\)/.test(src), 'a failed desktop OPEN runs the folder key instead of the old hunt-for-it sentence');
  const chat = fs.readFileSync(require('path').join(__dirname, '..', 'frontend', 'app', 'chat.js'), 'utf8');
  A.ok(/folderButton, copyPathButton, fullSavedPath: absoluteArtifactPath \};\n\}\)\(\);\s*$/.test(chat), 'Chat exports the shared keys and their resolver');
}
A.report('deliverables-ui.test');
