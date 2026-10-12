/* A behavioral comparison must not create free or falsely settled provider calls. */
'use strict';
function makeEvaluationAccounting(options) {
  const o = options || {}, ledger = o.ledger;
  if (!ledger || typeof ledger.beginRun !== 'function' || typeof ledger.recordStrict !== 'function') throw new Error('evaluation ledger required');
  let spent = 0, uncertain = false;
  return {
    canContinue() { return !uncertain && spent < (o.maxUsd || 0.40); },
    beforeRun({ runId }) {
      if (uncertain || !ledger.beginRun(runId, o.agentId, { provider: o.provider, model: o.model, runCapUsd: o.runCapUsd || 0.08 })) {
        uncertain = true;
        throw new Error('Evaluation dispatch could not be durably recorded.');
      }
      return true;
    },
    onRun({ result, runId }) {
      if (!result || ['error', 'cancelled', 'runner-error'].includes(result.reason) || result.accountingIncomplete || !Number.isFinite(result.usd) || result.usd < 0 || !Number.isFinite(result.tokens) || result.tokens < 0 || (result.unpricedUsage || []).length) {
        uncertain = true;
        // Keep the dispatch receipt for reconciliation after restart. Never invent a zero-dollar settlement.
        throw new Error('Evaluation spend is incomplete; its dispatch receipt remains unsettled.');
      }
      spent += result.usd;
      try { ledger.recordStrict({ runId, agentId: o.agentId, turns: result.turns || 0, usd: result.usd, tokens: result.tokens, model: o.model, unmetered: !!o.unmetered }); }
      catch (error) { uncertain = true; throw error; }
    }
  };
}
module.exports = { makeEvaluationAccounting };
