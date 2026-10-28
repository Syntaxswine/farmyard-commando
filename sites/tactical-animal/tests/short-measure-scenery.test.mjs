import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {createSoloGame,DEFAULT_BUILD,Core,hero,geometry,freePoint,walkSegment,lineClear,navigationPath,previewGrenade,encodeSave,decodeSave,tick,getMission} from '../dist/solo-game.js';
import {missionScenery,missionArtBindings,clueAnchorHeight} from '../dist/mission-scenery.js';
import {SHORT_MEASURE_SOLIDS,SOLIDS_VERSION} from '../dist/mission-art/short-measure/solids.js';
import {solidPartBoxes} from '../dist/mission-art/short-measure/solid-parts.js';
import {PLACEMENTS,ART_VERSION,bindingFor} from '../dist/mission-art/short-measure/manifest.js';
import {createShortMeasureKit,createShortMeasureArt} from '../dist/mission-art/short-measure/kit.js';
import {createMissionArt} from '../dist/mission-art-view.js';
import {InteractionScenery} from '../dist/interaction-view.js';
import {blockWindow} from '../dist/world-grid.js';

const GRENADES={...DEFAULT_BUILD,utility:'grenade'};
const mill=()=>createSoloGame(GRENADES,1947,'short-measure');

test('the registered solid table is exactly what the kit builds today',()=>{
  const kit=createShortMeasureKit();
  try{
    const rebuilt=PLACEMENTS.filter(p=>p.owner).map(p=>{const b=bindingFor(p);return {id:p.id,owner:b.owner,footprint:b.footprint,height:b.height,shapeKey:b.occlusion.shapeKey,parts:solidPartBoxes(kit.solidParts(kit.place(p.id,{binding:b})))};});
    assert.deepEqual(rebuilt,SHORT_MEASURE_SOLIDS,'run node sites/tactical-animal/tools/short-measure-art.mjs');
    assert.equal(SOLIDS_VERSION,ART_VERSION);
  }finally{kit.dispose();}
});

test('part boxes map three.js axes to world axes and round outward to the millimetre',()=>{
  const geometry=new T.BoxGeometry(1,1,1),mesh=new T.Mesh(geometry),boxes=()=>{mesh.updateMatrixWorld(true);return solidPartBoxes([{geometry,matrixWorld:mesh.matrixWorld}]);};
  mesh.position.set(10,.25,20);mesh.scale.set(2,.5,1);
  assert.deepEqual(boxes(),[[9,11,19.5,20.5,0,.5]]);   // three z is world y (south); three y is height
  mesh.rotation.y=Math.PI/2;
  assert.deepEqual(boxes(),[[9.5,10.5,19,21,0,.5]]);   // a quarter turn swaps width and depth exactly
  mesh.rotation.y=0;mesh.position.x=10.0004;
  assert.deepEqual(boxes(),[[9,11.001,19.5,20.5,0,.5]]); // 0.4 mm off the grid grows the box, never shrinks it
  geometry.dispose();
});

test('Short Measure registers each new prop once on the ground and every owned placement by its parts',()=>{
  const s=mill(),boxes=geometry(s),props=boxes.filter(b=>b.kind==='prop'),parts=boxes.filter(b=>b.kind==='part');
  assert.deepEqual(props.map(b=>b.placementId).sort(),['freight-scale','sealed-load-arrival','shipping-manifest','worker-scale']);
  assert.equal(parts.length,SHORT_MEASURE_SOLIDS.reduce((n,solid)=>n+solid.parts.length,0));
  const scale=props.find(b=>b.placementId==='worker-scale');
  assert.deepEqual([scale.x0,scale.y0,scale.x1,scale.y1,scale.height],[7.15,19.45,8.85,20.55,1.72]);
  // The sealed load keeps its four crate cells as its reservation and adds only parts.
  assert.equal(boxes.filter(b=>b.kind==='crate'&&b.interactionId==='sealed-load').length,4);
  assert.ok(boxes.filter(b=>b.placementId==='sealed-load').every(b=>b.kind==='part'));
  // A prop that embodies a clue or the objective may be reached into.
  for(const id of ['worker-scale','sealed-load','shipping-manifest'])assert.ok(boxes.filter(b=>b.placementId===id).every(b=>b.interactionId===id),id);
  assert.ok(boxes.filter(b=>['freight-scale','sealed-load-arrival'].includes(b.placementId)).every(b=>!b.interactionId));
  assert.deepEqual(props.filter(b=>b.cover).map(b=>b.placementId),['sealed-load-arrival']);
  for(const id of ['night-ledger','road-checkpoint'])assert.equal(geometry(createSoloGame(DEFAULT_BUILD,1947,id)).filter(b=>b.kind==='prop'||b.kind==='part').length,0,id);
});

