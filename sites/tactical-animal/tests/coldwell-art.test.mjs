import test from 'node:test';
import assert from 'node:assert/strict';
import {COLDWELL_METRICS,toCanonical,toThree,canonicalBounds,intersects,normalizeVisibleRegion,nearbyHeightBand} from '../dist/art/coldwell/contract.js';
test('Coldwell source frames convert once to canonical metres',()=>{
 assert.deepEqual(toCanonical('silo',[111,0,18]),{x:149.5,y:103.5,h:46.64});
 assert.deepEqual(toCanonical('site',[104,0,190]),{x:104.5,y:190.5,h:46.64});
 assert.deepEqual(toCanonical('canonical',{x:73.5,y:118,h:46.64}),{x:73.5,y:118,h:46.64});
 assert.equal(toCanonical('silo',[0,-46.64,0]).h,0);assert.deepEqual(toThree({x:73.5,y:118,h:46.64}),[73.5,46.64,118]);
 assert.equal(COLDWELL_METRICS.supportRoof,48.76);assert.throws(()=>toCanonical('unknown',[0,0,0]));
});
test('Coldwell residency uses whole bounds and canonical height bands',()=>{
 const b=canonicalBounds('silo',{min:[100,-10.6,10],max:[120,-8.48,30]}),v=normalizeVisibleRegion({rect:{x:140,y:100,w:24,h:24},heightBands:[{min:35,max:38}],cutaway:{roofs:false}});
 assert.equal(intersects(b,v.rect,v.heightBands),true);assert.equal(intersects(b,v.rect,[{min:1,max:2}]),false);assert.equal(v.cutaway.roofs,false);assert.equal(v.cutaway.canopies,true);
 assert.throws(()=>normalizeVisibleRegion({rect:v.rect,heightBands:[]}));assert.throws(()=>normalizeVisibleRegion({...v,cutaway:{plane:{normal:[0,0,0],constant:0}}}));
 assert.equal(nearbyHeightBand(36.04).length,1);assert.deepEqual(nearbyHeightBand(0,{below:0,above:0}),[{min:-.12,max:2.12}]);
});

