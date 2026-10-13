'use strict';
// Reproduce the two PixelLab skins from the saved character receipts.
// Downloads stay under .dogfood; only packed masters enter the shipped manifest.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..'), out=path.join(root,'output/austin-evil-skins');
const DIRS=['south','south-east','east','north-east','north','north-west','west','south-west'];
const CARDINAL=['south','east','north','west'];
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const save=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
async function download(url,file){
 if(fs.existsSync(file))return file;
 const r=await fetch(url);if(!r.ok)throw Error('Download failed '+r.status+' '+url);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));return file;
}
async function bounds(file){
 const{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,t=info.height,r=-1,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>100){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
 if(r<l)throw Error('Empty art '+file);
 return{l,t,r,b,w:r-l+1,h:b-t+1,cw:info.width,ch:info.height};
}
function animations(detail,name){
 const block=detail.split(/\n  (?=[\w-]+ — \d+ dir)/).find(s=>s.startsWith(name+' —'));
 const rows={};for(const m of (block||'').matchAll(/^    ([a-z-]+): (https:[^\n]+)$/gm)){
  const urls=m[2].match(/https:\/\/[^,\s]+/g),range=m[2].match(/\(i=(\d+)\.\.(\d+)\)/);
  rows[m[1]]=range?Array.from({length:Number(range[2])-Number(range[1])+1},(_,i)=>urls[0].replace('{i}',String(i+Number(range[1])))):urls;
 }
 return rows;
}
async function pack(file,dest,rot){
 const m=await sharp(file).metadata(),s=76/rot.h;
 const w=Math.round(m.width*s),h=Math.round(m.height*s);
 let buf=await sharp(file).ensureAlpha().resize(w,h).png().toBuffer();
 // Use the SAME source origin and scale throughout a direction's animation.
 let left=24+Math.floor((96-Math.round(rot.w*s))/2)-Math.round((rot.l+(m.width-rot.cw)/2)*s);
 let top=36-Math.round((rot.t+(m.height-rot.ch)/2)*s);
 const ex=Math.max(0,-left),ey=Math.max(0,-top);left=Math.max(0,left);top=Math.max(0,top);
 const ew=Math.min(w-ex,144-left),eh=Math.min(h-ey,144-top);
 if(ew<=0||eh<=0)throw Error('Art outside master '+file);
 if(ex||ey||ew!==w||eh!==h){
  const b=await bounds(buf);
  if(b.l<ex||b.t<ey||b.r>=ex+ew||b.b>=ey+eh)throw Error('Would clip visible art '+file);
  buf=await sharp(buf).extract({left:ex,top:ey,width:ew,height:eh}).png().toBuffer();
 }
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 await sharp({create:{width:144,height:144,channels:4,background:'#00000000'}}).composite([{input:buf,left,top}]).png().toFile(dest);
}
(async()=>{
 const records=read('output/austin-evil-skins/characters.json'),sprites={},report=[];
 const motion=fs.existsSync(path.join(out,'motion.json'))?read('output/austin-evil-skins/motion.json'):{};
 for(const row of records){
  const set='approved_'+row.id,dir=path.join(root,'frontend/assets/sprites',set);
  const cache=path.join(root,'.dogfood/austin-evil/raw',row.id);
  const rotationText=row.detail.split('rotations:\n')[1]?.split('\n\n')[0]||'';
  const rotations=Object.fromEntries([...rotationText.matchAll(/^  ([a-z-]+): (https:\/\/\S+)/gm)].map(m=>[m[1],m[2]]));
  const replacement=motion[row.id]||{};
  const walks={...animations(row.detail,'starnet-walk'),...animations(row.detail,'starnet-walk-front')},sits={...animations(row.detail,'starnet-sit'),...replacement.sit},typing={...animations(row.detail,'starnet-type'),...replacement.type};
  const stats={id:row.id,rotations:0,walkDirections:0,seatedDirections:0,typingFrames:0};
  for(const d of DIRS){
   if(!rotations[d])throw Error('Missing rotation '+row.id+' '+d);
   const raw=await download(rotations[d],path.join(cache,'rot_'+d+'.png')),anchor=await bounds(raw);
   const rotName='rot_'+d+'.png';await pack(raw,path.join(dir,rotName),anchor);sprites[set+'.rot.'+d]=[set+'/'+rotName];stats.rotations++;
   if(walks[d]){
    if(walks[d].length!==6)throw Error('Expected six walk frames '+row.id+' '+d);
    const files=[];
    for(let i=0;i<walks[d].length;i++){
     const name='walk_'+d+'_'+i+'.png',frame=await download(walks[d][i],path.join(cache,(animations(row.detail,'starnet-walk-front')[d]?'front_':'')+name));
     await pack(frame,path.join(dir,name),anchor);files.push(set+'/'+name);
    }
    sprites[set+'.walk.'+d]=files;stats.walkDirections++;
   }
   if(CARDINAL.includes(d)&&sits[d]){
    const name='sit_'+d+'.png',frame=await download(sits[d].at(-1),path.join(cache,(replacement.sit?.[d]?'fixed_':'')+name));
    await pack(frame,path.join(dir,name),anchor);sprites[set+'.sit.'+d]=[set+'/'+name];stats.seatedDirections++;
   }
   if(d==='north'&&typing[d]){
    const urls=typing[d].slice(-4),files=[];
    for(let i=0;i<urls.length;i++){
     const name='type_north_'+i+'.png',frame=await download(urls[i],path.join(cache,(replacement.type?.[d]?'fixed_':'')+name));
     await pack(frame,path.join(dir,name),anchor);files.push(set+'/'+name);
    }
    sprites[set+'.type.north']=files;stats.typingFrames=files.length;
   }
  }
  report.push(stats);
  const repairs=fs.existsSync(path.join(out,'master-repairs.json'))?read('output/austin-evil-skins/master-repairs.json'):[];
  for(const repair of repairs.filter(r=>r.skin===row.id)){
   const fixed=await download(repair.url,path.join(cache,'repaired_'+repair.file));
   fs.copyFileSync(fixed,path.join(dir,repair.file));
  }
  const contact=[];
  for(let rowIndex=0;rowIndex<8;rowIndex++)for(let c=0;c<DIRS.length;c++){
   const d=DIRS[c],name=rowIndex===0?'rot_'+d+'.png':rowIndex===7?'sit_'+d+'.png':'walk_'+d+'_'+(rowIndex-1)+'.png';
   const file=path.join(dir,name);if(fs.existsSync(file))contact.push({input:file,left:c*144,top:rowIndex*144});
  }
  await sharp({create:{width:1152,height:1152,channels:4,background:'#18232a'}}).composite(contact).png().toFile(path.join(root,'.dogfood/austin-evil',row.id+'-contact.png'));
 }
 save('output/austin-evil-skins/packing-report.json',report);
 console.log(JSON.stringify(report));
 if(!process.argv.includes('--install'))return;
 if(report.some(s=>s.rotations!==8||s.walkDirections!==8||s.seatedDirections!==4||s.typingFrames!==4))throw Error('Cannot install incomplete sprite sets');
 for(const p of ['frontend/assets/sprites/manifest.json','frontend/agent-demo/manifest.json']){
  const m=read(p);Object.assign(m.sprites,sprites);save(p,m);
 }
 for(const p of ['frontend/assets/skin-study-0914/runtime-motion.json','frontend/agent-demo/catalog.json']){
  const m=read(p);
  for(const row of records){
   const skin={id:row.id,skin:row.id,name:row.name,stage:'complete',targetStandingHeight:19,walkFramesReady:true,walkReady:true,complete:true,retainedOriginal:false,sourceStandingHeight:76,readyForStation:true,renderSet:'approved_'+row.id};
   const index=m.skins.findIndex(s=>s.id===row.id);if(index<0)m.skins.push(skin);else m.skins[index]=skin;
  }
  if(m.sprites)Object.assign(m.sprites,sprites);save(p,m);
 }
 const dataPath=path.join(root,'frontend/app/data-shim.js');let source=fs.readFileSync(dataPath,'utf8');
 for(const row of records)if(!source.includes('\n  '+row.id+':')){
  const value={name:row.name,set:'approved_'+row.id,scale:.25,sourceStandingHeight:76};
  source=source.replace(/\r?\n};\r?\n\/\/ Keep the retired/, '\n  '+row.id+': '+JSON.stringify(value)+',\n};\n// Keep the retired');
 }
 fs.writeFileSync(dataPath,source);
})();
