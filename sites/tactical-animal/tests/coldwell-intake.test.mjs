import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadColdwell,validateColdwellData,decodeColdwellTerrain,requireColdwellCapabilities} from '../dist/coldwell-loader.js';
import {siloToWorld,siteToWorld,legacyCellToWorld,rigPoint,pointInPolygon,supportedDisc,capsuleTriangleHit} from '../dist/coldwell-space.js';
import {coldwellVisibleRegion,coldwellBoundsIntersect} from '../dist/coldwell-residency.js';
import {attachSpatial,registerSpatialProvider,providerFor} from '../dist/spatial-provider.js';
import {Triangle,Vector3} from '../dist/aft/tactics/vendor/three.module.js';
const base=new URL('../dist/coldwell/',import.meta.url);
const fetcher=async url=>{try{return new Response(fs.readFileSync(url));}catch{return new Response('',{status:404});}};
const bundle=await loadColdwell({baseURL:base,fetcher});

test('Coldwell conversion and optional upstream closure reproduce exact checked-in bytes',()=>{
  for(const script of ['prepare-coldwell.mjs','snapshot-coldwell-upstream.mjs'])execFileSync(process.execPath,['sites/tactical-animal/tools/'+script,'--check'],{stdio:'pipe'});
});
test('the atomic package retains the complete source inventory and native geometry',()=>{
  assert.equal(bundle.data.surface.props.length,83);assert.equal(Object.keys(bundle.data.surface.edges).length,488);
  const cells=bundle.terrain.flat();assert.equal(cells.filter(x=>x==='void').length,319);assert.equal(cells.filter(x=>x==='ground-dirt').length,1315);
  assert.equal(bundle.data.rigs.length,14);assert.equal(bundle.manifest.inventory.siloRigs,11);assert.equal(bundle.data.semantics.stairs.length,31);assert.equal(bundle.data.plan.floors.length,23);
  assert.equal(Object.keys(bundle.data.surface.upper[0]).length,168);assert.equal(bundle.manifest.inventory.roofHeight,48.76);
  assert.equal(bundle.positions.length/9,167836);assert.ok(Object.isFrozen(bundle.data));assert.ok(Object.isFrozen(bundle.data.surface.props));
});
test('missing, modified or truncated collision/companion data refuses the entire load',async()=>{
  await assert.rejects(loadColdwell({baseURL:base,fetcher:async url=>url.pathname.endsWith('collision.bin.gz')?new Response('',{status:404}):fetcher(url)}),/refused/);
  await assert.rejects(loadColdwell({baseURL:base,fetcher:async url=>url.pathname.endsWith('data.json')?new Response('{}'):fetcher(url)}),/integrity/);
  for(const mutate of [d=>delete d.companion,d=>d.companion.required=false,d=>d.companion.coordinates.placement.h=0,d=>d.plan.floors.pop(),d=>d.rigs.pop(),d=>d.batches[0].count-=9]){
    const data=structuredClone(bundle.data);mutate(data);assert.throws(()=>validateColdwellData(bundle.manifest,data),/refused/);
  }
  assert.throws(()=>requireColdwellCapabilities({capabilities:[]}),/missing provider/);
});
test('terrain RLE refuses overflow, unknown terrain and incomplete coverage',()=>{
  for(const runs of [[['ground-grass',57601]],[['dirt',57600]],[['ground-grass',57599]],[['ground-grass',0]]])assert.throws(()=>decodeColdwellTerrain({terrainRLE:runs}),/refused/);
});
test('every coordinate frame applies its shared origin exactly once',()=>{
  assert.deepEqual(siloToWorld([111,0,18]),{x:149.5,y:103.5,h:46.64});
  assert.deepEqual(legacyCellToWorld({x:104,y:190}),{x:104.5,y:190.5,h:46.64});
  assert.equal(siloToWorld([111,-46.64,18]).h,0);
  assert.deepEqual(siteToWorld([140.5,0,94.5]),{x:141,y:95,h:46.64});
  assert.deepEqual(bundle.data.companion.access.surfaceDoor,{x:73.5,y:118,h:46.64});
});
test('independent native rig poses preserve source degrees and normalized travel',()=>{
  const door=bundle.data.rigs.find(r=>r.id==='blast-door-west'),bridge=bundle.data.rigs.find(r=>r.id==='service-bridge-17'),cover=bundle.data.rigs.find(r=>r.id==='silo-cover');
  const closed=rigPoint(door,[1,0,0],0),open=rigPoint(door,[1,0,0],90);assert.ok(Math.abs(open.y-closed.y-1)<1e-7);assert.ok(Math.abs(closed.x-open.x-1)<1e-7);
  assert.equal(rigPoint(bridge,[0,0,0],1).x-rigPoint(bridge,[0,0,0],0).x,1.5);
  assert.equal(rigPoint(cover,[0,0,0],1).x-rigPoint(cover,[0,0,0],0).x,12);
  assert.throws(()=>rigPoint(door,[0,0,0],91));
});
test('residency keeps nine blocks, measured floor bands and full-overlap bounds',()=>{
  const region=coldwellVisibleRegion({x:149.5,y:103.5,h:36.04});
  assert.equal(region.blocks.length,9);assert.equal(region.rect.w,72);assert.equal(region.rect.h,72);
  assert.ok(Math.abs(region.heightBands[0].min-33.8)<1e-7);assert.ok(region.heightBands[0].max<40.3);
  assert.equal(coldwellBoundsIntersect({min:[0,35,103],max:[150,37,104]},region),true);
  assert.equal(coldwellBoundsIntersect({min:[149,0,103],max:[150,2,104]},region),false);
  const edge=coldwellVisibleRegion({x:239,y:239,h:46.64});assert.equal(edge.rect.x+edge.rect.w,240);assert.equal(edge.blocks.length,9);
});
test('circular support respects polygon holes, small interior holes and adjacent seams',()=>{
  const square={outline:[[0,0],[2,0],[2,2],[0,2]],holes:[[[.9,.9],[1.1,.9],[1.1,1.1],[.9,1.1]]]};
  assert.equal(pointInPolygon({x:.5,y:.5},square.outline),true);
  assert.equal(supportedDisc({x:.4,y:.4},.23,[square]),true);assert.equal(supportedDisc({x:.8,y:1},.23,[square]),false);
  assert.equal(supportedDisc({x:1,y:1},.23,[{...square,holes:[[[1.05,1.05],[1.06,1.05],[1.06,1.06],[1.05,1.06]]]}]),false);
  assert.equal(supportedDisc({x:1,y:1},.23,[{outline:[[0,0],[1,0],[1,2],[0,2]]},{outline:[[1,0],[2,0],[2,2],[1,2]]}]),true);
});
test('Three narrow phase catches a thin wall swept between capsule endpoints',()=>{
  const wall=new Triangle(new Vector3(1,0,-2),new Vector3(1,2,-2),new Vector3(1,2,2));
  assert.equal(capsuleTriangleHit({x:0,y:0,h:0},{x:2,y:0,h:0},1.75,.23,wall),true);
  assert.equal(capsuleTriangleHit({x:0,y:0,h:3},{x:2,y:0,h:3},1.75,.23,wall),false);
});
test('an optional provider never enters saves as a mesh and absent providers refuse restoration',()=>{
  const provider={schema:1,createState:()=>({provider:'test-coldwell',version:1}),validateState:s=>assert.equal(s.provider,'test-coldwell')};
  for(const name of ['supportAt','occupancy','sweep','trace','path','pick'])provider[name]=()=>null;
  registerSpatialProvider('test-coldwell',provider);const state={};attachSpatial(state,'test-coldwell');assert.equal(providerFor(state),provider);
  assert.equal(JSON.stringify(state),'{"spatial":{"provider":"test-coldwell","version":1}}');
  assert.throws(()=>providerFor({spatial:{provider:'missing'}}),/not loaded/);assert.equal(providerFor({}),null);
});
