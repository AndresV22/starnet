'use strict';
const fs = require('node:fs'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const chat = fs.readFileSync('frontend/app/chat.js', 'utf8');
const delegated = fs.readFileSync('frontend/app/delegated.js', 'utf8');
function part(src, start, end) { const i=src.indexOf(start), j=src.indexOf(end,i+start.length); assert.ok(i>=0&&j>i,start); return src.slice(i,j); }
function ctx(code, extra={}) { const c=vm.createContext(extra); vm.runInContext(code,c); return c; }

test('explicit worker reveal wins a queued layout pin; ordinary loads still follow the latest message', () => {
  const frames=[], target={ scrollIntoView(){ log.scrollTop=120; } }, log={scrollTop:0,scrollHeight:2000,contains:el=>el===target};
  const c=ctx(part(chat,'  function cancelHistoryPin()', '  function positionNewPill('), {log,historyPinPending:1,stick:true,userScrollAt:0,requestAnimationFrame:fn=>frames.push(fn),nearBottom:()=>log.scrollTop===log.scrollHeight,hideNewPill(){},showNewPill(){}});
  c.pinLoadedHistoryAfterLayout(1); assert.equal(c.revealHistory(target),true);
  while(frames.length) frames.shift()();
  assert.equal(log.scrollTop,120); assert.equal(c.stick,false); assert.equal(c.historyPinPending,0);
  c.historyPinPending=2; c.pinLoadedHistoryAfterLayout(2);
  assert.equal(c.revealHistory({}),false); while(frames.length)frames.shift()();
  assert.equal(log.scrollTop,2000); assert.equal(c.stick,true);
});

test('worker prose uses the worker and project for both links and images; cache scopes do not collide',async()=>{
  const wired=[], images=[], keys=[];
  const c=ctx(part(chat,'  function workspaceFileRefs(', '  function hydrateFileRefs(')+part(chat,'  function fileUrl(', '  // append a small'),{
    fileRefScope:0,attachAgentId:()=> 'lead',wireFileOpen:(...args)=>wired.push(args),
    cachedBlob:(key,make)=>{keys.push(key);return make();},imageBlobUrl:(url)=>{images.push(url);return Promise.resolve(url);},
    ApiTicket:{fileUrl:(a,p)=>'/api/file?agent='+encodeURIComponent(a)+'&path='+encodeURIComponent(p)+'&ticket=test'}
  });
  const a={};const refs=c.workspaceFileRefs('vex','run-1','C:/project/');refs.wire(a,'report.html');await refs.image('chart.png');
  assert.deepEqual(wired[0],[a,'report.html','vex','C:/project/']);
  const url=new URL(images[0],'http://local'); assert.equal(url.searchParams.get('agent'),'vex');assert.equal(url.searchParams.get('project'),'C:/project');
  await c.workspaceFileRefs('vex','run-1','C:/elsewhere').image('chart.png'); assert.notEqual(keys[0],keys[1]);
  assert.ok(!c.fileUrl('D:/original/chart.png','vex','C:/project').includes('&project='),'absolute file keeps its original location');
});

test('approval failure leaves pending state intact; a confirmed answer settles only that prompt',async()=>{
  const effects=[], p={promptId:'mira-ask',runId:'lead-run',tool:'shell.exec'}, ws={id:'home',agentId:'lead'};
  let reply={ok:false,error:'temporarily unavailable'};
  const c=ctx(part(chat,'  const settledPromptNotices', '  // the channel\'s record'),{
    Harness:{consent:async()=>reply},StationUI:{settleNotifs:id=>effects.push(['notice',id])},
    Channels:{clearPending:(id,at,pid)=>effects.push(['clear',id,pid])},U:{bus:{emit:(name,data)=>effects.push(['event',name,data.promptId])}},
    isActiveWs:()=>false,renderPresence(){},syncStatus(){}
  });
  await assert.rejects(c.answerConsent(p,ws,'once'),/temporarily unavailable/);assert.equal(effects.length,0);
  reply={ok:true,decision:'once'};const res=await c.answerConsent(p,ws,'once');
  assert.equal(res.appliedDecision,'once');assert.deepEqual(effects.find(x=>x[0]==='clear'),['clear','home','mira-ask']);
});

test('delegated and ordinary inspectors render full payload as text, including build steps',()=>{
  const el=tag=>({tag,children:[],appendChild(n){this.children.push(n);},textContent:''});
  const raw='<script>unsafe()</script>'+ ' x'.repeat(200);
  const c=ctx(part(chat,'  function appendConsentDetails(', '  function actionPhrase('),{
    document:{createElement:el},consentInspect:()=>({label:'Inspect complete request',text:raw}),
    copyText:async()=>true,setTimeout,clearTimeout
  });
  const host=el('div');c.appendConsentDetails(host,{tool:'shell.exec'});
  assert.equal(host.children[0].children[1].textContent,raw);assert.equal(host.children[0].children[1].innerHTML,undefined);
  const build=el('div');c.appendConsentDetails(build,{tool:'station.build',argsSummary:'Plan\nFull first step\nFull second step'});
  assert.equal(build.children[1].children[1].textContent,'Full first step\nFull second step');
});

test('worker receipt failures are visible and retryable, and concurrent opens share one read',async()=>{
  let fail=true, reads=0;
  const c=ctx(part(delegated,'  async function loadReceipt(', '  function workHtml('),{
    findRow:()=>({ws:{agentId:'vex',parentStreamId:'home'},lead:'lead'}),workerRunOf:()=> 'run-1',
    loadingReceipts:new Set(),receipts:new Map(),repaint(){},stateOf:()=>({cls:'done'}),foldReceipt:(row)=>({answer:row.deliveryText}),
    fetch:async(url)=>{reads++;return {ok:!fail,status:503,json:async()=>url.startsWith('/api/runs')?{runs:[{runId:'run-1',deliveryText:'saved'}]}:{turns:[]}};}
  });
  await Promise.all([c.loadReceipt('worker'),c.loadReceipt('worker')]);assert.equal(reads,2);assert.equal(c.receipts.get('worker').status,'err');assert.match(c.receipts.get('worker').error,/503/);
  fail=false;await c.loadReceipt('worker');assert.equal(c.receipts.get('worker').status,'ok');assert.equal(c.receipts.get('worker').data.answer,'saved');
});

test('receipt prose refreshes on changed content without reparsing unchanged content',()=>{
  const renders=[],el={dataset:{dgAnswer:'worker'}};const rec={runId:'r',data:{answer:'first'}};
  const c=ctx(part(delegated,'  function hydrate(card)', '  function hydrateInspectors('),{
    receipts:new Map([['worker',rec]]),Workstreams:{get:()=>({agentId:'vex',projectRoot:'C:/project'})},
    Chat:{workspaceFileRefs:(...a)=>a,renderProse:(node,text,opts)=>{renders.push({text,files:opts.files});node.__proseSource=text;}}
  });
  const card={querySelectorAll:()=>[el]};c.hydrate(card);c.hydrate(card);assert.equal(renders.length,1);
  assert.deepEqual(renders[0].files,['vex','delegated:worker:r:vex:C:/project','C:/project']);
  rec.data.answer='second';c.hydrate(card);assert.equal(renders.length,2);assert.equal(renders[1].text,'second');
  rec.data.agentId='mira';rec.data.projectRoot='C:/original';c.hydrate(card);assert.equal(renders.length,3);assert.equal(renders[2].files[0],'mira');assert.equal(renders[2].files[2],'C:/original');
  rec.data.projectRoot='';c.hydrate(card);assert.equal(renders[3].files[2],'','finished run without a project never borrows a newer project');
});

test('answering one worker keeps the remaining worker in the bell; duplicate responses do not repeat notices',()=>{
  const effects=[], pending=[{promptId:'mira',workerAgentId:'mira',tool:'brief.ask'},{promptId:'rook',workerAgentId:'rook',tool:'fs.write'}];
  const c=ctx(part(chat,'  const settledPromptNotices', '  async function answerConsent('),{Channels:{pendingAllOf:()=>pending},StationUI:{notify:(text,cls,category,opts)=>effects.push(['pending',opts.prompt]),settleNotifs:key=>effects.push(['done',key])},askerName:p=>p.workerAgentId,actionPhrase:()=> 'write a file'});
  c.settlePromptNotice('home','mira');assert.deepEqual(effects,[['pending','rook']]);
  c.settlePromptNotice('home','mira');assert.equal(effects.length,1);
  pending.shift();c.settlePromptNotice('home','rook');assert.deepEqual(effects[1],['done','needs:home']);
});

test('delegated response repaint waits for the prompt-state listeners',async()=>{
  const listeners=new Map(),observed=[];let pending=true;
  ctx(delegated,{document:{addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')fn();},getElementById:()=>{observed.push(pending);return null;}},U:{bus:{on:(event,fn)=>listeners.set(event,fn)}},setInterval,clearInterval});
  observed.length=0;listeners.get('permission.response')({promptId:'p'});pending=false;
  assert.deepEqual(observed,[]);await Promise.resolve();assert.deepEqual(observed,[false]);
});
