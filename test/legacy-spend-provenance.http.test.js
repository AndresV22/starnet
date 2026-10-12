'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SidecarFixture}=require('./helpers/sidecar-fixture.js');
(async()=>{
 const f=new SidecarFixture({prefix:'legacy-spend-provenance-',timeoutMs:20000,env:{SKYNET_BUDGET_PER_DAY:'10',SKYNET_AUX_BUDGET:'0'}});
 const dir=path.join(f.workspace,'.spend-pending');fs.mkdirSync(dir,{recursive:true});
 const rows=[{runId:'legacy-origin',agentId:'agent'},{runId:'provider-only',agentId:'agent',provider:'starnet'},{runId:'known-managed',agentId:'agent',managed:true,provider:'starnet'},{runId:'known-byok',agentId:'agent',managed:false,provider:'openrouter'}];
 const ledger=path.join(f.workspace,'ledger.jsonl'),original=JSON.stringify({runId:'prior',agentId:'agent',usd:1,ts:Date.now()})+'\n';fs.writeFileSync(ledger,original);
 for(const r of rows)fs.writeFileSync(path.join(dir,crypto.createHash('sha256').update(r.runId).digest('hex')+'.json'),JSON.stringify(r));
 try {
  for(let boot=0;boot<2;boot++) {
   await f.start();const st=(await f.json('GET','/api/budget/status')).body;
   assert.equal(st.spentToday,null);assert.equal(st.accounting.complete,false);assert.equal(st.unsettled.length,rows.length);
   for(const r of rows){const actual=st.unsettled.find(x=>x.runId===r.runId);assert.ok(actual);assert.equal(actual.managed,typeof r.managed==='boolean'?r.managed:null);assert.equal(actual.runCapUsd,null);}
   for(const r of rows){const rejected=await f.json('POST','/api/budget/settle',{runId:r.runId,mode:'limit'});assert.equal(rejected.status,400);assert.match(rejected.body.error,r.managed===true?/RECENT ACTIVITY/:r.managed===false?/provider dashboard/:/no per-run limit or billing source/);}
   assert.equal((await f.json('POST','/api/budget/resume',{scope:'day'})).status,409);
   assert.equal(fs.readFileSync(ledger,'utf8'),original,'inspection/refusal cannot book money');assert.equal(fs.readdirSync(dir).length,rows.length,'all unresolved receipts preserved');
   await f.stop();
  }
  console.log('legacy spend provenance HTTP: four origins, unknown totals, absent caps, refusal and restart PASS');
 } finally {await f.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1});
