'use strict';
const A=require('./_assert.js'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const chat=read('frontend/app/chat.js'),gc=read('frontend/app/group-chat.js'),idx=read('sidecar/index.js'),dlv=read('frontend/app/deliverables.js'),out=read('frontend/app/windows/outbox.js');
function fn(src,name){const m=new RegExp('^( {0,4})(?:async )?function '+name+'\\([^]*?\\n\\1\\}', 'm').exec(src);if(!m)throw Error('missing '+name);return m[0];}
(async()=>{
  let loads=0,version='v1';
  const refs=new Function('imageBlobUrl','wireFileOpen','fileUrl','attachAgentId',`const fileRefCache=new Map();let fileRefScope=0;${fn(chat,'cachedBlob')}${fn(chat,'workspaceFileRefs')}return workspaceFileRefs;`)(async p=>{loads++;if(p.endsWith('missing.png'))throw Error('missing');return version},()=>{},p=>p,()=> 'agent');
  const first=refs('agent');A.eq(await first.image('out/final.png'),'v1','first message reads first image');
  version='v2';A.eq(await first.image('out/final.png'),'v1','stream re-render keeps same message image');
  A.eq(await refs('agent').image('out/final.png'),'v2','new message revalidates overwritten path');
  A.eq(loads,2,'streaming does not refetch successful images');
  const missing=refs('agent');for(let i=0;i<5;i++)await missing.image('missing.png').catch(()=>{});A.eq(loads,3,'missing image fetched once per message');
  await refs('agent').image('missing.png').catch(()=>{});A.eq(loads,4,'new message can retry missing file');
  A.eq(await refs('agent','group:g:m1').image('out/final.png'),'v2','group first message reads image');version='v3';
  A.eq(await refs('agent','group:g:m1').image('out/final.png'),'v2','rebuilt group row shares message cache');A.eq(await refs('agent','group:g:m2').image('out/final.png'),'v3','later group message reads overwritten image');
  let sharedLoads=0;const groupRefs=new Function('Chat','sharedFor','openFile','showError',`const sharedBlobs=new Map();${fn(gc,'fileRefs')}return fileRefs;`)({workspaceFileRefs:refs,imageBlobUrl:async()=>{sharedLoads++;throw Error('missing shared')}},()=>({id:'immutable-v1',name:'gone.png'}),()=>{},()=>{});
  for(let i=0;i<5;i++)await groupRefs('g','agent','m').image('gone.png').catch(()=>{});A.eq(sharedLoads,1,'failed shared immutable version does not refetch every group repaint');
  const rows=[{id:'same',status:'pending'},{id:'kept',status:'kept'},{id:'open',status:'kept'}];
  const visible=new Function('deliverableRows','deliverableStore',fn(idx,'visibleDeliverableRows')+';return visibleDeliverableRows;')(async()=>rows,{clearedIds:()=>new Set(['same','kept'])});
  A.eq((await visible()).map(r=>r.id),['same','open'],'undo KEEP restores pending row even if library id was cleared');
  const ws={id:'build-run',history:[]};let request='';
  const note=new Function('Workstreams','sessionIdOf','historyTellsTheStory','fetch','App','Chat','RESOLVED_MARK','GONE_MARK',fn(read('frontend/app/workshopstore.js'),'noteResolved')+';return noteResolved;')({get:()=>ws,activeId:()=>null},()=>ws.id,()=>false,async url=>{request=url;return {ok:true,json:async()=>({items:url.includes('includeCleared=1')?[{runId:'run',agentId:'agent',status:'kept'}]:[]})}},{persist:()=>{}},{},'RESOLVED: ','GONE: ');
  await note('agent','run');A.ok(request.includes('includeCleared=1'),'resolution lookup includes cleared cards');A.ok(ws.history[0].content.startsWith('RESOLVED: ')&&/KEPT/.test(ws.history[0].content),'cleared kept build gets correct durable note');
  const scroll=chat.match(/log\.addEventListener\('scroll', \(\) => \{([^]*?)\n      \}\);/)[1];
  function scrollState(held,now,near){return new Function('userScrollHeld','Date','nearBottom',`let historyPinPending=0,stick=true,userScrollAt=0;const log={scrollTop:20,scrollHeight:900};const hideNewPill=()=>{},showNewPill=()=>{};${scroll};return {stick,top:log.scrollTop};`)(held,{now:()=>now},()=>near)}
  A.eq(scrollState(true,9000,false),{stick:false,top:20},'holding scrollbar beyond gesture timeout keeps reader position');A.eq(scrollState(false,9000,false),{stick:true,top:900},'unprompted layout movement still follows bottom');
  const live=[{dataset:{runId:'already',collected:'1'}},{dataset:{runId:'left'}}];let resolved=[],notice='';
  const clear=out.match(/    const clearEvery = \(\) => \{([^]*?)\n    \};/)[1];new Function('list','RS','notify','renderEmpty',clear)({children:live},{resolveAll:ids=>{resolved=ids}},t=>{notice=t},()=>{});
  A.eq(resolved,['left'],'TO REVIEW clear acts only on still-live rows');A.ok(/Cleared 1 /.test(notice),'clear toast counts only remaining reminder');
  let q={value:'filtered'},status={value:''},runFilter=null,project='',kind='',total=12,libraryRows=[];
  const label=new Function('state',fn(dlv,'clearShownLabel').replace(/runFilter|project|kind|total|rows|q|status/g,x=>'state.'+({rows:'libraryRows'}[x]||x))+';return clearShownLabel;')({q,status,runFilter,project,kind,total,libraryRows});
  const armSrc=read('frontend/app/armconfirm.js');let timer=null;const sandbox={module:{exports:{}},setTimeout:f=>{timer=f;return 1},clearTimeout:()=>{},console};vm.runInNewContext(armSrc,sandbox);
  const btn={textContent:label(),dataset:{},classList:{add(){},remove(){}},addEventListener(t,f){this.click=f},removeEventListener(){},isConnected:true};
  sandbox.module.exports.wire(btn,{armedLabel:'SURE?',onDisarm:()=>{btn.textContent=label()},onConfirm:()=>{}});btn.click();q.value='';timer();A.eq(btn.textContent,'CLEAR ALL 12','disarm repaints current filter scope instead of stale wired label');
  A.ok(/onDisarm: \(\) => \{ shown.textContent = clearShownLabel\(\);/.test(dlv)&&/onDisarm: paintFold/.test(out),'both changing clear controls repaint their live label when disarmed');
  A.report('declutter-recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
