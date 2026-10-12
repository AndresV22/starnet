'use strict';

// The Skills backend can be completely healthy while a missing frontend lane dependency makes
// ABILITIES silently omit SKILL LIBRARY, AGENT SKILLS, and SKILL EXCHANGE. connectors.js deliberately
// catches lane-builder errors so one optional lane cannot break the whole console; this test therefore
// executes the production lane builder and requires every shipped Skills section to survive that seam.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('./_assert.js');

const source = fs.readFileSync(path.join(__dirname, '../frontend/app/stationui.js'), 'utf8');
const laneMatch = source.match(/function abilitySkillsLane\(body\) \{[\s\S]*?\n  \}\n  window\.AbilityLanes/);
A.ok(laneMatch, 'the ABILITIES Skills lane is present');

const laneSource = laneMatch[0].replace(/\n  window\.AbilityLanes[\s\S]*$/, '');
const context = {
  present: [{ id: 'agent', name: 'Agent' }],
  sel: 0,
  esc: value => String(value),
  result: null
};
vm.runInNewContext(laneSource + '\nresult = abilitySkillsLane({});', context);

A.eq(context.result.sections.map(section => section.id), ['market', 'library', 'agent', 'exchange'],
  'the live lane builds all four Skills sections without throwing');
A.eq(context.result.sections.map(section => section.label), ['SKILL MARKET', 'SKILL LIBRARY', 'AGENT SKILLS', 'SKILL EXCHANGE'],
  'the live lane exposes the four promised labels');