test('the kit accepts every binding the simulation reports; without the crates neither side keeps the sealed load',()=>{
  const mission=getMission('short-measure'),s=mill();
  const art=createShortMeasureArt({missionId:mission.id,bindings:missionArtBindings(mission,s.map)});
  try{assert.deepEqual(art.skipped,[]);}finally{art.dispose();}
  const map=s.map.map(row=>row.slice());for(const [x,y] of [[27,19],[28,19],[27,20],[28,20]])map[y][x]='floor';
  assert.equal(missionArtBindings(mission,map)['sealed-load'],undefined);
  assert.equal(missionScenery(mission,map).filter(b=>b.placementId==='sealed-load').length,0);
  const bare=createShortMeasureArt({missionId:mission.id,bindings:missionArtBindings(mission,map)});
  try{assert.deepEqual(bare.skipped,['sealed-load']);}finally{bare.dispose();}
});

// Every geometry ruling, run against one open strip of Night Ledger. A shooter
// at (2,3) faces a standing guard at (8,3); the box under test sits halfway.
// Columns stand from the ground (z0 = 0); parts fill only [z0, height].
const A={x:2,y:3},B={x:8,y:3};
function strip(obstacles,{stance='standing'}={}){
  const fresh=createSoloGame(GRENADES,1947,'night-ledger'),s={...fresh,obstacles},u=hero(s),g=s.units[1];
  Object.assign(u,{...A,stance,ap:20});Object.assign(g,{...B,stance,weapon:'rifle',hp:100});
  s.engaged=true;s.phase='player';s.seed=0;Core.refresh(s,{forceFog:true});
  return {s,u,g};
}
const mid=(z0,z1,kind='part',extra={})=>({x0:4.88,x1:5.12,y0:2,y1:4,height:z1,kind,...(kind==='part'?{z0}:{}),...extra});
// Height of each consumer's line where it crosses the box (t = .5).
const LINE={
  proneSight:.3,                                   // prone eye to prone eye
  bullets:(1.1+1.75*.62)/2,                        // standing eye to standing torso
  grenade:1.1*.5+.08*.5+Math.min(2.5,6*.35),       // grenadeTrajectory at its midpoint
  flame:null,                                      // three rays: 1.1, 1.425 and 0.8 m here
};
const variants=consumer=>{
  if(consumer==='flame')return {through:[.7,1.5],above:[1.6,2.2],below:[0,.6]};
  const h=LINE[consumer];return {through:[h-.1,h+.1],above:[h+.2,h+.6],below:[0,Math.max(.01,h-.2)]};
};
const blocks={
  walking:box=>!freePoint(strip([box]).s,{x:5,y:3},null,{units:false}),
  standingSight:box=>{const {s,u,g}=strip([box]);return !lineClear(s,u,g);},
  proneSight:box=>{const {s,u,g}=strip([box],{stance:'prone'});return !lineClear(s,u,g);},
  bullets:box=>{
    const {s,u,g}=strip([box]),p=Core.previewAttack(s,u,g);if(!p.ok)return true;
    assert.ok(p.chance>30,'seed 0 must roll a hit');Core.attack(s,u,g,false,false,'torso',false,'hip');return g.hp===100;
  },
  grenade:box=>{const {s,u,g}=strip([box]);return previewGrenade(s,u,g).reason==='Throw path is blocked';},
  flame:box=>{const {s,u,g}=strip([box]);return !Core.previewFlame(s,u,Core.headingTo(u,g)).contacts.some(c=>c.id===g.id);},
};
test('each geometry kind answers only its own questions (the rulings table)',()=>{
  const prop=mid(0,3,'prop'),crate=mid(0,.92,'crate'),wall=mid(0,2,'wall');
  const table={};
  for(const [consumer,probe] of Object.entries(blocks)){
    const v=variants(consumer==='walking'||consumer==='standingSight'?'bullets':consumer);
    table[consumer]={prop:probe(prop),...Object.fromEntries(Object.entries(v).map(([name,[z0,z1]])=>[name,probe(mid(z0,z1))])),crate:probe(crate)};
    if(['walking','standingSight','proneSight','bullets','flame'].includes(consumer))table[consumer].wall=probe(wall);
  }
  assert.deepEqual(table,{
    walking:      {prop:true, through:false,above:false,below:false,crate:true, wall:true},
    standingSight:{prop:false,through:false,above:false,below:false,crate:false,wall:true},
    proneSight:   {prop:false,through:true, above:false,below:false,crate:true, wall:true},
    bullets:      {prop:false,through:true, above:false,below:false,crate:false,wall:true},
    grenade:      {prop:false,through:true, above:false,below:false,crate:false},
    flame:        {prop:false,through:true, above:false,below:false,crate:false,wall:true},
  });
});

