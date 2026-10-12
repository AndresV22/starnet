import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {findChrome,connectCDP,evalJS,sleep} from '../../../scripts/lib/cdp.mjs';
import {waitUp,waitDevReady} from '../../../scripts/lib/seed.mjs';
const label=process.argv[2]||'after';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['sidecar/index.js','sidecar/ledger.js','frontend/app/stationui.js','website/app/app/stationui.js'];
const provenance={startedAt:new Date().toISOString(),command:'node qa/evidence/legacy-spend-recovery-1011/live-probe.mjs '+label,gitSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:Object.fromEntries(sourceFiles.map(p=>[p,{diskSha256:sha256(fs.readFileSync(p)),gitSha256:sha256(execFileSync('git',['show','HEAD:'+p],{maxBuffer:5e6}))}])),scope:'Seeded browser/API evidence, not installed artifact or customer acceptance'};
if(Object.values(provenance.files).some(v=>v.diskSha256!==v.gitSha256))throw Error('product source differs from frozen Git SHA');
const root=resolve('.tmp/legacy-spend-'+label+'-'+Date.now());fs.mkdirSync(root,{recursive:true});
const workspace=join(root,'workspace');fs.cpSync('dev/fixtures/seed-workspace',workspace,{recursive:true});
const pending=join(workspace,'.spend-pending');fs.mkdirSync(pending);
const receipts=[
 {runId:'legacy-managed',agentId:'legacy-managed',ts:Date.now()-60000},
 {runId:'legacy-byok',agentId:'legacy-byok',ts:Date.now()-60000},
 {runId:'legacy-unknown',agentId:'legacy-unknown',ts:Date.now()-60000},
 {runId:'known-managed',agentId:'known-managed',ts:Date.now()-60000,managed:true,provider:'starnet',runCapUsd:0.5},
 {runId:'known-byok',agentId:'known-byok',ts:Date.now()-60000,managed:false,provider:'openrouter',runCapUsd:0.5}
];
for(const r of receipts)fs.writeFileSync(join(pending,createHash('sha256').update(r.runId).digest('hex')+'.json'),JSON.stringify(r));
const port=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
const appPort=await port(),cdpPort=await port(),base='http://127.0.0.1:'+appPort;
const env={...process.env,SKYNET_PORT:String(appPort),SKYNET_DEFAULT_MODEL:'test/legacy-spend',SKYNET_OPENROUTER_KEY:'',STARNET_OPENROUTER_KEY:'',SKYNET_BUDGET_PER_DAY:'5',SKYNET_AUX_BUDGET:'0',SKYNET_REFLECT:'0',SKYNET_EDGE_TTS:'0',NODE_OPTIONS:'--require='+resolve('qa/evidence/legacy-spend-recovery-1011/block-external.cjs')};
for(const k of ['APPDATA','LOCALAPPDATA','USERPROFILE','HERMES_HOME']){env[k]=join(root,k);fs.mkdirSync(env[k],{recursive:true})}
let host,chrome,cdp,log='';const out={label,base,provenance,scope:'Real seeded sidecar and Chromium UI, five synthetic receipts; legacy origins are fixture labels only, not stored billing evidence. No live provider or customer account.',rows:[]};
const boot=()=>{host=spawn(process.execPath,['dev/seed.js','--keep','--workspace',workspace],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});host.stdout.on('data',s=>log+=s);host.stderr.on('data',s=>log+=s)};
const stop=p=>new Promise(r=>{if(!p||p.exitCode!==null)return r();const t=setTimeout(r,5000);p.once('exit',()=>{clearTimeout(t);r()});spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})});
const waitStation=async()=>{for(let i=0;i<60;i++){if(await evalJS(cdp,`typeof StationUI !== 'undefined' && typeof StationUI.openTerm === 'function'`))return;await sleep(500)}throw Error('StationUI initialization timeout')};
try{boot();if(!await waitUp(base,40))throw Error('boot timeout');
chrome=spawn(findChrome(),['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--mute-audio','--remote-debugging-port='+cdpPort,'--window-size=1440,1000','--user-data-dir='+join(root,'chrome'),'about:blank'],{windowsHide:true,stdio:'ignore'});
cdp=await connectCDP(cdpPort);await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Page.navigate',{url:base});if(!await waitDevReady(cdp,evalJS,{tries:30,url:base}))throw Error('UI boot timeout');
await waitStation();await evalJS(cdp,`StationUI.openTerm('settings','budget')`);for(let i=0;i<60;i++){if(await evalJS(cdp,`document.querySelectorAll('#budget-unsettled .bg-unsettled').length===5`))break;await sleep(500)}
const capture=()=>evalJS(cdp,`({rows:[...document.querySelectorAll('#budget-unsettled .bg-unsettled')].map(e=>({text:e.textContent,tip:e.getAttribute('data-tip'),label:e.querySelector('input').getAttribute('aria-label'),buttons:[...e.querySelectorAll('button')].map(b=>b.textContent)})),spend:document.querySelector('#budget-spend')?.textContent})`);
const served=await fetch(base+'/app/stationui.js');provenance.servedStationUi={status:served.status,sha256:sha256(Buffer.from(await served.arrayBuffer()))};if(provenance.servedStationUi.sha256!==provenance.files['frontend/app/stationui.js'].diskSha256)throw Error('served JS differs from source');
out.initial=await capture();out.status=await evalJS(cdp,`Harness.api.get('/api/budget/status')`);
if(out.initial.rows.length!==5)throw Error('Expected five unsettled rows, got '+JSON.stringify(out.initial));
if(label==='after'){
 const legacy=out.initial.rows.filter(r=>r.text.includes('legacy-'));if(!legacy.every(r=>r.tip.includes('billing source was not recorded')&&!r.buttons.some(b=>b.startsWith('COUNT AS'))))throw Error('legacy provenance/cap claim');
 if(!out.initial.rows.find(r=>r.text.includes('known-managed')).tip.includes('RECENT ACTIVITY'))throw Error('managed guidance');
 if(!out.initial.rows.find(r=>r.text.includes('known-byok')).tip.includes('provider dashboard'))throw Error('BYOK guidance');
 await stop(host);boot();if(!await waitUp(base,40))throw Error('restart timeout');await cdp.send('Page.reload',{ignoreCache:true});if(!await waitDevReady(cdp,evalJS,{tries:30,url:base}))throw Error('restart UI timeout');await waitStation();await evalJS(cdp,`StationUI.openTerm('settings','budget')`);for(let i=0;i<60;i++){if(await evalJS(cdp,`document.querySelectorAll('#budget-unsettled .bg-unsettled').length===5`))break;await sleep(500)}out.restart=await capture();out.restartStatus=await evalJS(cdp,`Harness.api.get('/api/budget/status')`);
 if(out.restart.rows.length!==5||!out.restart.rows.filter(r=>r.text.includes('legacy-')).every(r=>r.tip.includes('billing source was not recorded')))throw Error('restart classification drift');
}
out.pass=true;console.log(JSON.stringify(out,null,2));
}catch(e){out.error=e.stack;console.error(e);process.exitCode=1}finally{provenance.finishedAt=new Date().toISOString();provenance.exitCode=process.exitCode||0;provenance.filesUnchanged=sourceFiles.every(p=>sha256(fs.readFileSync(p))===provenance.files[p].diskSha256);fs.writeFileSync(join(root,'host.log'),log);fs.writeFileSync('.tmp/legacy-spend-'+label+'.json',JSON.stringify(out,null,2)+'\n');try{cdp?.ws.close()}catch{}await stop(chrome);await stop(host)}
