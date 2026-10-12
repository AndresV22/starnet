/* Durable terminal-job receipts. A completed stage and a current belt path cannot
   prove a shipment: loops revisit stages and COPY branches meet before one output.
   Only the chain's OUTBOX callback may mint a receipt, backed by its exact run rows.
   Clock and persistence are injected; failed persistence never publishes a count. */
'use strict';
const { note: failNote } = require('../failopen.js');
const id = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 256 && !/[\x00-\x1f\x7f]/.test(v) ? v : null;
const propId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const time = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const keyOf = r => JSON.stringify([r.lineId, r.entryRunId]);
const validReceipt = r => !!r && typeof r === 'object' && !Array.isArray(r) && propId(r.lineId) && id(r.entryRunId) && id(r.terminalRunId) && propId(r.outboxId) && time(r.at);
const receiptView = r => ({ lineId: r.lineId, entryRunId: r.entryRunId, terminalRunId: r.terminalRunId, outboxId: r.outboxId, at: r.at });
function cleanShipments(value) {
  const out = [], seen = new Set();
  for (const r of Array.isArray(value) ? value : []) {
    if (!validReceipt(r)) continue;
    const key = keyOf(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(receiptView(r));
  }
  return out;
}
// Persistence must not discard malformed evidence and later overwrite it with a
// guessed repair. Exact duplicate copies mean one receipt; conflicting copies
// of the same job cannot choose their own OUTBOX, terminal run or timestamp.
function validateShipments(value) {
  if (!Array.isArray(value)) throw new Error('shipment history is not an array');
  const out = [], seen = new Map();
  for (let i = 0; i < value.length; i++) {
    const r = value[i];
    if (!validReceipt(r)) throw new Error('shipment history has an invalid receipt at row ' + i);
    const clean = receiptView(r), key = keyOf(clean), previous = seen.get(key);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(clean)) throw new Error('shipment history has conflicting duplicate receipts at row ' + i);
      continue;
    }
    seen.set(key, clean); out.push(clean);
  }
  return out;
}
// Domain-store defaults are legitimate only for an absent file. Unreadable,
// corrupt and invalid reads carry [] too, but never authorize a replacement.
function loadShipmentReceipts(store) {
  const read = store.load();
  if (!read || !['ok', 'recovered', 'absent'].includes(read.status) || !Array.isArray(read.value)) {
    throw new Error('shipment history could not be read (' + ((read && read.status) || 'unknown') + ')');
  }
  return validateShipments(read.value);
}
function makeLineShipments(options) {
  const o = options || {}, now = typeof o.now === 'function' ? o.now : () => 0;
  const load = typeof o.load === 'function' ? o.load : () => [];
  const save = typeof o.save === 'function' ? o.save : () => {};
  const runsFor = typeof o.runsFor === 'function' ? o.runsFor : () => [];
  let receipts = null;
  function ensure() {
    if (!receipts) { try { receipts = validateShipments(load()); } catch (e) { failNote('line-shipments.load', e); throw e; } }
    return receipts;
  }
  function record(rec) {
    const r = rec || {}, at = now();
    if (!propId(r.lineId) || !id(r.entryRunId) || !id(r.streamId) || !propId(r.outboxId) || !id(r.agentId)
      || (r.dockId != null && !propId(r.dockId)) || !time(at)) return false;
    let current; try { current = ensure(); } catch (_) { return false; }
    const key = keyOf(r);
    if (current.some(s => keyOf(s) === key)) return true;
    let rows;
    try { rows = runsFor(r.streamId); } catch (e) { failNote('line-shipments.runs', e); return false; }
    if (!Array.isArray(rows)) return false;
    // runStore returns newest-first. The entry run is an exact boundary, including
    // when adjacent jobs on the same channel started in the same millisecond.
    const entry = rows.findIndex(x => x && x.runId === r.entryRunId && x.streamId === r.streamId && x.lineId === r.lineId);
    if (entry < 0) return false;
    const job = rows.slice(0, entry + 1).filter(x => x && x.streamId === r.streamId && x.lineId === r.lineId);
    if (!job.length || job.some(x => x.stepTest === true || x.reason !== 'done' || !id(x.runId))) return false;
    // Keep the existing productive-work rule. Talk-only answers can be delivered
    // but do not manufacture SHIPPED work; one productive job counts once.
    if (!job.some(x => Number(x.toolsOk) > 0 || (Array.isArray(x.artifacts) && x.artifacts.length > 0))) return false;
    const terminal = job.find(x => x.agentId === r.agentId && (!r.dockId || x.dockId === r.dockId));
    if (!terminal) return false;
    const receipt = { lineId: r.lineId, entryRunId: r.entryRunId, terminalRunId: terminal.runId, outboxId: r.outboxId, at };
    const next = current.concat([receipt]);
    try { save(next); } catch (e) {
      // Main may already contain next even though its read-back failed. Re-load
      // authority before another write; an old cache could erase that commit.
      receipts = null; failNote('line-shipments.persist', e); return false;
    }
    receipts = next;
    return true;
  }
  return { record, snapshot: () => cleanShipments(ensure()) };
}
module.exports = { cleanShipments, validateShipments, makeLineShipments, loadShipmentReceipts };
