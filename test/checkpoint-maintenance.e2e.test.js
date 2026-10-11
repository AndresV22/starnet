'use strict';
// #107: real seeded sidecar, authenticated workspace writes and undo/redo, no model/network work.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {SidecarFixture}=require('./helpers/sidecar-fixture.js');
const fixture=SidecarFixture.create({entry:path.resolve(__dirname,'../dev/seed.js'),timeoutMs:60000,
  env:{SKYNET_DEFAULT_MODEL:'checkpoint-local-fixture',SKYNET_OPENROUTER_KEY:'',OPENROUTER_KEY:'',OPENROUTER_API_KEY:'',
    STARNET_CHECKPOINT_MAX_BYTES:String(96*1024)}});
fixture.args=['--keep','--workspace',fixture.workspace];
function killOwnedLauncher(){if(process.platform==='win32'&&fixture.child&&fixture.child.exitCode===null)spawnSync('taskkill',['/pid',String(fixture.child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});}
(async()=>{try{
  await fixture.start();
  const write=content=>fixture.json('POST','/api/autonomy/write',{agentId:'agent',path:'checkpoint-proof.txt',content});
  const baseline=await write('baseline'); assert.equal(baseline.status,200); assert.ok(baseline.body.snapshot);
  const second=await write('baseline'); assert.equal(second.status,200); assert.ok(second.body.snapshot);
  const pack=path.join(fixture.workspace,'.checkpoints','agent','git','objects','pack');fs.mkdirSync(pack,{recursive:true});
  const garbage=path.join(pack,'tmp_pack_fixture');fs.writeFileSync(garbage,Buffer.alloc(128*1024));
  const changed=await write('after maintenance'); assert.equal(changed.status,200); assert.ok(changed.body.snapshot);
  assert.equal(fs.existsSync(garbage),false,'no-change pre-write snapshot ran maintenance');
  assert.ok(fixture.output().includes('over ceiling'),'real checkpoint store recorded the sweep');
  const listed=await fixture.json('GET','/api/checkpoint?agent=agent');
  assert.ok(listed.body.snapshots.some(s=>s.id===changed.body.snapshot),'UI index exposes the surviving receipt');
  const restore=await fixture.json('POST','/api/checkpoint/restore',{agentId:'agent',snapshotId:changed.body.snapshot});
  assert.equal(restore.status,200,restore.text);assert.ok(restore.body.preRestoreId);
  const file=path.join(fixture.workspace,'agent','checkpoint-proof.txt');assert.equal(fs.readFileSync(file,'utf8'),'baseline');
  killOwnedLauncher(); await fixture.stop(); await fixture.start();
  const undo=await fixture.json('POST','/api/checkpoint/restore',{agentId:'agent',snapshotId:restore.body.preRestoreId});
  assert.equal(undo.status,200,undo.text); assert.equal(fs.readFileSync(file,'utf8'),'after maintenance');
  console.log('checkpoint-maintenance.e2e: OK '+JSON.stringify({writeStatus:changed.status,garbageRemoved:true,listed:true,restoreStatus:restore.status,restartUndoStatus:undo.status}));
}finally{killOwnedLauncher();await fixture.dispose();}})().catch(e=>{console.error(e.stack||e);console.error(fixture.output().slice(-4000));process.exitCode=1;});
