import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import{once}from'node:events';import{createRequire}from'node:module';
import{launchChrome,connectCDP,evalJS,sleep}from'../../../scripts/lib/cdp.mjs';import{waitDevReady}from'../../../scripts/lib/seed.mjs';
const require=createRequire(import.meta.url),{SidecarFixture,allocatePort}=require('../../../test/helpers/sidecar-fixture.js');
const results=[];let mode='empty',hits=0,cdp,chrome;
const check=(name,ok,detail)=>{results.push({name,ok:!!ok,detail});console.log(JSON.stringify(results.at(-1)));if(!ok)throw Error(name);};
const mock=http.createServer((req,res)=>{
 if(req.url.includes('/models')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data:[{id:'test/model',context_length:128000,pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']}]}));}
 let raw='';req.on('data',d=>raw+=d);req.on('end',()=>{hits++;res.writeHead(200,{'Content-Type':'text/event-stream'});
 const text=mode==='empty'?'':mode==='promise'?'I will remember your preference for future conversations.':mode==='esc'?'Starting the requested work.':'The answer is five.';
 if(text)res.write('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n');
 const end=()=>{if(res.destroyed)return;res.write('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}})+'\n\n');res.end('data: [DONE]\n\n');};
 if(mode==='esc'){const t=setTimeout(end,30000);res.on('close',()=>clearTimeout(t));}else end();
 });
});mock.listen(0,'127.0.0.1');await once(mock,'listening');const mockBase='http://127.0.0.1:'+mock.address().port+'/api/v1';
const fixture=new SidecarFixture({entry:path.resolve('dev/seed.js'),timeoutMs:60000,env:{SKYNET_DEFAULT_MODEL:'test/model',SKYNET_OPENROUTER_KEY:'sk-or-v1-synthetic-proof',SKYNET_OPENROUTER_BASE:mockBase,STARNET_OPENROUTER_BASE:mockBase,SKYNET_REFLECT:'0',SKYNET_SKILL_REVIEW:'0',SKYNET_EDGE_TTS:'0',SKYNET_AUX_BUDGET:'0'}});fixture.args=['--keep','--workspace',fixture.workspace];
const until=async(fn,ms=45000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(250);}throw Error('timed out waiting');};
const text=()=>evalJS(cdp,"document.getElementById('chat-log').innerText");
async function send(s){await evalJS(cdp,`(()=>{const e=document.getElementById('chat-input');e.value=${JSON.stringify(s)};e.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('chat-send').click();return true;})()`);}
try{
 await fixture.start();const port=await allocatePort();chrome=launchChrome({cdpPort:port,profileDir:path.join(fixture.profile,'chrome')});cdp=await connectCDP(port);await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Page.navigate',{url:fixture.baseUrl});check('seeded station opens',await waitDevReady(cdp,evalJS,{url:fixture.baseUrl,tries:60}));
 await evalJS(cdp,`(()=>{window.__proofRuns=[];const f=window.fetch;window.fetch=async function(...a){const r=await f.apply(this,a);if(String(a[0]).includes('/api/run'))r.clone().text().then(t=>{try{window.__proofRuns.push(t.split('\\n').filter(Boolean).map(JSON.parse));}catch(e){window.__proofRuns.push({error:String(e)});}});return r;};return true;})()`);
 await send('Please answer this simple arithmetic question: what is two plus three?');await until(()=>evalJS(cdp,'window.__proofRuns.length>0 && !Chat.isBusy()'));
 const emptyText=await text(),ends=await evalJS(cdp,"window.__proofRuns.flat().filter(e=>e.name==='agent.run.end').map(e=>e.payload.reason)");check('empty terminal reason matches UI',ends.includes('empty')&&/empty reply|nothing was done/i.test(emptyText),{ends,text:emptyText.slice(-2200),providerCalls:hits});check('empty has retry',await evalJS(cdp,"[...document.querySelectorAll('#chat-log button')].some(e=>/try again/i.test(e.textContent))"));
 await cdp.send('Page.reload');await sleep(1200);await waitDevReady(cdp,evalJS,{url:fixture.baseUrl,tries:60});await until(()=>evalJS(cdp,"typeof Chat!=='undefined' && !!document.getElementById('chat-log') && /empty reply|nothing was done/i.test(document.getElementById('chat-log').innerText)"));check('stop reason survives reload',true,(await text()).slice(-1800));
 mode='complete';await evalJS(cdp,"([...document.querySelectorAll('#chat-log button')].find(e=>/try again/i.test(e.textContent)).click(),true)");await until(()=>evalJS(cdp,"!Chat.isBusy() && /The answer is five/.test(document.getElementById('chat-log').innerText)"));check('retry completes through provider',true,(await text()).slice(-1400));
 mode='promise';await send('Please remember for all future conversations that I prefer violet accents.');await until(async()=>!await evalJS(cdp,'Chat.isBusy()')&&/nothing was written to memory|will not remember this next time/.test(await text()),60000);check('unkept memory promise says no save',true,(await text()).slice(-2000));
 mode='esc';await send('Write a short explanation of the ocean.');await until(()=>evalJS(cdp,"Chat.isBusy() && /Starting the requested work/.test(document.getElementById('chat-log').innerText)"));await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(async()=>/STOPPED BY YOU \(ESC\)/.test(await text()));check('Escape attributes stop to user',true,(await text()).slice(-1600));
}catch(e){console.error(e.stack);if(cdp)try{console.error((await text()).slice(-3000));}catch{}process.exitCode=1;}finally{
 fs.writeFileSync('.tmp/stop-ui-results.json',JSON.stringify({results,hits},null,2));fs.writeFileSync('.tmp/stop-ui-sidecar.log',fixture.output());
 if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.ws.close();}if(chrome?.proc&&chrome.proc.exitCode===null){const ex=once(chrome.proc,'exit');chrome.proc.kill();await Promise.race([ex,sleep(3000)]);}await fixture.dispose();mock.closeAllConnections();await new Promise(r=>mock.close(r));
}
