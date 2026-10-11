'use strict';
const A = require('./_assert.js');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFile } = require('node:child_process');
const { makeCheckpointStore } = require('../sidecar/checkpoint-store.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-checkpoint-maintenance-'));
let active = 0, peak = 0, calls = [], failMaintenance = false, failAdd = false;
function runGit(args, opts) {
  calls.push(args); active++; peak = Math.max(peak, active);
  const failing = (failMaintenance && (args.includes('gc') || (args[1].endsWith('.reinit') && args.includes('add')))) || (failAdd && args.includes('add'));
  if (failing) { active--; return Promise.resolve({code:1,stdout:'',stderr:'injected failure'}); }
  return new Promise(resolve => execFile('git', args, {cwd:opts.cwd,windowsHide:true,timeout:15000}, (err,stdout,stderr) => {
    active--; resolve({code:err?1:0,stdout:String(stdout||''),stderr:String(stderr||'')});
  }));
}
const deps = { fs, pathMod:path, root, runGit, clock:{now:()=>1700000000000} };
const aid = 'worker', wt = path.join(root,aid);
fs.mkdirSync(wt); fs.writeFileSync(path.join(wt,'draft.txt'),'baseline');
const pack = path.join(root,'.checkpoints',aid,'git','objects','pack');
const garbage = path.join(pack,'tmp_pack_fixture');
function inflate() { fs.mkdirSync(pack,{recursive:true}); fs.writeFileSync(garbage,Buffer.alloc(128*1024)); }
(async () => {
  try {
    const wide = makeCheckpointStore({...deps,maxRepoBytes:10*1024*1024});
    A.ok(await wide.snapshot(aid,{runId:'initial'}),'baseline exists');
    const bounded = makeCheckpointStore({...deps,maxRepoBytes:96*1024});
    inflate(); calls=[];
    const unchanged = await bounded.snapshot(aid,{runId:'unchanged'});
    A.ok(calls.some(a=>a.includes('gc')),'unchanged snapshot enforces ceiling');
    A.ok(unchanged && bounded.list(aid).snapshots.some(s=>s.id===unchanged.id),'maintenance returns a recorded surviving checkpoint');
    A.ok(!fs.existsSync(garbage),'replacement removes abandoned shadow data');
    fs.writeFileSync(path.join(wt,'draft.txt'),'later edit');
    A.ok(await bounded.restore(aid,unchanged.id),'post-maintenance id really restores');
    A.eq(fs.readFileSync(path.join(wt,'draft.txt'),'utf8'),'baseline','restore preserves baseline bytes');
    inflate(); failMaintenance=true; calls=[];
    const failed = await bounded.snapshot(aid,{runId:'maintenance-failure'});
    A.ok(failed && failed.maintenance && failed.maintenance.overLimit===true,'failed cleanup is reported as over limit');
    A.eq(failed.maintenance.gcSucceeded,false,'failed GC is not reported as success');
    A.ok(fs.existsSync(garbage),'failed replacement preserves original repo');
    const priorId=failed.id; failAdd=true; calls=[];
    A.eq(await bounded.snapshot(aid,{runId:'add-failure'}),null,'failed add keeps fail-open null contract');
    A.ok(calls.some(a=>a.includes('gc')),'failed add still attempts bounded maintenance');
    failMaintenance=false; failAdd=false;
    A.ok(await wide.restore(aid,priorId),'failed maintenance preserves usable undo history');
    peak=0; calls=[];
    const project=path.join(root,'project'); fs.mkdirSync(project); fs.writeFileSync(path.join(project,'draft.txt'),'project baseline');
    const multi=makeCheckpointStore({...deps,maxRepoBytes:10*1024*1024,scopeIdOf:()=> 'a'.repeat(24),allowWorkTree:()=>true});
    const both=await Promise.all([multi.snapshot(aid,{runId:'local'}),multi.snapshot(aid,{runId:'project',workTree:project}),multi.listResilient(aid)]);
    A.eq(peak,1,'same agent has one checkpoint Git writer across scopes');
    A.ok(both[0]&&both[1],'both scopes complete');
    const rows=multi.list(aid).snapshots;
    A.ok(rows.some(s=>s.id===both[0].id)&&rows.some(s=>s.id===both[1].id),'shared index retains both scopes');
    A.ok(calls.every(a=>a.includes('gc.auto=0')&&a.includes('maintenance.auto=false')&&a.includes('gc.autoDetach=false')),'Git cannot start hidden background maintenance');
    const tiny=makeCheckpointStore({...deps,maxRepoBytes:1});
    const replaced=await tiny.snapshot(aid,{runId:'replacement',turn:7});
    A.ok(replaced&&replaced.maintenance.reinit,'tiny ceiling exercises replacement');
    const replacement=tiny.list(aid).snapshots.find(s=>s.id===replaced.id);
    A.ok(replacement,'replacement returns surviving indexed id');
    A.eq(replacement.runId,'replacement','replacement preserves triggering run correlation');
    A.ok(await tiny.restore(aid,replaced.id),'returned replacement id restores through undo guard');
    const priorRows=tiny.list(aid).snapshots;
    const failedFs=Object.create(fs);
    failedFs.renameSync=(from,to)=>{
      if(to===path.join(root,'.checkpoints',aid,'index.json')&&!from.endsWith('.reinit-index'))throw Object.assign(new Error('index replace denied'),{code:'EACCES'});
      return fs.renameSync(from,to);
    };
    const noIndex=makeCheckpointStore({...deps,fs:failedFs,maxRepoBytes:1});
    const attempted=await noIndex.enforceSizeCeiling(aid);
    A.eq(attempted.reinit,false,'index failure rejects replacement');
    A.eq(JSON.stringify(noIndex.list(aid).snapshots),JSON.stringify(priorRows),'index failure restores previous rows');
    A.ok(await wide.restore(aid,replaced.id),'old object history survives index failure');
    A.report('checkpoint-maintenance.test');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
