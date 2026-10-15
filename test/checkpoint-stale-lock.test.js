/* node test/checkpoint-stale-lock.test.js — a checkpoint Git command killed mid-flight must not kill the undo net.

   The P1 (found by the GH#107 lane): a snapshot's own `git add -A`, killed at its 15 s bound on the first snapshot of
   a big workspace, leaves .checkpoints/<agent>/git/index.lock behind. Git then refuses every later `add` for that
   agent ("Unable to create index.lock: File exists"), so every later snapshot returned null and the rollback net
   was silently dead until an over-ceiling re-init happened to replace the repo. Every checkpoint Git command for one
   agent runs inside the store's per-agent lock and a stopped command's whole process tree is dead before the runner
   resolves, so a lock file found at the start of the next checkpoint operation is always stale.

   REAL git through the REAL supervised runner (checkpoint-git.js): the add is killed by an abort the moment its
   index.lock exists, exactly what the runner's timeout does. Then: the next snapshot succeeds, the repo is fsck
   clean, and restore brings the files back byte-identical. Also: the other locks the store's own commands take,
   a user's own repo is never touched, and a snapshot that cannot be taken says so through health().
   Spawns git, so it rides test:http (the subprocess bucket). */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { makeCheckpointGitRunner } = require('../sidecar/checkpoint-git.js');
