/* Read-only observer: node --require ./qa/evidence/runtime-sweep-2026-10-11/http-lifecycle-preload.cjs test/loops-stall.e2e.test.js
   Set STARNET_TEST_DIAG_FILE to an OWNED output path. No deadlines/retries/requests/child cleanup are changed. */
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const started = process.hrtime.bigint();
const destination = process.env.STARNET_TEST_DIAG_FILE;
if (!destination) throw new Error('STARNET_TEST_DIAG_FILE must name an owned diagnostic output');
const clean = value => {
  let s = String(value == null ? '' : value);
  for (const [raw, name] of [[process.cwd(), '<WORKTREE>'], [os.tmpdir(), '<TEMP>'], [os.homedir(), '<USER>']]) if (raw) {
    for (const form of [JSON.stringify(raw).slice(1, -1), raw, raw.replaceAll('\\', '/')]) s = s.split(form).join(name);
  }
  return s.replace(/((?:token|api[_-]?key|secret|authorization)\s*[:=]\s*)\S+/ig, '$1<redacted>').slice(0, 1800);
};
function record(type, data) {
  try { fs.appendFileSync(destination, JSON.stringify({ atMs: Number(process.hrtime.bigint() - started) / 1e6, type,
    freeMemory: os.freemem(), rss: process.memoryUsage().rss, ...data }) + '\n'); } catch (_) { /* diagnostics must not change the test */ }
}
function errorOf(e, depth = 0) {
  if (!e || depth > 3) return null;
  const out = {};
  for (const k of ['name', 'message', 'code', 'errno', 'syscall', 'address', 'port']) if (e[k] != null) out[k] = clean(e[k]);
  if (e.cause) out.cause = errorOf(e.cause, depth + 1);
  if (Array.isArray(e.errors)) out.errors = e.errors.slice(0, 4).map(x => errorOf(x, depth + 1));
  return out;
}
record('observer-start', { test: path.basename(process.argv[1] || ''), node: process.version, platform: process.platform });
const spawn = cp.spawn;
let sequence = 0;
cp.spawn = function (...args) {
  const child = spawn.apply(this, args);
  const entry = Array.isArray(args[1]) ? args[1][0] : '';
  if (!/[\\/]sidecar[\\/]index\.js$/.test(String(entry))) return child;
  const id = ++sequence, tail = [];
  record('sidecar-spawn', { id, pid: child.pid });
  for (const [stream, pipe] of [['stdout', child.stdout], ['stderr', child.stderr]]) if (pipe) pipe.on('data', chunk => {
    const text = clean(chunk.toString());
    tail.push({ stream, text }); if (tail.length > 32) tail.shift();
    if (/recovery|exec-env|http:\/\/127\.0\.0\.1|fault|fatal|uncaught|unhandled|EADDRINUSE/i.test(text)) record('sidecar-milestone', { id, stream, text });
  });
  child.on('error', e => record('sidecar-error', { id, error: errorOf(e) }));
  child.on('exit', (code, signal) => record('sidecar-exit', { id, code, signal, tail }));
  child.on('close', (code, signal) => record('sidecar-close', { id, code, signal }));
  return child;
};
const fetch = globalThis.fetch, errors = new Map(), healthReady = new Set();
let request = 0;
globalThis.fetch = async function (...args) {
  let pathname = '', host = '';
  try { const u = new URL(typeof args[0] === 'string' ? args[0] : args[0].url || String(args[0])); pathname = u.pathname; host = u.host; } catch (_) {}
  const id = ++request, method = (args[1] && args[1].method) || 'GET';
  const tracked = pathname === '/api/health' || pathname.startsWith('/api/loops');
  if (tracked && method !== 'GET') record('request-start', { id, method, pathname, host });
  try {
    const response = await fetch.apply(this, args);
    if (tracked && method !== 'GET') record('request-response', { id, method, pathname, host, status: response.status });
    if (pathname === '/api/health' && response.status === 200 && !healthReady.has(host)) {
      healthReady.add(host); record('health-ready', { id, host });
    }
    return response;
  } catch (e) {
    const error = errorOf(e), key = host + pathname + JSON.stringify(error), prior = errors.get(key);
    errors.set(key, { pathname, host, error, count: (prior ? prior.count : 0) + 1 });
    if (!prior || pathname !== '/api/health') record('request-error', { id, method, pathname, host, error });
    throw e;
  }
};
process.on('uncaughtExceptionMonitor', e => record('uncaught-monitor', { error: errorOf(e) }));
process.on('exit', code => record('observer-exit', { code, requestErrors: Array.from(errors.values()) }));
