'use strict';
const A = require('./_assert.js');
const WM = require('../frontend/app/worldmodel.js');
const P = require('../frontend/app/pipeline.js');
function fresh() { const s=WM.create(); s.projectGeometry(); s.addRoom({kind:'hab',rect:{x1:30,y1:0,x2:120,y2:60}}); return s; }
const add=(s,t,x,y)=>s.addProp({t,x,y,w:/^(bay|intake|outbox)$/.test(t)?2:1,h:/^(bay|intake|outbox)$/.test(t)?2:1,block:/^(bay|intake|outbox)$/.test(t)}).id;
const plan=s=>P.compileRoutingPlan(s.projectGeometry());
const frozen=s=>JSON.stringify(s.serialize());
function rig(type='loop') {
 const s=fresh(), ids=[add(s,'intake',32,4),add(s,'bay',42,4),add(s,'bay',58,4),add(s,'outbox',76,4)];
 s.assignPropAgent(ids[1],'a');s.assignPropAgent(ids[2],'b');
 for(let i=1;i<ids.length;i++) A.ok(s.connectBelt(ids[i-1],ids[i]).ok,'rig connection');
 const l=s.links().find(l=>l.from.prop===ids[1]&&l.to.prop===ids[2]),t=l.path[Math.floor(l.path.length/2)];
 const j=s.junctionOnBelt(t.x,t.y,type,{}); A.ok(j.ok,'rig junction');
 return {s,I:ids[0],B1:ids[1],B2:ids[2],O:ids[3],J:j.id};
}
// A LOOP gets one back lane only, after its done lane. Preview and commit must share the refusal.
{
 const {s,I,B1,B2,O,J}=rig();
 A.ok(s.connectBelt(J,B1).ok,'first back lane remains allowed');
 const before=frozen(s),pv=s.previewBelt(J,I),r=s.connectBelt(J,I);
 A.ok(!pv.ok&&!r.ok,'cannot connect LOOP into INBOX');
 const upstream=add(s,'bay',34,15);s.assignPropAgent(upstream,'up');
 A.ok(s.connectBelt(upstream,B1).ok,'independent upstream BAY connects');
 const state=frozen(s),p=s.previewBelt(J,upstream),c=s.connectBelt(J,upstream);
 A.ok(!p.ok&&p.error==='CIRCLE'&&!c.ok&&c.error==='CIRCLE','third upstream exit is refused');
 A.ok(frozen(s)===state,'refused third lane leaves floor unchanged');
 A.ok(!plan(s).errors.some(e=>e.code==='CHAIN_CYCLE'),'no cycle introduced');
 const x=add(s,'outbox',82,18);A.ok(s.connectBelt(J,x).ok,'third downstream escape remains allowed');
 A.ok(s.isBackLink&&s.links().filter(l=>s.isBackLink(l.id)).length===1,'back-lane reader identifies just the legitimate lane');
}
{
 const {s,B1,B2,J}=rig();
 const l=s.links().find(l=>l.from.prop===J);s.removeLinks([l.id],[],{});
 const before=frozen(s),p=s.previewBelt(J,B1),c=s.connectBelt(J,B1);
 A.ok(!p.ok&&!c.ok&&c.error==='CIRCLE','first lane upstream cannot masquerade as done');
 A.ok(frozen(s)===before,'first upstream refusal leaves floor unchanged');
}
// SELECT MOVES never means splice a selected junction into some other belt.
for (const type of ['merger','splitter','filter','loop']) {
 const {s,B1,B2,O,J}=rig(type), link=s.links().find(l=>l.from.prop===B2&&l.to.prop===O),target=link.path[Math.floor(link.path.length/2)],j=s.propById(J),state=frozen(s);
 const pv=s.canMoveProp(J,target.x,target.y); A.ok(!pv.ok&&pv.error==='ON_BELT',type+' move ghost refuses unrelated belt');
 A.ok(frozen(s)===state,type+' preview is pure');
 const r=s.moveProp(J,target.x-j.x,target.y-j.y); A.ok(!r.ok&&r.error===pv.error&&frozen(s)===state,type+' commit matches ghost without skipping BAY2');
 const group=s.canMoveProps([J],target.x-j.x,target.y-j.y),gr=s.moveProps([J],target.x-j.x,target.y-j.y);
 A.ok(!group.ok&&!gr.ok&&frozen(s)===state,type+' group move also refuses intact');
}
const LE=require('../frontend/app/lineedit.js');
function lines(n) {
 const s=fresh(),out=[];
 for(let i=0;i<n;i++) {
  const r=LE.placeBlueprint(s,'research_line',{x:50,y:8+i*14});if(!r.ok)throw Error(JSON.stringify(r));
  const of=t=>r.ids.filter(id=>s.propById(id).t===t);out.push({I:of('intake')[0],O:of('outbox')[0],B:of('bay')});
 }
 for(const p of s.props())if(p.t==='bay')s.assignPropAgent(p.id,'a'+p.id);
 return {s,L:out};
}
// A→B→C must not become a SEND TO cycle through a newly merged A/C floor component.
{
 const {s,L:[a,b,c]}=lines(3);s.setSendTo(a.O,b.I);s.setSendTo(b.O,c.I);
 const state=frozen(s),pv=s.previewBelt(c.B[c.B.length-1],a.O),r=s.connectBelt(c.B[c.B.length-1],a.O);
 A.ok(!pv.ok&&!r.ok&&r.error==='SEND_TO_CONFLICT','transitive SEND TO fusion refuses in preview and commit');
 A.ok(frozen(s)===state&&Object.keys(plan(s).sendTo).length===2,'both handoffs and floor preserved');
}
// Recover a pre-SEND TO save explicitly, one undo, and preserve it across restart.
{
 const {s,L:[a,b]}=lines(2),d=JSON.parse(frozen(s));
 for(const p of d.props)if(p.id===a.O||p.id===b.I)p.t='bay';
 const oldBuild=WM.deserialize(d);A.ok(oldBuild.connectBelt(a.O,b.I).ok,'old belt fixture');
 const saved=JSON.parse(frozen(oldBuild));for(const p of saved.props){if(p.id===a.O)p.t='outbox';if(p.id===b.I)p.t='intake';}
 const old=WM.deserialize(saved),before=frozen(old);
 A.eq(old.oldHandoffBelts(a.O).length,1,'legacy belt discoverable even in the same component');
 A.eq(old.sendToRefusal(a.O,b.I).error,'OLD_BELT','explains conversion instead of unreachable SAME LINE');
 A.ok(old.convertHandoffBelt(a.O).ok,'explicit conversion succeeds');
 A.ok(plan(old).lines.length===2&&plan(old).sendTo[a.O].intakeId===b.I,'conversion makes two separate working lines');
 const reloaded=WM.deserialize(JSON.parse(frozen(old)));A.ok(plan(reloaded).sendTo[a.O].intakeId===b.I,'converted handoff survives reload');
 old.undo();A.ok(frozen(old)===before,'one undo restores original old belt');
 old.redo();A.ok(plan(old).sendTo[a.O].intakeId===b.I,'redo restores the conversion');
}
// Separate budgets and handoffs survive editing an adjacent line.
{
 const {s,L:[a,b]}=lines(2);s.setSendTo(a.O,b.I);s.setPropLimits(a.I,{maxHops:4});s.setPropLimits(b.I,{maxHops:9});
 const before=plan(s),r=LE.run(s,b.B[0],'appendStep',{after:b.B[0],role:'WRITER'});
 A.ok(r.ok,'adding a step on clear nearby floor succeeds');
 const after=plan(s);A.ok(after.lines.length===2&&after.sendTo[a.O].intakeId===b.I,'editing B preserves two lines and A SEND TO');
 A.eq(after.lines.map(l=>l.maxHops).sort(),before.lines.map(l=>l.maxHops).sort(),'each line keeps its own budget');
}
// Names persist and duplicate line labels are refused without forbidding BAY labels.
{
 const {s,L:[a,b]}=lines(2);A.ok(s.setPropLabel(a.I,'LINE RESEARCH').ok,'name first line');
 A.ok(!s.setPropLabel(b.I,' research ').ok&&!s.propById(b.I).label,'equivalent line name is refused');
 A.ok(s.setPropLabel(a.B[0],'Draft review').ok,'BAY label allowed');
 const re=WM.deserialize(JSON.parse(frozen(s)));A.eq(re.propById(a.B[0]).label,'Draft review','BAY label survives reload');
 A.eq(s.copyLines([a.B[0]]).clip.nodes[0].label,'Draft review','BAY label survives copy');
}
A.report('conveyor-floor-integrity.test');
