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


// Minimal layout-backed DOM double: exercise actual insertion/separator/pruning logic without replacing old nodes.
function deliveryDom(pinned=false, count=4, scale=1, nativeAnchor=false) {
  let log;
  class Node {
    constructor(){this.children=[];this.dataset={};this.className='';this.textContent='';this.parentNode=null;this.classList={contains:x=>this.className.split(' ').includes(x),remove:x=>{this.className=this.className.split(' ').filter(c=>c!==x).join(' ');}};}
    appendChild(n){return this.insertBefore(n,null);}
    insertBefore(n,b){if(b&&!this.children.includes(b))throw Error('detached insertion target');if(n.parentNode)n.remove();const i=b?this.children.indexOf(b):this.children.length;this.children.splice(i,0,n);n.parentNode=this;return n;}
    remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}}
    get previousElementSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)-1]||null;}
    get firstElementChild(){return this.children[0]||null;}
    setAttribute(){}
    contains(n){return this.children.includes(n);}
    querySelector(s){return s==='.tb-when'?this.children.find(n=>n.className==='tb-when'):null;}
    getBoundingClientRect(){const top=this===log?0:(log.children.indexOf(this)*20-log.scrollTop)*scale;return {top,bottom:top+20*scale,height:100*scale};}
  }
  log=new Node();log.scrollTop=40;log.offsetHeight=100;
  const first=Date.UTC(2026,9,12,12);
  for(let i=0;i<count;i++){const n=new Node();n.dataset.ts=String(first+i*1000);n.textContent='original '+i;log.appendChild(n);}
  const ws={id:'read'}, original=log.children.slice();
  const code=part(chat,'  function syncTimeBreaks()', '  // stamp: omitted')+part(chat,'  function pruneLog()', '  function row(')+part(chat,'  function deliverTurns(', '  // SWITCH-SURVIVAL:');
  const c=ctx(code,{log,stick:pinned,insertingDelivery:false,LOG_DOM_CAP:400,TIME_BREAK_MS:1800000,document:{createElement:()=>new Node()},fmtBreak:at=>at.toISOString(),isActiveWs:w=>w===ws,cancelHistoryPin(){},autoscroll(){},Set,Array,Number,Date});
  c.renderHistory=turns=>{for(const m of turns){const n=new Node();n.dataset.ts=String(m.ts);n.textContent=m.content;log.appendChild(n);if(nativeAnchor)log.scrollTop+=20;c.pruneLog();}};
  c.syncTimeBreaks();return {c,log,ws,original,first};
}

test('recovered history preserves existing nodes and reading anchor while correcting date ownership',()=>{
  const {c,log,ws,original,first}=deliveryDom();
  const anchor=log.children.find(n=>n.getBoundingClientRect().bottom>0), before=anchor.getBoundingClientRect().top;
  assert.equal(c.deliverTurns(ws,[{role:'assistant',content:'Yesterday answer',ts:first-86400000}]),true);
  assert.ok(original.every(n=>log.contains(n)),'reader selection and controls retain their original nodes');
  assert.equal(anchor.getBoundingClientRect().top,before,'earlier insertion keeps the same row at the same screen position');
  const breaks=log.children.filter(n=>n.className==='cmsg-timebreak');
  assert.deepEqual(breaks.map(n=>n.children[0].textContent),[new Date(first-86400000).toISOString(),new Date(first).toISOString()]);
  assert.equal(log.children[log.children.indexOf(breaks[1])+1],original[0],'Today separator still belongs to Today');
  const snapshot=log.children.slice();assert.equal(c.deliverTurns({id:'other'},[{ts:first,content:'unrelated'}]),false);assert.deepEqual(log.children,snapshot);
});

test('history insertion suspends pruning until the recovered message reaches its chronological position',()=>{
  const {c,log,ws,first}=deliveryDom(true,400);
  assert.doesNotThrow(()=>c.deliverTurns(ws,[{role:'assistant',content:'Recovered',ts:first+500}]));
  const stamps=log.children.filter(n=>n.dataset.ts).map(n=>Number(n.dataset.ts));
  assert.deepEqual(stamps,stamps.slice().sort((a,b)=>a-b),'pruning cannot strand older recovery at the tail');
  assert.ok(log.children.length<=400,'normal DOM cap still applies after insertion');
  assert.equal(c.insertingDelivery,false);
});

test('reader anchoring composes with browser anchoring and scaled UI coordinates',()=>{
  const {c,log,ws,original,first}=deliveryDom(false,4,1.15,true);
  const anchor=original[2], before=anchor.getBoundingClientRect().top;
  c.deliverTurns(ws,[{role:'assistant',content:'Earlier scaled insertion',ts:first-86400000}]);
  assert.ok(Math.abs(anchor.getBoundingClientRect().top-before)<0.001);
});

test('a finished worker with a failed finalization write shows retry instead of working forever',async()=>{
  const c=ctx(part(delegated,'  async function loadReceipt(', '  function workHtml('),{
    findRow:()=>({ws:{agentId:'mira',parentStreamId:'home'},lead:'lead'}),workerRunOf:()=> 'run-pending',
    loadingReceipts:new Set(),receipts:new Map(),repaint(){},stateOf:()=>({cls:'done'}),foldReceipt:()=>({live:true}),
    fetch:async(url)=>({ok:true,json:async()=>url.startsWith('/api/runs')?{runs:[{runId:'run-pending',dispatchDelivery:{state:'pending'}}]}:{turns:[]}})
  });
  await c.loadReceipt('worker');assert.equal(c.receipts.get('worker').status,'err');
  assert.match(c.receipts.get('worker').error,/ended.*finalized result.*Try again/);
});

test('reader anchor survives reassignment of a time separator',()=>{
  const {c,log,ws,original,first}=deliveryDom();
  original[1].dataset.ts=String(first+3600000);original[2].dataset.ts=String(first+3660000);original[3].dataset.ts=String(first+3720000);
  c.syncTimeBreaks();const divider=original[1].previousElementSibling;log.scrollTop=log.children.indexOf(divider)*20;
  const before=original[1].getBoundingClientRect().top;
  c.deliverTurns(ws,[{role:'assistant',content:'Recovered within the gap',ts:first+2700000}]);
  assert.equal(divider.children[0].textContent,new Date(first+2700000).toISOString(),'the separator now belongs to the recovered earlier message');
  assert.equal(original[1].getBoundingClientRect().top,before,'the persistent message remains anchored');
});
