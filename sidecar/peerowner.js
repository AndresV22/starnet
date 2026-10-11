/* sidecar/peerowner.js — WHO is on the other end of a loopback connection? (2026-10-10 security pass)

   Why this exists. The served page (`GET /`) carries the per-launch master token so the browser UI, the `starnet`
   CLI and the ACP/MCP bridges can authenticate. Loopback TCP has NO per-user access control: any process on the
   machine — including one running under a DIFFERENT OS account (a second Windows user, a sandbox account, another
   login on a shared Linux box) — could connect, read the page and act as the owner. The Host pin and Origin list
   stop websites; they never stopped other local accounts.

   The fix is the loopback equivalent of SO_PEERCRED: before the token is put into a response, find the process
   that owns the CLIENT end of this TCP connection and require that it runs as the same OS user as the sidecar.
     win32  : `netstat -ano` maps the client's (address, port) to a PID; `tasklist /FI "PID eq N" /FI "USERNAME eq
              <us>"` lists it only when it is ours (a non-admin cannot even read another account's process owner,
              so a foreign process never matches).
     linux  : /proc/net/tcp{,6} carries the owning uid of every socket directly.
     darwin : `lsof -F pu` on the client port; lsof run as a non-root user cannot see another user's sockets, so a
              foreign client yields no row.
   FAIL CLOSED: anything we cannot prove (lookup error, timeout, connection not found, unknown platform) withholds
   the token — the page still loads, it just cannot drive the station. STARNET_TRUST_LOCAL_PEERS=1 is the owner's
   explicit escape hatch for an environment where the lookup cannot work (set in the owner's own process env —
   nothing a local stranger can reach).

   What this does NOT claim: a process running as the SAME user (including a command an agent was allowed to run)
   still passes. Same-user isolation is the OS's job (see apiauth.js THREAT MODEL).

     parseNetstatPid(text, { clientAddress, clientPort, serverPort }) -> pid | null
     tasklistListsPid(text, pid) -> boolean
     parseProcNetTcpUid(text, { clientPort, serverPort }) -> uid | null
     parseLsofOwners(text, selfPid) -> [{ pid, uid }]
     makePeerOwnerCheck(deps) -> async ({ remoteAddress, remotePort, localPort }) -> { ok, reason, pid? } */
'use strict';

const LOOPBACK_V4_HEX = '0100007F';   // 127.0.0.1 as /proc/net/tcp prints it (little-endian)

function normAddr(a) {
  let s = String(a || '').trim();
  if (/^::ffff:/i.test(s)) s = s.slice(7);   // an IPv4-mapped peer on a dual-stack socket
  return s;
}
function endpointOf(addr, port) {
  const a = normAddr(addr);
  return (a.indexOf(':') >= 0 ? '[' + a + ']' : a) + ':' + Number(port);
}
// netstat prints `  TCP    127.0.0.1:52345   127.0.0.1:8787   ESTABLISHED   1234` — the state column is localized on
// some Windows builds, so only the two endpoints and the trailing PID are read.
function parseNetstatPid(text, q) {
  const local = endpointOf(q.clientAddress, q.clientPort).toLowerCase();
  const tail = ':' + Number(q.serverPort);
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].trim().split(/\s+/);
    if (f.length < 4 || !/^tcp/i.test(f[0])) continue;
    if (String(f[1]).toLowerCase() !== local) continue;
    if (String(f[2]).slice(-tail.length) !== tail) continue;
    const pid = Number(f[f.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}
// tasklist /FO CSV /NH prints `"node.exe","1234","Console","1","50,212 K"` per match, or an INFO line (localized)
// when nothing matched — so a match is a CSV row whose second field is exactly the PID.
function tasklistListsPid(text, pid) {
  const want = '"' + Number(pid) + '"';
  return String(text || '').split(/\r?\n/).some(l => { const f = l.split(','); return f.length > 2 && f[1] === want; });
}
function hexPort(p) { return ('0000' + Number(p).toString(16).toUpperCase()).slice(-4); }
// /proc/net/tcp row: `sl local_address rem_address st tx:rx tr:tm retrnsmt uid ...`, addresses as HEXADDR:HEXPORT.
// The client end is the row whose LOCAL port is the client's port and whose REMOTE port is ours, on loopback.
function parseProcNetTcpUid(text, q) {
  const cp = hexPort(q.clientPort), sp = hexPort(q.serverPort);
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].trim().split(/\s+/);
    if (f.length < 8) continue;
    const loc = String(f[1]).toUpperCase().split(':'), rem = String(f[2]).toUpperCase().split(':');
    if (loc.length !== 2 || rem.length !== 2 || loc[1] !== cp || rem[1] !== sp) continue;
    const a = loc[0];
    const loopback = a === LOOPBACK_V4_HEX || a.slice(-8) === LOOPBACK_V4_HEX || a === '00000000000000000000000001000000';
    if (!loopback) continue;
    const uid = Number(f[7]);
    if (Number.isInteger(uid) && uid >= 0) return uid;
  }
  return null;
}
// `lsof -F pu` prints a `p<pid>` line then a `u<uid>` line per process (plus `f…` lines we ignore).
function parseLsofOwners(text, selfPid) {
  const out = []; let cur = null;
  String(text || '').split(/\r?\n/).forEach(l => {
    if (l.charAt(0) === 'p') { cur = { pid: Number(l.slice(1)), uid: null }; out.push(cur); }
    else if (l.charAt(0) === 'u' && cur) cur.uid = Number(l.slice(1));
  });
  return out.filter(r => Number.isInteger(r.pid) && r.pid !== Number(selfPid) && Number.isInteger(r.uid));
}

