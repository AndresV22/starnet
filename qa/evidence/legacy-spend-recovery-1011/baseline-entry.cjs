'use strict';
const cp=require('node:child_process'),Module=require('node:module'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
for(const file of ['sidecar/ledger.js','sidecar/index.js']) {
 const filename=path.join(root,file),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=m;
 m._compile(cp.execFileSync('git',['show','b2cdcb2f2:'+file],{cwd:root,encoding:'utf8',maxBuffer:5e6}),filename);m.loaded=true;
}
