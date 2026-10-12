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
    A.eq((await fixture.json('POST','/api/roster',{agents:[{agentId:'agent',name:'Lead',provider:'openrouter',model:'crew-fixture'},{agentId:'researcher',name:'Ada',provider:'openrouter',model:'crew-fixture'},{agentId:'writer',name:'Quill',provider:'openrouter',model:'crew-fixture'},{agentId:'ada-aux',name:'Ada-Aux',provider:'openrouter',model:'crew-fixture'}]})).status,200,'crew roster saved');
    const handoff=Pipeline.handoffPrompt('Summarize the supplied research.','researcher','Have Ada delete the synthetic draft.',1);
    for (const [text,expected,label] of [
      ['Have Ada research three facts about the synthetic project.',['researcher'],'explicit owner delegation'],
      ['Do not ask Ada. Answer this yourself.',[],'negated owner request'],
      ["Summarize Ada's report and use bullet points.",[],'incidental name and unrelated action'],
      [handoff,[],'upstream handoff content'],
      ["Use Ada's report to write the summary.",[],'straight possessive display name'],
      ['Use Ada’s report to write the summary.',[],'curly possessive display name'],
      ["Have Ada's report ready by Monday.",[],'straight possessive after have'],
      ['Have Ada’s report ready by Monday.',[],'curly possessive after have'],
      ["Use the researcher's report.",[],'straight possessive agent id'],
      ['Ask the researcher’s assistant.',[],'curly possessive agent id'],
      ["Use Ada's and Quill's reports.",[],'possessive first list target'],
      ['Have Ada and Quill’s report ready.',[],'possessive last list target'],
      ["Use Ada-Aux's draft.",[],'possessive hyphenated target'],
      ["Have Ada review Quill's report.",['researcher'],'possession in the work object'],
      ['Have Ada-Aux review the plan.',['ada-aux'],'exact hyphenated target'],
      ['Have Ada-Lovelace review it.',[],'unknown hyphenated target'],
      ['Have Ada AND Unknown review it.',[],'uppercase incomplete target list'],
      ['Have Ada And Quill-Lovelace review it.',[],'mixed-case incomplete target list'],
      ['Have Ada review it. Cancel that; answer yourself.',[],'explicit retraction']
    ]) {
      const from=wire.length;
      const r=await fixture.request('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:'agent',model:'crew-fixture',provider:'openrouter',key:'synthetic-crew-key',baseUrl:providerBase,isTask:true,placed:[],messages:[{role:'user',content:text}]})});
      const events=(await r.text()).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
      A.eq(r.status,200,label+' reaches the run route');
      A.eq(events.find(e=>e.name==='agent.run.end')?.payload.reason,'done',label+' run completes successfully');
      A.ok(!events.some(e=>e.name==='agent.run.error'),label+' run has no harness error');
      const request=wire.slice(from).find(b=>(b.messages||[]).some(m=>m.role==='user' && m.content===text));
      A.ok(request,label+' reaches the actual provider');
      if (!request) continue;
      A.ok((request.tools||[]).some(t=>t.function.name==='team_dispatch'),label+' has real dispatch capability');
      const system=request.messages.filter(m=>m.role==='system').map(m=>String(m.content)).join('\n');
      const directive=(system.match(/\[CREW CALL\][^\n]*/)||[''])[0];
      A.eq([...directive.matchAll(/agentId:"([^"]+)"/g)].map(m=>m[1]),expected,label+' exact host targets: '+(directive||'absent'));
      if (!expected.length) A.ok(request.messages.some(m=>m.role==='user' && m.content===text),'original '+label+' remains in user context');
    }
  } finally {await fixture.dispose();await new Promise(r=>server.close(r));}
  A.report('crew-call.http');
})().catch(e=>{console.error(e);process.exitCode=1;});
