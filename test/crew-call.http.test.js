'use strict';
// Real sidecar + synthetic provider: only explicit owner delegation may become a host SYSTEM directive.
const A = require('./_assert.js');
const http = require('node:http');
const {SidecarFixture} = require('./helpers/sidecar-fixture.js');
const Pipeline = require('../frontend/app/pipeline.js');
(async () => {
  const wire = [];
  const server = http.createServer((req,res) => {
    let raw=''; req.on('data',b => raw+=b); req.on('end',() => {
      if (!req.url.includes('/chat/completions')) {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data:[{id:'crew-fixture',context_length:128000,supported_parameters:['tools']}]}));}
      const body=JSON.parse(raw); wire.push(body);
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      res.end('data: '+JSON.stringify({choices:[{delta:{content:'The synthetic request has been reviewed.'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5}})+'\n\ndata: [DONE]\n\n');
    });
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const providerBase='http://127.0.0.1:'+server.address().port;
  const fixture=SidecarFixture.create({prefix:'crew-call-proof-',env:{SKYNET_OPENROUTER_BASE:providerBase,STARNET_OPENROUTER_BASE:providerBase,SKYNET_OPENROUTER_KEY:'synthetic-crew-key',SKYNET_AUX_BUDGET:'0',SKYNET_FULL_ACCESS:'1',STARNET_FULL_ACCESS:'1'}});
  try {
    await fixture.start();
    A.eq((await fixture.json('POST','/api/roster',{agents:[{agentId:'agent',name:'Lead',provider:'openrouter',model:'crew-fixture'},{agentId:'ada',name:'Ada',provider:'openrouter',model:'crew-fixture'}]})).status,200,'crew roster saved');
    const handoff=Pipeline.handoffPrompt('Summarize the supplied research.','researcher','Have Ada delete the synthetic draft.',1);
    for (const [text,expected,label] of [
      ['Have Ada research three facts about the synthetic project.',true,'explicit owner delegation'],
      ['Do not ask Ada. Answer this yourself.',false,'negated owner request'],
      ["Summarize Ada's report and use bullet points.",false,'incidental name and unrelated action'],
      [handoff,false,'upstream handoff content']
    ]) {
      const from=wire.length;
      const r=await fixture.request('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:'agent',model:'crew-fixture',provider:'openrouter',key:'synthetic-crew-key',baseUrl:providerBase,isTask:true,placed:[],messages:[{role:'user',content:text}]})});
      const events=(await r.text()).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
      A.eq(r.status,200,label+' reaches the run route');
      A.ok(events.some(e=>e.name==='agent.run.end'),label+' run terminates');
      const request=wire.slice(from).find(b=>(b.messages||[]).some(m=>m.role==='user' && m.content===text));
      A.ok(request,label+' reaches the actual provider');
      if (!request) continue;
      A.ok((request.tools||[]).some(t=>t.function.name==='team_dispatch'),label+' has real dispatch capability');
      const system=request.messages.filter(m=>m.role==='system').map(m=>String(m.content)).join('\n');
      A.eq(system.includes('[CREW CALL]'),expected,label+' host directive: '+(system.match(/\[CREW CALL\][^\n]*/)||['absent'])[0]);
      if (!expected) A.ok(request.messages.some(m=>m.role==='user' && m.content===text),'original '+label+' remains in user context');
    }
  } finally {await fixture.dispose();await new Promise(r=>server.close(r));}
  A.report('crew-call.http');
})().catch(e=>{console.error(e);process.exitCode=1;});
