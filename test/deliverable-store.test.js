/* node test/deliverable-store.test.js — durable lifecycle metadata + cleanup undo for the Deliverables library. */
'use strict';
const A = require('./_assert.js');
const path = require('path');
const { makeDeliverableStore } = require('../sidecar/deliverable-store.js');

function memFs() {
  const files = new Map();
  return {
    _files: files,
    readFileSync(f) { if (!files.has(String(f))) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return files.get(String(f)); },
    writeFileSync(f, d) { files.set(String(f), String(d)); },
    renameSync(a, b) { files.set(String(b), files.get(String(a))); files.delete(String(a)); },
    existsSync(f) { return files.has(String(f)); }, mkdirSync() {}, unlinkSync(f) { files.delete(String(f)); },
    openSync() { return 1; }, fsyncSync() {}, closeSync() {}
  };
}
const writeDurable = ({ fs }, file, data) => fs.writeFileSync(file, data);

(async () => {
  const fs = memFs();
  const s = makeDeliverableStore({ fs, path, workspaces: '/ws', writeDurable });
  A.eq(s.list(), [], 'new library starts empty');

  await s.record({ id: 'workshop:agent:r1', agentId: 'agent', runId: 'r1', title: 'Report', source: 'nightshift', status: 'kept', files: [{ path: 'report.md', bytes: 12 }] }, 100);
  await s.record({ id: 'workshop:agent:r2', agentId: 'agent', runId: 'r2', title: 'Old draft', source: 'queued', status: 'discarded', files: [{ path: 'draft.csv', bytes: 9 }] }, 200);
  A.eq(s.list().map(x => x.id), ['workshop:agent:r2', 'workshop:agent:r1'], 'list is newest-first');
  A.eq(s.list()[0].status, 'discarded', 'lifecycle status round-trips');

  const s2 = makeDeliverableStore({ fs, path, workspaces: '/ws', writeDurable });
  A.eq(s2.list().length, 2, 'records survive a fresh store instance');

  const preview = s2.previewCleanup({ statuses: ['discarded'] });
  A.eq(preview.targets.map(x => x.id), ['workshop:agent:r2'], 'cleanup preview names the exact eligible target');
  A.eq(preview.protected.map(x => x.id), ['workshop:agent:r1'], 'kept rows are protected by default');

  const applied = await s2.applyCleanup(preview, 'undo-1', 300);
  A.ok(applied.ok && applied.removed === 1 && applied.undoToken === 'undo-1', 'cleanup removes the previewed set and records undo');
  A.eq(s2.list().map(x => x.id), ['workshop:agent:r1'], 'only previewed rows leave the live index');
  const restored = await s2.undoCleanup('undo-1', 400);
  A.ok(restored.ok && restored.restored === 1, 'undo restores the removed lifecycle row');
  A.eq(s2.list().map(x => x.id), ['workshop:agent:r2', 'workshop:agent:r1'], 'undo restores exact metadata');

  const stale = s2.previewCleanup({ statuses: ['discarded'] });
  await s2.record({ id: 'workshop:agent:r3', agentId: 'agent', runId: 'r3', title: 'New', status: 'discarded', files: [] }, 500);
  const refused = await s2.applyCleanup(stale, 'undo-stale', 600);
  A.ok(refused.ok === false && refused.reason === 'preview-stale', 'apply refuses when the exact preview fingerprint is stale');

  /* CLEARED — "I'm done with these": a library-only hide with undo; lifecycle rows are never touched */
  A.eq(Array.from(s2.clearedIds()), [], 'nothing is cleared to begin with');
  const noTok = await s2.clear(['run:a'], '', 700);
  A.ok(noTok.ok === false, 'a clear without an undo token is refused');
  const c1 = await s2.clear(['run:a', 'run:b', 'run:a', 'workshop:agent:r1'], 'clr-1', 800);
  A.ok(c1.ok && c1.cleared === 3 && c1.undoToken === 'clr-1', 'clear hides each distinct id once and hands back its undo token');
  A.eq(Array.from(s2.clearedIds()).sort(), ['run:a', 'run:b', 'workshop:agent:r1'], 'the cleared set holds exactly those ids');
  A.eq(s2.list().map(x => x.id), ['workshop:agent:r3', 'workshop:agent:r2', 'workshop:agent:r1'], 'clearing never removes a lifecycle row');
  const c2 = await s2.clear(['run:b', 'run:c'], 'clr-2', 900);
  A.ok(c2.ok && c2.cleared === 1, 'a second clear counts only the ids it newly hid');
  const s3 = makeDeliverableStore({ fs, path, workspaces: '/ws', writeDurable });
  A.eq(Array.from(s3.clearedIds()).sort(), ['run:a', 'run:b', 'run:c', 'workshop:agent:r1'], 'cleared ids survive a fresh store instance (journal replay)');
  const u1 = await s3.unclear('clr-1', 1000);
  A.ok(u1.ok && u1.restored === 3, 'undo names how many rows came back');
  A.eq(Array.from(s3.clearedIds()), ['run:c'], 'undo restores only what THAT clear hid (run:b was already hidden by clr-1, not clr-2)');
  A.ok((await s3.unclear('clr-1', 1100)).ok === false, 'an undo token works once');
  const s4 = makeDeliverableStore({ fs, path, workspaces: '/ws', writeDurable });
  A.eq(Array.from(s4.clearedIds()), ['run:c'], 'the undo is durable too');

  A.report('deliverable-store.test');
})().catch(e => { console.error(e); process.exit(1); });
