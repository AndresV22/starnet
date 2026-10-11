'use strict';
// Regression (audit 2026-10-11): the CUA driver's allowlisted env dropped the Windows system locations, and its
// spawn inherited the sidecar's cwd. Native GPU/shell code then resolved "%ProgramData%\..." as RELATIVE paths and
// created literal "%SystemDrive%\ProgramData\Microsoft\Windows\Caches" and "NVIDIA Corporation\umdlogs" folders in
// the user's working directory. The allowlist must keep those locations AND keep every secret out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const cp = require('node:child_process');
const runtime = require('../sidecar/tools/builtin/cua-runtime.js');
const { childEnv, driverCwd, driverBinary } = runtime;

const WIN_SYSTEM = {
  SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', Path: 'C:\\Windows\\system32',
  SystemDrive: 'C:', ProgramData: 'C:\\ProgramData', ALLUSERSPROFILE: 'C:\\ProgramData', PUBLIC: 'C:\\Users\\Public',
  ProgramFiles: 'C:\\Program Files', CommonProgramFiles: 'C:\\Program Files\\Common Files',
  NUMBER_OF_PROCESSORS: '16', PROCESSOR_ARCHITECTURE: 'AMD64'
};
const SECRETS = {
  OPENROUTER_API_KEY: 'sk-or-secret', STARNET_API_TOKEN: 'launch-token', SKYNET_IPC_TOKEN: 'ipc-token',
  OPENAI_API_KEY: 'sk-secret', GITHUB_TOKEN: 'ghp-secret', NODE_OPTIONS: '--require evil.js', MY_PRIVATE_VAR: 'user-data'
};
const SECRET_SHAPED = /(TOKEN|KEY|SECRET|PASSWORD|PASS|AUTH|BEARER|CREDENTIAL|COOKIE)/i;

test('win32 driver env keeps the system locations native GPU/shell code needs', () => {
  const env = childEnv({ ...WIN_SYSTEM, ...SECRETS });
  for (const k of Object.keys(WIN_SYSTEM)) assert.equal(env[k], WIN_SYSTEM[k], k + ' reaches the driver');
  assert.equal(env.CUA_DRIVER_RS_TELEMETRY_ENABLED, '0');
});

test('the allowlist still omits every secret and every unlisted variable', () => {
  const env = childEnv({ ...WIN_SYSTEM, ...SECRETS });
  for (const k of Object.keys(SECRETS)) assert.equal(env[k], undefined, k + ' must not reach the driver');
  assert.deepEqual(Object.keys(env).filter(k => SECRET_SHAPED.test(k)), [], 'no secret-shaped name is allowlisted');
  const values = Object.values(env).join('\n');
  for (const v of Object.values(SECRETS)) assert.ok(!values.includes(v), 'no secret value leaks under another name');
});

test('on this host the real process env keeps ProgramData/SystemDrive (Windows only)', { skip: process.platform !== 'win32' }, () => {
  const env = childEnv();
  for (const k of ['SystemDrive', 'ProgramData', 'ALLUSERSPROFILE']) {
    assert.ok(process.env[k], 'host defines ' + k);
    assert.equal(env[k], process.env[k], k + ' is passed through');
  }
});

