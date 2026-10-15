/* sidecar/process-identity.js — is the process that holds a PID today the one that stamped a claim?

   process.kill(pid, 0) proves only that SOME process holds a PID. Windows recycles PIDs within one boot, so a
   claim orphaned by an uncatchable kill can name a PID that later belongs to an unrelated program. The 2026-10-15
   soak hit it: sidecar 43136 stamped its workspace-owner claim at 08:30:50Z, was hard-killed, and cmd.exe got
   PID 43136 at 09:01:52Z. Every later boot read "alive", exited 73 WORKSPACE_BUSY, and the crash-loop breaker
   parked the station in a degraded hold.

   This module reads the OS's own record of when a PID's CURRENT process was created:
     win32  — (Get-Process -Id pid).StartTime.ToFileTimeUtc(): the kernel creation FILETIME, fixed at creation.
              .NET's local-time round trip keeps the DST-ambiguous hour exact (checked on Windows PowerShell 5.1).
     darwin — `ps -o lstart= -o comm= -p <pid>` under TZ=UTC / LC_ALL=C: XNU's p_start, a wall-clock time set at
              fork and never re-derived. Second precision (truncated, so it can only read EARLIER, never later).
     linux  — /proc/<pid>/stat field 22: start time in clock ticks since boot. Linux re-derives wall-clock start
              times from the CURRENT boot time, which moves when the clock is stepped, so a wall-clock
              comparison could misjudge a live holder after an NTP step. Linux therefore compares the exact tick
              value the holder stamped from /proc/self/stat: (pid, start ticks) names one process within a boot.
   Every failure (no such process, access denied, missing tool, timeout, unparseable output, other platform)
   returns { ok: false, reason }. Callers must read that as UNKNOWN, i.e. still a live owner.

   makeProcessIdentity({ platform?, spawnSync?, readFileSync?, env?, timeoutMs? }) ->
     probe(pid) -> { ok: true, startedAt?: epochMs, startTicks?: string, executable?: string } | { ok: false, reason }
     self()     -> { startTicks: string } | null       identity fields this process stamps into its own claims */
'use strict';

const FILETIME_UNIX_EPOCH = BigInt('116444736000000000');   // 1601-01-01 → 1970-01-01 in 100 ns units
const FILETIME_PER_MS = BigInt(10000);
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DEFAULT_TIMEOUT_MS = 10000;

