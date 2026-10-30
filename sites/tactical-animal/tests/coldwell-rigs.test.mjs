import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadColdwell} from '../dist/coldwell-loader.js';
import {ColdwellProvider} from '../dist/coldwell-provider.js';
import {registerSpatialProvider,attachSpatial} from '../dist/spatial-provider.js';
import {createSoloGame,hero,Core,encodeSave,tick} from '../dist/solo-game.js';
const bundle=await loadColdwell({baseURL:new URL('../dist/coldwell/',import.meta.url),fetcher:async u=>new Response(fs.readFileSync(u))}),provider=new ColdwellProvider(bundle);
registerSpatialProvider(provider.id,provider);
const actor=(id,x,y,h=36.04,floorId='coldwell-datum-17')=>({id,x,y,h,floorId,hp:100,stance:'standing'});
const state=(units=[])=>({spatial:provider.createState(),units,revision:0,interactables:[]});
const advance=(s,count=30)=>{for(let i=0;i<count;i++)provider.tick(s,.05);};

test('all 14 original independent rigs accept valid source poses without consuming randomness',()=>{
  for(const rig of bundle.data.rigs){const s=state();s.seed=841902;const check=provider.startRig(s,rig.id,rig.maximum);assert.equal(check.ok,true,rig.id);assert.equal(s.spatial.poses[rig.id],0);advance(s);assert.equal(s.spatial.poses[rig.id],rig.maximum);assert.deepEqual(s.spatial.transitions,{});assert.equal(s.seed,841902);assert.equal(Object.values(s.spatial.poses).filter(p=>p>0).length,1);}
});
test('a door rejects a body anywhere in its continuous sweep without changing state',()=>{
  const s=state([actor(0,72.2,103.5)]),before=JSON.stringify(s);assert.equal(provider.previewRig(s,'blast-door-west',90).ok,false);assert.equal(provider.startRig(s,'blast-door-west',90).ok,false);assert.equal(JSON.stringify(s),before);
  s.units=[actor(0,71.6,103.5)];assert.equal(provider.startRig(s,'blast-door-west',90).ok,true);advance(s);s.units.push(actor(1,73,103.5));assert.equal(provider.previewRig(s,'blast-door-west',0).ok,false);
});
test('an occupied service bridge cannot retract, including under a fallen body',()=>{
  for(const hp of [100,0]){const s=state([{...actor(1,152.4,103.5),hp}]);assert.equal(provider.supportAt(s,s.units[0])?.surfaceId,'service-bridge-17');const before=JSON.stringify(s);assert.match(provider.previewRig(s,'service-bridge-17',1).reason,/occupied/);assert.equal(JSON.stringify(s),before);}
});
test('the cover checks its full 12 metre travel against offscreen actors',()=>{
  const s=state([actor(1,159,103.5,46.64,'coldwell-datum-22')]);assert.equal(provider.occupancy(s,s.units[0],s.units[0]),true);assert.equal(provider.previewRig(s,'silo-cover',1).ok,false);
  s.units[0].h=36.04;s.units[0].floorId='coldwell-datum-17';assert.equal(provider.previewRig(s,'silo-cover',1).ok,true);
});
test('mid-transition JSON restore resumes identical poses and revisions without replay receipts',()=>{
  const s=state();assert.equal(provider.startRig(s,'silo-cover',1).ok,true);advance(s,7);const saved=JSON.stringify(s),restored=JSON.parse(saved);provider.validateState(restored.spatial);assert.ok(restored.spatial.poses['silo-cover']>0&&restored.spatial.poses['silo-cover']<1);
  for(let i=0;i<30;i++){provider.tick(s,.05);provider.tick(restored,.05);assert.deepEqual(restored,s);}
  for(const mutate of [x=>x.sourceDigest='0'.repeat(64),x=>x.poses['silo-cover']=.9,x=>x.transitions['silo-cover'].duration=99,x=>x.transitions['silo-cover'].elapsed=-1,x=>x.poses['unknown']=0]){const bad=JSON.parse(saved).spatial;mutate(bad);assert.throws(()=>provider.validateState(bad));}
});
test('existing hand actions charge once, lock movement during the accepted motion, and expose the actual opening',()=>{
  const s=createSoloGame(),u=hero(s);s.units=[u];Object.assign(u,actor(0,71.6,103.5));s.phase='player';u.ap=10;s.map=bundle.terrain;s.edges=bundle.data.surface.edges;s.interactables=[{id:'blast-door-west',rigId:'blast-door-west',kind:'rig',name:'Blast door',x:73,y:103.5,h:36.04,floorId:'coldwell-datum-17',range:1.65,open:false,inventory:[]}];attachSpatial(s,provider.id);
  assert.equal(Core.previewInteraction(s,'blast-door-west','open').ok,true);const seed=s.seed;assert.equal(Core.performInteraction(s,'blast-door-west','open').ok,true);assert.equal(u.ap,9);assert.equal(Core.canControl(s,u),false);assert.equal(Core.endTurn(s),false);assert.equal(Core.travel(s,u,.1,0),0);const encoded=encodeSave(s);assert.ok(encoded.includes('transitions'));assert.equal(s.seed,seed);
  for(let i=0;i<20;i++)tick(s,.05);assert.equal(s.spatial.poses['blast-door-west'],90);assert.equal(Core.canControl(s,u),true);assert.equal(provider.trace(s,{x:72,y:103.5,h:37.14},{x:74,y:103.5,h:37.14}),null);
});

test('all original machinery controls are reachable from safe source-supported positions in both poses',async()=>{
  const {coldwellRigObjects}=await import('../dist/coldwell-operation.js');
  for(const object of coldwellRigObjects(provider)){
    const s=state(),rig=provider.geometry.rigs.get(object.rigId);let operator;
    for(let i=0;i<32;i++){const angle=i/32*Math.PI*2,u={...actor(0,object.x+Math.cos(angle)*1.4,object.y+Math.sin(angle)*1.4,object.h,object.floorId)};s.units=[u];if(provider.occupancy(s,u,u)&&provider.canReach(s,u,object)&&provider.previewRig(s,rig.id,rig.maximum).ok){operator=u;break;}}
    assert.ok(operator,'Unreachable safe control: '+rig.id);assert.equal(provider.startRig(s,rig.id,rig.maximum).ok,true);advance(s);assert.ok(provider.canReach(s,operator,object),rig.id);assert.equal(provider.startRig(s,rig.id,0).ok,true);advance(s);assert.equal(s.spatial.poses[rig.id],0);
  }
});
