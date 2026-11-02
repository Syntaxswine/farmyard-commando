import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadColdwell} from '../dist/coldwell-loader.js';
import {ColdwellProvider} from '../dist/coldwell-provider.js';
import {registerSpatialProvider,spatialDistance} from '../dist/spatial-provider.js';
import {registerColdwellOperations} from '../dist/coldwell-operation.js';
import {coldwellFogOffset,ColdwellFog} from '../dist/coldwell-fog.js';
import {drawColdwellMinimap} from '../dist/coldwell-minimap.js';
import {recordFlame,flameFogMask} from '../dist/flame-event.js';
import {Core,createSoloGame,hero,encodeSave,decodeSave,tick,objectiveSecured} from '../dist/solo-game.js';
const bundle=await loadColdwell({baseURL:new URL('../dist/coldwell/',import.meta.url),fetcher:async u=>new Response(fs.readFileSync(u))}),provider=new ColdwellProvider(bundle);
registerSpatialProvider(provider.id,provider);registerColdwellOperations(provider);
const fresh=(id='coldwell-traversal',build)=>createSoloGame(build,1947,id),ground={h:46.64,floorId:'coldwell-datum-22'},b5={h:36.04,floorId:'coldwell-datum-17'};
function walk(state,destination){
  const unit=hero(state),route=Core.navigationPath(state,unit,destination.x,destination.y,destination);assert.ok(route?.length,'No route to '+JSON.stringify(destination));
  for(const point of route){const distance=spatialDistance(unit,point);Core.travel(state,unit,point.x-unit.x,point.y-unit.y,{distanceBudget:distance});assert.ok(spatialDistance(unit,point)<.025,'Stopped before '+JSON.stringify(point));}
}

test('Recon binds the complete source, all independent rigs and six supported guards outside initial contact',()=>{
  const state=fresh('coldwell-recon');assert.equal(state.map.length,240);assert.equal(state.map[0].length,240);assert.equal(state.phase,'explore');assert.equal(state.detected.size,0);assert.equal(state.units.length,7);assert.equal(state.interactables.filter(o=>o.kind==='rig').length,14);
  for(const actor of state.units){assert.ok(provider.occupancy(state,actor,actor));assert.equal(actor.alert,false);}
  assert.equal(state.spatial.sourceDigest,bundle.manifest.sourceDigest);assert.deepEqual(decodeSave(encodeSave(state)),state);
});

test('the private quiet loop legally reaches the clue, uses both native stair flights, collects and returns to the source exit',()=>{
  const state=fresh(),unit=hero(state);
  for(const point of [{x:104.5,y:166},{x:104.5,y:150},{x:94.5,y:144.4}])walk(state,{...point,...ground});
  assert.equal(Core.performInteraction(state,'coldwell-gatehouse-clue','inspect').ok,true);
  for(const point of [{x:82,y:130},{x:73.5,y:118.6}])walk(state,{...point,...ground});
  const stair=provider.stairById.get('portal-stair-21');walk(state,stair.route.at(-1));const before=state.solo.distance;walk(state,stair.route[0]);assert.ok(state.solo.distance-before>7);assert.equal(unit.floorId,'coldwell-datum-21');
  assert.equal(Core.performInteraction(state,'coldwell-b1-survey','collect').ok,true);assert.equal(objectiveSecured(state),true);
  walk(state,stair.route.at(-1));for(const point of [{x:73.5,y:118.6},{x:82,y:130},{x:104.5,y:150},{x:104.5,y:166},{x:104.5,y:224.5}])walk(state,{...point,...ground});
  assert.equal(Core.performInteraction(state,'extraction','extract').ok,true);assert.equal(state.solo.status,'extracted');assert.ok(state.solo.distance>220);assert.ok(unit.hp>0);
});

test('native tread picking and partial stair routing retain continuous height after a mid-route save',()=>{
  let state=fresh(),unit=hero(state);const stair=provider.stairById.get('portal-stair-21');Object.assign(unit,stair.route[4]);
  const picked=provider.pick(state,{x:unit.x,y:unit.y,h:unit.h+4},{x:0,y:0,h:-1},{min:44,max:46.64});assert.ok(picked?.stairId);assert.ok(Math.abs(picked.h-unit.h)<.2);
  const route=Core.navigationPath(state,unit,stair.route.at(-1).x,stair.route.at(-1).y,stair.route.at(-1));assert.ok(route?.length>4);state.queue=route;Core.refresh(state,{forceFog:true});
  assert.ok(state.visible.has(Core.cellKey(state,unit)),'The actor knows its own cell while between floor datums.');
  const restored=decodeSave(encodeSave(state));for(let i=0;i<12;i++){tick(state,.05);tick(restored,.05);assert.deepEqual(restored,state);}assert.ok(hero(state).h>unit.h-.001);
  const low=stair.route[3],path=provider.path(state,hero(state),low);assert.ok(path?.some(p=>p.stairId===stair.id));
});