test('driverCwd is a private folder under temp, never the sidecar cwd', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-cua-cwd-'));
  try {
    const dir = driverCwd(tmp);
    assert.equal(dir, path.join(tmp, 'starnet-cua'));
    assert.ok(fs.statSync(dir).isDirectory(), 'created');
    assert.equal(driverCwd(tmp), dir, 'stable across sessions');
    assert.notEqual(path.resolve(driverCwd()), path.resolve(process.cwd()));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// Review 2026-10-11: Windows resolves a RELATIVE spawn path against the CHILD's cwd, so the private cwd silently
// broke a relative STARNET_CUA_BINARY / dev-eval argv path (ENOENT) while computer-control's installed()/check()
// still found it from the sidecar cwd — status said installed, every action failed. The path is pinned first.
test('driverBinary pins a relative driver path to the sidecar cwd and leaves PATH lookups alone', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-cua-bin-'));
  try {
    const abs = path.join(base, 'drv', 'cua-driver.exe');
    assert.equal(driverBinary(abs, base), abs, 'absolute unchanged');
    assert.equal(driverBinary('.qa_tmp/cua-evaluation/driver/cua-driver.exe', base),
      path.resolve(base, '.qa_tmp/cua-evaluation/driver/cua-driver.exe'), 'relative with a separator → absolute');
    assert.equal(driverBinary('drv\\cua-driver.exe', base), path.resolve(base, 'drv\\cua-driver.exe'), 'backslash separator too');
    assert.equal(driverBinary('cua-driver.exe', base), 'cua-driver.exe', 'bare name not in the sidecar cwd keeps PATH lookup');
    fs.writeFileSync(path.join(base, 'cua-driver.exe'), '');
    assert.equal(driverBinary('cua-driver.exe', base), path.join(base, 'cua-driver.exe'), 'bare name sitting in the sidecar cwd keeps the old cwd-first resolution');
    assert.equal(driverBinary('rel/x.exe'), path.resolve(process.cwd(), 'rel/x.exe'), 'defaults to the sidecar cwd');
    assert.equal(driverBinary(undefined), undefined, 'non-string passes through to the spawn error path');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('a relative executable still runs once the child gets the private cwd (real spawn)', async () => {
  const rel = path.relative(process.cwd(), process.execPath);
  if (path.isAbsolute(rel)) return; // node lives on another drive: no relative form exists to test
  const run = file => new Promise(resolve => cp.execFile(file, ['-e', 'process.stdout.write("ran")'],
    { env: childEnv(), cwd: driverCwd(), windowsHide: true, timeout: 15000 }, (err, out) => resolve(err ? 'ERR ' + (err.code || err.message) : out)));
  assert.equal(await run(driverBinary(rel)), 'ran', 'pinned relative path resolves from the sidecar cwd');
  if (process.platform === 'win32' && !fs.existsSync(path.resolve(driverCwd(), rel))) {
    assert.match(await run(rel), /^ERR/, 'the unpinned relative path is the bug this guards (resolves against the child cwd)');
  }
});

// Wiring: the real connect() must hand the env AND the private cwd to every process it starts — the daemon/proxy
// spawns and the manifest/status/stop CLI calls. Stubs the child_process module object cua-runtime calls through.
async function stubbedConnect(binary) {
  const calls = [];
  const orig = { spawn: cp.spawn, execFile: cp.execFile };
  const planted = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, STARNET_API_TOKEN: process.env.STARNET_API_TOKEN };
  process.env.OPENROUTER_API_KEY = 'sk-or-planted-secret';
  process.env.STARNET_API_TOKEN = 'planted-launch-token';
  cp.execFile = (file, args, opts, cb) => {
    calls.push({ kind: 'execFile', file, args: args.slice(), opts });
    setImmediate(() => args[0] === 'manifest' ? cb(null, JSON.stringify({ binary_version: '0.28.2' })) : cb(new Error('not running')));
  };
  cp.spawn = (file, args, opts) => {
    calls.push({ kind: 'spawn', file, args: args.slice(), opts });
    const child = new EventEmitter();
    Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
    child.kill = () => { if (child.exitCode === null) { child.exitCode = 1; child.emit('exit', 1); } };
    setTimeout(() => child.kill(), 20);   // the fake daemon dies: connect must fail closed and reap
    return child;
  };
  try {
    await assert.rejects(runtime.connect({ binary, clock: { now: () => Date.now() }, timeoutMs: 2000 }),
      /Computer driver exited/);
  } finally {
    cp.spawn = orig.spawn; cp.execFile = orig.execFile;
    for (const k of Object.keys(planted)) { if (planted[k] === undefined) delete process.env[k]; else process.env[k] = planted[k]; }
  }
  return calls;
}

test('connect() hands a relative driver path to spawn/execFile as an absolute one', async () => {
  const rel = path.join('.qa_tmp', 'cua-evaluation', 'driver', 'cua-driver.exe');
  const calls = await stubbedConnect(rel);
  assert.ok(calls.length >= 3, 'manifest, serve and stop all ran');
  for (const c of calls) assert.equal(c.file, path.resolve(process.cwd(), rel), c.kind + ' ' + c.args[0] + ' gets the sidecar-cwd path');
});

test('connect() spawns and execs the driver with the allowlisted env and a private cwd', async () => {
  const calls = await stubbedConnect('fake-cua-driver.exe');
  for (const c of calls) assert.equal(c.file, 'fake-cua-driver.exe', 'a bare name not in the sidecar cwd stays a PATH lookup');
  const kinds = calls.map(c => c.kind + ':' + c.args[0]);
  assert.ok(kinds.includes('execFile:manifest') && kinds.includes('spawn:serve') && kinds.includes('execFile:stop'), kinds.join(','));
  const expected = driverCwd();
  for (const c of calls) {
    assert.equal(c.opts.cwd, expected, c.kind + ' ' + c.args[0] + ' carries the private cwd');
    assert.notEqual(path.resolve(c.opts.cwd), path.resolve(process.cwd()), 'never the sidecar cwd');
    assert.equal(c.opts.env.OPENROUTER_API_KEY, undefined, 'provider key stays out');
    assert.equal(c.opts.env.STARNET_API_TOKEN, undefined, 'launch token stays out');
    if (process.platform === 'win32') assert.equal(c.opts.env.ProgramData, process.env.ProgramData, 'ProgramData reaches ' + c.args[0]);
  }
});

test('LSP and MCP stdio allowlists keep the same Windows locations and still drop secrets', () => {
  const { safeChildEnv } = require('../sidecar/lsp-manager.js')._internals;
  const { buildChildEnv } = require('../sidecar/mcp/transport.stdio.js')._internals;
  for (const [name, env] of [['lsp', safeChildEnv({ ...WIN_SYSTEM, ...SECRETS })], ['mcp', buildChildEnv({}, { ...WIN_SYSTEM, ...SECRETS })]]) {
    for (const k of ['SystemDrive', 'ProgramData', 'ALLUSERSPROFILE']) assert.equal(env[k], WIN_SYSTEM[k], name + ' keeps ' + k);
    for (const k of Object.keys(SECRETS)) assert.equal(env[k], undefined, name + ' drops ' + k);
  }
});
