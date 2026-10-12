import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import http from 'node:http';
import {findChrome,connectCDP,evalJS,collectDiagnostics,sleep} from '../../../scripts/lib/cdp.mjs';
import {materializeSeedWorkspace,bootSeededSidecar,waitUp,waitDevReady} from '../../../scripts/lib/seed.mjs';
const label=process.argv[2]||'after';
const receiptDir=resolve('qa/evidence/deep-sweep-2026-10-11');
const root=mkdtempSync(join(tmpdir(),'starnet-update-backoff-'));
const port=()=>new Promise((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p))})});
const stop=child=>new Promise(resolve=>{if(!child||child.exitCode!==null)return resolve();const timer=setTimeout(resolve,5000);child.once('exit',()=>{clearTimeout(timer);resolve()});if(process.platform==='win32'){const k=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});k.once('error',()=>child.kill());}else child.kill('SIGKILL')});
const mock=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'test/model',context_length:64000,pricing:{prompt:'0',completion:'0'}}]}))});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const iso={};for(const k of ['APPDATA','LOCALAPPDATA','USERPROFILE','HOME','HERMES_HOME']){iso[k]=join(root,k);mkdirSync(iso[k],{recursive:true})}
const appPort=await port(),cdpPort=await port(),base='http://127.0.0.1:'+appPort,workspace=join(root,'workspace');
materializeSeedWorkspace(workspace,'test/model');
const sidecar=bootSeededSidecar({port:appPort,scratchDir:workspace,model:'test/model',key:'sk-or-v1-fake',env:{...iso,SKYNET_OPENROUTER_BASE:'http://127.0.0.1:'+mock.address().port+'/api/v1'}});
const chrome=spawn(findChrome(),['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--no-proxy-server','--mute-audio','--remote-debugging-port='+cdpPort,'--window-size=1440,900','--user-data-dir='+join(root,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let cdp;const receipt={label,at:new Date().toISOString(),limits:'Actual seeded sidecar and Chromium page; only the native updater IPC is stubbed. No installer, network update or customer acceptance claim.'};
try{
 if(!await waitUp(base+'/'))throw Error('seeded sidecar did not start');
 cdp=await connectCDP(cdpPort);cdp.timeoutMs=45000;await cdp.send('Page.enable');await cdp.send('Runtime.enable');const diagnostic=collectDiagnostics(cdp);
 await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),100);window.cancelAnimationFrame=id=>clearTimeout(id);window.__updateCalls=[];window.__updateStub={core:{Channel:class{},invoke:async(cmd)=>{if(cmd==='starnet_update_status')return{desktop:true,currentVersion:'0.13.2',pending:null};if(cmd==='starnet_update_check'){window.__updateCalls.push(Date.now());throw Error('fixture: offline update service')}throw Error('unexpected updater IPC '+cmd)}}};if(!sessionStorage.getItem('update-fixture-set')){localStorage.setItem('starnet.updates.v1',JSON.stringify({autoCheck:true,lastCheckAt:Date.now()-3600000,nextCheckAt:Date.now()+3600000,availableVersion:'99.0.0'}));sessionStorage.setItem('update-fixture-set','1');}`});
 const source=readFileSync('frontend/app/updates.js','utf8');
 cdp.on('Fetch.requestPaused',p=>{const body='window.__TAURI__=window.__updateStub;\n'+source+'\ndelete window.__TAURI__;';cdp.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(body).toString('base64')}).catch(e=>{receipt.interceptError=e.message})});
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/app/updates.js*',requestStage:'Request'}]});
 await cdp.send('Page.navigate',{url:base+'/'});
 receipt.liveFloor=await waitDevReady(cdp,evalJS,{url:base+'/',tries:50,reloadEvery:0});if(!receipt.liveFloor)throw Error('page did not reach live floor');
 await sleep(3300);
 receipt.automatic=await evalJS(cdp,`({calls:window.__updateCalls.slice(),phase:Updates.phase(),prefs:Updates.prefs(),hero:App.heroId()})`);
 await evalJS(cdp,`Updates.check(true,'manual')`);await sleep(2200);
 receipt.manual=await evalJS(cdp,`({calls:window.__updateCalls.slice(),phase:Updates.phase(),prefs:Updates.prefs()})`);
 await cdp.send('Page.reload',{ignoreCache:true});if(!await waitDevReady(cdp,evalJS,{tries:40,reloadEvery:0}))throw Error('reload floor failed');await sleep(2200);
 receipt.restart=await evalJS(cdp,`({calls:window.__updateCalls.slice(),phase:Updates.phase(),prefs:Updates.prefs()})`);
 receipt.exceptions=diagnostic.exceptions;
 receipt.pass=label==='before'?receipt.automatic.calls.length>1:receipt.automatic.calls.length===1&&receipt.manual.calls.length===2&&receipt.restart.calls.length===0&&receipt.exceptions.length===0;
 console.log(JSON.stringify(receipt,null,2));
 writeFileSync(join(receiptDir,'update-backoff-'+label+'.json'),JSON.stringify(receipt,null,2)+'\n');
 if(!receipt.pass)process.exitCode=1;
}catch(e){receipt.error=e.stack;writeFileSync(join(receiptDir,'update-backoff-'+label+'.json'),JSON.stringify(receipt,null,2)+'\n');console.error(e);process.exitCode=1}
finally{try{cdp?.ws.close()}catch{}await stop(chrome);await stop(sidecar);mock.closeAllConnections();await new Promise(r=>mock.close(r));}