test('cover and grenade landings follow the ground, not the parts',()=>{
  const near=(kind,extra={})=>({x0:7.2,x1:7.6,y0:2.5,y1:3.5,height:1,kind,...(kind==='part'?{z0:.4}:{}),...extra});
  const cover=box=>{const {s,u,g}=strip([box]);return Core.previewAttack(s,u,g).cover;};
  assert.deepEqual([cover(near('prop',{cover:true})),cover(near('prop')),cover(near('part')),cover(near('crate'))],[20,0,0,20]);
  const at=(kind,extra={})=>({x0:6.8,x1:7.2,y0:3.6,y1:4,height:1,kind,...(kind==='part'?{z0:.6}:{}),...extra});
  const landing=box=>{const {s,u}=strip([box]);return previewGrenade(s,u,{x:7,y:3.8}).reason;};
  assert.deepEqual([landing(at('prop')),landing(at('part')),landing(at('crate'))],['Landing point is inside an obstacle','','Landing point is inside an obstacle']);
});

// Real kit geometry: the dispatch desk's top spans z .86-.98 over legs and low
// end rails. Shooter and target stand either side of it along y = 6.1.
function office(shooter,target){
  const s=mill(),u=hero(s),g=s.units[1];
  Object.assign(u,{x:29.4,y:6.1,stance:shooter,ap:20});Object.assign(g,{x:34.6,y:6.1,stance:target,weapon:'rifle',hp:100});
  s.engaged=true;s.phase='player';s.seed=0;Core.refresh(s,{forceFog:true});
  return {s,u,g};
}
test('the desk keeps its open air: a kneeling shot passes under the top, a standing shot stops on it',()=>{
  for(const [shooter,hit] of [['kneeling',true],['standing',false]]){
    const {s,u,g}=office(shooter,'kneeling'),p=Core.previewAttack(s,u,g);
    assert.ok(p.ok,p.reason);assert.ok(p.chance>30);
    assert.ok(Core.attack(s,u,g,false,false,'torso',false,'hip'));
    assert.equal(g.hp<100,hit,`${shooter} shooter`);
  }
});

test('prone animals see beneath the desk between its legs, but not through the ration scale',()=>{
  const s=mill(),[a,b]=[{x:32,y:4.6,stance:'prone'},{x:32,y:7.6,stance:'prone'}];
  assert.equal(lineClear(s,a,b),true);                                    // under the top, between the legs
  assert.equal(lineClear(s,{...a,stance:'standing'},{...b,stance:'standing'}),true);
  const c={x:6.4,y:19.65,stance:'prone'},d={x:9.6,y:19.65,stance:'prone'};
  assert.equal(lineClear(s,c,d),false);                                   // the scale's upright at prone eye height
  assert.equal(lineClear(s,{...c,stance:'standing'},{...d,stance:'standing'}),true);
});