const { makeCheckpointStore } = require('../sidecar/checkpoint-store.js');
const failopen = require('../sidecar/failopen.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-checkpoint-stale-lock-'));
let nowMs = 1700000000000;
const clock = { now: () => nowMs };
const realGit = makeCheckpointGitRunner({ spawn, clock: { now: () => Date.now() } });
const gitDirOf = id => path.join(root, '.checkpoints', id, 'git');
const gitIn = (gitDir, args) => execFileSync('git', ['--git-dir', gitDir].concat(args), { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function tree(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name); if (fs.statSync(f).isFile()) out[name] = sha(f); }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const noted = tag => failopen.counts()[tag] || 0;

(async () => {
  try {
    /* ---- 1. the reported failure: an add killed while it holds index.lock ---- */
    const aid = 'agent', wt = path.join(root, aid), lock = path.join(gitDirOf(aid), 'index.lock');
    fs.mkdirSync(wt, { recursive: true });
    // incompressible bytes so the add is still hashing when the abort lands (the reported case was a 96 MB workspace)
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(wt, 'blob' + i + '.bin'), crypto.randomBytes(1024 * 1024));
    fs.writeFileSync(path.join(wt, 'notes.txt'), 'line one\r\nline two\n');
    let killNext = true, killed = null;
    function killingGit(args, opts) {
      if (!(killNext && args.includes('add'))) return realGit(args, opts);
      killNext = false;
      const controller = new AbortController();
      const run = realGit(args, Object.assign({}, opts, { signal: controller.signal }));
      let lockSeen = false, done = false;
      run.then(() => { done = true; });
      (async () => {
        const deadline = Date.now() + 20000;
        while (!done && Date.now() < deadline) {
          if (fs.existsSync(lock)) { lockSeen = true; controller.abort(); return; }
          await sleep(2);
        }
      })();
      return run.then(r => { killed = { lockSeen: lockSeen, aborted: !!r.aborted, code: r.code }; return r; });
    }
    const store = makeCheckpointStore({ fs, pathMod: path, root, runGit: killingGit, clock, maxRepoBytes: 1 << 30 });
    A.eq(store.health(aid), null, 'no snapshot attempted yet: health is unknown, not ok');
    const first = await store.snapshot(aid, { runId: 'r1', turn: 1, label: 'killed add' });
    A.ok(killed && killed.lockSeen && killed.aborted, 'fixture: the add was stopped while it held index.lock (' + JSON.stringify(killed) + ')');
    A.eq(first, null, 'the snapshot whose add was killed reports no restore point');
    A.ok(fs.existsSync(lock), 'fixture: the killed add left index.lock behind (the reported state)');
    const down = store.health(aid);
    A.ok(down && down.ok === false, 'health says the last restore point could not be saved');
    A.ok(down && /add/i.test(down.lastFailure && down.lastFailure.reason) && /stopped|timed out/i.test(down.lastFailure && down.lastFailure.reason),
      'the failure names the Git step and that it was stopped: ' + JSON.stringify(down));
    A.eq(down && down.since, nowMs, 'the failing streak starts at the failed attempt');

    nowMs += 60000;
    const before = noted('checkpoint.staleLock');
    const second = await store.snapshot(aid, { runId: 'r2', turn: 2, label: 'next turn' });
    A.ok(second && second.created, 'the next snapshot after a killed add succeeds (was null for every later turn)');
    A.ok(!fs.existsSync(lock), 'the stale index.lock is gone');
    A.eq(noted('checkpoint.staleLock') - before, 1, 'the stale-lock removal is noted exactly once');
    const up = store.health(aid);
    A.ok(up && up.ok === true && up.at === nowMs, 'health is back to ok after the successful snapshot');
    A.ok(up && up.lastFailure && up.failures === 1, 'the earlier missed restore point stays on record');
    A.ok(store.list(aid).snapshots.some(s => s.id === second.id), 'the new restore point is in the index');

    const fsck = (() => {
      try { return { code: 0, out: execFileSync('git', ['--git-dir', gitDirOf(aid), 'fsck', '--full', '--no-progress'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
    })();
    A.eq(fsck.code, 0, 'git fsck --full is clean after the recovered snapshot: ' + fsck.out.slice(0, 400));
    A.ok(!/^(error|missing|broken|bad)/mi.test(fsck.out), 'fsck reports no missing/broken objects');

    const captured = tree(wt);
    fs.writeFileSync(path.join(wt, 'notes.txt'), 'rewritten by a bad tool');
    fs.rmSync(path.join(wt, 'blob7.bin'));
    fs.writeFileSync(path.join(wt, 'blob3.bin'), crypto.randomBytes(1024));
    fs.writeFileSync(path.join(wt, 'created-later.txt'), 'new');
    A.ok(await store.restore(aid, second.id), 'restore to the recovered restore point succeeds');
    A.eq(tree(wt), captured, 'restore brings every file back byte-identical and removes the file created later');
    A.eq(fs.readFileSync(path.join(wt, 'notes.txt'), 'utf8'), 'line one\r\nline two\n', 'CRLF bytes survive the round trip');

    /* ---- 2. the other locks the store's own commands take (commit, reset, gc, init) ---- */
    const branchRef = gitIn(gitDirOf(aid), ['symbolic-ref', 'HEAD']);
    const planted = [
      'HEAD.lock', 'ORIG_HEAD.lock', 'config.lock', 'packed-refs.lock', 'gc.pid',
      branchRef.split('/').join(path.sep) + '.lock',
      path.join('objects', 'info', 'commit-graph.lock'),
      path.join('objects', 'info', 'commit-graphs', 'commit-graph-chain.lock'),
      path.join('objects', 'pack', 'multi-pack-index.lock')
    ].map(rel => path.join(gitDirOf(aid), rel));
    for (const f of planted) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'left by a killed command'); }
    const headBefore = gitIn(gitDirOf(aid), ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(wt, 'notes.txt'), 'turn three');
    const third = await store.snapshot(aid, { runId: 'r3', turn: 3, label: 'after a killed commit' });
    A.ok(third && third.created && third.id !== headBefore, 'a snapshot after a killed commit/reset/gc records a new commit');
    A.eq(gitIn(gitDirOf(aid), ['rev-parse', 'HEAD']), third && third.id, 'the branch really advanced to the new restore point');
    A.eq(planted.filter(f => fs.existsSync(f)).map(f => path.relative(gitDirOf(aid), f)), [], 'every stale lock the store own commands take is gone');
    A.ok(fs.existsSync(path.join(gitDirOf(aid), 'objects', 'info', 'commit-graphs')), 'only lock FILES are removed, never a directory');

    /* ---- 3. never the user's own repo ---- */
    const project = path.join(root, 'user-project');
    fs.mkdirSync(project);
    execFileSync('git', ['init', '-q', project], { windowsHide: true, stdio: 'ignore' });
    fs.writeFileSync(path.join(project, 'app.js'), 'console.log(1)');
    const userLocks = [path.join(project, '.git', 'index.lock'), path.join(project, '.git', 'HEAD.lock')];
    for (const f of userLocks) fs.writeFileSync(f, 'the user\'s own git is busy');
    const scoped = makeCheckpointStore({ fs, pathMod: path, root, runGit: realGit, clock, maxRepoBytes: 1 << 30,
      scopeIdOf: () => 'b'.repeat(24), allowWorkTree: () => true });
    const projectSnap = await scoped.snapshot(aid, { runId: 'r4', turn: 4, label: 'project edit', workTree: project });
    A.ok(projectSnap && projectSnap.created, 'a project-root snapshot still works while the user repo is locked');
    A.ok(userLocks.every(f => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === 'the user\'s own git is busy'), 'the user repo lock files are never touched');

    /* ---- 4. a lock that cannot be removed: the snapshot says so instead of pretending ---- */
    fs.mkdirSync(lock);   // not a file git left: the sweep must not rm -rf it, and git still cannot take the lock
    fs.writeFileSync(path.join(wt, 'notes.txt'), 'turn five');
    nowMs += 60000;
    const blocked = await store.snapshot(aid, { runId: 'r5', turn: 5, label: 'blocked' });
    A.eq(blocked, null, 'a snapshot that cannot take the index lock still returns null (fail-open contract)');
    A.ok(fs.statSync(lock).isDirectory(), 'a directory named index.lock is left alone');
    const stuck = store.health(aid);
    A.ok(stuck && stuck.ok === false && stuck.since === nowMs && stuck.failures === 2, 'health reports the new failing streak: ' + JSON.stringify(stuck));
    A.ok(/index\.lock/.test(stuck && stuck.lastFailure && stuck.lastFailure.reason), 'the reason names what blocked it: ' + JSON.stringify(stuck && stuck.lastFailure));
    A.ok(!new RegExp(root.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/\\\\/g, '[\\\\/]'), 'i').test(stuck.lastFailure.reason),
      'the reason does not print the station directory path');
    nowMs += 60000;
    const stillBlocked = await store.snapshot(aid, { runId: 'r6', turn: 6, label: 'still blocked' });
    A.eq(stillBlocked, null, 'still blocked on the next turn');
    A.eq(store.health(aid).since, nowMs - 60000, 'the streak start does not move while it keeps failing');
    fs.rmdirSync(lock);
    nowMs += 60000;
    A.ok(await store.snapshot(aid, { runId: 'r7', turn: 7, label: 'unblocked' }), 'once the blocker is gone the next snapshot succeeds');
    A.eq(store.health(aid).ok, true, 'and health says so');

    /* ---- 5. reasons for the supervised runner's other outcomes (no real git needed) ---- */
    let answer = null;
    const fake = makeCheckpointStore({ fs, pathMod: path, root, clock, maxRepoBytes: 1 << 30,
      runGit: (args, opts) => (answer && args.includes('add')) ? Promise.resolve(answer) : realGit(args, opts) });
    answer = { code: null, stdout: '', stderr: 'checkpoint Git process tree timed out', timedOut: true };
    A.eq(await fake.snapshot(aid, { label: 'slow' }), null, 'a timed-out add returns null');
    A.ok(/add timed out/i.test(fake.health(aid).lastFailure.reason), 'a timed-out add says it timed out: ' + fake.health(aid).lastFailure.reason);
    answer = { code: 128, stdout: '', stderr: 'error: open("blob1.bin"): Permission denied\nerror: unable to index file \'blob1.bin\'\nfatal: adding files failed\n' };
    A.eq(await fake.snapshot(aid, { label: 'denied' }), null, 'a failed add returns null');
    A.ok(/add failed/i.test(fake.health(aid).lastFailure.reason) && /Permission denied/.test(fake.health(aid).lastFailure.reason), 'a failed add carries Git\'s own first line: ' + fake.health(aid).lastFailure.reason);
    A.ok(fake.health(aid).lastFailure.reason.length <= 240, 'the reason stays short');
    A.eq(fake.health('bad id!'), null, 'an invalid agent id has no health');
    const copy = fake.health(aid); copy.ok = 'tampered';
    A.ok(fake.health(aid).ok === false, 'health() hands out a copy, never the live record');

    A.report('checkpoint-stale-lock.test');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