/* deps: { platform, run(exe, args) -> Promise<{ ok, stdout }>, readFile(path) -> Promise<string>, selfPid, uid,
           winUser, winSystemDir, trustAll, now, cacheMs }
   A positive verdict is cached per client PID for cacheMs (a page load fetches `/` more than once) — never a
   negative one, so a refused stranger cannot poison the owner's next load. */
function makePeerOwnerCheck(deps) {
  const d = deps || {};
  const platform = d.platform || process.platform;
  // the clock is injected (index.js passes the host's): without one there is no cache — every load is checked
  const now = typeof d.now === 'function' ? d.now : null;
  const cacheMs = !now ? 0 : (d.cacheMs == null ? 15000 : d.cacheMs);
  const okPids = new Map();
  function remember(pid) { if (cacheMs > 0 && pid) okPids.set(pid, now() + cacheMs); }
  function cached(pid) { const t = okPids.get(pid); if (t && t > now()) return true; if (t) okPids.delete(pid); return false; }

  async function win(q) {
    const sys = d.winSystemDir || 'C:\\Windows\\System32';
    const ns = await d.run(sys + '\\netstat.exe', ['-ano']);
    if (!ns || !ns.ok) return { ok: false, reason: 'lookup-failed' };
    const pid = parseNetstatPid(ns.stdout, q);
    if (!pid) return { ok: false, reason: 'peer-not-found' };
    if (pid === Number(d.selfPid) || cached(pid)) return { ok: true, reason: 'same-user', pid };
    if (!d.winUser) return { ok: false, reason: 'lookup-failed', pid };
    const tl = await d.run(sys + '\\tasklist.exe', ['/FI', 'PID eq ' + pid, '/FI', 'USERNAME eq ' + d.winUser, '/FO', 'CSV', '/NH']);
    if (!tl || !tl.ok) return { ok: false, reason: 'lookup-failed', pid };
    if (!tasklistListsPid(tl.stdout, pid)) return { ok: false, reason: 'other-user', pid };
    remember(pid);
    return { ok: true, reason: 'same-user', pid };
  }
  async function linux(q) {
    let uid = null;
    for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
      let t = ''; try { t = await d.readFile(f); } catch (_) { t = ''; }
      uid = parseProcNetTcpUid(t, q);
      if (uid != null) break;
    }
    if (uid == null) return { ok: false, reason: 'peer-not-found' };
    return uid === Number(d.uid) ? { ok: true, reason: 'same-user' } : { ok: false, reason: 'other-user' };
  }
  async function darwin(q) {
    const r = await d.run('/usr/sbin/lsof', ['-nP', '-iTCP:' + Number(q.clientPort), '-sTCP:ESTABLISHED', '-F', 'pu']);
    // lsof exits 1 when it lists nothing — that is "no visible owner", not a tool failure
    const rows = parseLsofOwners(r && r.stdout, d.selfPid);
    if (!rows.length) return { ok: false, reason: (r && (r.ok || r.code === 1)) ? 'peer-not-found' : 'lookup-failed' };
    return rows.every(x => x.uid === Number(d.uid)) ? { ok: true, reason: 'same-user', pid: rows[0].pid } : { ok: false, reason: 'other-user', pid: rows[0].pid };
  }

  return async function check(q) {
    if (d.trustAll) return { ok: true, reason: 'trusted-by-env' };
    const query = { clientAddress: q && q.remoteAddress, clientPort: q && q.remotePort, serverPort: q && q.localPort };
    if (!query.clientPort || !query.serverPort) return { ok: false, reason: 'peer-not-found' };
    try {
      if (platform === 'win32') return await win(query);
      if (platform === 'linux') return await linux(query);
      if (platform === 'darwin') return await darwin(query);
      return { ok: false, reason: 'unsupported-platform' };
    } catch (_) { return { ok: false, reason: 'lookup-failed' }; }
  };
}

module.exports = { makePeerOwnerCheck, parseNetstatPid, tasklistListsPid, parseProcNetTcpUid, parseLsofOwners, endpointOf };
