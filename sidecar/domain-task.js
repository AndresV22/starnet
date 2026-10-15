/* sidecar/domain-task.js — pure policy for a bounded, direct-domain inspection.

   A request such as "check example.com and read its docs" is not an open-ended web-research
   assignment. The exact host is the subject. If that host provably does not resolve, searching
   dozens of engines, archives and spelling variants cannot complete the requested read; it only
   hides a likely typo behind minutes of activity.

   This module identifies only the narrow case: one explicit public hostname, direct inspect/read
   language, and no request to locate alternatives/history/the correct URL. The host then uses the
   policy at three independent seams: prompt guidance, delegation restraint, and terminal evidence.
   False negatives merely keep the ordinary research path; false positives are avoided by the
   explicit exclusion vocabulary below — and a FILE NAME is never the host (namesFile). */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SK = root.SK || {}; root.SK.domainTask = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The suffix must END the dotted word: without the lookahead "deploy.ps1" read as the host deploy.ps, "song.mp3" as
  // song.mp and "libfoo.so.6" as libfoo.so. Group 2 is the trailing path/query/fragment, read by namesFile below.
  const HOST_RE = /\b(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,62})\.)+[a-z]{2,63})(?![a-z0-9_]|\.[a-z0-9])(?::\d+)?([\/?#][^\s]*)?/ig;
  // Bare dotted words are admitted only when their final label is an assigned country-code suffix or a
  // well-known generic public suffix. This is intentionally conservative: a false negative keeps ordinary
  // research behavior, while treating Cargo.toml as a host can terminate real work early.
  const COUNTRY_SUFFIXES = 'ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw'.split(' ');
  const GENERIC_SUFFIXES = 'aero app art asia biz blog cloud club com coop dev digital edu email gov info int live mil mobi museum name net news online org pro shop site store tech travel xyz'.split(' ');
  // `.invalid` is the one deliberate non-public exception: it is the deterministic way to exercise terminal
  // NXDOMAIN handling without a live domain. Other special-use labels collide with common files (`.env.example`,
  // `widget.test`) and therefore stay on the conservative non-domain path.
  const PUBLIC_SUFFIXES = new Set(COUNTRY_SUFFIXES.concat(GENERIC_SUFFIXES, ['invalid']));
  /* A FILE NAME IS NOT A HOST (overnight soak 10-15). These public suffixes are also everyday file extensions — .md
     Moldova, .py Paraguay, .sh Saint Helena, .rs Serbia, .pl Poland, .cc Cocos, .tf, .gd, .in … — and a
     lowercase "main.py" / "notes.md" / "soak-poem-x.md" beside "review"/"open"/"check" was read as ONE exact website:
     the run lost team.* and web_search, and a delegated worker was cut to 3 tools. A bare token with one of these
     suffixes is a website only on web evidence (namesFile below). MIXED suffixes are everyday websites AND file
     extensions (claude.ai / logo.ai, notion.so / libfoo.so): a host unless the sentence is about files. Suffixes that
     are rarely file extensions (.com .io .me .to .tv .ly .gg …) stay hosts unless the name is a file this run can see
     or the sentence calls it a file. */
  const FILE_SUFFIXES = new Set('ac am cc gd gs in md mk ml mm mo pl pm ps py rs sc sh sv tf'.split(' '));
  const MIXED_SUFFIXES = new Set(['ai', 'so']);
  // words that put a sentence in a file/code task (tested with the token itself cut out, so "code.py" proves nothing)
  const FILE_WORD_RE = /\b(?:files?|file\s?names?|scripts?|modules?|source|code|codebase|repo|repository|folders?|director(?:y|ies)|workspace|bugs?|fix|debug|refactor|compile|lint|tests?|functions?|class(?:es)?|methods?|imports?|edit|rewrite|write|create|save|rename|append|update|modify|delete|run|execute|line\s+\d+|diff|commit|traceback|stack\s?trace|syntax|crash(?:es)?|errors?)\b/i;
  // words that say the token is a place on the web
  const WEB_WORD_RE = /\b(?:web\s?sites?|sites?|web\s?pages?|home\s?pages?|landing\s+pages?|urls?|links?|domains?|online|internet|visit(?:ing)?|brows(?:e|ing)|docs?|documentation)\b/i;
  const IN_FILE_BEFORE_RE = /\b(?:in|into|inside|within)\s+(?:the\s+)?[`'"([]?$/i;      // "in guide.md", "into notes.md"
  const NAMED_FILE_BEFORE_RE = /\bfiles?\s+(?:(?:named|called)\s+)?[`'"([]?$/i;        // "a file named x.md", "the file x.md"
  const FILE_AFTER_RE = /^[`'")\]]?\s+files?\b/i;                                         // "the notes.md file"
  // "I'll check back later" is not an inspection of anything.
  const DIRECT_RE = /\b(check(?!\s+back\b)|check out|visit|open|read|inspect|browse|look at|review)\b|\b(docs?|documentation|website|site)\b/i;
  const EXPANSIVE_RE = /\b(find|locate|discover)\s+(?:the\s+)?(?:correct|right|official|new|current)\b|\b(alternatives?|similar sites?|where (?:it|the site) moved|domain history|archives?|wayback|compare|across the web)\b|\bsearch\s+(?:the\s+)?web\s+for\b/i;
  /* AN API CALL IS NOT A PAGE READ (issue #58). The policy withholds web_request, so a task that calls one host's
     API ("POST to https://api.x.com/v1/items with ${MY_KEY}, then check the response") lost the only tool that
     can do it — "check"/"read" matched DIRECT_RE — and the agent reported web_request missing. Routines were hit
     hardest: their whole spec is one message, where an interactive chat's follow-up rarely repeats the URL. */
  const API_CALL_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\bweb_request\b|\b(?:endpoints?|webhooks?|bearer|graphql|api[\s_-]?(?:keys?|tokens?|calls?|requests?)|(?:get|post|put|patch|delete|http|rest)\s+requests?)\b|\b(?:call|calls|calling|hit|query|using|via|through)\s+(?:the\s+|their\s+|its\s+|an?\s+)?(?:[\w-]+\s+)?apis?\b|https?:\/\/api\.|https?:\/\/[^\s\/]+\/(?:[^\s]*\/)?(?:api|v\d+)(?:[\/?#\s]|$)/i;
  const HTTP_METHOD_RE = /\b(?:GET|POST|PUT|PATCH|DELETE)\b/;   // case-sensitive: "read the latest post" stays a page read
  /* AN INTERACTIVE VISIT IS NOT A PAGE READ. "open amazon.com and search for usb cables" / "browse github.com and log
     in" / "visit example.com and click the pricing page" matched DIRECT_RE, so the run was confined to one host's
     page read — and the next message without a host was not, which read to the Commander as tools that come and go.
     Clicking, typing, signing in and searching a site are browser work, not the typo-cascade case this module bounds.
     Imperative forms only: "the order status", "the press release", "what type of site" stay bounded page reads. */
  const INTERACTIVE_RE = /\b(?:log\s?(?:in|into|on)|sign\s?(?:in|into|up|on)|click(?:s|ing)?|tap\s+(?:on\s+)?(?:the|a|an)|fill\s+(?:in|out)|type\s+(?:in|into|my|the|a|an|our|your)|press\s+(?:the|a|an|enter|return)|submit|scroll|screenshots?|add\s+(?:\S+\s+){0,4}?to\s+(?:the\s+|my\s+|a\s+)?(?:cart|basket|bag|wishlist)|(?:buy|purchase|order|book)\s+(?:me\s+)?(?:a|an|the|some|\d+|it|them|this|that)|search\s+(?:for|on|it|there)|(?:in|with|using|through)\s+(?:the\s+|a\s+)?browser|browser[._]\w+|navigate\s+(?:to|through|around)|interact\s+with)\b/i;
  const WORKER_MAX_ITERS = 3;
  const WORKER_MAX_TOOLS = 3;
  const WORKER_MAX_MS = 45000;

  function normalizeHost(host) {
    return String(host || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
  }

  /* Is this BARE token (no scheme, no www.) a file name rather than a host? m is a HOST_RE match on src.
     opts.isFile(name) — supplied by the run host — answers whether that exact name exists where this run's
     relative paths land; a name that exists there is a file, whatever its suffix. */
  function namesFile(src, m, suffix, opts) {
    const token = m[1];
    if (opts && typeof opts.isFile === 'function' && opts.isFile(token)) return true;
    const before = src.slice(Math.max(0, m.index - 48), m.index);
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (NAMED_FILE_BEFORE_RE.test(before) || FILE_AFTER_RE.test(after)) return true;
    const fileLike = FILE_SUFFIXES.has(suffix);
    if (!fileLike && !MIXED_SUFFIXES.has(suffix)) return false;
    if (IN_FILE_BEFORE_RE.test(before)) return true;
    const tail = m[2] || '';
    if (/^\/[^\s\/]/.test(tail)) return false;            // docs.rs/tokio — a URL path ("main.py?" and "notes.md#x" are not)
    const rest = src.slice(0, m.index) + ' ' + src.slice(m.index + m[0].length);
    if (FILE_WORD_RE.test(rest)) return true;
    return fileLike && !WEB_WORD_RE.test(rest);            // no web evidence: a file-like suffix stays a file
  }

  function hostsOf(text, opts) {
    const found = [];
    const seen = new Set();
    const src = String(text || '');
    let m;
    HOST_RE.lastIndex = 0;
    while ((m = HOST_RE.exec(src)) !== null) {
      const host = normalizeHost(m[1]);
      const explicitUrl = /^https?:\/\//i.test(m[0]);
      const preceding = m.index > 0 ? src[m.index - 1] : '';
      const suffix = host.slice(host.lastIndexOf('.') + 1);
      if (!explicitUrl && (preceding === '@' || preceding === '/' || preceding === '\\')) continue;
      // Uppercase bare identifiers are overwhelmingly repository filenames (README.md, LICENSE.md). URLs
      // remain case-insensitive when explicit; for a bare ambiguous token, declining classification is safer.
      if (!explicitUrl && m[1] !== m[1].toLowerCase()) continue;
      if (!explicitUrl && !PUBLIC_SUFFIXES.has(suffix)) continue;
      if (!explicitUrl && !/^www\./i.test(m[1]) && namesFile(src, m, suffix, opts)) continue;
      if (!host || seen.has(host)) continue;
      seen.add(host); found.push(host);
    }
    return found;
  }

  function classify(text, opts) {
    const src = String(text || '').trim();
    const hosts = hostsOf(src, opts);
    if (hosts.length !== 1 || !DIRECT_RE.test(src) || EXPANSIVE_RE.test(src)) return null;
    if (API_CALL_RE.test(src) || HTTP_METHOD_RE.test(src) || INTERACTIVE_RE.test(src)) return null;
    return {
      kind: 'direct-domain', host: hosts[0],
      workerMaxIters: WORKER_MAX_ITERS, workerMaxTools: WORKER_MAX_TOOLS, workerMaxMs: WORKER_MAX_MS
    };
  }

  function urlHost(raw) {
    try { return normalizeHost(new URL(String(raw || '')).hostname); } catch (_) { return ''; }
  }

  function isTargetFetch(call, policy) {
    if (!call || !policy || policy.kind !== 'direct-domain') return false;
    const name = String(call.name || '').replace(/_/g, '.');
    if (name !== 'web.fetch') return false;
    return urlHost(call.args && call.args.url) === normalizeHost(policy.host);
  }

  /* web_request to the NAMED host (or one of its subdomains — api.printify.com for printify.com) stays available
     (issue #58). The API-wording carve-out in classify() only helps when the prompt SAYS "api"; a routine like
     "check my orders on printify.com and summarize" with a granted key still lost the one tool that can call the
     shop's API, and the agent truthfully reported web_request missing. Any other host stays refused. */
  function isTargetRequest(call, policy) {
    if (!call || !policy || policy.kind !== 'direct-domain') return false;
    if (String(call.name || '').replace(/\./g, '_') !== 'web_request') return false;
    const h = urlHost(call.args && call.args.url), want = normalizeHost(policy.host);
    return !!h && !!want && (h === want || h.endsWith('.' + want));
  }

  /* The browser stays ADVERTISED on a direct-domain run: a storefront behind a bot wall, a JS-rendered page or a
     search box is exactly what web_fetch cannot read, and withholding every browser.* tool left the agent with no
     tool that could do the job. Its URL-taking entry points (navigate, login) are confined to the named host and
     its subdomains — the same bound as isTargetRequest — so a typo still cannot cascade into engines or archives. */
  function isTargetNavigate(call, policy) {
    if (!call || !policy || policy.kind !== 'direct-domain') return false;
    const name = String(call.name || '').replace(/_/g, '.');
    if (name !== 'browser.navigate' && name !== 'browser.login') return false;
    const h = urlHost(call.args && call.args.url), want = normalizeHost(policy.host);
    return !!h && !!want && (h === want || h.endsWith('.' + want));
  }

  function isDomainMissing(result) {
    const summary = String((result && result.summary) || '').toLowerCase();
    const content = String((result && result.content) || '').toLowerCase();
    const failed = !!(result && (result.isError || result.ok === false));
    return summary === 'domain not found'
      || /\bdomain\b[^\n]{0,160}\bdoes not resolve\b/.test(content)
      || /\bnxdomain\b/.test(content)
      // browser.navigate resolves the name in node before Chrome loads anything ("getaddrinfo ENOTFOUND <host>");
      // a later hop through the station proxy surfaces Chrome's own net::ERR_NAME_NOT_RESOLVED. Only a FAILED call
      // counts: a page that loaded fine can quote "getaddrinfo ENOTFOUND" (node/npm error docs, an issue thread),
      // and stopping that run would tell the Commander a live host does not exist.
      || (failed && (/\benotfound\b/.test(content) || /\berr_name_not_resolved\b/.test(content)));
  }

  function prompt(policy) {
    if (!policy) return '';
    return '[DIRECT DOMAIN CHECK — HOST POLICY] The Commander named one exact host: ' + policy.host + '. '
      + 'Check that host yourself with web_fetch, or with the browser (browser.navigate to that host) when the page '
      + 'needs searching, clicking, or a bot wall blocks the fetch; do not delegate this single-host lookup. If the fetch or navigation reports '
      + 'that the domain does not resolve / NXDOMAIN, that is terminal evidence for this request: make no more '
      + 'web, DNS, archive, WHOIS, certificate, or spelling-variant calls. Report the unavailable host and ask '
      + 'for the corrected URL. Only search for alternatives when the Commander explicitly asked you to find them.';
  }

  function stopControl(policy) {
    return {
      stopTools: true,
      reason: 'target domain does not resolve',
      prompt: '<terminal_domain>The exact requested host ' + policy.host + ' does not resolve. This is terminal '
        + 'evidence for the direct-domain request. Do not call or propose any more tools. Briefly report that the '
        + 'site/docs cannot be read, say the URL is likely mistyped or unavailable, and ask for the corrected URL.</terminal_domain>'
    };
  }

  return {
    classify, hostsOf, normalizeHost, isTargetFetch, isTargetRequest, isTargetNavigate, isDomainMissing, prompt, stopControl,
    WORKER_MAX_ITERS, WORKER_MAX_TOOLS, WORKER_MAX_MS
  };
});