test('records use the shared chest and take-all transaction, require the clue, and persist without duplicate collection',()=>{
  const state=fresh('coldwell-recon'),unit=hero(state);Object.assign(unit,{x:74,y:112.8,...b5});Core.refresh(state,{forceFog:true});state.phase='player';unit.ap=30;
  assert.ok(state.visible.has('coldwell-datum-17@75,112'),'The visible chest must not hide itself by blocking the ground beneath it.');
  assert.equal(Core.performInteraction(state,'coldwell-records-chest','open').ok,true);assert.match(Core.previewInteraction(state,'coldwell-records-chest','take-all').reason,/duty sheet/);assert.equal(objectiveSecured(state),false);
  state.solo.inspected.push('coldwell-gatehouse-clue');const before=unit.ap;assert.equal(Core.performInteraction(state,'coldwell-records-chest','take-all').ok,true);assert.equal(unit.ap,before-1);assert.equal(objectiveSecured(state),true);assert.equal(Core.previewInteraction(state,'coldwell-records-chest','take-all').ok,false);
  const restored=decodeSave(encodeSave(state));assert.equal(objectiveSecured(restored),true);assert.equal(restored.interactables.find(o=>o.id==='coldwell-records-chest').inventory.length,0);
});

test('source-bound saves preserve a mid-door transition without replaying cues, and refuse invalid floors or missing objects',()=>{
  const state=fresh(),unit=hero(state);Object.assign(unit,{x:94.5,y:143.2,...ground});Core.refresh(state,{forceFog:true});
  assert.equal(Core.performInteraction(state,'surface-door:s:94:141','open').ok,true);tick(state,.05);const text=encodeSave(state),restored=decodeSave(text);assert.equal(restored.effect,undefined);assert.equal(restored.fireAnimations,undefined);
  for(let i=0;i<18;i++){tick(state,.05);tick(restored,.05);assert.deepEqual(restored,state);}
  for(const change of [s=>s.units[0].h+=.5,s=>s.spatial.sourceDigest='0'.repeat(64),s=>s.interactables.pop(),s=>s.queue=[{x:72,y:114.1,h:44.52,floorId:'coldwell-datum-99',cost:1}],s=>s.seen={$set:['coldwell-datum-99@1,1']}]){const bad=JSON.parse(text);change(bad);assert.throws(()=>decodeSave(JSON.stringify(bad)));}
});

test('source floors block perception, bullets, blast and flame while a true vertical opening remains transparent',()=>{
  const state=fresh('coldwell-recon'),unit=hero(state),target=state.units[1];state.units=[unit,target];Object.assign(unit,{x:79,y:111,...ground});Object.assign(target,{x:79,y:111,h:44.52,floorId:'coldwell-datum-21'});Core.refresh(state,{forceFog:true});
  assert.equal(Core.canSee(state,unit,target),false);assert.equal(Core.previewAttack(state,unit,target).ok,false);assert.equal(Core.grenadeAffects(state,{x:79,y:111,...ground},target),false);assert.equal(provider.combat.flameAffects(state,unit,target,unit.heading,7),false);
  const hit=provider.combat.impact(state,unit,target,'torso');assert.ok(hit?.box);assert.equal(hit.unit,undefined);
  assert.equal(provider.trace(state,{x:149.5,y:103.5,h:39},{x:149.5,y:103.5,h:35},{purpose:'sight'}),null);
});

test('all primary weapon command paths use spatial queries without changing the flat geometry contract',()=>{
  for(const weapon of ['assault','rifle','smg','shotgun','sniper','hmg','rpg','flamethrower']){
    const state=fresh('coldwell-recon',{animal:'rifleman',primary:weapon,secondary:'pistol',utility:'grenade'}),unit=hero(state),target=state.units[1];state.units=[unit,target];state.interactables=state.interactables.filter(o=>o.kind==='rig');Object.assign(unit,{x:104.5,y:185,...ground});Object.assign(target,{x:104.5,y:181,...ground,hp:10000,stance:'standing'});Core.refresh(state,{forceFog:true});unit.ap=100;unit.heading=270;state.phase='player';
    assert.equal(Core.previewAttack(state,unit,target).ok,true,weapon);assert.equal(Core.attack(state,unit,target,false),true,weapon);
  }
});

