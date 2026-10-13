'use strict';
// Read committed production modules into memory. No checkout, real workspace or provider access.
const cp = require('node:child_process');
const path = require('node:path');
const Module = require('node:module');
const ref = process.argv[2] || 'db63a980da421c75d00072978776e117802c8c24';
const root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const cache = new Map();
function source(file) { return cp.execFileSync('git', ['show', ref + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const name = path.join(root, file), m = new Module(name, module);
  m.filename = name; m.paths = Module._nodeModulePaths(path.dirname(name)); cache.set(file, m);
  const normalRequire = m.require.bind(m);
  m.require = request => {
    if (!request.startsWith('.')) return normalRequire(request);
    let relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
    if (!path.posix.extname(relative)) relative += '.js';
    if (relative.startsWith('../')) throw new Error('Module left repository');
    return load(relative);
  };
  m._compile(source(file), name); return m.exports;
}
(async () => {
  if (!/makeRecallTool\(\{\s*transcriptStore\s*\}\)\.register\(registry\)/.test(source('sidecar/index.js'))) throw new Error('Host factory binding changed; update this baseline probe before judging the repair.');
  const { makeTranscriptStore } = load('sidecar/transcriptstore.js');
  const { makeRecallTool } = load('sidecar/tools/builtin/recall.js');
  const store = makeTranscriptStore({ io: { readAll: () => [], append: () => {} }, clock: { now: () => 200 }, redact: s => s });
  store.append({ streamId: 'owner-private', agentId: 'a', role: 'user', content: 'SYNTHETIC_PRIVATE_COBALT deployment detail', ts: 100, taint: '' });
  store.append({ streamId: 'allowed-group', agentId: 'a', role: 'user', content: 'Public group update', ts: 200, taint: '' });
  const tool = makeRecallTool({ transcriptStore: store }).recallTool;
  const ctx = { streamId: 'allowed-group', connectorAuthority: { withholdTaste: true } };
  const cases = [
    ['default-search', { query: 'SYNTHETIC_PRIVATE_COBALT' }],
    ['explicit-all', { query: 'SYNTHETIC_PRIVATE_COBALT', scope: 'all' }],
    ['foreign-scroll', { around: 100, stream: 'owner-private' }],
    ['browse', {}],
    ['authorized-local', { query: 'Public', scope: 'stream' }],
    ['restricted-default-with-local-hit', { query: 'update deployment' }],
    ['restricted-missing-stream', { query: 'SYNTHETIC_PRIVATE_COBALT' }, { connectorAuthority: { withholdTaste: true } }],
    ['simulated-restricted-worker-foreign-stream', { query: 'SYNTHETIC_PRIVATE_COBALT', scope: 'stream' }, { streamId: 'owner-private', connectorAuthority: { withholdTaste: true } }],
    ['owner-cross-stream', { query: 'SYNTHETIC_PRIVATE_COBALT', scope: 'all' }, { streamId: 'owner-active', connectorAuthority: { withholdTaste: false } }],
    ['owner-foreign-scroll', { around: 100, stream: 'owner-private' }, { streamId: 'owner-active', connectorAuthority: { withholdTaste: false } }],
    ['owner-browse', {}, { streamId: 'owner-active', connectorAuthority: { withholdTaste: false } }]
  ];
  const results = [];
  for (const [mode, args, callContext] of cases) {
    const r = await tool.run(args, callContext || ctx);
    results.push({ mode, privateSentinelReturned: r.content.includes('SYNTHETIC_PRIVATE_COBALT'), publicControlReturned: r.content.includes('Public group update'), taintedBy: r.taintedBy || null });
  }
  const blobs = {};
  for (const file of cache.keys()) blobs[file] = cp.execFileSync('git', ['rev-parse', ref + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  console.log(JSON.stringify({ source: cp.execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim(), kind: 'Exact committed modules with synthetic in-memory transcript data. No real sidecar, account, conversation or provider accessed.', execution: 'The current candidate host supplies only transcriptStore to the factory; inherited host restriction is present in synthetic context.', results, sourceBlobs: blobs }, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
