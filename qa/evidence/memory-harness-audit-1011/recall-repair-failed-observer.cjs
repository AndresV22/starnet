'use strict';
// Exact owner repair; synthetic data and extracted host expressions only. No live host/provider.
const cp=require('node:child_process'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const ref='6ef7d4e453730e05f0c82a07c92683bbef897138';
const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),cache=new Map();
function source(p){return cp.execFileSync('git',['show',ref+':'+p],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});}
function load(p){if(cache.has(p))return cache.get(p).exports;const name=path.join(root,p),m=new Module(name,module);m.filename=name;m.paths=Module._nodeModulePaths(path.dirname(name));cache.set(p,m);const normal=m.require.bind(m);m.require=n=>{if(!n.startsWith('.'))return normal(n);let f=path.posix.normalize(path.posix.join(path.posix.dirname(p),n));if(!path.posix.extname(f))f+='.js';if(f.startsWith('../'))throw Error('Module escaped repository');return load(f);};m._compile(source(p),name);return m.exports;}
const {makeRecallTool}=load('sidecar/tools/builtin/recall.js'),{makeTranscriptStore}=load('sidecar/transcriptstore.js');
const host=source('sidecar/index.js');
const predicate=host.match(/const tasteWithheld = ([\s\S]*?);/);
const binding=host.match(/makeRecallTool\((\{[^\r\n;]+\})\)\.register\(registry\)/);
const bridge=host.match(/withholdTaste:\s*tasteWithheld\s*,/);
if(!predicate||!binding||!bridge)throw Error('Host wiring changed: adapt exact-source probe');
function restricted(o){return vm.runInNewContext('('+predicate[1]+')',{o},{timeout:1000});}
function make(o,store){const tasteWithheld=restricted(o);return vm.runInNewContext('makeRecallTool('+binding[1]+').recallTool',{makeRecallTool,transcriptStore:store,tasteWithheld},{timeout:1000});}
function project(o){return vm.runInNewContext('({'+bridge[0]+'})',{tasteWithheld:restricted(o)},{timeout:1000});}
const helpers={exports:{}},sub={exports:{}};
vm.runInNewContext(source('sidecar/tools/builtin/orchestration.js').split(/\r?\n/).slice(322,349).join('\n')+'\nmodule.exports={originLimitsOf,resumeConnectorOptions,connectorOptions};',{module:helpers},{timeout:1000});
vm.runInNewContext(source('sidecar/subagents.js').split(/\r?\n/).slice(223,228).join('\n')+'\nmodule.exports={mergeOriginLimits};',{module:sub},{timeout:1000});
const store=makeTranscriptStore({io:{readAll:()=>[],append:()=>{}},clock:{now:()=>200},redact:s=>s});
store.append({streamId:'owner-private',agentId:'a',role:'user',content:'SYNTHETIC_PRIVATE_COBALT deployment detail',ts:100,taint:''});
store.append({streamId:'allowed-group',agentId:'a',role:'user',content:'Public group update',ts:200,taint:''});
store.append({streamId:'worker-local',agentId:'worker',role:'user',content:'Worker local milestone',ts:300,taint:''});
function observeStore(target){const calls=[];const spy={};for(const key of ['search','around','streams','taintOf'])if(typeof target[key]==='function')spy[key]=(...args)=>{calls.push({method:key,stream:key==='streams'?null:args[0],scope:args[2]&&args[2].scope});return target[key](...args);};return {spy,calls};}
const group={channelSender:true,channelSenderOwner:false},owner={channelSender:true,channelSenderOwner:true};
const worker=helpers.exports.connectorOptions({connectorAuthority:project(group)});
const persisted=JSON.parse(JSON.stringify(sub.exports.mergeOriginLimits(null,helpers.exports.originLimitsOf({connectorAuthority:project(group)}))));
const resumed=helpers.exports.resumeConnectorOptions({connectorAuthority:project(owner)},{originLimits:persisted});
const nested=helpers.exports.connectorOptions({connectorAuthority:project(worker)});
const cases=[
 ['default-search',{query:'SYNTHETIC_PRIVATE_COBALT'},group,'allowed-group',false,false],
 ['explicit-all',{query:'SYNTHETIC_PRIVATE_COBALT',scope:'all'},group,'allowed-group',false,false],
 ['foreign-scroll',{around:100,stream:'owner-private'},group,'allowed-group',false,false],
 ['browse',{},group,'allowed-group',false,true],
 ['authorized-local',{query:'Public',scope:'stream'},group,'allowed-group',false,true],
 ['restricted-default-with-local-hit',{query:'update deployment'},group,'allowed-group',false,true],
 ['restricted-missing-stream',{query:'SYNTHETIC_PRIVATE_COBALT'},group,null,false,false],
 ['simulated-restricted-worker-foreign-stream',{query:'SYNTHETIC_PRIVATE_COBALT',scope:'stream'},worker,'owner-private',true,false,'conditional-simulation-not-full-dispatch'],
 ['owner-cross-stream',{query:'SYNTHETIC_PRIVATE_COBALT',scope:'all'},owner,'owner-active',true,false],
 ['owner-foreign-scroll',{around:100,stream:'owner-private'},owner,'owner-active',true,false],
 ['owner-browse',{},owner,'owner-active',true,true],
 ['restricted-own-scroll',{around:200,stream:'allowed-group'},group,'allowed-group',false,true],
 ['restricted-foreign-stable-anchor',{anchor:'tx-1',stream:'owner-private'},group,'allowed-group',false,false],
 ['forged-scope-policy-args',{query:'SYNTHETIC_PRIVATE_COBALT',scope:'all',ownStreamOnly:false,tasteWithheld:false},group,'allowed-group',false,false],
 ['worker-private-search',{query:'SYNTHETIC_PRIVATE_COBALT',scope:'all'},worker,'worker-local',false,false],
 ['worker-local-success',{query:'milestone'},worker,'worker-local',false,false],
 ['resumed-worker-private-search',{query:'SYNTHETIC_PRIVATE_COBALT',scope:'all'},resumed,'worker-local',false,false],
 ['resumed-worker-local-success',{query:'milestone'},resumed,'worker-local',false,false],
 ['nested-worker-private-search',{query:'SYNTHETIC_PRIVATE_COBALT'},nested,'worker-local',false,false],
 ['restricted-malformed-stream',{query:'SYNTHETIC_PRIVATE_COBALT'},group,'not valid!',false,false,'invalid-nonempty-binding-storage-read-observation']
];
(async()=>{
 const results=[];
 for(const [mode,args,o,streamId,expectPrivate,expectPublic,qualification]of cases){
  const {spy,calls}=observeStore(store),r=await make(o,spy).run(args,{streamId,connectorAuthority:o.connectorAuthority});
  const row={mode,hostRestricted:restricted(o),privateSentinelReturned:r.content.includes('SYNTHETIC_PRIVATE_COBALT'),publicControlReturned:r.content.includes('Public group update'),workerLocalReturned:r.content.includes('Worker local milestone'),calls,qualification:qualification||'direct-or-pure-helper-control'};
  if(row.privateSentinelReturned!==expectPrivate||row.publicControlReturned!==expectPublic)throw Error('Unexpected control '+mode);
  if(/worker-local-success/.test(mode)&&!row.workerLocalReturned)throw Error('Lost worker local success');
  if(['foreign-scroll','restricted-missing-stream','restricted-foreign-stable-anchor'].includes(mode)&&calls.length)throw Error('Denied request accessed store');
  results.push(row);
 }
 const own={streamId:'allowed-group',role:'user',ts:200,content:'Public group update keyword',taint:'',taintKnown:true,rowId:2};
 const foreign={streamId:'owner-private',role:'user',ts:100,content:'SYNTHETIC_PRIVATE_COBALT keyword',taint:'',taintKnown:true,rowId:1};
 const missing={role:'user',ts:100,content:'MISSING_STREAM_CANARY keyword',taint:'',taintKnown:true,rowId:3};
 const adapter={search:()=>[foreign,missing,own],around:()=>[foreign,missing,own],streams:()=>[foreign,missing,own].map(x=>({...x,turns:1,lastAt:x.ts,preview:x.content,previewTaintKnown:true}))};
 const adapterResults=[];
 for(const [mode,args]of [['search',{query:'keyword',scope:'all'}],['stable-scroll',{anchor:'tx-2'}],['browse',{}]]){
  const {spy,calls}=observeStore(adapter),r=await make(group,spy).run(args,{streamId:'allowed-group'});
  const row={mode,foreignReturned:r.content.includes('SYNTHETIC_PRIVATE_COBALT'),missingStreamReturned:r.content.includes('MISSING_STREAM_CANARY'),ownReturned:r.content.includes('Public group update'),calls};
  if(row.foreignReturned||row.missingStreamReturned||!row.ownReturned)throw Error('Adapter confinement failed '+mode);
  adapterResults.push(row);
 }
 const sourceBlobs={};for(const p of new Set([...cache.keys(),'sidecar/index.js','sidecar/tools/builtin/orchestration.js','sidecar/subagents.js']))sourceBlobs[p]=cp.execFileSync('git',['rev-parse',ref+':'+p],{cwd:root,encoding:'utf8'}).trim();
 console.log(JSON.stringify({source:ref,kind:'Exact modules plus extracted host predicate/factory/authority field and actual pure worker helpers. In-memory transcript and hostile-adapter fixtures. No full host/dispatch, provider, live page or installed test.',hostWiring:{predicate:predicate[1],factoryArguments:binding[1],bridgeField:bridge[0]},persistedWorkerLimits:persisted,resumedRestriction:restricted(resumed),results,adapterResults,sourceBlobs,verdict:'Direct restricted-chat recall and inherited Boolean/local worker controls pass. Foreign destination binding remains a conditional observation, not a demonstrated admitted dispatch. Malformed nonempty binding reaches storage but returns no foreign text.'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
