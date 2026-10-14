'use strict';
const assert = require('node:assert/strict');
const {AutonomyStore: S} = require('../frontend/app/autonomystore.js');
global.Autonomy = require('../frontend/app/autonomy.js');
const mem = {};
global.localStorage = {getItem:k=>mem[k]||null,setItem:(k,v)=>{mem[k]=v;},removeItem:k=>{delete mem[k];}};
const key='starnet.autonomy.v1';
let server=Autonomy.fresh(), fail=false, malformed=false, hold=null;
const calls=[];
global.fetch=async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):null;calls.push(body);
  if(body&&hold)await hold;
  if(body&&fail)return {ok:false,json:async()=>({ok:false,error:'disk full'})};
  if(body&&malformed)return {ok:true,json:async()=>({})};
  if(body)server=Autonomy.normalize(body.posture);
  return {ok:true,json:async()=>({ok:true,summary:Autonomy.summary(server)})};
};
(async()=>{
  mem[key]=JSON.stringify({initiative:'free',reach:'reach',leashPerDay:12});
  await S.init();assert.equal(S.get().initiative,'propose','a new station reads the server default: propose, never act');assert.ok(calls.every(x=>x===null),'boot is read-only');
  assert.equal((await S.applyPreset('build')).ok,true);assert.equal(S.get().initiative,'leash');assert.equal(calls.at(-1).resumeHalt,true);
  assert.equal(JSON.parse(mem[key]).initiative,'leash');
  fail=true;assert.equal((await S.setInitiative('wait')).ok,false);assert.equal(S.get().initiative,'leash');assert.match(S.status().error,/disk full/);
  fail=false;malformed=true;assert.equal((await S.setReach('reach')).ok,false);assert.equal(S.get().reach,'sandbox');malformed=false;
  let release;hold=new Promise(r=>release=r);
  const first=S.setReach('observe'),second=S.setLeash(7);
  await new Promise(r=>setImmediate(r));assert.equal(S.status().pending,true);assert.equal(S.get().reach,'sandbox','pending value is not current');
  release();await Promise.all([first,second]);hold=null;
  assert.equal(server.reach,'observe');assert.equal(server.leashPerDay,7);assert.equal(S.status().pending,false);
  const original=global.fetch;
  global.fetch=async(url,opts)=>{if(opts.body){server=Autonomy.normalize(JSON.parse(opts.body).posture);throw new Error('ack lost');}return original(url,opts);};
  assert.equal((await S.setInitiative('free')).ok,false);assert.equal(S.get().initiative,'free','lost ack reconciles committed state');
  global.fetch=original;
  await S.importState({initiative:'wait',reach:'sandbox',leashPerDay:4});assert.equal(calls.at(-1).resumeHalt,false);
  server={initiative:'leash',reach:'observe',leashPerDay:6};mem[key]='broken';await S.init();assert.equal(S.get().leashPerDay,6,'reload uses server despite missing cache');
  global.fetch=async()=>{throw new Error('offline');};await S.refresh();assert.equal(S.status().loaded,false);assert.match(S.status().error,/offline/);
  global.fetch=original;await S.refresh();assert.equal(S.status().loaded,true);assert.equal(S.status().error,'');
  let emitted=0;global.U={bus:{emit:()=>emitted++}};await S.setLeash(12);assert.equal(emitted,0);
  fail=true;assert.equal((await S.reset()).ok,false);assert.equal(S.get().initiative,server.initiative);
  fail=false;await S.reset();assert.equal(mem[key],undefined);assert.equal(S.get().initiative,'propose');assert.equal(server.initiative,'propose','reset returns to the new-station default');assert.equal(calls.at(-1).resumeHalt,false);
  // org P06: REACH and PACE never lift an E-STOP halt (resumeHalt:false); the ON ITS OWN rungs (setInitiative /
  // applyPreset) still do. A write the route says LIFTED a halt (haltLifted) tells the Commander; one that lifted
  // nothing says nothing — the notice keys on the route's proof, never on the request.
  await S.setReach('reach');assert.equal(calls.at(-1).resumeHalt,false,'REACH never lifts a halt');
  await S.setLeash(5);assert.equal(calls.at(-1).resumeHalt,false,'PACE never lifts a halt');
  await S.setInitiative('leash');assert.equal(calls.at(-1).resumeHalt,true,'an ON ITS OWN rung is still a stated lift');
  const notes=[];global.StationUI={notify:(m,k)=>notes.push([m,k])};
  const plain=global.fetch;let lifted=false;
  global.fetch=async(url,opts)=>{const r=await plain(url,opts);if(!opts.body||!lifted)return r;const j=await r.json();return {ok:true,json:async()=>Object.assign({},j,{haltLifted:true})};};
  let res=await S.setInitiative('free');assert.equal(res.haltLifted,false);assert.equal(notes.length,0,'no halt lifted → no notice');
  lifted=true;res=await S.applyPreset('build');assert.equal(res.haltLifted,true);
  assert.deepEqual(notes,[['Automation resumed — schedules and away work will run again','good']],'a lifted halt says Automation resumed');
  global.fetch=plain;delete global.StationUI;
  // the route's haltLifted is TRUE only when this write cleared a standing halt (nightshift halted, or liftCronHalt() lifted one)
  const idx=require('fs').readFileSync(require('path').join(__dirname,'..','sidecar','index.js'),'utf8');
  assert.match(idx,/if \(resumeRequested && nightshift\.isHalted\(nightshiftState\)\) \{ saveNightshiftState\(nightshift\.clearHalt\(nightshiftState, Date\.now\(\)\)\); haltLifted = true; \}/,'nightshift lift sets haltLifted after the save');
  assert.match(idx,/if \(resumeRequested && liftCronHalt\(\)\) haltLifted = true;/,'cron lift sets haltLifted only when liftCronHalt lifted one');
  assert.match(idx,/resumeRequested: resumeRequested, haltLifted: haltLifted,/,'the posture route reports haltLifted (additive)');
  console.log('autonomystore.test: PASS (confirmed writes, failures, serialization, lost ack, reload, recovery, halt-lift receipt)');
})().catch(e=>{console.error(e);process.exitCode=1;});
