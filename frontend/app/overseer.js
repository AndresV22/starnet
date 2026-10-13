'use strict';

// Reuse existing sessions and transcript reconciliation; never change chat focus.
const Overseer = (() => {
  let busy = false, lastDeliveries = '', last = null;   // last = the latest /api/overseer answer (Delegated reads it)
  async function refresh() {
    if (busy || typeof Workstreams === 'undefined' || !Workstreams.generalId()) return;
    busy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/overseer', { signal: controller.signal });
      if (!response.ok) throw new Error('Delegation synchronization unavailable');
      const data = await response.json();
      let adopted = false;
      for (const row of data.threads || []) {
        if (!row.parentStreamId || !Workstreams.get(row.parentStreamId)) continue;
        const local = Workstreams.get(row.id);
        const before = local && [local.parentStreamId, local.worker, local.projectRoot];
        // Reconciliation may have filed the result first. The store adopts its missing thread
        // metadata and invalidates delegated participation before CREW or search reads it.
        const adoptedRow = Workstreams.adopt(row);
        if (adoptedRow && (!before || before[0] !== adoptedRow.parentStreamId || before[1] !== adoptedRow.worker || before[2] !== adoptedRow.projectRoot)) adopted = true;
      }
      last = data;
      if (adopted) { App.persist(); App.refreshRail(); }
      if (typeof Delegated !== 'undefined' && Delegated.repaint) Delegated.repaint();   // the parent's DELEGATED card follows the ledger
      const deliveries = JSON.stringify([(data.workers || []).map(w => [w.runId, w.status]),
        (data.reviews || []).map(r => [r.reviewRunId, r.status])]);
      if ((adopted || deliveries !== lastDeliveries) && typeof StationCommands !== 'undefined') {
        await StationCommands.reconcile(); lastDeliveries = deliveries;
      }
    } catch (error) {
      // Existing connection UI owns outages. Retry reconciliation after recovery.
      lastDeliveries = '';
      console.debug('[overseer sync]', error.message);
    } finally { clearTimeout(timeout); busy = false; }
  }
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { refresh(); setInterval(refresh, 2500); });
  return { refresh, snapshot: () => last };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Overseer;
