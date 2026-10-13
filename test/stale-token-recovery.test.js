/* node test/stale-token-recovery.test.js — #39: after a sidecar restart the open page keeps a STALE API token.

   The sidecar mints a per-launch token and injects it into the page it serves; a restart (START FRESH's exit(75), a
   crash respawn, a container restart) mints a new one, and every /api/ call from the still-open page answered
   403 'forbidden token'. Each surface misread it as its own failure: START FRESH greyed out forever after it
   SUCCEEDED, the connect screen said "catalog offline", a rename looked saved and silently reverted.

   harness.js now recovers in place: re-read the token from the page the sidecar serves ('/'), adopt it, replay the
   refused request ONCE. This test drives the lifted staleTokenRecovery() with real WHATWG Responses and locks the
   narrowness that makes it safe: it never swallows a real 403, never replays without proof of a rotation, never
   loops, and shares one page read across concurrent 403s. Source locks cover the wiring and the honest surfaces. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const harness = fs.readFileSync(path.join(__dirname, '../frontend/app/harness.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../frontend/app/app.js'), 'utf8');
const sidecar = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');

// Lift by indentation, NOT fnBody: the token regex holds a quote inside a character class (the documented fnBody
// hazard). The factory's own closing brace is the first two-space-indented "}" line after its header.
const start = harness.indexOf('  function staleTokenRecovery(o) {');
A.ok(start >= 0, 'harness.js defines staleTokenRecovery(o)');
const end = harness.indexOf('\n  }\n', start);
const factorySrc = harness.slice(start, end + 4);
A.ok(factorySrc.length > 200 && factorySrc.length < 6000, 'lifted exactly the factory (' + factorySrc.length + ' chars)');
const staleTokenRecovery = new Function(factorySrc + '\nreturn staleTokenRecovery;')();

// The page the sidecar serves carries the token in EXACTLY this shape (sidecar/index.js serveStatic). Lock the
// producer so a format change there cannot silently blind the recovery.
// The boot script now opens with a per-response CSP nonce (<script nonce="…">) and carries the token only for the
// same-user owner (peerOwnerCheck); the recovery's TOKEN_RE matches the assignment itself, whatever the tag carries.
A.ok(sidecar.includes("'window.__STARNET_API_TOKEN__=' + JSON.stringify(API_TOKEN) + ';'"),
  'serveStatic still injects window.__STARNET_API_TOKEN__=<json>; into the page');
A.ok(sidecar.includes("(scriptNonce ? '<script nonce=\"' + scriptNonce + '\">' : '<script>')"),
  'serveStatic opens the boot script with its per-response nonce');
A.ok(/res\.writeHead\(403\); res\.end\('forbidden token'\); return true;/.test(sidecar),
  "rejectBadApiToken still answers the stale-token case with the exact body 'forbidden token'");
const pageWith = tok => '<html><head><script>window.__STARNET_API_TOKEN__=' + JSON.stringify(tok) + ';</script>\n</head><body></body></html>';

function rig(opts) {
  opts = opts || {};
  const st = { token: opts.token || 'OLD', pageReads: 0, recovered: 0, stale: 0, replays: [] };
  const page = opts.page != null ? opts.page : pageWith('NEW');
  const rec = staleTokenRecovery({
    rawFetch: (u) => {
      A.eq(u, '/', 'the only thing the recovery ever fetches is the same-origin page');
      st.pageReads++;
      if (opts.pageFails) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(page, { status: 200 }));
    },
    getToken: () => st.token,
    setToken: t => { st.token = t; },
    canRefresh: () => opts.canRefresh !== false,
    onRecovered: () => { st.recovered++; },
    onStale: () => { st.stale++; }
  });
  const replay = (status, body) => fresh => { st.replays.push(fresh); return Promise.resolve(new Response(body || '{"ok":true}', { status: status || 200 })); };
  return { st, rec, replay };
}
const forbiddenToken = () => new Response('forbidden token', { status: 403 });

(async () => {
  // 1. a healthy response passes straight through — no page read, no body read.
  {
    const { st, rec, replay } = rig();
    const ok = new Response('{"x":1}', { status: 200 });
    const out = await rec.settle(ok, 'OLD', replay());
    A.ok(out === ok && st.pageReads === 0 && st.replays.length === 0, 'a 200 is returned untouched with no page read');
  }
  // 2. a ROUTE's own 403 is a real refusal: never swallowed, never replayed.
  for (const body of ['forbidden', 'forbidden host', 'forbidden origin', '{"error":"not allowed"}', 'forbidden ticket']) {
    const { st, rec, replay } = rig();
    const res = new Response(body, { status: 403 });
    const out = await rec.settle(res, 'OLD', replay());
    A.ok(out === res && st.pageReads === 0 && st.replays.length === 0 && st.stale === 0,
      "a 403 '" + body + "' passes through untouched (not the token gate)");
    A.eq(await out.text(), body, 'the caller can still read the untouched 403 body');
  }
  // 3. THE BUG: a stale-token 403 after a restart → adopt the served token, replay once, caller sees the success.
  {
    const { st, rec, replay } = rig();
    const out = await rec.settle(forbiddenToken(), 'OLD', replay(200, '{"lineage":{"priorInstallEvidence":false}}'));
    A.eq(out.status, 200, 'the caller gets the REPLAYED response, not the 403');
    A.eq((await out.json()).lineage.priorInstallEvidence, false, 'the replayed body is intact');
    A.eq(st.token, 'NEW', 'the fresh token from the served page is adopted');
    A.eq(st.replays.join(','), 'NEW', 'exactly one replay, carrying the fresh token');
    A.ok(st.recovered === 1 && st.stale === 0, 'recovery is reported once, not staleness');
  }
  // 3b. the page the sidecar serves today: a nonce'd boot script — recovery reads the token all the same.
  {
    const { st, rec, replay } = rig({ page: '<html><head><script nonce="b64Nonce+/==">window.__STARNET_API_TOKEN__=' + JSON.stringify('NEW') + ';</script>\n</head><body></body></html>' });
    const out = await rec.settle(forbiddenToken(), 'OLD', replay());
    A.eq(out.status, 200, 'a nonce-tagged boot script still yields the fresh token and one replay');
    A.eq(st.token, 'NEW', 'the fresh token is adopted from the nonce-tagged page');
  }
  // 3c. a page served to a different OS user withholds the token: nothing to adopt, the 403 stands.
  {
    const { st, rec, replay } = rig({ page: '<html><head><script nonce="n">window.__STARNET_TOKEN_WITHHELD__="other-user";</script></head></html>' });
    const res = forbiddenToken();
    const out = await rec.settle(res, 'OLD', replay());
    A.ok(out === res && st.replays.length === 0 && st.stale === 1, 'a withheld-token page is not a rotation: 403 stands, stale reported');
  }
  // 3d. A PAGE THE STATION KEPT ITS KEY FROM (review threads-backend-05 / sidecar-index-06). The sidecar serves the page
  // without its key when it cannot prove this browser runs as its own OS user, and says why in
  // window.__STARNET_TOKEN_WITHHELD__. Every keyed call 403s like a stale page, but a reload only re-runs the same check:
  // the page must say WHY and name the owner's escape hatch, never "the station restarted — reload this page".
  {
    const noticeSrc = A.fnBody(harness, 'function tokenWithheldNotice(');
    A.ok(noticeSrc.length > 100 && noticeSrc.length < 3000, 'harness.js defines tokenWithheldNotice(reason)');
    const tokenWithheldNotice = new Function(noticeSrc + '\nreturn tokenWithheldNotice;')();
    const WHY = { 'lookup-failed': /ownership check timed out or failed/, 'peer-not-found': /connection could not be traced/,
      'other-user': /connection belongs to another account/, 'unsupported-platform': /can’t run the ownership check/, 'constructor': /ownership check did not pass/ };
    for (const reason of Object.keys(WHY)) {
      const t = tokenWithheldNotice(reason);
      A.ok(WHY[reason].test(t), 'the withheld notice names the reason in plain words (' + reason + '): ' + t);
      A.ok(/STARNET_TRUST_LOCAL_PEERS=1/.test(t) && /won’t take commands from this page/.test(t), 'and says what it means + the owner\'s escape hatch');
      A.ok(!/restarted|reload/i.test(t), 'and never claims a restart or offers a reload (a reload re-runs the same check)');
    }
    A.eq(tokenWithheldNotice(''), '', 'a page that holds its key has no withheld notice');

    // the real wiring (lifted from harness.js), driven with the real factory: a withheld page never re-reads '/',
    // shows the withheld notice ONCE as a kept alert, and is not marked a stale (restarted) session
    const wiringStart = harness.indexOf('  let sessionStale = false;');
    const wiringEnd = harness.indexOf("  if (typeof window !== 'undefined' && window.fetch && !window.__STARNET_FETCH_HARDENED__)");
    A.ok(wiringStart > 0 && wiringEnd > wiringStart, 'lifted the stale-token wiring');
    const wiringSrc = harness.slice(wiringStart, wiringEnd);
    const wire = (withheld, page) => {
      const notes = [], settled = []; let reads = 0;
      const win = { fetch: () => { reads++; return Promise.resolve(new Response(page || '<html></html>', { status: 200 })); } };
      if (!withheld) win.__STARNET_API_TOKEN__ = 'OLD';
      const StationUI = { notify: (text, cls, category, opts) => notes.push({ text, cls, category, opts }), settleNotifs: key => settled.push(key) };
      const w = new Function('window', 'DESKTOP', 'StationUI', 'staleTokenRecovery', 'tokenWithheld',
        'let apiToken = window.__STARNET_API_TOKEN__ || "";\n' + wiringSrc + '\nreturn { staleToken, stale: () => sessionStale, note: noteTokenWithheld };')(
        win, false, StationUI, staleTokenRecovery, withheld);
      return { w, notes, settled, reads: () => reads };
    };
    {
      const { w, notes, settled, reads } = wire('lookup-failed', '<html><script>window.__STARNET_TOKEN_WITHHELD__="lookup-failed";</script></html>');
      w.note();   // boot (Harness.init) shows it first …
      for (let i = 0; i < 3; i++) {
        const res = forbiddenToken();
        A.ok(await w.staleToken.settle(res, '', fresh => Promise.resolve(new Response('replayed:' + fresh))) === res, 'a withheld page\'s 403 stands (nothing to adopt)');
      }
      A.eq(reads(), 0, 'a withheld page never re-reads the page on a 403 (it would only re-run the same failing check)');
      A.eq(notes.length, 1, '… and the withheld notice is shown ONCE (boot + every later 403): ' + JSON.stringify(notes.map(n => n.text)));
      A.eq(notes[0].text, tokenWithheldNotice('lookup-failed'), 'the notice is the withheld wording, not the restart wording');
      A.ok(notes[0].opts && notes[0].opts.kind === 'alert' && notes[0].opts.key === 'token-withheld', 'kept in NOTIFICATIONS as one alert (it outlives the toast)');
      A.eq(w.stale(), false, 'a withheld page is not a stale (restarted) session: no surface may say "reload"');
      A.eq(settled.length, 0, 'a withheld page never marks its own alert handled');
    }
    {
      const { w, notes, settled, reads } = wire('', pageWith('OLD'));
      w.note();
      A.eq(notes.length, 0, 'a page that holds its key shows no withheld notice at boot');
      A.eq(settled, ['token-withheld'], '… and marks an alert left by an earlier withheld page as handled (the owner fixed it)');
      await w.staleToken.settle(forbiddenToken(), 'OLD', null);
      A.ok(reads() === 1 && w.stale() === true && notes.length === 1 && /station restarted/.test(notes[0].text),
        'a keyed page whose token went stale keeps the restart + reload wording: ' + (notes[0] && notes[0].text));
    }
    A.ok(/const tokenWithheld = \(typeof window !== 'undefined' && !window\.__STARNET_API_TOKEN__ && window\.__STARNET_TOKEN_WITHHELD__\)/.test(harness),
      'harness reads the withheld reason only when the page carries no key');
    A.ok(/async function init\(\) \{\s*(\/\/[^\n]*\n\s*)?noteTokenWithheld\(\);/.test(harness), 'boot shows the withheld notice before the first refused call');
    A.ok(/tokenWithheld: \(\) => tokenWithheld,/.test(harness) && /tokenWithheldNotice: \(\) => tokenWithheldNotice\(tokenWithheld\),/.test(harness),
      'Harness exposes tokenWithheld() and tokenWithheldNotice() for the surfaces');
  }
  // 4. the served page carries the SAME token → no rotation proven → no replay; staleness reported.
  {
    const { st, rec, replay } = rig({ page: pageWith('OLD') });
    const res = forbiddenToken();
    const out = await rec.settle(res, 'OLD', replay());
    A.ok(out === res && st.replays.length === 0 && st.stale === 1 && st.recovered === 0,
      'same token on the page: the 403 stands, never replayed, reported as stale');
  }
  // 5. a page with no token at all, or a page read that throws, is not a rotation either.
  for (const o of [{ page: '<html></html>' }, { pageFails: true }]) {
    const { st, rec, replay } = rig(o);
    const res = forbiddenToken();
    const out = await rec.settle(res, 'OLD', replay());
    A.ok(out === res && st.replays.length === 0 && st.stale === 1, 'no token recoverable (' + JSON.stringify(o) + '): 403 stands, stale reported');
  }
  // 6. desktop (canRefresh false): never reads a page the sidecar did not serve.
  {
    const { st, rec, replay } = rig({ canRefresh: false });
    const res = forbiddenToken();
    const out = await rec.settle(res, 'OLD', replay());
    A.ok(out === res && st.pageReads === 0 && st.stale === 1, 'desktop: no page read, 403 stands, stale reported');
  }
  // 7. NO LOOP: the replay itself 403s → that answer is final (one replay, never a second).
  {
    const { st, rec, replay } = rig();
    const out = await rec.settle(forbiddenToken(), 'OLD', replay(403, 'forbidden token'));
    A.eq(out.status, 403, 'a replay that also 403s is returned as-is');
    A.eq(st.replays.length, 1, 'exactly one replay — never a loop');
  }
  // 8. concurrent 403s share ONE page read; a late 403 for the old token reuses the adopted token without reading.
  {
    const { st, rec, replay } = rig();
    const outs = await Promise.all([1, 2, 3, 4].map(() => rec.settle(forbiddenToken(), 'OLD', replay())));
    A.ok(outs.every(r => r.status === 200), 'every concurrent refused call is replayed to success');
    A.eq(st.pageReads, 1, 'four concurrent 403s share ONE page read');
    A.eq(st.replays.join(','), 'NEW,NEW,NEW,NEW', 'each replays once with the fresh token');
    const late = await rec.settle(forbiddenToken(), 'OLD', replay());
    A.ok(late.status === 200 && st.pageReads === 1, 'a late 403 sent with the old token reuses the adopted token (no second read)');
  }
  // 9. an unreplayable (streamed) body: token still adopted so the NEXT call works; this one keeps its 403.
  {
    const { st, rec } = rig();
    const res = forbiddenToken();
    const out = await rec.settle(res, 'OLD', null);
    A.ok(out === res && st.token === 'NEW' && st.stale === 0, 'no replay function: 403 returned, fresh token adopted for the next call');
  }
  // 10. the caller's body is never consumed by the sniff (clone), even on the recover path's pass-through.
  {
    const { rec } = rig({ page: pageWith('OLD') });
    const res = forbiddenToken();
    const out = await rec.settle(res, 'OLD', null);
    A.eq(await out.text(), 'forbidden token', 'the sniff reads a clone; the caller still reads the real body');
  }

  // ---- wiring (source locks) ----
  const wrapper = harness.slice(harness.indexOf("if (typeof window !== 'undefined' && window.fetch && !window.__STARNET_FETCH_HARDENED__)"));
  A.ok(/staleToken\.settle\(res, t, replayable \?/.test(wrapper), 'the global /api fetch wrapper routes every response through staleToken.settle');
  A.ok(/setToken: t => \{ apiToken = t; try \{ window\.__STARNET_API_TOKEN__ = t;/.test(harness),
    'adopting a token updates BOTH the cached header token and window.__STARNET_API_TOKEN__ (apiticket.js mints SSE/file/save tickets from it)');
  A.ok(/canRefresh: \(\) => !tokenWithheld && !DESKTOP && !\(typeof window !== 'undefined' && window\.__STARNET_API__\)/.test(harness),
    'desktop never reads the page for a token (the shell keeps one token across respawns), nor does a page the station kept its key from');
  A.ok(/sessionStale: \(\) => sessionStale/.test(harness), 'Harness exposes sessionStale() for the surfaces');

  // the START FRESH + recover polls: a 403 is not "not ready yet".
  const gate = A.fnBody(app, 'function showPriorStateGate(');
  A.ok(gate.length > 0 && gate.length < app.length, 'lifted showPriorStateGate');
  const polls = gate.match(/if \(probe\.status === 403\) \{ clearInterval\(timer\); location\.reload\(\); return; \}/g) || [];
  A.eq(polls.length, 2, 'both restart polls (START FRESH, RECOVER) stop and reload once on a 403 instead of greying out forever');
  A.ok(/const next = body && body\.lineage;[\s\S]{0,400}checked again — still nothing recoverable here/.test(gate),
    'RETRY with nothing recoverable re-asks the sidecar and SAYS so instead of a no-op reload');
  A.ok(/throw new Error\(refusedPageLine\(\) \|\| 'report unavailable'\)/.test(gate),
    'report export names a refused page (withheld key or stale session) instead of "report unavailable"');
  A.ok(/could not check again — ' \+ \(refusedPageLine\(\) \|\| 'the station service did not answer'\)/.test(gate),
    'RETRY names a refused page instead of "the station service did not answer"');
  // the connect screen: a stale session is not an offline catalog, and not the user's network.
  const models = A.fnBody(app, 'async function loadModels(');
  A.ok(/const refused = refusedPageLine\(\);\s*countEl\.textContent = refused \? '\(' \+ refused \+ '\)' : '\(catalog offline — type or pick a slug\)'/.test(models),
    'loadModels names a refused page (withheld key or stale session), "catalog offline" only otherwise');
  const wake = A.fnBody(app, 'async function onWake(');
  A.ok(/const refused = refusedPageLine\(\);[\s\S]{0,300}'could not start — ' \+ \(refused \|\| /.test(wake), 'WAKE names a refused page instead of "Failed to fetch"');
  // ONE phrase for "why this page is refused": a page the station kept its key from is checked FIRST, so no surface
  // tells its owner "the station restarted; reload this page" — a reload re-runs the same check (review threads-backend-05)
  {
    const lineSrc = A.fnBody(app, 'function refusedPageLine(');
    A.ok(lineSrc.length > 50 && lineSrc.length < 2000, 'app.js defines refusedPageLine()');
    const lineFor = (H) => new Function('Harness', lineSrc + '\nreturn refusedPageLine;')(H)();
    const withheld = lineFor({ tokenWithheld: () => 'peer-not-found', sessionStale: () => true });
    A.ok(/not verified as your own account/.test(withheld) && /STARNET_TRUST_LOCAL_PEERS=1/.test(withheld) && !/restarted|reload/i.test(withheld),
      'a withheld page says it was not verified + the escape hatch, never "restarted; reload": ' + withheld);
    A.eq(lineFor({ tokenWithheld: () => '', sessionStale: () => true }), 'the station restarted; reload this page', 'a keyed page\'s stale session keeps the reload line');
    A.eq(lineFor({ tokenWithheld: () => '', sessionStale: () => false }), '', 'a page that is not refused has no line');
    A.eq(lineFor({}), '', 'an older Harness without either probe has no line');
  }

  A.report('stale-token-recovery');
})().catch(e => { console.error(e); process.exit(1); });