test('Coldwell frame keys and world planes validate at the boundary',()=>{
 for(const key of ['__proto__','constructor','toString'])assert.throws(()=>toCanonical(key,[0,0,0]));
 const region=normalizeVisibleRegion({rect:{x:0,y:0,w:24,h:24},heightBands:[{min:0,max:2.12}],cutaway:{plane:{normal:[0,0,-2],constant:207}}});
 assert.deepEqual(region.cutaway.plane,{normal:[0,0,-1],constant:103.5});
});
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {createColdwellArt} from '../dist/art/coldwell/index.js';
const artBase=new URL('../dist/art/coldwell/',import.meta.url),artPath=fileURLToPath(artBase);
const json=name=>JSON.parse(fs.readFileSync(new URL(name,artBase),'utf8'));
const unpack=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL(name,artBase))));
const manifest=json('manifest.json'),siloSource=unpack('source/coldwell-complex.game-mesh.json.gz');
const localFetch=async url=>new Response(fs.readFileSync(fileURLToPath(url)));
const dummyTexture=async()=>new T.Texture({width:32,height:32});
const makeArt=(options={})=>createColdwellArt({THREE:T,assetBaseURL:artBase,fetch:localFetch,loadTexture:dummyTexture,...options});
const surfaceRegion={rect:{x:72,y:168,w:72,h:72},heightBands:[{min:46.4,max:56}]};
const b5Region={rect:{x:120,y:72,w:72,h:72},heightBands:[{min:33.8,max:38.2}],cutaway:{display:false,plane:{normal:[0,0,-2],constant:207}}};
const coverRegion={rect:{x:120,y:72,w:72,h:72},heightBands:[{min:44.4,max:50}],cutaway:{display:false}};
const emptyRegion={rect:{x:0,y:0,w:24,h:24},heightBands:[{min:-100,max:-90}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function assertReleased(art){const d=art.diagnostics();assert.equal(d.residentEntries,0);assert.equal(d.geometries,0);assert.equal(d.textures,0);assert.equal(d.counters.createdModels,d.counters.disposedModels);assert.equal(d.counters.createdGeometries,d.counters.disposedGeometries);assert.equal(d.counters.createdTextures,d.counters.disposedTextures);}
test('Coldwell complete manifest and every runtime asset match their recorded integrity',()=>{
 assert.equal(manifest.metrics.trees,78);assert.equal(manifest.metrics.props,83);assert.equal(manifest.metrics.edges,488);assert.equal(manifest.metrics.roofCells,168);assert.equal(Object.values(manifest.metrics.terrain).reduce((a,b)=>a+b),57600);
 assert.equal(manifest.floors.length,23);assert.deepEqual(manifest.floors.map(f=>f.h),Array.from({length:23},(_,i)=>Number((i*2.12).toFixed(2))));
 for(const file of json('source/provenance.json').files.filter(f=>f.path.startsWith('source/')||f.path.startsWith('upstream/'))){const b=fs.readFileSync(new URL(file.path,artBase));assert.equal(b.length,file.bytes,file.path);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),file.sha256,file.path);}
 assert.equal(manifest.rigs.length,14);assert.deepEqual(manifest.rigs.filter(r=>r.frame==='silo').map(r=>r.id),siloSource.rigs.map(r=>r.id));
 for(const r of siloSource.rigs){const e=manifest.entries.find(e=>e.rigId===r.id),d=unpack(e.url);assert.deepEqual(d.rigs,[r]);}
 for(const a of [manifest.prototypes,manifest.groundWeights,manifest.semantics,...Object.values(manifest.textures),...manifest.entries]){const b=fs.readFileSync(new URL(a.url,artBase));assert.equal(b.length,a.bytes,a.url);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),a.sha256,a.url);}
 assert.equal(fs.readdirSync(path.join(artPath,'chunks')).length,manifest.entries.length,'No stale chunk derivatives');
 const semantic=unpack(manifest.semantics.url);assert.deepEqual(semantic.silo.stairs,siloSource.semantics.stairs);assert.deepEqual(semantic.silo.openings,siloSource.semantics.openings);assert.equal(semantic.silo.floors.length,38);assert.equal(semantic.silo.landings.length,34);
 const props=new Set(manifest.entries.flatMap(e=>e.sourceIds||[]).filter(id=>id.startsWith('prop:')));assert.equal(props.size,83);
 const roofIds=new Set(manifest.entries.filter(e=>e.category==='roof').flatMap(e=>e.sourceIds));assert.equal(roofIds.size,168);
 const floors=new Set(manifest.entries.filter(e=>e.category==='ground').flatMap(e=>e.sourceIds));assert.equal(floors.size,57600-319);
});
function area(p){let total=0;for(let i=0;i<p.length;i+=9){const a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];total+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;}return total;}
test('Coldwell block clipping preserves source area, metres, curves and interpolated attributes',()=>{
 const infill=unpack('source/surface-infill.mesh.json.gz');let sourceArea=0,renderArea=0,triangles=0;
 for(const data of [siloSource,infill])for(const b of data.batches)sourceArea+=area(b.positions);
 for(const e of manifest.entries.filter(e=>e.kind==='silo'&&!e.rigId)){
  const d=unpack(e.url),offset=e.frame==='silo'?[38.5,46.64,85.5]:[.5,46.64,.5];
  for(const b of d.batches){renderArea+=area(b.positions);triangles+=b.positions.length/9;assert.equal(b.positions.length,b.normals.length);assert.equal(b.uvs.length,b.positions.length/3*2);
   for(let i=0;i<b.positions.length;i+=3){const x=b.positions[i]+offset[0],y=b.positions[i+2]+offset[2];assert.ok(x>=e.block[0]*24-1e-7&&x<=(e.block[0]+1)*24+1e-7,e.id);assert.ok(y>=e.block[1]*24-1e-7&&y<=(e.block[1]+1)*24+1e-7,e.id);}
  }
 }
 assert.ok(Math.abs(sourceArea-renderArea)<1e-5);assert.equal(triangles,manifest.metrics.partition.derivedTriangles);assert.equal(siloSource.metrics.curveSegments,96);assert.equal(siloSource.sourceProfile.floorSpacing,2.12);
 const b=infill.batches[0],g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(b.positions,3)),m=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));m.updateMatrixWorld(true);
 const ray=new T.Raycaster(new T.Vector3(149,2,103),new T.Vector3(0,-1,0),0,3);assert.equal(ray.intersectObject(m).length,0,'The round shaft stays open');ray.ray.origin.set(140.6,2,94.6);assert.ok(ray.intersectObject(m).length>0,'Clipped square corners remain supported');g.dispose();m.material.dispose();
});
test('Coldwell wrapper retains the original renderer and motion implementation',()=>{
 const original=fs.readFileSync(path.join(artPath,'upstream/silo-three.original.js'),'utf8').replace(/\r\n/g,'\n');
 const expected=original.replace("import {buildSiloMesh,SILO_MATERIALS} from './mesh.js';\nimport {levelY,SILO_PLAN} from './designs.js';","import {buildSiloMesh,SILO_MATERIALS,levelY,SILO_PLAN} from './silo-bindings.js';");
 const actual=fs.readFileSync(path.join(artPath,'upstream/silo-renderer.js'),'utf8');assert.equal(actual.slice(actual.indexOf('\n')+1),expected);
 // The public runtime closure uses host Three and resolves all relative browser imports.
 const seen=new Set();function visit(file){if(seen.has(file))return;seen.add(file);const code=fs.readFileSync(file,'utf8');assert.ok(!/from ['"].*vendor\/three/.test(code));for(const m of code.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)){const dep=path.resolve(path.dirname(file),m[1]);assert.ok(fs.existsSync(dep),dep);if(dep.endsWith('.js'))visit(dep);}}visit(path.join(artPath,'index.js'));
});
test('Coldwell actual Three geometry stays bounded, reuses residency and releases all resources',async()=>{
 const art=await makeArt();try{
  await art.setVisibleRegion(surfaceRegion);const first=art.diagnostics();assert.ok(first.residentEntries<40);assert.ok(first.triangles<100000);assert.ok(first.geometries<20);
  await art.setVisibleRegion(surfaceRegion);assert.equal(art.diagnostics().counters.createdModels,first.counters.createdModels,'Same region reuses its resident models');
  await art.setVisibleRegion(b5Region);const underground=art.diagnostics();assert.ok(underground.residentEntries<64);assert.ok(underground.triangles<40000);assert.equal(underground.region.cutaway.plane.constant,103.5);
  const bounds=new T.Box3().setFromObject(art.root,true);assert.ok(bounds.min.y>=31&&bounds.max.y<=41,'Nearby floors allocate a bounded band');
  art.root.traverse(m=>{if(!m.isMesh)return;assert.ok(m.userData.componentId);for(const material of [m.material,m.customDepthMaterial,m.customDistanceMaterial]){const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,{});assert.ok(shader.vertexShader.includes('vColdwellHeight'));assert.ok(shader.fragmentShader.includes('coldwellKeep'));assert.equal(material.clippingPlanes[0].constant,103.5);}});
  await art.setVisibleRegion(emptyRegion);assertReleased(art);
 }finally{await art.dispose();}assertReleased(art);await art.dispose();assert.throws(()=>art.setVisibleRegion(surfaceRegion),/disposed/);
});
test('Coldwell original rigs restore latest hidden poses without effects or a new animator',async()=>{
 const art=await makeArt();try{
  art.syncDynamicState({'silo-cover':.5,'service-bridge-17':.5,'blast-door-west':45});
  assert.throws(()=>art.syncDynamicState({'silo-cover':1,unknown:1}));assert.equal(art.diagnostics().poses['silo-cover'],.5);
  await art.setVisibleRegion(coverRegion);let cover=art.root.getObjectByName('silo-cover');assert.ok(cover);assert.equal(cover.position.x,6);
  const mid=new T.Box3().setFromObject(cover,true);art.syncDynamicState({'silo-cover':1});const open=new T.Box3().setFromObject(cover,true);assert.ok(Math.abs(open.min.x-mid.min.x-6)<1e-6);
  await art.setVisibleRegion(emptyRegion);art.syncDynamicState({'silo-cover':.25,'service-bridge-17':1,'blast-door-west':90});await art.setVisibleRegion(coverRegion);cover=art.root.getObjectByName('silo-cover');assert.equal(cover.position.x,3);
  await art.setVisibleRegion(b5Region);const bridge=art.root.getObjectByName('service-bridge-17');assert.ok(bridge);assert.equal(bridge.position.x,112.5);await art.setVisibleRegion({...b5Region,rect:{x:48,y:72,w:72,h:72}});const door=art.root.getObjectByName('blast-door-west');assert.ok(door);assert.ok(Math.abs(door.quaternion.y-Math.sin(Math.PI/2))<1e-8);
 }finally{await art.dispose();}assertReleased(art);
});
test('Coldwell overlapping async regions are latest-request-wins even when fetch ignores abort',async()=>{
 const blocked=deferred(),entered=deferred();let shouldBlock=true;
 const art=await makeArt({fetch:async(url,options)=>{if(shouldBlock&&url.includes('/chunks/surface-ground-3-7.')){shouldBlock=false;entered.resolve();await blocked.promise;}return localFetch(url,options);}});
 try{
  const old=art.setVisibleRegion(surfaceRegion);await entered.promise;const recent=art.setVisibleRegion(b5Region);const result=await recent;assert.equal(result.applied,true);blocked.resolve();assert.equal((await old).applied,false);assert.deepEqual(art.diagnostics().region.rect,b5Region.rect);
 }finally{blocked.resolve();await art.dispose();}assertReleased(art);
});
test('Coldwell disposal cancels pending loads and disposes late textures without resurrection',async()=>{
 const entered=deferred(),blocked=deferred();let loaded;
 const art=await makeArt({loadTexture:async()=>{entered.resolve();await blocked.promise;loaded=new T.Texture({width:8,height:8});return loaded;}});
 const pending=art.setVisibleRegion(b5Region);await entered.promise;const disposing=art.dispose();blocked.resolve();assert.equal((await pending).applied,false);await disposing;assert.ok(loaded);assert.equal(art.root.children.length,0);assertReleased(art);
});
test('Coldwell failed asset verification preserves the prior complete region',async()=>{
 let corrupt=false;const art=await makeArt({fetch:async(url,options)=>{if(corrupt&&url.includes('/chunks/silo-shaft-17-')){const b=fs.readFileSync(fileURLToPath(url));b[20]^=1;return new Response(b);}return localFetch(url,options);}});
 try{await art.setVisibleRegion(surfaceRegion);const before=art.diagnostics().residentIds;corrupt=true;await assert.rejects(art.setVisibleRegion(b5Region),/integrity mismatch/);assert.deepEqual(art.diagnostics().residentIds,before);}finally{await art.dispose();}assertReleased(art);
});
