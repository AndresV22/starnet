'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {makeTaskBriefStore}=require('../sidecar/taskbrief-store.js');
const {registerTaskBriefTools}=require('../sidecar/taskbrief-tools.js');
const {makeRegistry}=require('../sidecar/tools/registry.js');
const Policy=require('../sidecar/taskbrief-policy.js');
const Intent=require('../frontend/app/fork.js').TaskIntent;
const Commander=require('../sidecar/commander-context.js');
const Context=require('../sidecar/taskbrief-context.js');
const files=new Map(),fs={readFileSync:p=>{if(!files.has(p))throw Object.assign(Error('missing'),{code:'ENOENT'});return files.get(p);},writeFileSync:(p,d)=>files.set(p,d),existsSync:p=>files.has(p),mkdirSync(){},renameSync:(p,q)=>{files.set(q,files.get(p));files.delete(p);}};
const make=()=>makeTaskBriefStore({fs,path,workspaces:'/conversation-proof',writeDurable:(_deps,p,d)=>fs.writeFileSync(p,d)});
(async()=>{
  let store=make(), state={brief:await store.prepare({id:'brief',key:'stream:one',runId:'run',text:'Help me automate my client updates'},100)};
  const registry=makeRegistry(),asked=[];
  let reply='I check Slack, chase missing details, and write a Google Doc. '+ 'Additional context. '.repeat(120)+'Never send updates without my review.';
  registerTaskBriefTools(registry,store,state,{now:()=>200+asked.length,askCommander:async q=>{asked.push(q);return {answered:true,text:reply};}});
  const call=(name,args)=>registry.dispatch({name,args,argsRaw:JSON.stringify(args)},{});
  const ask=question=>({mode:'conversation',dimension:'sources',question,reason:'This changes the collection workflow.',discoverable:false});
  assert.ok(Policy.validateQuestions(ask('Walk me through the last client update you sent.'),state.brief).ok);
  assert.equal(Policy.validateQuestions({...ask('What did you do last time?'),also:[ask('Which part takes longest?')]},state.brief).ok,false);
  let result=await call('brief.ask',ask('Walk me through the last client update you sent.'));assert.ok(result.ok);assert.equal(asked[0].options.length,0);
  assert.ok(state.brief.questions[0].answer.endsWith('Never send updates without my review.'));
  assert.equal((await call('brief.ask',ask('Which reminders should I send?'))).ok,false,'must extract the whole answer first');
  assert.equal((await call('brief.proceed',{objective:'Prepare a client update'})).ok,false,'cannot discard unincorporated context');
  const id=state.brief.questions[0].id;
  const facts=[{dimension:'sources',text:'Collect from Slack',quote:'I check Slack',sourceId:id},{dimension:'deliverable',text:'Prepare a Google Doc',quote:'write a Google Doc',sourceId:id},{dimension:'safety',text:'User reviews before sending',quote:'Never send updates without my review.',sourceId:id}];
  const update={through:id,facts,assumptions:['Start with one client'],unknowns:['Reminder timing'],nextStep:'Draft an update structure for review'};
  // A fabricated quote is never stored as the Commander's words — and never blocks the run either (2026-10-12 user
  // report: one paraphrase re-rejected the whole snapshot, proceed stayed locked, every authorized write was refused).
  const fab=await call('brief.update',{...update,facts:[{...facts[0],quote:'Send everything automatically'}]});
  assert.ok(fab.ok,'a fabricated quote no longer fails the update');
  assert.equal(state.brief.context.facts.length,0,'fabricated quote is NOT stored as user evidence');
  assert.ok(state.brief.context.assumptions.includes(Context.UNCONFIRMED+'Collect from Slack'),'it is kept as a labelled unconfirmed assumption');
  assert.match(fab.content,/1 item\(s\) had no matching quote/,'the model is told what happened and that it does not block');
  // Re-typed quotes anchor: curly quotes, case, edge punctuation, an elided middle, the wrong sourceId.
  const retyped=[{dimension:'sources',text:'Collect from Slack',quote:'“i CHECK slack,”',sourceId:id},
    {dimension:'deliverable',text:'Prepare a Google Doc',quote:'chase missing details… write a Google Doc.',sourceId:'request'},
    {dimension:'objective',text:'Automate client updates',quote:'help me automate my client updates',sourceId:id}];
  assert.ok((await call('brief.update',{...update,facts:retyped})).ok);
  assert.deepEqual(state.brief.context.facts.map(f=>f.sourceId),[id,id,'request'],'all three anchor; a wrong sourceId is corrected to the source that holds the words');
  assert.ok(!state.brief.context.assumptions.some(a=>a.startsWith(Context.UNCONFIRMED)),'nothing demoted when every quote anchors');
  assert.equal(Context.anchored('chase... Go',reply),false,'a fragment under 3 chars is not evidence');
  assert.equal(Context.anchored('write a Google Doc ... I check Slack',reply),false,'elided fragments must appear in order');
  assert.ok((await call('brief.update',update)).ok);
  store=make();const restored=store.active('stream:one');assert.equal(restored.context.facts.length,3);assert.ok(Context.current(restored));
  assert.match(Commander.compose({brief:restored}),/Never send updates without my review/);
  reply='Use a short table.\nUse your judgment for the remaining choices.';
  result=await call('brief.ask',{...ask('Would this structure help you review the update?'),dimension:'deliverable',sample:'Client | Progress | Missing details\nAcme | Draft | Awaiting owner'});
  assert.ok(result.ok);assert.match(asked[1].sample,/\nAcme/);assert.equal(asked[1].context.facts.length,3);
  const last=state.brief.questions.at(-1);
  assert.equal((await call('brief.update',update)).ok,false,'stale snapshot cannot replace latest reply');
  assert.ok((await call('brief.update',{...update,through:last.id,unknowns:[],nextStep:'Prepare the table using reversible assumptions'})).ok);
  assert.equal((await call('brief.ask',ask('Which reminder timing should I choose?'))).ok,false,'delegation stops discovery');
  assert.ok((await call('brief.proceed',{objective:'Prepare the client-update table',assumptions:['Start with one client']})).ok);
  const capped={...restored,askCalls:6};assert.equal(Policy.validateQuestions(ask('Which step is still unclear?'),capped).ok,false);
  assert.equal(Policy.validateQuestions({...ask('Which step is still unclear?'),discoverable:true},restored).ok,false);
  assert.deepEqual(Intent.parse('TASK_QUESTION: Walk me through the last update. || [free text]'),{question:'Walk me through the last update.',options:[],mode:'conversation'});
  assert.equal(Intent.strip('TASK_QUESTION: Walk me through the last update. || [free text]'),'');
  // Unwatched/restart path keeps the same open question, not an invented choice list.
  const other={brief:await store.prepare({id:'offline',key:'stream:two',text:'Help me automate reports'},500)}, offline=makeRegistry();
  registerTaskBriefTools(offline,store,other,{now:()=>501});
  result=await offline.dispatch({name:'brief.ask',args:ask('How did you prepare your last report?'),argsRaw:'{}'},{});
  assert.match(result.control.text,/\[free text\]/);assert.equal(make().active('stream:two').status,'clarifying');
  const resumed=await make().prepare({key:'stream:two',text:'Help me automate reports',resumeOnly:true},600);
  assert.equal(resumed.status,'clarifying');assert.equal(resumed.questions[0].answer,'','journal recovery is not a user answer');
  const answered=await make().prepare({key:'stream:two',text:'Use a short table.\nUse your judgment for the remaining choices.'},601);
  assert.ok(Context.delegate(answered.questions[0].answer),'restart answer preserves newlines and delegation');
  console.log('task-conversation: whole-answer extraction, grounded updates, adaptive sample, delegation, stale state and restart passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
