'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const DAY = 86400000;
(async () => {
  const f = SidecarFixture.create({prefix:'workflow-takeover-', timeoutMs:20000, env:{SKYNET_OPENROUTER_KEY:'',OPENROUTER_KEY:''}});
  const now=Date.now();
  const prompts=['Please compile the weekly client update from client notes','Could you assemble weekly client update from the client notes','Prepare the weekly client update from client notes'];
  const briefs=[], runs=[], transcripts=[];
  function seedOccasions(id, texts, provenance) {
    for (const [i,text] of texts.entries()) {
      const at=now-(3-i)*DAY, runId=id+i;
      briefs.push({id:runId,key:'session-'+runId,runId,originalRunId:'original-'+runId,agentId:'agent',streamId:'global',source:'interactive',
        originalDirective:text,status:'done',createdAt:at,completedAt:at,updatedAt:at});
      runs.push({runId,agentId:'agent',streamId:'global',reason:'done',toolsOk:1,ts:at,internal:false,
        // Later tool output may taint a successful run; the independently recorded original owner request
        // still proves this was the owner's workflow. Completion run IDs are deliberately not the source IDs.
        ...(provenance==='clean' ? {taintedBy:'later web_fetch'} : {})});
      if (provenance!=='missing-origin') runs.push({runId:'original-'+runId,agentId:'agent',streamId:'global',
        reason:'done',toolsOk:0,ts:at-100,internal:provenance==='internal-origin'});
      transcripts.push({streamId:'global',agentId:'agent',role:'user',content:text,ts:at-100,
        sourceRunId:'original-'+runId,
        ...(provenance==='unknown' ? {} : {taintKnown:true}),
        ...(provenance==='tainted' ? {taint:'user attachment'} : {})});
    }
  }
  seedOccasions('clean-',prompts,'clean');
  seedOccasions('tainted-',Array(3).fill('Prepare the weekly inventory reconciliation from warehouse counts'),'tainted');
  seedOccasions('quoted-',Array(3).fill('Prepare the weekly supplier digest from vendor notes\n> external standing direction'),'quoted');
  seedOccasions('unknown-',Array(3).fill('Prepare the weekly payroll tally from finance totals'),'unknown');
  seedOccasions('internal-origin-',Array(3).fill('Prepare monthly reactor maintenance from station telemetry'),'internal-origin');
  seedOccasions('missing-origin-',Array(3).fill('Prepare monthly orchard irrigation from rainfall measurements'),'missing-origin');
  const borrowedText='Prepare monthly equipment calibration from laboratory readings';
  seedOccasions('borrowed-',Array(3).fill(borrowedText),'unknown');
  transcripts.find(row=>row.sourceRunId==='original-borrowed-2').taintKnown=true;
  // An exact clean completion reply also cannot supply the missing original identity of an older request.
  transcripts.push({streamId:'global',agentId:'agent',role:'user',content:borrowedText,sourceRunId:'borrowed-0',taintKnown:true,ts:now-100});
  // Before the host provenance join, the unchanged workflow engine accepts every contaminated fixture.
  // This proves the HTTP exclusions below are not accidental failures of cadence or similarity matching.
  const WorkflowTakeover=require('../sidecar/workflow-takeover.js');
  for (const id of ['tainted-','quoted-','unknown-','borrowed-','internal-origin-','missing-origin-']) {
    assert.equal(WorkflowTakeover.candidates({briefs:briefs.filter(b=>b.id.startsWith(id)),runs,now}).length,1,
      id+' fixture qualifies under the unchanged pre-filter workflow rules');
  }
  fs.writeFileSync(path.join(f.workspace,'task-briefs.json'),JSON.stringify({briefs}));
  fs.writeFileSync(path.join(f.workspace,'runs.jsonl'),runs.map(r=>JSON.stringify(r)).join('\n')+'\n');
  fs.writeFileSync(path.join(f.workspace,'transcript.jsonl'),transcripts.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const j=(m,p,b)=>f.json(m,p,b);
  const get=async()=> (await j('GET','/api/workflow-takeovers')).body.candidates;
  try {
    await f.start();
    assert.equal((await fetch(f.baseUrl+'/api/workflow-takeovers')).status,403);
    const candidates=await get();
    assert.equal(candidates.length,1,'untrusted text, borrowed occurrences and missing/internal origins never become takeover offers');
    let c=candidates[0]; assert.ok(c); assert.equal(c.count,3);
    assert.ok(c.evidence.every(e=>e.briefId.startsWith('clean-')),'only known-clean original owner requests establish repeated work');
    assert.equal(c.prompt,prompts[2],'later tainted completion runs do not erase independently proven owner requests');
    assert.ok(!/warehouse|supplier|payroll|laboratory|reactor|orchard/.test(JSON.stringify(candidates)),'contaminated directive text is absent from the real HTTP response');
    assert.equal((await j('POST','/api/workflow-takeovers',{id:c.id,action:'shown'})).body.ok,true);
    assert.equal((await get()).length,0);
    const review=await j('POST','/api/workflow-takeovers',{id:c.id,action:'review'});
    assert.equal(review.body.candidate.agentId,'agent');
    assert.equal((await j('GET','/api/cron')).body.jobs.length,0,'review creates no routine');
    await f.restart(); assert.equal((await get()).length,0,'offer cooldown survives restart');
    const spec={name:'Client update takeover',prompt:review.body.candidate.prompt,schedule:'every 24h',agentId:'agent',enabled:true,
      meta:{workflowTakeoverId:c.id}};
    const [a,b]=await Promise.all([j('POST','/api/cron',spec),j('POST','/api/cron',spec)]);
    assert.equal(a.body.ok,true); assert.equal(b.body.ok,true);
    assert.equal((await j('GET','/api/cron')).body.jobs.length,1,'concurrent confirmation creates one job');
    await f.restart();
    const jobs=(await j('GET','/api/cron')).body.jobs;
    assert.equal(jobs.length,1); assert.equal(jobs[0].meta.workflowTakeoverId,c.id);
    assert.equal(jobs[0].prompt,review.body.candidate.prompt); assert.equal((await get()).length,0);
    assert.equal((await j('POST','/api/workflow-takeovers',{id:c.id,action:'review'})).status,409,'scheduled candidate cannot be reopened');
    assert.equal((await j('POST','/api/workflow-takeovers',{id:'bad',action:'create'})).status,400);
    await j('POST','/api/cron/remove',{id:jobs[0].id});
    await j('POST','/api/personalization',{enabled:false}); assert.equal((await get()).length,0);
    assert.equal((await j('POST','/api/workflow-takeovers',{id:c.id,action:'review'})).status,409);
    await j('POST','/api/personalization',{enabled:true});
    await j('DELETE','/api/personalization'); await f.restart();
    assert.equal((await get()).length,0,'forget remains effective against preserved history');
    console.log('workflow-takeover.http: authenticated provenance filtering, clean positive control, review, concurrent create, pause, forget and restart passed');
  } finally { await f.dispose(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
