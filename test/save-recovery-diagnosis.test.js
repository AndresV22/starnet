'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fnBody}=require('./_assert.js');
const source=fnBody(fs.readFileSync('frontend/app/app.js','utf8'),'function showSaveUnreachableGate');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,disabled:false});return nodes.get(id)};
 let next={unknown:true,reason:'unreachable'},degraded='',reloads=0,report;
 const ctx={el,gateActive:false,World:{stop(){}},SFX:{click(){}},tauriCore:()=>null,show(){},setInterval:()=>1,clearInterval(){},setTimeout(){},Save:{load:()=>null},location:{reload(){reloads++}},Harness:{engineState:async()=>({reason:degraded})},CloudSave:{reconcile:async()=>next,isUnknownSentinel:r=>!!r?.unknown},Diag:{copy(o){report=o.context;o.onDone(true,'fixture')}}};
 vm.runInNewContext(source+';showSaveUnreachableGate("unreachable")',ctx);await tick();
 for(const [reason,code] of [['unreadable','SAVE-READ'],['forbidden','SAVE-403'],['cache','SAVE-CACHE'],['unreachable','SAVE-NET']]){
  next={unknown:true,reason};el('btn-unreachable-retry').onclick();await tick();await tick();
  assert.match(el('unreachable-code').innerHTML,new RegExp(code),'latest response updates displayed recovery code');
  el('btn-unreachable-report').onclick();assert.match(report.kind,new RegExp(code),'copied report uses latest response');assert.equal(reloads,0,'unknown state never resumes');
 }
 degraded='degraded: crash-loop';next={unknown:true,reason:'unreadable'};
 for(let i=0;i<2;i++){el('btn-unreachable-retry').onclick();await tick();await tick();assert.match(el('unreachable-code').innerHTML,/SAVE-LOOP/,'unchanged authoritative degraded reason still overrides refreshed request diagnosis');}
 degraded='';el('btn-unreachable-retry').onclick();await tick();await tick();assert.match(el('unreachable-code').innerHTML,/SAVE-READ/,'cleared degradation reveals latest save result');
 next={schema:'starnet.save'};el('btn-unreachable-retry').onclick();await tick();assert.equal(reloads,1,'definitive recovered save reloads once');
 console.log('save recovery diagnosis: retry codes, report context, degraded precedence and successful recovery PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
