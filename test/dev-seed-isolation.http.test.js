'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const entry = path.resolve(__dirname, '../dev/seed.js');

function fixture() {
  const f = SidecarFixture.create({prefix:'seed-isolation-',entry,timeoutMs:30000,
    env:{SKYNET_DEFAULT_MODEL:'test/model',SKYNET_OPENROUTER_KEY:'seed-fixture'}});
  f.args = ['--keep','--workspace',f.workspace];
  const stop = f.stop.bind(f);
  f.stop = async () => {
    if (process.platform === 'win32' && f.child) spawnSync('taskkill', ['/PID',String(f.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    await stop();
  };
  return f;
}

(async () => {
  for (const args of [['--workspace'],['--workspace','--keep'],['--workspace','unused']]) {
    const result = spawnSync(process.execPath,[entry,...args],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,1);
    assert.match(result.stderr,/--workspace requires/);
  }
  // docs-claims-13: the pre-flight checks the catalog the sidecar will call (SKYNET_OPENROUTER_BASE, STARNET_ first, like
  // the sidecar's ENV), so a preview's mock /models answers it and no false 'first runs WILL fail' box is printed.
  // Run in a vm with a stubbed fetch: no network, no sidecar.
  {
    const vm = require('node:vm');
    const { fnBody } = require('./_assert.js');
    const src = fs.readFileSync(entry,'utf8');
    const body = fnBody(src,'function warnBox(') + '\n' + fnBody(src,'async function checkModelInCatalog(');
    assert.ok(body.length > 200 && body.length < src.length/2, 'dev/seed.js has warnBox + checkModelInCatalog');
    const preflight = async (env, ids) => {
      const seen = { urls: [], errors: [] };
      const ctx = { AbortController, setTimeout, clearTimeout, process:{ env },
        console:{ error:(...xs) => seen.errors.push(xs.join(' ')) },
        fetch: async url => { seen.urls.push(String(url)); return { ok:true, json: async () => ({ data: ids.map(id => ({ id })) }) }; } };
      vm.createContext(ctx);
      vm.runInContext(body + '\nthis.check = checkModelInCatalog;', ctx);
      await ctx.check('test/model');
      return seen;
    };
    const mock = await preflight({ SKYNET_OPENROUTER_BASE:'http://127.0.0.1:9/api/v1/' }, ['test/model']);
    assert.deepEqual(mock.urls,['http://127.0.0.1:9/api/v1/models'],'the pre-flight asks the configured base, not openrouter.ai');
    assert.equal(mock.errors.join('\n'),'','a model the configured catalog lists prints no warning');
    const dead = await preflight({ SKYNET_OPENROUTER_BASE:'http://127.0.0.1:9/api/v1' }, ['other/model']);
    assert.match(dead.errors.join('\n'),/not on http:\/\/127\.0\.0\.1:9\/api\/v1\/models/,'the warning names the catalog it checked');
    const pub = await preflight({}, ['test/model']);
    assert.deepEqual(pub.urls,['https://openrouter.ai/api/v1/models'],'no override keeps the public catalog');
    const starnet = await preflight({ STARNET_OPENROUTER_BASE:'http://127.0.0.1:8/v1', SKYNET_OPENROUTER_BASE:'http://127.0.0.1:9/v1' }, ['test/model']);
    assert.deepEqual(starnet.urls,['http://127.0.0.1:8/v1/models'],'STARNET_OPENROUTER_BASE wins, as in the sidecar');
  }
  const a=fixture(), b=fixture();
  try {
    // Concurrent campaigns must neither contend for a lease nor share durable data.
    await Promise.all([a.start(), b.start()]);
    assert.notEqual(a.workspace,b.workspace);
    for (const f of [a,b]) assert.ok(fs.existsSync(path.join(f.workspace,'agent.save.json')));
    const before = await a.json('GET','/api/save?agent=agent');
    const doc = {...before.body.save,updatedAt:Date.now()+1000};
    doc.agent = {...doc.agent,name:'ISOLATED A'};
    assert.equal((await a.json('POST','/api/save',doc)).body.ok,true);
    assert.notEqual((await b.json('GET','/api/save?agent=agent')).body.save.agent.name,'ISOLATED A');
    await a.stop(); await a.start();
    assert.equal((await a.json('GET','/api/save?agent=agent')).body.save.agent.name,'ISOLATED A');
    assert.notEqual((await b.json('GET','/api/save?agent=agent')).body.save.agent.name,'ISOLATED A');
    console.log('dev-seed isolation: invalid arguments, concurrent workspaces, independent saves and retained restart PASS');
  } finally { await Promise.all([a.dispose(),b.dispose()]); }
})().catch(error => { console.error(error); process.exitCode=1; });
