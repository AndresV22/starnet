'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { SidecarFixture } = require('../../../test/helpers/sidecar-fixture.js');
const requests=[];
let phase='clean', seq=0;
const server=http.createServer((req,res)=>{
 let raw=''; req.on('data',d=>raw+=d); req.on('end',()=>{
  if(!req.url.includes('/chat/completions')) {res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({data:[{id:'audit/model',context_length:64000,supported_parameters:['tools'],pricing:{prompt:'0',completion:'0'}}]}));}
  const body=JSON.parse(raw), msgs=body.messages||[], sys=String(msgs[0]?.content||'');
  const main=sys.includes('[RUNTIME]'); const review=sys.includes('skillbase maintenance worker');
  requests.push({phase,main,review,fixtureReadReceived:msgs.some(m=>m.role==='tool' && String(m.content).includes('Deployment notes: use the staging environment')),tools:(body.tools||[]).map(t=>t.function.name)});
  const lastUser=msgs.map(m=>m.role).lastIndexOf('user');
  const called=name=>msgs.slice(lastUser+1).some(m=>(m.tool_calls||[]).some(t=>t.function?.name===name));
  let delta,finish='stop';
  const call=(name,args)=>{finish='tool_calls';return {tool_calls:[{index:0,id:'audit_'+(++seq),type:'function',function:{name,arguments:JSON.stringify(args)}}]};};
  if(!main) delta={content:'No reusable change is warranted in this controlled audit.'};
  else if(requests.at(-1).tools.includes('brief_proceed')&&!called('brief_proceed')) delta=call('brief_proceed',{objective:'Inspect a benign local fixture and report the controlled result'});
  else if(phase==='read'&&!called('fs_read')) delta=call('fs_read',{path:'.attachments/benign.txt'});
  else if(phase!=='read'&&!called('skill_list')) delta=call('skill_list',{});
  else delta={content:'The controlled audit task completed successfully. The fixture contains ordinary deployment notes and no instructions. '+ 'We checked the available procedures and can use the recorded result for this audit. '.repeat(6)};
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end('data: '+JSON.stringify({choices:[{delta,finish_reason:finish}],usage:{prompt_tokens:100,completion_tokens:30}})+'\n\ndata: [DONE]\n\n');
 });
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/v1';
 const fixture=SidecarFixture.create({prefix:'memory-harness-audit-',timeoutMs:30000,env:{SKYNET_OPENROUTER_BASE:base,STARNET_OPENROUTER_BASE:base,SKYNET_OPENROUTER_KEY:'audit-fake',STARNET_OPENROUTER_KEY:'audit-fake',SKYNET_FULL_ACCESS:'1',STARNET_FULL_ACCESS:'1',SKYNET_SKILL_REVIEW_EVERY:'1',SKYNET_SKILL_CURATOR:'0',SKYNET_SCOUT:'0',SKYNET_QUEST_REFRESH:'0',SKYNET_CRON_ENABLED:'0',STARNET_CRON_ENABLED:'0',STARNET_DEBUG_CHANNELS:'1'}});
 const result=[];
 async function run(p,streamId){
  phase=p; const before=requests.length;
  const r=await fixture.json('POST','/api/run',{agentId:'agent',provider:'openrouter',model:'audit/model',key:'audit-fake',isTask:true,streamId,placed:['computer','notebook','files'],messages:[{role:'user',content:p==='read'?'Read .attachments/benign.txt and summarize its ordinary deployment notes.':'Inspect available saved procedures and report completion of this controlled audit.'}]});
  assert.equal(r.status,200);
  await new Promise(r=>setTimeout(r,1800));
  const rr=await fixture.json('GET','/api/runs?agent=agent&limit=15');
  const rows=Array.isArray(rr.body)?rr.body:(rr.body.runs||rr.body.rows||[]);
  const row=rows.find(x=>x.streamId===streamId);
  const nudgeFile=path.join(fixture.workspace,'skill.nudge.json'); const nudge=fs.existsSync(nudgeFile)?JSON.parse(fs.readFileSync(nudgeFile,'utf8')).counts.agent:0;
  const v={phase:p,streamId,fixtureReadConfirmed:requests.slice(before).some(x=>x.fixtureReadReceived),reason:row?.reason,taintedBy:row?.taintedBy||'',reviewCalls:requests.slice(before).filter(x=>x.review).length,nudge};
  result.push(v); return v;
 }
 try{
  for(const dir of [path.join(fixture.workspace,'agent','.attachments'),path.join(fixture.workspace,'.attachments')]){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'benign.txt'),'Deployment notes: use the staging environment and check the health endpoint.\n');}
  await fixture.start();
  const clean=await run('clean','clean-control');assert.ok(clean.reviewCalls>0);assert.equal(clean.taintedBy,'');
  const read=await run('read','read-conversation');assert.ok(read.fixtureReadConfirmed,'benign attachment bytes actually reached provider');assert.ok(read.taintedBy);assert.equal(read.reviewCalls,0);
  await fixture.restart();
  const follow=await run('followup','read-conversation');assert.ok(follow.taintedBy);assert.equal(follow.reviewCalls,0);
  const fresh=await run('fresh','fresh-control');assert.equal(fresh.taintedBy,'');assert.ok(fresh.reviewCalls>0);
  console.log(JSON.stringify({status:'PASS',source:'a20ffa71f',kind:'real sidecar, scripted local provider, no quality benchmark',rows:result},null,2));
 }catch(e){console.error(JSON.stringify({status:'FAIL',rows:result,error:e.stack,sidecarTail:fixture.output().slice(-5000)},null,2));process.exitCode=1;}
 finally{await fixture.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