test('the ration scale is solid around its clue, which stays inspectable from either side',()=>{
  const s=mill(),u=hero(s);
  assert.equal(freePoint(s,{x:8,y:20},null,{units:false}),false);
  assert.equal(walkSegment(s,{x:6.3,y:20},{x:10.5,y:20}),false);
  Object.assign(u,{x:6.3,y:20});const path=navigationPath(s,u,10.5,20);
  assert.ok(path?.length>1);let from={x:u.x,y:u.y};for(const p of path){assert.ok(walkSegment(s,from,p,u.id));from=p;}
  for(const [x,y] of [[8,21],[8,19.1]]){Object.assign(u,{x,y});const p=Core.previewInteraction(s,'worker-scale','inspect');assert.ok(p.ok,`${x},${y}: ${p.reason}`);}
});

test('a save that stood on the old scale marker loads beside the scale and walks away; nothing else moves',()=>{
  const s=mill(),stored=JSON.parse(encodeSave(s));stored.units[0].x=8;stored.units[0].y=20;
  const restored=decodeSave(JSON.stringify(stored)),u=hero(restored);
  assert.ok(freePoint(restored,u,u.id));assert.ok(Math.hypot(u.x-8,u.y-20)<.85,`${u.x},${u.y}`);
  assert.deepEqual(restored.units.slice(1).map(g=>[g.x,g.y]),s.units.slice(1).map(g=>[g.x,g.y]));
  const before={x:u.x,y:u.y};for(let i=0;i<10;i++)tick(restored,.05,{x:0,y:1});
  assert.ok(Math.hypot(u.x-before.x,u.y-before.y)>.3);
  assert.equal(encodeSave(decodeSave(encodeSave(s))),encodeSave(s));  // a valid save is untouched
});

test('the art view follows map knowledge, hands the sealed load its crate tiles and hides collected paper',()=>{
  const s=mill(),errors=[],loads=[];
  const art=createMissionArt(s,{loader:{load:url=>{loads.push(url);return new T.Texture();}},onError:message=>errors.push(message)});
  try{
    assert.deepEqual([art.skipped,art.refused,errors],[[],[],[]]);
    assert.ok(loads[0].endsWith('mission-art/short-measure/shipping-manifest.svg'));
    assert.deepEqual([...art.replacedCells].sort(),['27,19','27,20','28,19','28,20']);
    const shown=()=>art.root.children.filter(child=>child.visible&&child.name!=='ground-markings').map(child=>child.name).sort();
    s.seen=new Set();art.update(s,blockWindow(s,hero(s)));assert.deepEqual(shown(),[]);
    s.seen.add('9,20');art.update(s,blockWindow(s,hero(s)));assert.deepEqual(shown(),['worker-scale']);
    s.seen.add('32,6');art.update(s,blockWindow(s,hero(s)));assert.deepEqual(shown(),['shipping-manifest','worker-scale']);
    const paper=art.root.getObjectByName('collectible-paper');assert.equal(paper.visible,true);
    s.solo.objectives['shipping-manifest']=true;art.update(s,blockWindow(s,hero(s)));assert.equal(paper.visible,false);
  }finally{art.dispose();art.dispose();}
  assert.equal(createMissionArt(createSoloGame()),null);
});

test('an embodied clue floats its marker above its prop; other markers keep their authored height',()=>{
  const s=mill(),mission=getMission('short-measure'),clue=id=>s.interactables.find(o=>o.id===id);
  assert.equal(clueAnchorHeight(mission,clue('worker-scale'),.8),1.72+.28);
  assert.equal(clueAnchorHeight(mission,clue('sealed-load'),.8),1.2);      // authored above its .92 m load already
  assert.equal(clueAnchorHeight(getMission('road-checkpoint'),{kind:'clue',id:'worker-scale',anchorHeight:.8},.8),.8);
  assert.equal(clueAnchorHeight(mission,{kind:'objective',id:'shipping-manifest'},.7),.7);
  const view=Object.create(InteractionScenery.prototype),marker=new T.Mesh(new T.OctahedronGeometry(.18),new T.MeshStandardMaterial());
  view.records=new Map([['worker-scale',{marker}]]);s.seen.add('8,20');view.update(s);
  assert.deepEqual(marker.position.toArray(),[8,2,20]);marker.geometry.dispose();marker.material.dispose();
});
