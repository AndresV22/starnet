'use strict';
/* ONE DAMAGED SPEND-RECORD LINE MUST NOT BRICK EVERY CAPPED RUN FOREVER (customer reports d688ea20: "Spend history
   unavailable" refusals that survived restart, reinstall and a new key; seven threads).

   ledger.jsonl was written for months by appends that could leave a torn or glued line after a crash (the torn-tail
   isolation landed 2026-09-22) and was read leniently, skipping such a line. The strict reader that followed
   (2026-09-19) turned ANY unreadable line into "the spend record could not be read": with a limit the Commander
   chose, every paid run is refused, a restart reads the same bytes, and SETTINGS › SPENDING LIMITS had nothing to
   settle — only "the spend files in your workspaces folder are damaged".

   The fail-closed rule is unchanged: what an unreadable line recorded is UNKNOWN, never $0, and capped work stays
   refused until it is known. What changes is the way out: the damaged line is listed in SPENDING LIMITS like an
   interrupted run, and the Commander settles it with the verified charge. The line itself is never rewritten or
   deleted; the attested row names the line it resolves, so the next boot reads history as complete. A torn tail whose
   full row was journaled before the append is recovered by the journal, and is not asked about. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
(async () => {
  const now = Date.now();
  const good1 = JSON.stringify({ runId: 'prior-1', agentId: 'agent', usd: 0.5, ts: now - 60000 });
  const good2 = JSON.stringify({ runId: 'prior-2', agentId: 'agent', usd: 0.25, ts: now - 30000 });
  // the pre-09-22 shape: a crash tore one row, and the next append was glued onto the fragment
  const glued = '{"runId":"old-a","agentId":"nova","model":"deepseek/deepseek-chat","usd":0.1' + JSON.stringify({ runId: 'old-b', agentId: 'agent', usd: 0.2, ts: now - 45000 });

  // ---- A: a damaged middle line is listed, settled by the Commander, and stays settled across restarts ----
  const f = new SidecarFixture({ prefix: 'ledger-damaged-line-', timeoutMs: 20000, env: { SKYNET_BUDGET_PER_DAY: '10', SKYNET_AUX_BUDGET: '0', SKYNET_QUEST_REFRESH: '0' } });
  const ledger = path.join(f.workspace, 'ledger.jsonl');
  const original = good1 + '\n' + glued + '\n' + good2 + '\n';
  fs.writeFileSync(ledger, original);
  try {
    await f.start();
    let st = (await f.json('GET', '/api/budget/status')).body;
    assert.equal(st.spentToday, null, 'what the damaged line recorded is unknown: no exact total');
    assert.equal(st.accounting.complete, false);
    assert.equal(st.accounting.readError, 'UNSETTLED_SPEND', 'one unknown line, not an unreadable logbook');
    assert.equal(st.unsettled.length, 1, 'the damaged line is listed for the Commander: ' + JSON.stringify(st.unsettled));
    const d = st.unsettled[0];
    assert.equal(d.kind, 'damaged', 'it is named as a damaged record, never as an interrupted run');
    assert.equal(d.agentId, 'nova', 'what can be read off the line helps the Commander find the charge');
    assert.equal(d.model, 'deepseek/deepseek-chat');
    assert.equal(d.runCapUsd, null, 'no limit is claimed');
    assert.ok(st.atLeast && Math.abs(st.atLeast.today - 0.75) < 1e-9, 'the readable rows stay a floor: ' + JSON.stringify(st.atLeast));
    const resume = await f.json('POST', '/api/budget/resume', { scope: 'day' });
    assert.equal(resume.status, 409, 'no headroom over spend it cannot see');
    assert.equal((await f.json('POST', '/api/budget/settle', { runId: d.runId, mode: 'limit' })).status, 400, 'nothing to count it at');
    assert.equal(fs.readFileSync(ledger, 'utf8'), original, 'inspection and refusals never touch the record');

    await f.restart();
    st = (await f.json('GET', '/api/budget/status')).body;
    assert.equal(st.unsettled.length, 1, 'a restart reads the same damaged line: still listed, still unknown');
    assert.equal(st.unsettled[0].runId, d.runId, 'the same line keeps the same identity across boots');

    const settled = await f.json('POST', '/api/budget/settle', { runId: d.runId, usd: 0.3 });
    assert.equal(settled.status, 200, JSON.stringify(settled.body));
    assert.equal(settled.body.unsettled.length, 0);
    assert.ok(Math.abs(settled.body.spentToday - 1.05) < 1e-9, 'the attested charge joins the readable rows: ' + settled.body.spentToday);
    const text = fs.readFileSync(ledger, 'utf8');
    assert.ok(text.startsWith(original), 'the damaged line is preserved byte for byte; nothing was rewritten');
    const att = text.trim().split('\n').slice(3).map(l => JSON.parse(l));
    assert.equal(att.length, 1);
    assert.equal(att[0].attested, true); assert.equal(att[0].attestedAs, 'entered'); assert.equal(att[0].usd, 0.3);
    assert.equal(att[0].resolvesLine, sha(glued), 'the attested row names exactly the line it settles');
    assert.equal((await f.json('POST', '/api/budget/settle', { runId: d.runId, usd: 0.3 })).status, 404, 'no second booking');

    for (let i = 0; i < 2; i++) {
      await f.restart();
      st = (await f.json('GET', '/api/budget/status')).body;
      assert.equal(st.accounting.complete, true, 'history is complete again after restart #' + (i + 1));
      assert.equal(st.unsettled.length, 0);
      assert.ok(Math.abs(st.spentToday - 1.05) < 1e-9, 'settled once, counted once: ' + st.spentToday);
    }
    await f.stop();
  } finally { await f.dispose(); }

  // ---- B: a torn tail whose full row the settlement journal holds is recovered, not asked about ----
  const g = new SidecarFixture({ prefix: 'ledger-torn-tail-', timeoutMs: 20000, env: { SKYNET_BUDGET_PER_DAY: '10', SKYNET_AUX_BUDGET: '0', SKYNET_QUEST_REFRESH: '0' } });
  const ledger2 = path.join(g.workspace, 'ledger.jsonl');
  const entry = { runId: 'crashed-mid-append', agentId: 'agent', turns: 1, usd: 0.4, tokens: 9, model: 'test/m', unmetered: false, ts: now - 1000, entryId: 'e-torn-1' };
  const full = JSON.stringify(entry);
  fs.writeFileSync(ledger2, good1 + '\n' + full.slice(0, 37));   // power lost mid-append: no newline, half a row
  const pending = path.join(g.workspace, '.spend-pending'); fs.mkdirSync(pending, { recursive: true });
  fs.writeFileSync(path.join(pending, sha('settlement:' + entry.entryId) + '.json'), JSON.stringify({ runId: entry.runId, entry }));
  try {
    for (let boot = 0; boot < 2; boot++) {
      await g.start();
      const st = (await g.json('GET', '/api/budget/status')).body;
      assert.equal(st.accounting.complete, true, 'boot ' + boot + ': the journaled row is the authority for its own torn fragment');
      assert.equal(st.unsettled.length, 0, 'nothing to settle: ' + JSON.stringify(st.unsettled));
      assert.ok(Math.abs(st.spentToday - 0.9) < 1e-9, 'counted once: ' + st.spentToday);
      await g.stop();
    }
  } finally { await g.dispose(); }

  // ---- C: a torn tail with no journal (written before journaling existed) is unknown, and listed ----
  const h = new SidecarFixture({ prefix: 'ledger-torn-nojournal-', timeoutMs: 20000, env: { SKYNET_BUDGET_PER_DAY: '10', SKYNET_AUX_BUDGET: '0', SKYNET_QUEST_REFRESH: '0' } });
  fs.writeFileSync(path.join(h.workspace, 'ledger.jsonl'), good1 + '\n' + '{"runId":"lost-tail","agentId":"agent","us');
  try {
    await h.start();
    const st = (await h.json('GET', '/api/budget/status')).body;
    assert.equal(st.spentToday, null, 'a torn row nobody journaled is unknown, never $0');
    assert.equal(st.unsettled.length, 1); assert.equal(st.unsettled[0].kind, 'damaged');
    await h.stop();
  } finally { await h.dispose(); }

  console.log('ledger damaged line HTTP: listed not bricked, settled once by the Commander, record preserved, journaled torn tail recovered, restart PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
