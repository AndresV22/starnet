/* A behavioral comparison must not create free or falsely settled provider calls. */
'use strict';
function makeEvaluationAccounting(options) {
  const o = options || {}, ledger = o.ledger;
  if (!ledger || typeof ledger.beginRun !== 'function' || typeof ledger.recordStrict !== 'function' || typeof ledger.markUnsettled !== 'function') throw new Error('evaluation ledger required');
  let spent = 0, uncertain = false;
  const clearLive = runId => { if (o.budget) o.budget.clearLive(runId); };
  function unknown(runId) {
    uncertain = true;
    // The dispatch receipt is already durable. Make it visible to every station
    // budget check now, rather than waiting for a process restart to discover it.
    ledger.markUnsettled(runId);
    clearLive(runId);
  }
  return {
    canContinue(caseSpent) { return !uncertain && spent + (Number(caseSpent) || 0) < (o.maxUsd || 0.40); },
    beforeRun({ runId }) {
      // An unmetered provider bills nothing per call, so there is no unknown charge to hold a receipt for (runOnce skips it too).
      if (uncertain || (!o.unmetered && !ledger.beginRun(runId, o.agentId, { provider: o.provider, model: o.model, runCapUsd: o.runCapUsd || 0.08 }))) {
        uncertain = true;
        throw new Error('Evaluation dispatch could not be durably recorded.');
      }
      return true;
    },
    onStream({ runId, spentUsd, accountingIncomplete }) {
      if (accountingIncomplete && !o.unmetered) unknown(runId);
      else if (o.budget) o.budget.noteLive(runId, o.unmetered ? 0 : spentUsd);
    },
    onRun({ result, runId }) {
      if (o.unmetered) {
        // Every outcome there (done, failed, timed out, cancelled) is known $0: book it unmetered, out of USD caps.
        const tokens = result && Number.isFinite(result.tokens) && result.tokens >= 0 ? result.tokens : 0;
        try { ledger.recordStrict({ runId, agentId: o.agentId, turns: (result && result.turns) || 0, usd: 0, tokens, model: o.model, unmetered: true }); }
        catch (error) { uncertain = true; throw error; }
        finally { clearLive(runId); }
        return;
      }
      if (!result || ['error', 'cancelled', 'runner-error'].includes(result.reason) || result.accountingIncomplete || !Number.isFinite(result.usd) || result.usd < 0 || !Number.isFinite(result.tokens) || result.tokens < 0 || (result.unpricedUsage || []).length) {
        unknown(runId);
        // Keep the dispatch receipt for explicit settlement, now or after restart.
        throw new Error('Evaluation spend is incomplete; its dispatch receipt remains unsettled.');
      }
      spent += result.usd;
      try { ledger.recordStrict({ runId, agentId: o.agentId, turns: result.turns || 0, usd: result.usd, tokens: result.tokens, model: o.model, unmetered: !!o.unmetered }); }
      catch (error) { uncertain = true; throw error; }
      finally { clearLive(runId); }
    }
  };
}
module.exports = { makeEvaluationAccounting };
