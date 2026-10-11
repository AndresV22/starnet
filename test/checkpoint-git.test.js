'use strict';
const A = require('./_assert.js');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { makeCheckpointGitRunner } = require('../sidecar/checkpoint-git.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'starnet-checkpoint-git-'));
const heartbeat = path.join(root,'heartbeat.txt');
const worker = path.join(root,'worker.cjs');
const launcher = path.join(root,'launcher.cjs');
fs.writeFileSync(worker,"const fs=require('node:fs'); setInterval(()=>fs.appendFileSync(process.argv[2],'x'),40);");
fs.writeFileSync(launcher,"require('node:child_process').spawn(process.execPath,[process.argv[2],process.argv[3]],{stdio:'inherit',windowsHide:true});setInterval(()=>{},1000);");
const run = makeCheckpointGitRunner({spawn,file:process.execPath,timeoutMs:1200,clock:{now:()=>Date.now()}});
(async()=>{
  try {
    const split = await run(['-e',"process.stdout.write('data'); process.stderr.write('warning');"],{cwd:root});
    A.eq(split.code,0,'successful process'); A.eq(split.stdout,'data','stdout contains only data'); A.eq(split.stderr,'warning','stderr retained separately');
    const timed = await run([launcher,worker,heartbeat],{cwd:root});
    A.ok(timed.timedOut&&timed.code!==0,'timeout is observable');
    A.ok(fs.existsSync(heartbeat),'descendant actually ran');
    const before=fs.statSync(heartbeat).size;
    await new Promise(r=>setTimeout(r,250));
    A.eq(fs.statSync(heartbeat).size,before,'timeout stopped descendant before returning');
    const controller=new AbortController();
    const aborted=run([launcher,worker,heartbeat],{cwd:root,signal:controller.signal});
    setTimeout(()=>controller.abort(),350);
    const abortResult=await aborted;
    A.ok(abortResult.aborted&&abortResult.code!==0,'abort is observable');
    const afterAbort=fs.statSync(heartbeat).size;
    await new Promise(r=>setTimeout(r,250));
    A.eq(fs.statSync(heartbeat).size,afterAbort,'abort stopped descendant before returning');
    const missing=await makeCheckpointGitRunner({spawn,file:path.join(root,'absent-executable')})([],{cwd:root});
    A.ok(missing.code!==0,'missing executable resolves fail-open error');
    const source=fs.readFileSync(path.join(__dirname,'../sidecar/index.js'),'utf8');
    A.ok(source.includes("require('./checkpoint-git.js').makeCheckpointGitRunner"),'real sidecar wires supervised checkpoint runner');
    const bounded = makeCheckpointGitRunner({spawn,file:process.execPath,maxBytes:128});
    for (const stream of ['stdout','stderr']) {
      const tooMuch = await bounded(['-e',"process."+stream+".write('x'.repeat(4096));setInterval(()=>{},1000)"],{cwd:root});
      A.ok(tooMuch.code!==0&&tooMuch.truncated,'oversized '+stream+' cannot be parsed as success');
      A.ok(tooMuch.stdout.length<=128&&tooMuch.stderr.length<256,'captured output stays bounded');
    }
    A.report('checkpoint-git.test');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
