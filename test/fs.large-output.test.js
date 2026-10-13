/* node test/fs.large-output.test.js — the recovery path for a big tool result must not lose data silently.

   Every over-cap tool result is parked to a file and the note says "read that file in ranges, or search it". A live
   A/B run of the 2026-10-12 Publisher report (a 1.4 MB JSON API response, haiku-4.5) showed both halves of that
   advice failing without a word:
     • fs.read paged with limit 100000 under a 27k result budget: the registry cut 73k characters out of the middle of
       every page while the trailer said "next: offset <end of page>", so following it skipped them for good;
     • fs.search "Oceania" over the parked file answered "(no matches for Oceania)" — files over 512 KB were skipped
       by both engines with no note, a confident false negative on exactly the files the notes point at.
   This locks: a page is sized to the result budget the registry hands the tool (contiguous "next"), a big file is
   searched (folder scan up to 8 MB, a named file up to 64 MB), and anything still skipped is NAMED, hit or miss. */
'use strict';
const A = require('./_assert.js');
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');

const ROOT = path.join(os.tmpdir(), 'starnet-fs-large-' + process.pid);
const WS = path.join(ROOT, 'big');

(async () => {
  await fsp.mkdir(path.join(WS, '.output'), { recursive: true });
  // ~1.5 MB of pretty JSON with the needle deep inside (past the old 512 KB cap)
  const rows = [];
  for (let i = 0; i < 6000; i++) rows.push({ id: i, region: i === 5321 ? 'Oceania' : 'Elsewhere', pad: 'x'.repeat(180) });
  const big = JSON.stringify(rows, null, 2);
  A.ok(big.length > 1024 * 1024, 'fixture is over 1 MB (' + big.length + ')');
  await fsp.writeFile(path.join(WS, '.output', 'untrusted-web_request-r1-0.txt'), big);

  // rg:false forces the pure-JS walker (the guaranteed engine); the rg engine shares the same caps via --max-filesize
  const tools = makeFsTools({ fsp, pathMod: path, root: ROOT, rg: false });
  const reg = makeRegistry();
  if (typeof tools.register === 'function') tools.register(reg); else for (const t of Object.values(tools)) if (t && t.name) reg.register(t);
  const parks = [];
  const ctx = { agentId: 'big', outputMax: 27000, parkOutput: async (c) => { parks.push(c.length); return { path: '.output/park-' + parks.length }; } };
  const call = (name, args) => reg.dispatch({ name, args, argsRaw: '{}' }, ctx);

  // ---- A. one page fits one result: nothing cut from the middle, "next" is contiguous ----
  {
    const r = await call('fs.read', { path: '.output/untrusted-web_request-r1-0.txt', offset: 100000, limit: 100000 });
    A.ok(r.ok, 'the read succeeds');
    A.eq(parks.length, 0, 'the page fit the budget, so nothing was re-parked or elided');
    A.ok(r.content.length <= 27000, 'the page is within the result budget (' + r.content.length + ')');
    const m = /\[showing characters 100000-(\d+) of \d+ \(page sized to fit this model's context window\); next: fs\.read \{[^}]*"offset":(\d+),"limit":(\d+)\}\]$/.exec(r.content);
    A.ok(!!m, 'the trailer says the page was sized to the window and where to continue: ' + JSON.stringify(r.content.slice(-200)));
    if (m) {
      A.eq(m[1], m[2], 'next offset == end of what was SHOWN (contiguous)');
      A.eq(r.content.indexOf(big.slice(100000, Number(m[1]))), 0, 'every character of the page is the file, in order');
    }
  }
  // no host budget (a direct call) keeps the old page size exactly
  {
    const direct = await tools.readTool.run({ path: '.output/untrusted-web_request-r1-0.txt', offset: 0, limit: 100000 }, { agentId: 'big' });
    A.ok(/\[showing characters 0-100000 of /.test(direct.content) && !/page sized/.test(direct.content), 'no budget passed = the requested page, unchanged');
  }

  // ---- B. a big file is searched, folder or named ----
  for (const p of ['.output', '.output/untrusted-web_request-r1-0.txt']) {
    const r = await call('fs.search', { query: 'Oceania', path: p });
    A.ok(/"region": "Oceania"/.test(r.content), 'search over ' + p + ' finds the needle in a >1 MB file: ' + JSON.stringify(r.content.slice(0, 160)));
  }

  // ---- C. anything still too big is NAMED — a miss never reads as a clean "no matches" ----
  {
    const huge = Buffer.alloc(9 * 1024 * 1024, 0x61);   // 9 MB of 'a': over the folder-scan cap, no needle
    await fsp.writeFile(path.join(WS, '.output', 'huge.txt'), huge);
    const r = await call('fs.search', { query: 'Zebra', path: '.output' });
    A.ok(/^\(no matches for Zebra\)/.test(r.content), 'the miss is still a miss');
    A.ok(/NOT searched — over the 8 MB per-file search limit: \.output\/huge\.txt/.test(r.content) && /Name one as "path"/.test(r.content),
      'the skipped file is named with the way to include it: ' + JSON.stringify(r.content));
    const named = await call('fs.search', { query: 'Zebra', path: '.output/huge.txt' });
    A.ok(/^\(no matches for Zebra\)$/.test(named.content), 'naming the 9 MB file searches it (64 MB named-file cap), so its miss is a real miss: ' + JSON.stringify(named.content.slice(0, 200)));
  }

  // ---- D. a NAMED file over the 64 MB cap is skipped BEFORE it is read ----
  // The one-file shortcut used to hand the walker an entry with no `size`, so `f.size > maxBytes` was
  // `undefined > n` and the whole file went through readFile before the post-read check threw it away:
  // a full-file RAM spike the 20 s budget cannot interrupt. Spy on readFile to prove it is never called.
  {
    const reads = [];
    const spyFsp = new Proxy(fsp, { get(t, k) {
      if (k === 'readFile') return (p, ...rest) => { reads.push(path.basename(String(p))); return t.readFile(p, ...rest); };
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
    } });
    const spyTools = makeFsTools({ fsp: spyFsp, pathMod: path, root: ROOT, rg: false });
    await fsp.writeFile(path.join(WS, '.output', 'over.log'), '');
    await fsp.truncate(path.join(WS, '.output', 'over.log'), 70 * 1024 * 1024);   // 70 MB, past the named-file cap
    const over = await spyTools.searchTool.run({ query: 'Zebra', path: '.output/over.log' }, { agentId: 'big' });
    A.eq(reads.indexOf('over.log'), -1, 'the over-cap named file is never read into memory (reads: ' + JSON.stringify(reads) + ')');
    A.ok(/NOT searched — over the 64 MB per-file search limit: \.output\/over\.log/.test(over.content) && /Read it in ranges with fs\.read/.test(over.content),
      'and it is still NAMED as not searched, with the way to read it: ' + JSON.stringify(over.content));
    const under = await spyTools.searchTool.run({ query: 'Zebra', path: '.output/huge.txt' }, { agentId: 'big' });
    A.ok(reads.indexOf('huge.txt') >= 0, 'a named file UNDER the cap is still read and searched (reads: ' + JSON.stringify(reads) + ')');
    A.ok(/^\(no matches for Zebra\)$/.test(under.content), 'so its miss is a real miss: ' + JSON.stringify(under.content.slice(0, 200)));
  }

  await fsp.rm(ROOT, { recursive: true, force: true });
  A.report('fs.large-output.test.js');
})().catch(e => { console.log('FAIL: fs.large-output.test.js threw — ' + (e && e.stack || e)); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} process.exit(1); });
