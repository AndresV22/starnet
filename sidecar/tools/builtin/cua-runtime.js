'use strict';

// Private native input transport. This is deliberately not an isolated MCP
// connector: the host must authorize computer.use before opening this runtime.
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { makeMcpClient } = require('../../mcp/client.js');
const { note: failNote } = require('../../failopen.js');

// The driver is an ALLOWLIST env on purpose: no provider key, launch token or
// station secret may reach a native process that drives the desktop. The list
// is runtime basics plus the Windows SYSTEM LOCATIONS a native GUI/GPU process
// resolves through the environment. Without ProgramData the GPU user-mode
// driver falls back to a RELATIVE "NVIDIA Corporation\umdlogs" in whatever
// folder the child inherited as cwd (reproduced 2026-10-11 with dxdiag under
// the old list); the stray "%SystemDrive%\ProgramData\Microsoft\Windows\Caches"
// folders are the same relative fallback. Locations and processor facts only —
// never a credential, never a user-defined variable.
const RUNTIME_ENV_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
const WINDOWS_SYSTEM_ENV_KEYS = ['SystemDrive', 'ProgramData', 'ALLUSERSPROFILE', 'PUBLIC',
  'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432',
  'ComSpec', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];
function childEnv(source = process.env) {
  const env = {};
  for (const key of [...RUNTIME_ENV_KEYS, ...WINDOWS_SYSTEM_ENV_KEYS]) {
    if (source[key] != null) env[key] = source[key];
  }
  env.CUA_DRIVER_RS_TELEMETRY_ENABLED = '0';
  return env;
}
// The driver never inherits the sidecar's cwd (on a user's machine: the install
// or project folder they launched from). It, and anything it opens, gets one
// stable private folder, so any native relative write lands there instead.
function driverCwd(tmp = os.tmpdir()) {
  const dir = path.join(tmp, 'starnet-cua');
  try { fs.mkdirSync(dir, { recursive: true }); return dir; }
  catch (error) { failNote('computer.runtime.cwd', error); return tmp; }
}
// The private cwd must not move the DRIVER itself: Windows resolves a relative
// spawn path against the child's cwd, so a relative STARNET_CUA_BINARY (or a
// dev-eval argv path) would stop resolving while computer-control's installed()
// / check() still find it from the sidecar cwd. Pin it to the sidecar cwd first:
// a path with a separator always, a bare name only when it sits there (the old
// lookup order); any other bare name keeps the PATH lookup.
function driverBinary(binary, base = process.cwd()) {
  if (typeof binary !== 'string' || !binary || path.isAbsolute(binary)) return binary;
  if (/[\\/]/.test(binary) || fs.existsSync(path.resolve(base, binary))) return path.resolve(base, binary);
  return binary;
}
function data(result) {
  const text = (result?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (result?.structuredContent) return { ...result.structuredContent,
    ...(result.isError && text ? { nativeMessage: text } : {}) };
  try { return JSON.parse(text); } catch { return { text }; }
}
async function connect({ binary: requested, signal, clock, timeoutMs = 20000 }) {
  if (!clock || typeof clock.now !== 'function') throw new Error('Computer runtime requires a host clock');
  if (signal?.aborted) throw new Error('Computer control cancelled');
  const env = childEnv();
  const binary = driverBinary(requested);
  const cwd = driverCwd();
  const socket = '\\\\.\\pipe\\starnet-cua-' + randomUUID();
  const session = 'starnet-' + randomUUID();
  let daemon, proxy, client, closed = false, closePromise, failure;
  const children = new Set();
  const launch = args => {
    const child = cp.spawn(binary, args, { env, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    child.stderr.resume(); // Never log desktop content or arbitrary native diagnostics.
    child.on('error', () => { failure = new Error('Computer driver could not start'); client?.close(failure.message); });
    child.on('exit', () => { children.delete(child); if (!closed) { failure = new Error('Computer driver exited'); client?.close(failure.message); } });
    return child;
  };
  function terminate() {
    for (const child of children) {
      // Never taskkill /T: apps opened for the user may be descendants. Only
      // these directly spawned driver/proxy processes belong to this runtime.
      child.kill();
    }
  }
  function close() {
    if (closePromise) return closePromise;
    closed = true;
    signal?.removeEventListener('abort', abort);
    client?.close('Computer control closed');
    closePromise = (async () => {
      // Graceful private-daemon shutdown also closes its UIA helper. This must
      // not close applications the Commander asked us to open.
      if (daemon) {
        try { await cli(['stop', '--socket', socket]); }
        catch { failNote('computer.runtime.stop', 'Private driver stop failed; terminating only owned processes'); }
      }
      terminate();
      await Promise.all([...children].map(child => new Promise(resolve => {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(resolve, 1000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      })));
    })();
    return closePromise;
  }
  const abort = () => { void close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const cli = args => new Promise((resolve, reject) => cp.execFile(binary, args, { env, cwd, windowsHide: true, timeout: 1500, maxBuffer: 65536 }, (err, out) => err ? reject(err) : resolve(out)));
  try {
    const manifest = JSON.parse(await cli(['manifest']));
    if (manifest.binary_version !== '0.28.2') throw new Error('CUA version mismatch; install the supported 0.28.2 driver in Abilities');
    if (closed || signal?.aborted) throw new Error('Computer control cancelled');
    daemon = launch(['serve', '--embedded', '--socket', socket, '--permission-mode', 'unrestricted', '--dangerously-bypass-approvals', '--no-overlay']);
    daemon.stdout.resume();
    const deadline = clock.now() + timeoutMs;
    for (;;) {
      if (closed || signal?.aborted) throw new Error('Computer control cancelled');
      if (failure) throw failure;
      try { await cli(['status', '--socket', socket]); break; }
      catch {
        if (clock.now() >= deadline) throw new Error('Computer driver startup timed out');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (closed) throw new Error('Computer control cancelled');
    proxy = launch(['mcp', '--embedded', '--socket', socket]);
    let onMessage, buffer = '';
    proxy.stdout.setEncoding('utf8');
    proxy.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 48 * 1024 * 1024) { client?.close('Computer response too large'); terminate(); return; }
      let i;
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        if (!line.trim()) continue;
        try { onMessage?.(JSON.parse(line)); }
        catch { client?.close('Invalid computer response'); terminate(); }
      }
    });
    proxy.stdin.on('error', () => client?.close('Computer transport closed'));
    client = makeMcpClient({ timeoutMs, transport: {
      send: message => new Promise((resolve, reject) => proxy.stdin.write(JSON.stringify(message) + '\n', e => e ? reject(e) : resolve())),
      onMessage: cb => { onMessage = cb; },
      close: () => {} // close() above reaps both the proxy and its private daemon.
    }});
    await client.initialize();
    const tools = await client.listTools();
    const started = await client.callTool('start_session', { session });
    if (started.isError) throw new Error('Computer session could not start');
    return {
      session, socket, close,
      async call(name, args = {}) {
        if (closed || failure) throw failure || new Error('Computer control closed');
        const tool = tools.find(t => t.name === name);
        if (!tool) throw new Error('Computer driver does not support ' + name);
        const scoped = tool.inputSchema?.properties?.session ? { ...args, session } : args;
        try { return await client.callTool(name, scoped); }
        catch (error) { await close(); throw new Error(error.message + '; outcome unknown. Observe again before deciding whether to retry.'); }
      }
    };
  } catch (error) { await close(); throw error; }
}
module.exports = { connect, childEnv, driverCwd, driverBinary, data };