test('the fog atlas separates colocated floors and composes the original material, depth and distance hooks',()=>{
  const fog=new ColdwellFog(),state={seen:new Set(['coldwell-datum-17@75,113']),visible:new Set(['coldwell-datum-22@75,113'])};fog.update(state);assert.equal(fog.bytes[coldwellFogOffset(17,75,113)],97);assert.equal(fog.bytes[coldwellFogOffset(22,75,113)],255);assert.equal(fog.bytes[coldwellFogOffset(21,75,113)],0);
  for(const shadow of [false,true]){let original=0;const material={isMeshDepthMaterial:shadow,onBeforeCompile:s=>{original++;s.vertexShader+='// original';},customProgramCacheKey:()=>'original'};fog.material(material);const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>\n#include <dithering_fragment>'};material.onBeforeCompile(shader);assert.equal(original,1);assert.ok(shader.vertexShader.includes('// original'));assert.ok(shader.fragmentShader.includes('farmyardKnown<.01'));assert.equal(shader.fragmentShader.includes('gl_FragColor.rgb*=farmyardKnown'),!shadow);}
  fog.dispose();
});

test('enemy route searches have a bounded budget when contact is across native stair openings',()=>{
  const state=fresh('coldwell-recon'),unit=hero(state),guard=state.units[5];Object.assign(unit,{x:72.45178693557631,y:114.1,h:40.4077051071229,floorId:'coldwell-datum-19',stairId:'portal-stair-19'});Core.refresh(state,{forceFog:true});
  assert.equal(state.phase,'player');const route=provider.approachPath(state,guard,unit,{rate:2});assert.ok(route===null||route.every(p=>Number.isFinite(p.h)));assert.ok(provider.lastSearch.expanded<=129);assert.equal(provider.lastSearch.nodeLimit,128);
});

test('the reused ray-BVH visibility probe agrees with the full source candidate query',()=>{
  const state=fresh(),world=provider.geometry.world;
  try{for(const from of [{x:72,y:114.1,h:45.62},{x:75,y:117,h:37.14},{x:149.5,y:103.5,h:37.14}])for(let i=0;i<16;i++){
    const to={x:from.x+Math.cos(i)*8,y:from.y+Math.sin(i)*8,h:from.h+(i%3-1)*2.12};provider.geometry.world=world;const fast=!!provider.trace(state,from,to,{purpose:'sight'});provider.geometry.world={...world,traceSegment:()=>null};assert.equal(fast,!!provider.trace(state,from,to,{purpose:'sight'}));
  }}finally{provider.geometry.world=world;}
});

test('canonical corner cells remain in bounds and restore at every map edge',()=>{
  const state=fresh(),unit=hero(state);
  for(const [x,y]of [[.24,.24],[239.76,.24],[.24,239.76],[239.76,239.76]]){Object.assign(unit,{x,y,...ground});Core.refresh(state,{forceFog:true});const cell=Core.cellKey(state,unit);assert.ok(state.visible.has(cell));assert.equal(cell,`coldwell-datum-22@${Math.floor(x)},${Math.floor(y)}`);assert.equal(hero(decodeSave(encodeSave(state))).x,x);}
  const obsolete=JSON.parse(encodeSave(state));obsolete.spatial.version=1;assert.throws(()=>decodeSave(JSON.stringify(obsolete)),/Unsupported Coldwell/);
});

test('native minimap paints only the inspected floor and emits finite canonical coordinates',()=>{
  const state=fresh('coldwell-recon');state.seen=new Set(['coldwell-datum-22@75,112','coldwell-datum-17@75,112']);const calls=[];
  const ctx=Object.fromEntries(['fillRect','beginPath','moveTo','lineTo','stroke','arc','fill','save','translate','rotate','closePath','restore','fillText'].map(name=>[name,(...args)=>calls.push({name,args})]));
  drawColdwellMinimap({width:190,height:140,getContext:()=>ctx},state,{floorId:'coldwell-datum-17'});assert.equal(calls.filter(c=>c.name==='fillRect').length,2);assert.ok(calls.some(c=>c.name==='fillText'&&c.args[0]==='B5'));assert.equal(calls.some(c=>c.name==='translate'),false);
  for(const call of calls)for(const value of call.args)if(typeof value==='number')assert.ok(Number.isFinite(value));
});

test('native flame and persistent fire share canonical cell centres without shifting legacy grids',()=>{
  const source={id:0,x:104.75,y:190.75,h:46.64,floorId:ground.floorId,heading:0,stance:'standing'},shape=recordFlame(source,1,[],new Set(['104,190']));assert.equal(shape.sourceVisible,true);assert.equal(flameFogMask(shape,new Set(['coldwell-datum-22@104,190']))[0],255);
  const state=fresh(),unit=hero(state);state.fires=[{x:104.5,y:189.5,z:22,...ground,turns:3}];const restored=decodeSave(encodeSave(state));assert.equal(restored.fires[0].x,104.5);Object.assign(unit,{x:104.75,y:189.75});assert.equal(Core.enterFire(state,unit),true);
});