A.ok(/function\s+scanFindingText\s*\(/.test(source), 'Skill Exchange scan findings renderer is defined');
A.ok(/function\s+renderSkillExchangePreview\s*\(/.test(source), 'Skill Exchange preview renderer is defined');
A.ok(/function\s+wireSkillExchange\s*\(/.test(source), 'Skill Exchange controls are wired');
A.ok(/window\.AbilityLanes\.push\(abilitySkillsLane\)/.test(source), 'the Skills lane registers with ABILITIES');
A.ok(source.includes("skills.length + ' skill'"), 'the library count calls these procedures skills, not launchable recipes');
A.ok(/id="sk-exchange-preview"[^>]*role="status"[^>]*aria-live="polite"/.test(source),
  'Skill Exchange inspection and validation feedback is announced');
A.ok(source.includes('PACKAGE SHA-256') && source.includes('sk-package-file'), 'review exposes the complete package manifest and exact digest');
A.ok(source.includes('IMPORT EXPORTED PACKAGE') && source.includes('data-ag-act="export"'), 'lossless import and export controls are present');
A.ok(source.includes('data-ag-act="generations"') && source.includes('data-rollback='), 'offline generation rollback is exposed');
A.ok(source.includes('DISCOVER SITE') && source.includes('SAVE TAP'), 'registry discovery and user-managed taps are exposed');
A.ok(!source.includes('referenced package files remain at the source'), 'the obsolete single-document limitation is gone');

// A Full Access user must not be sent to place a cabinet just to load FILES instructions.
// Exercise the actual UI loader with the real authority projection, not a second grant calculation.
async function checkAvailability() {
  const { effectiveToolsets } = require('../sidecar/capability/effective-toolsets.js');
  const loader = source.match(/function loadSkillLibrary\(agentId\) \{[\s\S]*?\n  \}/)[0];
  async function run(view, shared = []) {
    let requested = '', rendered = null;
    const host = { innerHTML:'', closest:() => null };
    vm.runInNewContext(loader + '\nloadSkillLibrary("agent");', {
      $: () => host, Harness:{api:{get:async () => view}},
      World:{heroCaps:() => [],stationCaps:() => shared.map(objectType => ({objectType}))},
      fetch:async url => { requested = url; return {ok:true,json:async () => ({skills:[]})}; },
      renderSkillLibrary:(_host,_skills,_id,placed) => { rendered = Array.from(placed); },
      requestAnimationFrame:() => {}, encodeURIComponent
    });
    await new Promise(resolve => setImmediate(resolve));
    return {requested,rendered,host};
  }
  const full = await run(effectiveToolsets({fullAccess:true}));
  A.ok(full.rendered.includes('cabinet') && full.requested.includes('cabinet'), 'Full Access projects FILES into skill availability without a placed cabinet');
  const profile = await run(effectiveToolsets({agent:{executionProfile:'safe-cell',approvalMode:'ask'}}), ['dish']);
  A.ok(profile.rendered.includes('cabinet') && profile.rendered.includes('dish'), 'profile objects and shared station gear follow the runtime skill context');
  const restricted = await run(effectiveToolsets({agent:{executionProfile:'station-gear',approvalMode:'ask'}}));
  A.ok(!restricted.rendered.includes('cabinet'), 'restricted station without FILES does not invent that ability');
  const unavailable = await run(null);
  A.eq(unavailable.requested, '', 'unavailable authority never produces a guessed skill query');
  A.ok(unavailable.host.innerHTML.includes('Could not load'), 'unavailable authority renders recovery instead of missing-prop advice');
  await checkCandidateReview();
  A.report('abilities.skills-lane.test');
}
checkAvailability().catch(error => { console.error(error); process.exitCode = 1; });

// Execute the real pending-review callbacks. These controls must send the receipt the
// server issued and the candidate digest displayed to the user, never a client verdict.
async function checkCandidateReview() {
  function element() {
    const children = [], found = {};
    return { children, dataset: {}, disabled: false, textContent: '', value: '',
      appendChild(child) { children.push(child); },
      querySelector(key) { return found[key] || (found[key] = element()); },
      set innerHTML(html) { this.html = html; }, get innerHTML() { return this.html || ''; } };
  }
  const postSource = source.slice(source.indexOf('  async function skillReviewPost('), source.indexOf('  function loadAgentSkills('));
  const renderSource = source.slice(source.indexOf('  function renderSkillCandidates('), source.indexOf('  function renderAgentSkills('));
  const requests = [], reloads = [], host = element(); let status = 'passed';
  const ctx = { host, esc: String, mkEl: element, loadAgentSkills: id => reloads.push(id),
    Harness: { api: { post: async (path, body) => { requests.push({ path, body }); return { ok: true, j: { ok: true, receipt: { receiptId: 'host-receipt', status } } }; } } },
    review: { candidates: [{ candidateId: 'candidate-3', candidateDigest: 'exact-sha', revision: 3,
      skill: { id: 'brief', name: 'Brief', body: 'Proposed instructions', scope: 'agent', files: [] } }],
      evaluationSuites: [{ id: 'brief-checks', skillId: 'brief', description: 'Weekly brief checks' }] }
  };
  vm.runInNewContext(postSource + renderSource + '\nrenderSkillCandidates(host, "agent", review);', ctx);
  const card = host.children[0], approve = card.querySelector('[data-candidate-approve]');
  // Fake DOM does not parse disabled attributes, but the actual markup must start disabled.
  A.ok(card.html.includes('data-candidate-approve disabled'), 'pending approval starts disabled');
  A.ok(card.html.includes('does not prove improvement for every use'), 'UI states evaluation scope honestly');
  const run = card.querySelector('[data-evaluation-suites]').children[1];
  await run.onclick();
  A.eq(requests[0].body.candidateDigest, 'exact-sha', 'evaluation request binds displayed revision');
  A.eq(requests[0].body.suiteId, 'brief-checks', 'host selects runner for registered suite');
  A.eq(approve.disabled, false, 'passing host receipt enables separate approval action');
  await approve.onclick();
  A.eq(requests[1].body.evaluation, 'host-receipt', 'approval uses durable host receipt ID');
  A.eq(requests[1].body.candidateDigest, 'exact-sha', 'approval remains bound to displayed revision');
  A.ok(!Object.hasOwn(requests[1].body, 'status'), 'UI cannot manufacture evaluation status for approval');
  A.eq(reloads, ['agent'], 'confirmed approval reloads authoritative state');
  const host2 = element(); ctx.host = host2; status = 'regression';
  vm.runInNewContext('renderSkillCandidates(host, "agent", review);', ctx);
  const card2 = host2.children[0];
  await card2.querySelector('[data-evaluation-suites]').children[1].onclick();
  A.eq(card2.querySelector('[data-candidate-approve]').disabled, true, 'regressed proposal cannot be approved from panel');
  await card2.querySelector('[data-candidate-reject]').onclick();
  A.ok(requests.at(-1).path.endsWith('/reject-candidate'), 'reject has a separate server decision');
  const host3 = element(); ctx.host = host3;
  vm.runInNewContext('renderSkillCandidates(host, "agent", review);', ctx);
  const card3 = host3.children[0];
  card3.querySelector('[data-suite-json]').value = JSON.stringify({ id: 'custom', skillName: 'Brief', cases: [] });
  await card3.querySelector('[data-suite-register]').onclick();
  A.eq(requests.at(-1).body.skillId, 'brief', 'custom task checks are bound to the owned skill');
  A.ok(requests.at(-1).path.endsWith('/evaluation-suite'), 'suite JSON is validated by host route');
}
