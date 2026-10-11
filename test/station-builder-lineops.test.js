'use strict';
const A = require('./_assert.js');
const M = require('../frontend/app/worldmodel.js'), P = require('../frontend/app/pipeline.js');
const W = require('../frontend/app/workflowline.js'), LE = require('../frontend/app/lineedit.js');
const SB = require('../frontend/app/stationbuilder.js'), S = require('../frontend/app/propsprites.js');
const { makeStationTools } = require('../sidecar/tools/builtin/station.js');
const env = { WorldModel:M, Pipeline:P, WorkflowLine:W, LineEdit:LE, PropSprites:S, crew:[{id:'agent',name:'NOVA'}], heroId:'agent' };
M.setPropRules(t => { const s=S.spec(t); return s ? {mount:s.mount||null,stack:!!s.stack,surface:!!s.surface,flat:!!s.flat} : null; });
const snap = s => JSON.stringify(s.serialize());
function fixture() {
  const s=M.create(); const z=s.rooms()[0].rects[0];
  A.ok(s.addRoom({kind:'hab',rect:{x1:z.x2+1,y1:z.y1,x2:z.x2+50,y2:z.y1+40}}).ok,'hall for independent lines');
  const lines=[];
  for(const [i,name] of [[0,'Line A'],[1,'Line B']]) {
    const r=LE.run(s,null,'newLine',{role:'WRITER'},{near:{x:z.x2+8,y:z.y1+4+i*12}});
    A.ok(r.ok,'line fixture '+name); if(!r.ok) throw Error(JSON.stringify(r));
    const c=P.lineComponents(s.projectGeometry()).find(c=>c.props.includes(r.focus));
    const l={intake:c.intakes[0],outbox:c.outboxes[0],bay:c.bays[0].propId};
    s.setPropLabel(l.intake,name); s.assignPropAgent(l.bay,'agent'); s.ensureWorkstation('agent');
    s.setPropBrief(l.bay,'Write the incoming work.'); s.setPropHands(l.bay,'Pass the full draft.');
    lines.push(l);
  }
  return {s,a:lines[0],b:lines[1],z};
}
function plan(s,ops) {const before=snap(s),r=SB.planEdit(s.serialize(),{refit:ops},env);A.eq(snap(s),before,'planning never mutates the live floor');return r;}
function enact(s,ops) {const r=plan(s,ops);A.ok(r.ok,'plan accepted: '+(r.error||''));if(!r.ok) throw Error(r.error);const x=SB.apply(s,r.plan,env);A.ok(x.ok,'apply accepted: '+(x.error||''));return r.plan;}
{
  const {s,a,b}=fixture(),before=snap(s);
  const p=enact(s,[{op:'connect',from:a.outbox,to:b.intake}]);
  A.eq(s.propById(a.outbox).sendTo,b.intake,'OUTBOX-to-INBOX connect is SEND TO');
  A.eq(P.lineComponents(s.projectGeometry()).length,2,'SEND TO never fuses the lines');
  A.ok(/LINE B/.test(p.summary)&&!/LINE LINE B/.test(p.summary),'approval names the destination once');
  A.ok(s.undo().ok,'one undo'); A.eq(snap(s),before,'one undo restores exact document');
  enact(s,[{op:'sendto',from:a.outbox,to:b.intake}]);
  const linked=snap(s);
  for(const ops of [[{op:'send',prop:a.outbox,to:a.intake}],[{op:'send',prop:b.outbox,to:a.intake}],[{op:'send',prop:a.outbox}]]) {
    const r=plan(s,ops);A.ok(!r.ok&&/same line|circle|needs to/i.test(r.error),'invalid SEND TO is refused by model or explicit argument check: '+r.error);A.eq(snap(s),linked,'refusal leaves existing connection');
  }
  enact(s,[{op:'send',prop:a.outbox,to:null}]); A.ok(!s.propById(a.outbox).sendTo,'explicit null clears SEND TO');
}
{
  const {s,a,b,z}=fixture(); s.setSendTo(a.outbox,b.intake);s.setPropProject(a.intake,'C:/projects/source');s.setPropLimits(a.intake,{maxHops:9,maxUsdPerMessage:2,maxUsdPerDay:5});
  const before=snap(s),ids=new Set(s.props().map(p=>p.id));
  const p=enact(s,[{op:'copy',line:'Line A',x:z.x2+28,y:z.y1+24,as:'copied'},{op:'send',prop:b.outbox,to:'copied'}]);
  const made=s.props().filter(p=>!ids.has(p.id)),inbox=made.find(p=>p.t==='intake'),bay=made.find(p=>p.t==='bay'),outbox=made.find(p=>p.t==='outbox');
  A.ok(inbox&&bay&&outbox,'whole line copied');A.eq([bay.role,bay.agentId,bay.brief,bay.hands],['WRITER','agent','Write the incoming work.','Pass the full draft.'],'role, crew, brief and hand-off preserved');
  A.eq(inbox.limits,s.propById(a.intake).limits,'copy keeps own budget settings');A.ok(!inbox.projectRoot&&!outbox.sendTo,'copy drops project folder and external SEND TO');
  A.eq(s.propById(b.outbox).sendTo,inbox.id,'an as name resolves a copied INBOX later in same plan');A.ok(/not copied:.*SEND TO.*project folder/.test(p.summary),'approval names omitted project and onward destination');
  A.eq(P.lineComponents(s.projectGeometry()).length,3,'copy is a third independent line');
  A.ok(s.undo().ok,'copy refit undoes once');A.eq(snap(s),before,'copy and later SEND TO undo together');
  A.ok(!plan(s,[{op:'copy',prop:a.bay,x:20,y:20,turn:1.5}]).ok,'fractional turn refused');
}
{
  const {s,a,b}=fixture();s.setSendTo(a.outbox,b.intake);const before=snap(s);
  const p=enact(s,[{op:'delete',line:'Line B'}]);
  A.ok(/LINE A no longer sends its finished work on/.test(p.summary),'delete plan names broken incoming SEND TO');
  A.ok(!s.propById(b.intake)&&!s.propById(a.outbox).sendTo,'delete removes destination and clears pointer');s.undo();A.eq(snap(s),before,'delete restores destination and SEND TO in one undo');
  const old=SB.planEdit(s.serialize(),{remove:{line:'Line B'}},env);A.ok(old.ok&&/LINE A no longer sends/.test(old.plan.summary),'original remove-line entry point warns too');
  const prop=plan(s,[{op:'delete',prop:b.intake}]);A.ok(prop.ok&&/LINE A no longer sends/.test(prop.plan.summary),'delete INBOX warns too');
}
(async()=>{
  let payload={};
  const t=makeStationTools({station:{request:async()=>({ok:true,result:{lineId:'a',name:'A',crewed:1,steps:[]}})},runLineJob:async()=>({code:200,obj:Object.assign({ok:true,totalUsd:0.12,runs:[],replies:[]},payload)})}).testLineTool;
  A.ok(/SEND TO.*own cost/.test(t.description),'test tool warns before paid downstream job');
  payload={sentTo:{line:'b',name:'Line B',jobId:'job-b'}};let r=await t.run({line:'A',job:'work'},{}),j=JSON.parse(r.content.split('\n')[0]);
  A.eq([j.cost,j.sentOnTo.lineId,j.sentOnTo.jobId],['$0.12','b','job-b'],'upstream cost and actual downstream job kept distinct');A.ok(/created/.test(j.sentOnTo.note)&&!/(now running|completed)/.test(j.sentOnTo.note),'created record is not a guessed current state');
  payload={sentTo:{line:'b',name:'B',refused:'budget exhausted'}};r=await t.run({line:'A',job:'work'},{});j=JSON.parse(r.content.split('\n')[0]);A.eq(j.sentOnTo.refused,'budget exhausted','downstream refusal preserved');A.ok(/refused/.test(r.summary),'summary says refused');
  payload={onwardDestinations:[{lineId:'b',outboxId:'o'}]};r=await t.run({line:'A',job:'work'},{});j=JSON.parse(r.content.split('\n')[0]);A.eq(j.sentOnTo.state,'unconfirmed','configured destination without durable link is unconfirmed');A.ok(!j.sentOnTo.jobId&&!/queued behind/.test(r.content),'no invented queue state');
  A.report('station-builder-lineops');
})().catch(e=>{console.error(e);process.exitCode=1;});