function validPid(pid) {
  const n = Number(pid);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

// "<FILETIME UTC>|<executable path>" (the win32 probe's one output line) -> { startedAt, executable } | null
function parseWin32(stdout) {
  const line = String(stdout == null ? '' : stdout).split(/\r?\n/).find(l => l.trim()) || '';
  const m = /^\s*(\d{15,20})\|(.*?)\s*$/.exec(line);
  if (!m) return null;
  const startedAt = Number((BigInt(m[1]) - FILETIME_UNIX_EPOCH) / FILETIME_PER_MS);
  if (!(startedAt > 0)) return null;
  return { startedAt, executable: m[2] };
}

// "Wed Oct 15 08:30:50 2026 /usr/local/bin/node" (ps lstart under TZ=UTC + comm) -> { startedAt, executable } | null
function parseLstart(stdout) {
  const line = String(stdout == null ? '' : stdout).split(/\r?\n/).find(l => l.trim()) || '';
  const m = /^\s*[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})(?:\s+(.*?))?\s*$/.exec(line);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month == null) return null;
  const startedAt = Date.UTC(Number(m[6]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  if (!(startedAt > 0)) return null;
  return { startedAt, executable: m[7] || '' };
}

// /proc/<pid>/stat -> field 22 (starttime, clock ticks since boot) as a decimal string | ''. comm (field 2) may
// itself contain spaces and parentheses, so fields are counted from the LAST ')'.
function parseProcStat(text) {
  const raw = String(text == null ? '' : text);
  const close = raw.lastIndexOf(')');
  if (close < 0) return '';
  const fields = raw.slice(close + 1).trim().split(/\s+/);   // fields[0] is field 3 (state)
  const ticks = fields[19];
  return /^\d+$/.test(String(ticks || '')) ? String(ticks) : '';
}

function makeProcessIdentity(deps) {
  const d = deps || {};
  const platform = String(d.platform || (typeof process !== 'undefined' ? process.platform : ''));
  const timeoutMs = Number(d.timeoutMs) > 0 ? Number(d.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const env = d.env || (typeof process !== 'undefined' ? process.env : {});
  let spawnSync = d.spawnSync;
  if (typeof spawnSync !== 'function' && platform !== 'linux') {
    spawnSync = require('./child-env.js').guardChildProcess(require('node:child_process')).spawnSync;
  }
  const readFileSync = typeof d.readFileSync === 'function' ? d.readFileSync : require('node:fs').readFileSync;

  function run(file, args, options) {
    const result = spawnSync(file, args, Object.assign({ encoding: 'utf8', timeout: timeoutMs, windowsHide: true }, options || {}));
    if (!result) return { ok: false, reason: 'no result' };
    if (result.error) return { ok: false, reason: String(result.error.code || result.error.message || 'spawn failed') };
    if (result.status !== 0) {
      const first = String(result.stderr || '').split(/\r?\n/).find(l => l.trim()) || ('exit ' + result.status);
      return { ok: false, reason: first.slice(0, 160) };
    }
    return { ok: true, stdout: String(result.stdout || '') };
  }

  function probeWin32(pid) {
    const root = String(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows');
    const exe = root + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    // pid is a validated integer, the only value interpolated into the script. Get-Process (not a static .NET
    // call) so the probe also runs under PowerShell's Constrained Language Mode; StartTime is null when the
    // process is not ours to query (protected/elevated), which is an unknown identity, never a guess.
    const script = "$ErrorActionPreference='Stop'; $p = Get-Process -Id " + pid + "; "
      + "if ($null -eq $p.StartTime) { throw 'start time unavailable' }; "
      + "$e = ''; try { $e = [string]$p.Path } catch { $e = '' }; "
      + "[string]$p.StartTime.ToFileTimeUtc() + '|' + $e";
    const out = run(exe, ['-NoProfile', '-NonInteractive', '-Command', script]);
    if (!out.ok) return out;
    const parsed = parseWin32(out.stdout);
    return parsed ? Object.assign({ ok: true }, parsed) : { ok: false, reason: 'unparseable start time' };
  }

  function probeDarwin(pid) {
    const out = run('/bin/ps', ['-o', 'lstart=', '-o', 'comm=', '-p', String(pid)],
      { env: require('./child-env.js').stationChildEnv(env, { TZ: 'UTC', LC_ALL: 'C', LANG: 'C' }) });
    if (!out.ok) return out;
    const parsed = parseLstart(out.stdout);
    return parsed ? Object.assign({ ok: true }, parsed) : { ok: false, reason: 'unparseable start time' };
  }

  function readTicks(which) {
    let text = '';
    try { text = readFileSync('/proc/' + which + '/stat', 'utf8'); }
    catch (error) { return { ok: false, reason: String((error && error.code) || 'unreadable') }; }
    const ticks = parseProcStat(text);
    return ticks ? { ok: true, startTicks: ticks } : { ok: false, reason: 'unparseable /proc stat' };
  }

  function probe(pid) {
    const n = validPid(pid);
    if (!n) return { ok: false, reason: 'invalid pid' };
    if (platform === 'win32') return probeWin32(n);
    if (platform === 'darwin') return probeDarwin(n);
    if (platform === 'linux') return readTicks(String(n));
    return { ok: false, reason: 'unsupported platform ' + platform };
  }

  function self() {
    if (platform !== 'linux') return null;
    const own = readTicks('self');
    return own.ok ? { startTicks: own.startTicks } : null;
  }

  return { probe, self };
}

module.exports = { makeProcessIdentity, _internals: { parseWin32, parseLstart, parseProcStat, validPid } };
