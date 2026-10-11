/* Checkpoint Git commands share the foreground process supervisor: timeout/abort must stop the whole
   owned tree before another checkpoint starts. execFile's timeout only killed git, leaving pack-objects.
   Capture streams separately because rev-parse/log parse stdout as data, never diagnostic stderr. */
'use strict';
const { runProcess } = require('./environment.js');
const { StringDecoder } = require('node:string_decoder');
function makeCheckpointGitRunner(deps) {
  const d = deps || {};
  return async function runGitCheckpoint(args, opts) {
    let stdout = '', stderr = '';
    const maxBytes = 8 << 20;
    const decOut = new StringDecoder('utf8'), decErr = new StringDecoder('utf8');
    const appendOut = data => { stdout = (stdout + (typeof data === 'string' ? data : decOut.write(data))).slice(0, maxBytes); };
    const appendErr = data => { stderr = (stderr + (typeof data === 'string' ? data : decErr.write(data))).slice(0, maxBytes); };
    const spawn = function (file, argv, options) {
      const child = d.spawn(file, argv, options);
      if (file === (d.file || 'git')) {
        if (child.stdout) child.stdout.on('data', appendOut);
        if (child.stderr) child.stderr.on('data', appendErr);
      }
      return child;
    };
    try {
      const result = await runProcess({ spawn, file: d.file || 'git', args, timeoutMs: d.timeoutMs || 15000,
        maxBytes, clock: d.clock, ledger: d.ledger, ledgerCmd: d.file || 'git',
        signal: opts && opts.signal,
        spawnOptions: { cwd: opts && opts.cwd || d.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] } });
      stdout = (stdout + decOut.end()).slice(0, maxBytes);
      stderr = (stderr + decErr.end()).slice(0, maxBytes);
      if (result.timedOut) stderr += '\ncheckpoint Git process tree timed out';
      if (result.aborted) stderr += '\ncheckpoint Git process tree aborted';
      return { code: result.exitCode, stdout, stderr, timedOut: result.timedOut, aborted: result.aborted };
    } catch (e) { return { code: 1, stdout, stderr: stderr + String(e && e.message || e) }; }
  };
}
module.exports = { makeCheckpointGitRunner };
