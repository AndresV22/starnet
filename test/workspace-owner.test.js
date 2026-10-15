/* node test/workspace-owner.test.js — process-wide ownership for StarNet's single-writer stores. */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('./_assert.js');
const { makeWorkspaceOwner } = require('../sidecar/workspace-owner.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-owner-'));
const lockfile = path.join(root, '.starnet-workspace-owner.json');
try {
  const first = makeWorkspaceOwner({ fs, path, pid: 41001, now: () => 100, nonce: () => 'first', pidAlive: p => p === 41001 });
  const a = first.acquire(root);
  A.eq(a.ok, true, 'first sidecar owns a free workspace');
  A.eq(JSON.parse(fs.readFileSync(lockfile, 'utf8')).pid, 41001, 'claim identifies its holder');

  const second = makeWorkspaceOwner({ fs, path, pid: 41002, now: () => 200, nonce: () => 'second', pidAlive: p => p === 41001 });
  const blocked = second.acquire(root);
  A.eq(blocked.ok, false, 'a second live sidecar is refused');
  A.eq(blocked.code, 'WORKSPACE_BUSY', 'collision fails with the stable safety code');
  A.eq(blocked.holder.pid, 41001, 'collision names the current holder');

  A.eq(second.release(), false, 'a non-owner cannot release another process claim');
  A.eq(fs.existsSync(lockfile), true, 'the legitimate holder claim remains');
  A.eq(first.release(), true, 'the legitimate holder can release');
  A.eq(fs.existsSync(lockfile), false, 'clean release removes the claim');

  const crashed = makeWorkspaceOwner({ fs, path, pid: 41003, now: () => 300, nonce: () => 'crashed', pidAlive: () => false });
  A.eq(crashed.acquire(root).ok, true, 'a replacement holder can acquire');
  // Simulate an uncatchable desktop kill: no release. A subsequent process proves the PID dead and reclaims.
  const recovered = makeWorkspaceOwner({ fs, path, pid: 41004, now: () => 400,
    nonce: (() => { let n = 0; return () => 'recovery-' + (++n); })(), pidAlive: () => false });
  A.eq(recovered.acquire(root).ok, true, 'a provably dead holder is reclaimed immediately');
  A.eq(JSON.parse(fs.readFileSync(lockfile, 'utf8')).pid, 41004, 'recovery installs the successor claim');
  A.eq(crashed.release(), false, 'a stale process instance cannot unlink its successor claim');

  recovered.release();
  fs.writeFileSync(lockfile, '{not-json');
  const cautious = makeWorkspaceOwner({ fs, path, pid: 41005, now: () => 500, nonce: () => 'cautious', pidAlive: () => false });
  const malformed = cautious.acquire(root);
  A.eq(malformed.ok, false, 'a malformed holder claim is never guessed stale');
  A.eq(malformed.code, 'WORKSPACE_BUSY', 'unprovable ownership fails closed');

  // REBOOT RECLAIM (2026-08-22 macOS dead-end): PIDs restart at boot, so a crash + reboot leaves a stamp whose
  // PID now belongs to some unrelated LIVE process. kill(0) alone said "busy" forever. A claim stamped before
  // the current boot is provably dead regardless of who owns that PID today.
  fs.unlinkSync(lockfile);
  const BOOT = 10_000_000;
  const preReboot = makeWorkspaceOwner({ fs, path, pid: 41006, now: () => BOOT - 3_600_000, nonce: () => 'prereboot', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(preReboot.acquire(root).ok, true, 'pre-reboot holder claims (fixture)');
  const reused = makeWorkspaceOwner({ fs, path, pid: 41007, now: () => BOOT + 5_000, nonce: () => 'afterboot', pidAlive: () => true, bootedAt: () => BOOT });
  const afterBoot = reused.acquire(root);
  A.eq(afterBoot.ok, true, 'a claim stamped before this boot is reclaimed even though its PID is live (reused)');
  A.eq(JSON.parse(fs.readFileSync(lockfile, 'utf8')).pid, 41007, 'the post-boot sidecar owns the workspace');
  reused.release();

  // within one boot, a live PID is still busy — the boot rule never weakens the same-boot guarantee.
  const sameBootA = makeWorkspaceOwner({ fs, path, pid: 41008, now: () => BOOT + 10_000, nonce: () => 'sbA', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(sameBootA.acquire(root).ok, true, 'same-boot holder claims');
  const sameBootB = makeWorkspaceOwner({ fs, path, pid: 41009, now: () => BOOT + 20_000, nonce: () => 'sbB', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(sameBootB.acquire(root).code, 'WORKSPACE_BUSY', 'a live same-boot holder still blocks');
  // a holder stamped within the 60s slack after boot is NOT treated as pre-boot.
  sameBootA.release();
  const nearBoot = makeWorkspaceOwner({ fs, path, pid: 41010, now: () => BOOT - 30_000, nonce: () => 'near', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(nearBoot.acquire(root).ok, true, 'near-boot holder claims');
  A.eq(sameBootB.acquire(root).code, 'WORKSPACE_BUSY', 'a holder inside the boot slack is still busy (clock skew is not death)');
  nearBoot.release();

  // a torn/empty lock left by a crash mid-write: reclaimable only when the FILE predates boot.
  fs.writeFileSync(lockfile, '');
  const tornRecent = makeWorkspaceOwner({ fs, path, pid: 41011, now: () => BOOT + 30_000, nonce: () => 'torn1', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(tornRecent.acquire(root).code, 'WORKSPACE_BUSY', 'a torn lock written this boot stays busy (unprovable)');
  const farFuture = Date.now() + 365 * 24 * 3600 * 1000;   // "boot" after the file's real mtime ⇒ file predates boot
  const tornOld = makeWorkspaceOwner({ fs, path, pid: 41012, now: () => farFuture + 1000, nonce: () => 'torn2', pidAlive: () => true, bootedAt: () => farFuture });
  A.eq(tornOld.acquire(root).ok, true, 'a torn lock from before this boot is reclaimed');
  tornOld.release();

  // unknown boot time (0) ⇒ the rule is inert and only kill(0) decides (the factory default).
  const inertA = makeWorkspaceOwner({ fs, path, pid: 41013, now: () => 1, nonce: () => 'inA', pidAlive: () => true });
  A.eq(inertA.acquire(root).ok, true, 'inert-boot holder claims');
  const inertB = makeWorkspaceOwner({ fs, path, pid: 41014, now: () => Date.now(), nonce: () => 'inB', pidAlive: () => true });
  A.eq(inertB.acquire(root).code, 'WORKSPACE_BUSY', 'with no boot time a live PID is busy (no guessing)');
  inertA.release();

  // A handled write error is not a crash. Leaving the O_EXCL file behind would create a malformed same-boot
  // claim that no later sidecar can prove stale, permanently wedging the workspace until the next OS reboot.
  const failingFs = Object.create(fs);
  failingFs.writeSync = function (fd, raw) {
    fs.writeSync(fd, String(raw).slice(0, 1));
    const error = new Error('simulated owner stamp write failure'); error.code = 'EIO'; throw error;
  };
  const failedClaim = makeWorkspaceOwner({ fs: failingFs, path, pid: 41015, now: () => BOOT + 40_000,
    nonce: () => 'failed-write', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(failedClaim.acquire(root).code, 'WORKSPACE_OWNER_UNAVAILABLE', 'owner stamp write failure is reported');
  A.eq(fs.existsSync(lockfile), false, 'a handled owner stamp write failure removes its partial claim');
  const afterFailedWrite = makeWorkspaceOwner({ fs, path, pid: 41016, now: () => BOOT + 41_000,
    nonce: () => 'after-failed-write', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(afterFailedWrite.acquire(root).ok, true, 'the next sidecar can acquire without waiting for a reboot');
  afterFailedWrite.release();

  // Read-back is part of claim creation too. If it rejects after O_EXCL + fsync, this process still owns the
  // unaccepted file and must remove it; otherwise the malformed/unverifiable same-boot claim wedges the root.
  const unreadableFs = Object.create(fs);
  let rejectOwnerRead = true;
  unreadableFs.readFileSync = function (file, encoding) {
    if (rejectOwnerRead && path.resolve(String(file)) === path.resolve(lockfile)) {
      rejectOwnerRead = false;
      const error = new Error('simulated owner stamp read-back failure'); error.code = 'EIO'; throw error;
    }
    return fs.readFileSync(file, encoding);
  };
  const unreadableClaim = makeWorkspaceOwner({ fs: unreadableFs, path, pid: 41017, now: () => BOOT + 42_000,
    nonce: () => 'failed-readback', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(unreadableClaim.acquire(root).code, 'WORKSPACE_OWNER_UNAVAILABLE', 'owner stamp read-back failure is reported');
  A.eq(fs.existsSync(lockfile), false, 'a rejected owner stamp read-back removes its unaccepted claim');
  const afterFailedRead = makeWorkspaceOwner({ fs, path, pid: 41018, now: () => BOOT + 43_000,
    nonce: () => 'after-failed-readback', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(afterFailedRead.acquire(root).ok, true, 'the next sidecar can acquire after a read-back failure');
  afterFailedRead.release();

  const mismatchedFs = Object.create(fs);
  let mismatchOwnerRead = true;
  mismatchedFs.readFileSync = function (file, encoding) {
    const raw = fs.readFileSync(file, encoding);
    if (mismatchOwnerRead && path.resolve(String(file)) === path.resolve(lockfile)) {
      mismatchOwnerRead = false;
      return String(raw) + ' ';
    }
    return raw;
  };
  const mismatchedClaim = makeWorkspaceOwner({ fs: mismatchedFs, path, pid: 41019, now: () => BOOT + 44_000,
    nonce: () => 'mismatched-readback', pidAlive: () => true, bootedAt: () => BOOT });
  A.eq(mismatchedClaim.acquire(root).code, 'WORKSPACE_OWNER_UNAVAILABLE', 'owner stamp read-back mismatch is reported');
  A.eq(fs.existsSync(lockfile), false, 'a mismatched owner stamp removes its unaccepted claim');

  /* PID REUSE WITHIN ONE BOOT (soak 2026-10-15). A hard-killed sidecar left its claim; Windows later gave its PID
     (43136) to an unrelated cmd.exe. kill(0) said "alive", every boot exited 73 WORKSPACE_BUSY and the crash-loop
     breaker parked the station in a degraded hold. The OS records when the PID's CURRENT process was created: a
     process created after the claim was stamped cannot be the process that stamped it. Identity probes are
     injected here (the real ones are exercised against real processes below). */
  const REUSE_ROOT = path.join(root, 'reuse');
  fs.mkdirSync(REUSE_ROOT, { recursive: true });
  const reuseLock = path.join(REUSE_ROOT, '.starnet-workspace-owner.json');
  const STAMP = 1792053050470;   // the soak holder's stamp (08:30:50Z)
  const NODE_EXE = 'C:\\Users\\andro\\AppData\\Local\\hermes\\node\\node.exe';
  const CMD_EXE = 'C:\\Windows\\system32\\cmd.exe';
  function identityOf(table, calls) {
    return {
      probe: pid => { if (calls) calls.push(pid); return table[pid] || { ok: false, reason: 'ESRCH' }; },
      self: () => null
    };
  }
  function stampHolder(holderPid, nonceTag) {
    const holder = makeWorkspaceOwner({ fs, path, pid: holderPid, now: () => STAMP, nonce: () => nonceTag, pidAlive: () => true });
    const claimed = holder.acquire(REUSE_ROOT);
    A.eq(claimed.ok, true, 'reuse fixture: holder ' + holderPid + ' claims');
    // the uncatchable kill: no release(); the claim + its election ticket stay behind
    return holder;
  }
  function contender(pidValue, table, calls, extra) {
    return makeWorkspaceOwner(Object.assign({ fs, path, pid: pidValue, now: () => STAMP + 3_600_000,
      nonce: (() => { let n = 0; return () => 'contender-' + pidValue + '-' + (++n); })(),
      pidAlive: () => true, processIdentity: identityOf(table, calls) }, extra || {}));
  }
  function resetReuseRoot() { fs.rmSync(REUSE_ROOT, { recursive: true, force: true }); fs.mkdirSync(REUSE_ROOT, { recursive: true }); }

  // 1. same PID, LATER process start (the soak shape: cmd.exe created 31 min after the stamp) -> stale -> boot proceeds
  stampHolder(43136, 'soak-holder');
  const reuseCalls = [];
  const afterReuse = contender(50616, { 43136: { ok: true, startedAt: STAMP + 31 * 60_000, executable: CMD_EXE } }, reuseCalls);
  const reclaimedReuse = afterReuse.acquire(REUSE_ROOT);
  A.eq(reclaimedReuse.ok, true, 'a live PID whose process started after the claim was stamped is a reused PID: the boot proceeds');
  A.eq(JSON.parse(fs.readFileSync(reuseLock, 'utf8')).pid, 50616, 'the booting sidecar now owns the workspace');
  A.ok(reuseCalls.indexOf(43136) >= 0, 'the stamped PID was identity-probed, not guessed');
  afterReuse.release();

  // 2. same PID, process started BEFORE its own claim (the genuine live holder) -> busy, with the evidence attached
  resetReuseRoot();
  stampHolder(43137, 'live-holder');
  const liveTable = { 43137: { ok: true, startedAt: STAMP - 1_500, executable: NODE_EXE } };
  const blockedLive = contender(50617, liveTable).acquire(REUSE_ROOT);
  A.eq(blockedLive.code, 'WORKSPACE_BUSY', 'a live holder whose process predates its claim still blocks a second sidecar');
  A.eq(blockedLive.identity && blockedLive.identity.verdict, 'same-process', 'the refusal says the holder process was identified as the claimant');
  A.eq(JSON.parse(fs.readFileSync(reuseLock, 'utf8')).pid, 43137, 'the live holder claim is untouched');

  // 3. dead PID -> stale, without spawning an identity probe at all
  const deadCalls = [];
  const afterDeath = contender(50618, {}, deadCalls, { pidAlive: () => false });
  A.eq(afterDeath.acquire(REUSE_ROOT).ok, true, 'a dead holder PID is reclaimed exactly as before');
  A.eq(deadCalls.length, 0, 'a PID proven dead by kill(0) needs no identity probe');
  afterDeath.release();

  // 4. identity unknown (access denied, probe tool missing, timeout) -> busy: never fail open
  resetReuseRoot();
  stampHolder(43138, 'unknown-holder');
  const blockedUnknown = contender(50619, { 43138: { ok: false, reason: 'EACCES' } }).acquire(REUSE_ROOT);
  A.eq(blockedUnknown.code, 'WORKSPACE_BUSY', 'an unreadable process start time is treated as a live owner');
  A.eq(blockedUnknown.identity && blockedUnknown.identity.verdict, 'unknown', 'the refusal says the identity could not be proven');
  A.eq(blockedUnknown.identity && blockedUnknown.identity.reason, 'EACCES', 'and why');
  const throwingProbe = contender(50628, {}, null, { processIdentity: { probe: () => { throw new Error('probe exploded'); }, self: () => null } });
  const blockedThrow = throwingProbe.acquire(REUSE_ROOT);
  A.eq(blockedThrow.code, 'WORKSPACE_BUSY', 'a throwing identity probe is an unknown identity: still busy, boot not aborted');
  A.eq(blockedThrow.identity && blockedThrow.identity.reason, 'probe exploded', 'the probe failure is named');
  const { describeIdentity } = require('../sidecar/workspace-owner.js');
  A.eq(describeIdentity(blockedLive.identity), 'PID 43137 started 2026-10-15T08:30:48.970Z; its claim was stamped ' +
    '2026-10-15T08:30:50.470Z — not provably a different process, treated as a live owner', 'the boot refusal line states the evidence it had');
  A.eq(describeIdentity(blockedUnknown.identity), 'PID 43138 is running but its start time could not be read (EACCES) — treated as a live owner',
    'an unknown identity is reported as unknown, never as a confirmed owner');

  // 5. a later start inside the clock-skew slack with the SAME executable is not proof of reuse
  resetReuseRoot();
  stampHolder(43139, 'skew-holder');
  A.eq(contender(50620, { 43139: { ok: true, startedAt: STAMP + 30_000, executable: NODE_EXE } }).acquire(REUSE_ROOT).code,
    'WORKSPACE_BUSY', 'a start time 30s after the stamp with the same executable stays busy (clock skew is not death)');
  // 6. ...but a different executable corroborates it once the start is clearly after the stamp
  const exeReuse = contender(50621, { 43139: { ok: true, startedAt: STAMP + 30_000, executable: CMD_EXE } });
  A.eq(exeReuse.acquire(REUSE_ROOT).ok, true, 'a later start plus a different executable proves an early PID reuse');
  exeReuse.release();
  // 7. a different executable alone (start within 2s of the stamp) never proves anything
  resetReuseRoot();
  stampHolder(43140, 'exe-only-holder');
  A.eq(contender(50622, { 43140: { ok: true, startedAt: STAMP + 1_000, executable: CMD_EXE } }).acquire(REUSE_ROOT).code,
    'WORKSPACE_BUSY', 'an executable mismatch without start-time evidence stays busy');
  A.eq(contender(50623, { 43140: { ok: true, startedAt: STAMP + 31 * 60_000 } }).acquire(REUSE_ROOT).ok, true,
    'a clearly later start proves reuse even when the executable is unreadable');
  fs.rmSync(reuseLock, { force: true });

  // 8. the election ticket alone (soak 09:30:44: the primary claim had been moved aside, "holder PID unverified")
  resetReuseRoot();
  stampHolder(43141, 'ticket-holder');
  fs.renameSync(reuseLock, reuseLock + '.moved-aside');
  const ticketOnly = contender(50624, { 43141: { ok: true, startedAt: STAMP + 31 * 60_000, executable: CMD_EXE } });
  A.eq(ticketOnly.acquire(REUSE_ROOT).ok, true, 'a reused PID on the latest election ticket no longer wedges the election');
  ticketOnly.release();

  // 9. Linux shape: exact (pid, start ticks) identity stamped from /proc/self/stat
  resetReuseRoot();
  const linuxHolder = makeWorkspaceOwner({ fs, path, pid: 43142, now: () => STAMP, nonce: () => 'linux-holder', pidAlive: () => true,
    processIdentity: { probe: () => ({ ok: false, reason: 'unused' }), self: () => ({ startTicks: '777001' }) } });
  A.eq(linuxHolder.acquire(REUSE_ROOT).ok, true, 'linux fixture: holder claims with its start ticks');
  A.eq(JSON.parse(fs.readFileSync(reuseLock, 'utf8')).startTicks, '777001', 'the claim carries the holder start ticks');
  A.eq(contender(50625, { 43142: { ok: true, startTicks: '777001' } }).acquire(REUSE_ROOT).code, 'WORKSPACE_BUSY',
    'identical start ticks = the same process = busy');
  const linuxReuse = contender(50626, { 43142: { ok: true, startTicks: '912345' } });
  A.eq(linuxReuse.acquire(REUSE_ROOT).ok, true, 'different start ticks on the same PID = reused = boot proceeds');
  linuxReuse.release();

  // 10. the factory default stays inert: no processIdentity -> a live PID is busy, nothing is probed
  resetReuseRoot();
  stampHolder(43143, 'inert-holder');
  const inertReuse = makeWorkspaceOwner({ fs, path, pid: 50627, now: () => STAMP + 3_600_000, nonce: () => 'inert-contender', pidAlive: () => true });
  const inertBusy = inertReuse.acquire(REUSE_ROOT);
  A.eq(inertBusy.code, 'WORKSPACE_BUSY', 'without an injected identity probe a live PID still blocks (opt-in like bootedAt)');
  A.eq(inertBusy.identity, null, 'and no identity verdict is claimed');
  resetReuseRoot();

  /* The probes themselves (sidecar/process-identity.js). Parsers first, then the real OS probe against real
     processes on whatever platform runs this test. */
  const { makeProcessIdentity, _internals: PI } = require('../sidecar/process-identity.js');
  A.eq(PI.parseWin32('134365335305662822|C:\\Users\\x\\node.exe\r\n'),
    { startedAt: 1792059930566, executable: 'C:\\Users\\x\\node.exe' }, 'win32: creation FILETIME (UTC) -> epoch ms + image path');
  A.eq(PI.parseWin32('134365335305662822|'), { startedAt: 1792059930566, executable: '' }, 'win32: an unreadable image path stays empty');
  A.eq(PI.parseWin32(''), null, 'win32: empty output is no evidence');
  A.eq(PI.parseWin32('Exception calling GetProcessById|x'), null, 'win32: error text is no evidence');
  A.eq(PI.parseLstart('Wed Oct 15 08:30:50 2026 /usr/local/bin/node\n'),
    { startedAt: Date.UTC(2026, 9, 15, 8, 30, 50), executable: '/usr/local/bin/node' }, 'darwin: ps lstart (TZ=UTC) + comm');
  A.eq(PI.parseLstart('Thu Oct  1 07:05:09 2026   /Applications/My App.app/Contents/MacOS/node\n'),
    { startedAt: Date.UTC(2026, 9, 1, 7, 5, 9), executable: '/Applications/My App.app/Contents/MacOS/node' }, 'darwin: padded day, spaced path');
  A.eq(PI.parseLstart('  PID STARTED\n'), null, 'darwin: anything but a start time is no evidence');
  const statLine = '4242 (we ird) name) S ' + Array.from({ length: 18 }, (_, i) => String(i + 1)).join(' ') + ' 777001 4096 99';
  A.eq(PI.parseProcStat(statLine), '777001', 'linux: field 22 counted from the LAST ")" (comm may hold spaces and parens)');
  A.eq(PI.parseProcStat('garbage'), '', 'linux: an unparseable stat is no evidence');

  const winCalls = [];
  const fakeWin = makeProcessIdentity({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    spawnSync: (file, args, opts) => { winCalls.push({ file, args, opts }); return { status: 0, stdout: '134365335305662822|C:\\Windows\\system32\\cmd.exe\r\n', stderr: '' }; } });
  A.eq(fakeWin.probe(43136), { ok: true, startedAt: 1792059930566, executable: 'C:\\Windows\\system32\\cmd.exe' }, 'win32 probe returns the creation time');
  A.ok(winCalls[0] && /powershell\.exe$/i.test(winCalls[0].file) && winCalls[0].args.join(' ').includes('Get-Process -Id 43136;'),
    'win32 probe asks Windows PowerShell for exactly that PID');
  A.ok(winCalls[0] && winCalls[0].opts.windowsHide === true && winCalls[0].opts.timeout > 0, 'win32 probe is hidden and time-bounded');
  A.eq(fakeWin.probe('1); Remove-Item C:\\ -Recurse; ('), { ok: false, reason: 'invalid pid' }, 'a non-integer pid is refused before any spawn');
  A.eq(winCalls.length, 1, 'no probe process for a non-integer pid');
  A.eq(fakeWin.self(), null, 'win32 stamps no extra identity (the wall-clock stamp is compared)');
  const failedWin = makeProcessIdentity({ platform: 'win32', env: {},
    spawnSync: () => ({ status: 1, stdout: '', stderr: 'Get-Process : Cannot find a process with the process identifier 43136.\r\nAt line:1' }) });
  A.eq(failedWin.probe(43136).ok, false, 'a failed win32 probe is unknown, never evidence');
  A.ok(/Cannot find a process/.test(failedWin.probe(43136).reason), 'and it carries the first stderr line as the reason');
  const missingPs = makeProcessIdentity({ platform: 'win32', env: {}, spawnSync: () => ({ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) }) });
  A.eq(missingPs.probe(43136), { ok: false, reason: 'ENOENT' }, 'a missing PowerShell is unknown');
  const macCalls = [];
  const fakeMac = makeProcessIdentity({ platform: 'darwin', env: { PATH: '/usr/bin', STARNET_API_TOKEN: 'secret-token-value' },
    spawnSync: (file, args, opts) => { macCalls.push({ file, args, opts }); return { status: 0, stdout: 'Wed Oct 15 09:01:52 2026 /bin/zsh\n', stderr: '' }; } });
  A.eq(fakeMac.probe(43136), { ok: true, startedAt: Date.UTC(2026, 9, 15, 9, 1, 52), executable: '/bin/zsh' }, 'darwin probe returns the creation time');
  A.ok(macCalls[0] && macCalls[0].file === '/bin/ps' && macCalls[0].args.join(' ') === '-o lstart= -o comm= -p 43136', 'darwin probe runs ps for exactly that PID');
  A.ok(macCalls[0] && macCalls[0].opts.env.TZ === 'UTC' && macCalls[0].opts.env.LC_ALL === 'C', 'darwin probe pins TZ=UTC and the C locale');
  A.ok(macCalls[0] && !('STARNET_API_TOKEN' in macCalls[0].opts.env), 'darwin probe does not hand station secrets to ps');
  const procFiles = { '/proc/43136/stat': '43136 (bash) S ' + Array.from({ length: 18 }, () => '0').join(' ') + ' 912345 1',
    '/proc/self/stat': '777 (node) R ' + Array.from({ length: 18 }, () => '0').join(' ') + ' 777001 1' };
  const fakeLinux = makeProcessIdentity({ platform: 'linux',
    readFileSync: file => { if (procFiles[file] == null) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return procFiles[file]; } });
  A.eq(fakeLinux.probe(43136), { ok: true, startTicks: '912345' }, 'linux probe reads the start ticks');
  A.eq(fakeLinux.probe(43137), { ok: false, reason: 'ENOENT' }, 'linux: a vanished /proc entry is unknown');
  A.eq(fakeLinux.self(), { startTicks: '777001' }, 'linux stamps its own exact start ticks');
  A.eq(makeProcessIdentity({ platform: 'aix', spawnSync: () => { throw new Error('must not spawn'); } }).probe(43136).ok, false,
    'an unsupported platform is unknown');

  // REAL probes, real processes (this platform). The owner below runs with the host's real identity + kill(0).
  if (['win32', 'darwin', 'linux'].indexOf(process.platform) >= 0) {
    const { spawn, spawnSync } = require('node:child_process');
    const real = makeProcessIdentity();
    const mine = real.probe(process.pid);
    A.eq(mine.ok, true, 'real probe reads this test process (' + process.platform + '): ' + JSON.stringify(mine));
    if (process.platform === 'linux') {
      A.eq(real.self(), { startTicks: mine.startTicks }, 'real linux self() stamps the same ticks the probe reads');
    } else {
      const earliest = Date.now() - process.uptime() * 1000 - 5_000;
      A.ok(mine.startedAt >= earliest && mine.startedAt <= Date.now(), 'real probe start time is when this process began (' + mine.startedAt + ')');
      if (process.platform === 'win32') {
        A.eq(path.basename(String(mine.executable)).toLowerCase(), path.basename(process.execPath).toLowerCase(), 'real win32 probe names this executable');
      }
    }
    const exited = spawnSync(process.execPath, ['-e', '0'], { windowsHide: true });
    A.eq(real.probe(exited.pid).ok, false, 'real probe of an exited PID is unknown, never a start time');

    const live = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
    try {
      const liveStamp = { self: () => (process.platform === 'linux' ? { startTicks: real.probe(live.pid).startTicks } : null), probe: real.probe };
      // genuine holder: the process exists, THEN stamps its claim
      resetReuseRoot();
      const genuine = makeWorkspaceOwner({ fs, path, pid: live.pid, now: () => Date.now(), nonce: () => 'real-genuine', processIdentity: liveStamp });
      A.eq(genuine.acquire(REUSE_ROOT).ok, true, 'real fixture: a live process holds the claim');
      const second = makeWorkspaceOwner({ fs, path, now: () => Date.now(), nonce: () => 'real-second', processIdentity: real });
      const refusedReal = second.acquire(REUSE_ROOT);
      A.eq(refusedReal.code, 'WORKSPACE_BUSY', 'REAL: a second sidecar is refused while the genuine holder process lives');
      A.eq(refusedReal.identity && refusedReal.identity.verdict, 'same-process', 'REAL: the refusal identified the holder as its claimant');
      // reused PID: the claim was stamped 31 minutes before the process now holding that PID was created (soak shape)
      resetReuseRoot();
      const crashed = makeWorkspaceOwner({ fs, path, pid: live.pid, now: () => Date.now() - 31 * 60_000, nonce: () => 'real-crashed',
        processIdentity: { probe: real.probe, self: () => (process.platform === 'linux' ? { startTicks: '1' } : null) } });
      A.eq(crashed.acquire(REUSE_ROOT).ok, true, 'real fixture: a long-dead holder stamped this PID');
      const booting = makeWorkspaceOwner({ fs, path, now: () => Date.now(), nonce: () => 'real-booting', processIdentity: real });
      const bootedReal = booting.acquire(REUSE_ROOT);
      A.eq(bootedReal.ok, true, 'REAL: a claim whose PID now belongs to a newer, unrelated process is reclaimed and the boot proceeds');
      A.eq(JSON.parse(fs.readFileSync(reuseLock, 'utf8')).pid, process.pid, 'REAL: the booting process owns the workspace');
      booting.release();
      // the recycled PID is the booting sidecar's OWN pid (the shell reaped an orphan and Windows handed its PID to
      // the next spawn): kill(0) on itself always says alive, so only the identity proves the old claim dead
      resetReuseRoot();
      const ownPidGhost = makeWorkspaceOwner({ fs, path, now: () => Date.now() - 31 * 60_000, nonce: () => 'real-own-ghost',
        processIdentity: { probe: real.probe, self: () => (process.platform === 'linux' ? { startTicks: '1' } : null) } });
      A.eq(ownPidGhost.acquire(REUSE_ROOT).ok, true, 'real fixture: a dead holder stamped the PID this process now has');
      const reborn = makeWorkspaceOwner({ fs, path, now: () => Date.now(), nonce: () => 'real-reborn', processIdentity: real });
      A.eq(reborn.acquire(REUSE_ROOT).ok, true, 'REAL: a claim stamped with our own PID before this process existed is reclaimed');
      reborn.release();
    } finally {
      live.kill();
    }
  }

  A.report('workspace-owner.test');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
