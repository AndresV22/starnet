'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {SidecarFixture}=require('../../../test/helpers/sidecar-fixture.js');
const model='openai/gpt-4o-mini';
const key=(/^SKYNET_OPENROUTER_KEY=(.+)$/m.exec(fs.readFileSync('C:/Users/andro/Desktop/gen/dev/.env.dev','utf8'))||[])[1]?.trim().replace(/^["']|["']$/g,'');assert.ok(key,'dev key configured');
const fixture=new SidecarFixture({prefix:'memory-live-1011-',timeoutMs:60000,env:{SKYNET_OPENROUTER_KEY:key,SKYNET_REFLECT:'0',SKYNET_SKILL_REVIEW:'0',SKYNET_EDGE_TTS:'0',SKYNET_FULL_ACCESS:'1',SKYNET_AUX_BUDGET:'0',SKYNET_BUDGET_PER_RUN:'0.10',SKYNET_BUDGET_GLOBAL:'0.50'}});
let usd=0;const results=[];const check=(name,ok,detail)=>{results.push({name,ok:!!ok,detail});console.log(JSON.stringify(results.at(-1)));};
async function send(streamId,history,text,isTask=false){
 const r=await fixture.request('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:'agent',provider:'openrouter',key,model,streamId,isTask,objects:['computer','notebook'],messages:[...history,{role:'user',content:text}]}),signal:AbortSignal.timeout(180000)});
 const raw=await r.text();assert.equal(r.status,200,raw.slice(0,400));const events=raw.split('\n').filter(Boolean).map(JSON.parse),end=events.find(e=>e.name==='agent.run.end');assert.ok(end,'terminal event');usd+=Number(end.payload.usd)||0;
 const reply=events.filter(e=>e.name==='agent.token').map(e=>e.payload.delta||'').join('').trim();console.log(JSON.stringify({streamId,reason:end.payload.reason,reply,usd:end.payload.usd,tools:events.filter(e=>e.name==='agent.tool_call').map(e=>e.payload.name),pineappleInToolResults:events.filter(e=>e.name==='agent.tool_result'&&/PINEAPPLE/i.test(JSON.stringify(e.payload))).map(e=>({callId:e.payload.callId,pineapple:true}))}));return{reply,end:end.payload};
}
(async()=>{try{
 await fixture.start();await fixture.json('POST','/api/memory/config',{reflectEnabled:false});await fixture.json('POST','/api/roster',{agents:[{agentId:'agent',name:'Hero',model,provider:'openrouter'}]});
 if(!process.argv.includes('--preferences-only')){ const history=[];for(const q of ['For this conversation only, end each reply with the exact word PINEAPPLE. Reply OK to confirm.','What is 2 plus 3?','Name a planet.','What colour is a clear sky?']){const r=await send('recall-original',history,q);assert.equal(r.end.reason,'done');history.push({role:'user',content:q},{role:'assistant',content:r.reply});}
 const windowed=history.slice(-4).map(m=>m.role==='assistant'?{...m,content:m.content.replace(/\W*PINEAPPLE\W*$/i,'').trim()}:m);
 for(const[i,q]of ['How many legs does a spider have?','Name an ocean.'].entries()){const lane=await send('recall-original',windowed,q),control=await send('recall-control-'+i,windowed,q);check('trimmed history recall '+i,/\bPINEAPPLE\W*$/i.test(lane.reply)&&!(/\bPINEAPPLE\W*$/i.test(control.reply)),{lane:lane.reply,control:control.reply});}
 } const saved=await send('preference-save',[],'From now on, always call me Captain Nemo whenever you address me. Please remember that for all future conversations.',true);
 check('conversation-only suffix stays out of fresh task',!/PINEAPPLE/i.test(saved.reply),saved.reply); const notes=((await fixture.json('GET','/api/memory/records?agent=agent')).body.records||[]).filter(r=>/nemo/i.test(r.body||r.content||''));check('durable global record',notes.some(n=>n.scope==='global'),notes.map(n=>({id:n.id,scope:n.scope,confirmation:n.confirmation,body:n.body})));
 const receipts=(await fixture.json('GET','/api/memory/proposals?agent=agent&run='+encodeURIComponent(saved.end.runId))).body;check('saving run receipt',!!receipts.proposals?.some(p=>p.saved),receipts);
 await fixture.restart();const fresh=await send('preference-fresh',[],'Hi! Greet me the way I asked you to, in one short sentence.');check('fresh conversation after restart',/Captain Nemo/i.test(fresh.reply),fresh.reply);
 const quiet=(await fixture.json('GET','/api/memory/proposals?agent=agent&run='+encodeURIComponent(fresh.end.runId))).body;check('non-saving run empty receipt',Array.isArray(quiet.proposals)&&quiet.proposals.length===0,quiet);
  const corrected=await send('preference-correct',[],'Correction: from now on, always call me Captain Mira instead of Captain Nemo. Update the existing saved preference for every future conversation.',true);
 const after=((await fixture.json('GET','/api/memory/records?agent=agent')).body.records||[]).filter(r=>/Captain (Nemo|Mira)/i.test(r.body||r.content||''));
 check('correction is durably recorded',after.some(r=>/Captain Mira/i.test(r.body||'')),after.map(r=>({id:r.id,body:r.body,confirmation:r.confirmation,scope:r.scope})));
 await fixture.restart();const latest=await send('preference-latest',[],'Hi! Greet me the way I asked you to, in one short sentence.');check('newest preference wins after restart',/Captain Mira/i.test(latest.reply)&&!/Captain Nemo/i.test(latest.reply),latest.reply);
 if(results.some(r=>!r.ok))process.exitCode=1;
}catch(e){console.error(e.stack);process.exitCode=1;}finally{fs.writeFileSync('.tmp/scope-live-results.json',JSON.stringify({model,usd,results},null,2));fs.writeFileSync('.tmp/scope-live-sidecar.log',fixture.output());await fixture.dispose();}})();
