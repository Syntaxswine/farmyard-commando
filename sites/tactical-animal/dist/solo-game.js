import {WEAPONS,AIM_ZONES} from './aft/tactics/solo-weapon-data.js';
import {initializeStats,weaponAccuracy,damageAfterResistance} from './aft/tactics/character-stats.js';
import {QUICKPLAY_PRESETS} from './aft/tactics/quickplay-presets.js';
import {identifyRange,headingTo} from './aft/tactics/core/perception.js';
import {shotAim} from './aft/tactics/aim-levels.js';
import {WALL_DIMENSIONS,CRATE_DIMENSIONS} from './world-dimensions.js';
import {missionScenery} from './mission-scenery.js';
import {windowSystem} from './window-catalogue.js';
import {legacyWallSpan,windowToLocal} from './window-system.js';
import {adaptAftSector} from './aft-sector.js';
import {WINDOW_REVIEW_ID} from './window-review-map.js';
import {createInteractionSystem,missionInteractables,interactionFootprint} from './interactions.js';
import {recordFlame} from './flame-event.js';
import {createFireRules,firePending,recordBurn} from './solo-fire.js';
import {createFuelRules,tankExplosionChance} from './solo-fuel.js';
export {tankExplosionChance} from './solo-fuel.js';
import {gridDimensions,worldBounds} from './world-grid.js';
import {PathFrontier} from './path-frontier.js';
import {createGuardCoordination} from './guard-coordination.js';
import {createGuardAwareness,guardState} from './guard-awareness.js';
export {GUARD_STATES,guardState} from './guard-awareness.js';
import {providerFor,attachSpatial,actorEye,actorHeight,spatialDistance,floorKey} from './spatial-provider.js';
import {restoreColdwellBase,validateColdwellObjects} from './coldwell-save.js';
import {DEFAULT_MISSION_ID,getMission,missionForState,missionMap,objectiveSecured} from './missions.js';
export {MISSIONS,DEFAULT_MISSION_ID,getMission,missionForState,missionMap,objectiveSecured,missionDestination} from './missions.js';

// Continuous positions are authoritative. Raster cells describe scenery and fog;
// movement, AP, sightlines, and weapon range use actual world distances.
const EPS=1e-7,RADIUS=.23;
export const ANIMALS=QUICKPLAY_PRESETS;
export const PRIMARY=['assault','rifle','smg','shotgun','sniper','hmg','flamethrower','rpg'];
export const SECONDARY=['pistol','knife'],UTILITIES=['dressing','grenade'];
export const DEFAULT_BUILD=Object.freeze({animal:'rifleman',primary:'assault',secondary:'pistol',utility:'dressing'});
// Preserve the original public brief for existing callers. Active operations
// resolve their own definition through missionForState instead.
export const BRIEF=getMission(DEFAULT_MISSION_ID);
export const distance=(a,b)=>a.h!==undefined&&b.h!==undefined?Math.hypot(a.x-b.x,a.y-b.y,a.h-b.h):Math.hypot(a.x-b.x,a.y-b.y);
export const key=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
export const cellKey=(s,point)=>s.spatial?floorKey({...point,floorId:point.floorId??hero(s).floorId}):key(point.x,point.y);
export const visibleCells=(s,floor=hero(s).floorId)=>s.spatial?providerFor(s).combat.visibleCells(s,floor):s.visible;
const rememberedPoint=u=>({x:u.x,y:u.y,...(u.h!==undefined?{h:u.h,floorId:u.floorId,...(u.stairId?{stairId:u.stairId}:{})}:{})});
export const hero=s=>s.units.find(u=>u.team==='squad');
export const alive=u=>!!u&&u.hp>0;
export const movementModeOf=u=>u.sneaking?'sneak':u.running?'run':'walk';
export const movementRate=u=>(u.stance==='prone'?8:u.stance==='kneeling'?4:2)*(u.running?.5:u.sneaking?1.5:1);
export const movementSpeed=u=>(u.stance==='prone'?.9:u.stance==='kneeling'?1.8:3.6)*(u.running?2:u.sneaking?.5:1);
export const combatCosts=s=>['player','enemy'].includes(s.phase)||s.units.some(g=>g.team==='guard'&&alive(g)&&g.alert);
export const canControl=(s,u)=>alive(u)&&!u.burningTurns&&u.team==='squad'&&['explore','player','won'].includes(s.phase)&&s.solo.status==='active'&&(!s.spatial||!providerFor(s).isMoving(s));
export function validBuild(b){return !!b&&ANIMALS.some(a=>a.id===b.animal)&&PRIMARY.includes(b.primary)&&SECONDARY.includes(b.secondary)&&UTILITIES.includes(b.utility);}
export function normalizeBuild(b){return validBuild(b)?{animal:b.animal,primary:b.primary,secondary:b.secondary,utility:b.utility}:{...DEFAULT_BUILD};}
export function buildStats(b){const p=ANIMALS.find(a=>a.id===b.animal),u={team:'squad',name:p.name};initializeStats(u,p.stats);return u;}
export function log(s,message){s.log.unshift(message);s.log=s.log.slice(0,35);s.revision++;}
function makeUnit(id,team,name,species,weapon,x,y,heading,stats){const u={id,team,name,species,weapon,x,y,z:0,heading,stance:'standing',running:false,sneaking:false,travelled:0,isMoving:false,alert:false,lastKnown:null,alertAge:0,slots:[weapon],pack:[],ammo:{[weapon]:WEAPONS[weapon].mag},ammoPouch:{[weapon]:WEAPONS[weapon].mag*3}};initializeStats(u,stats);return u;}
function mapMetadata(state,map){
  // Mission scenery belongs to the full world, regardless of render residency.
  for(const name of ['props','obstacles','worldBounds','groundPalette','windows']){
    if(map[name]===undefined)delete state[name];
    else state[name]=structuredClone(map[name]);
  }
}
export function createSoloGame(build=DEFAULT_BUILD,seed=1947,missionId=DEFAULT_MISSION_ID,{layoutVersion,authoredMap}={}){
  if(!validBuild(build))throw Error('Choose a valid animal and loadout.');
  if(authoredMap&&missionId!==WINDOW_REVIEW_ID)throw Error('Authored maps use the window playtest.');
  const mission=getMission(missionId,layoutVersion),p=ANIMALS.find(a=>a.id===build.animal),m=authoredMap?adaptAftSector(authoredMap):missionMap(mission.id,mission.layoutVersion??1),spawn=authoredMap?.starts?.[0]||mission.spawn;
  if(!insideWorld({map:m.terrain,worldBounds:m.worldBounds},spawn))throw Error('Place a ground-level start in the map designer.');
  const u=makeUnit(0,'squad',p.name,p.species,build.primary,spawn.x,spawn.y,spawn.heading??270,p.stats);
  u.slots=[build.primary,build.secondary];const kinds=[...u.slots,...(build.utility==='grenade'?['grenade']:[])];
  u.ammo=Object.fromEntries(kinds.map(k=>[k,WEAPONS[k].mag]));u.pack=kinds.map(kind=>({type:'weapon',kind,rounds:u.ammo[kind],condition:100}));if(build.secondary==='pistol')u.ammoPouch.pistol=24;
  const stats={strength:10,endurance:20,agility:22,firearms:35,perception:35,dexterity:35};
  const posts=authoredMap?authoredMap.guards||[]:mission.guards;
  if(authoredMap&&(posts.length>128||posts.some(g=>!g||!WEAPONS[g.weapon]||!['horse','goat','bull','cow','donkey','sheep','skunk','pig-foreman','pig-director','rabbit','dog','hen'].includes(g.species)||!insideWorld({map:m.terrain,worldBounds:m.worldBounds},g))))throw Error('Unsupported authored guard.');
  const units=[u,...posts.map((g,i)=>makeUnit(i+1,'guard',g.name||g.character?.displayName||'Guard '+(i+1),g.species,g.weapon,g.x,g.y,g.heading??0,stats))];
  if(mission.fallen){const f=mission.fallen,fallen=makeUnit(units.length,'guard',f.name,f.species,f.weapon,f.x,f.y,f.heading,stats);fallen.hp=0;fallen.casualty='dead';units.push(fallen);}
  const s={map:m.terrain,edges:m.edges,units,interactables:missionInteractables({missionId:mission.id,layoutVersion:mission.layoutVersion??1}),phase:'explore',round:0,selected:0,visible:new Set(),seen:new Set(),detected:new Set(),log:[],seed,revision:0,queue:[],enemyIndex:1,enemyDelay:0,elapsed:0,solo:{version:2,missionId:mission.id,layoutVersion:mission.layoutVersion??1,build:{...build},objectives:{},inspected:[],ledger:false,status:'active',dressings:build.utility==='dressing'?2:0,distance:0,apDistance:0}};
  if(authoredMap)s.solo.authoredMap=structuredClone(authoredMap);
  if(m.spatialProvider){
    const provider=attachSpatial(s,m.spatialProvider);s.interactables.push(...structuredClone(m.interactables||[]));
    for(const [i,unit]of s.units.entries()){const position=i===0?spawn:posts[i-1];unit.h=position.h;unit.floorId=position.floorId;unit.z=provider.floorById.get(unit.floorId)?.index;if(!provider.occupancy(s,unit,unit,{units:false}))throw Error('Coldwell actor needs valid source support and clearance: '+unit.name);}
  }
  guardAwareness.initialize(s,posts);mapMetadata(s,m);windowSystem.restore(s);interactionRules.restore(s);refresh(s);log(s,mission.briefing);return s;
}
const geometryCache=new WeakMap(),GEOMETRY_BUCKET=8;
export function geometry(s){
  if(s.spatial)throw Error('This operation requires its spatial provider queries.');
  if(geometryCache.has(s))return geometryCache.get(s).boxes;const boxes=[],covered=new Set(windowSystem.compile(s).flatMap(r=>r.edges));
  for(const [k,kind] of Object.entries(s.edges)){
    const span=legacyWallSpan(k,covered,WALL_DIMENSIONS.length);if(kind==='door'||!span)continue;const [axis,xs,ys]=k.split(':'),x=+xs+(axis==='e'?.5:0),y=+ys+(axis==='s'?.5:0);
    const hx=(axis==='e'?WALL_DIMENSIONS.thickness:WALL_DIMENSIONS.length)/2,hy=(axis==='s'?WALL_DIMENSIONS.thickness:WALL_DIMENSIONS.length)/2;
    const interactionId=s.interactables?.find(object=>object.kind==='door'&&object.edge===k)?.id;
    boxes.push({x0:axis==='s'?span.min:x-hx,x1:axis==='s'?span.max:x+hx,y0:axis==='e'?span.min:y-hy,y1:axis==='e'?span.max:y+hy,height:WALL_DIMENSIONS.height,kind:'wall',...(interactionId?{interactionId}:{})});
  }
  const cargo=missionForState(s).cover.filter(p=>s.interactables?.some(object=>object.kind==='clue'&&object.id===p.id));
  const {width,height}=gridDimensions(s);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(s.map[y][x]==='crate'){
    const placement=cargo.find(({rect:[cx,cy,w,h]})=>x>=cx&&x<cx+w&&y>=cy&&y<cy+h);
    const {half,height:crateHeight}=CRATE_DIMENSIONS;
    boxes.push({x0:x-half,x1:x+half,y0:y-half,y1:y+half,height:crateHeight,kind:'crate',...(placement?{interactionId:placement.id}:{})});
  }
  for(const box of s.obstacles||[])boxes.push({...box});
  boxes.push(...windowSystem.boxes(s));
  for(const box of missionScenery(missionForState(s),s.map))boxes.push({...box});
  for(const object of s.interactables||[])if(object.kind==='chest'||object.kind==='door'&&object.open)boxes.push({...interactionFootprint(object),kind:object.kind==='door'?'wall':'crate',interactionId:object.id});
  const layers={};
  for(const [name,keep] of Object.entries(GEOMETRY_LAYERS)){
    const buckets=new Map();layers[name]=buckets;
    for(const box of boxes)if(keep(box))for(let y=Math.floor(box.y0/GEOMETRY_BUCKET);y<=Math.floor(box.y1/GEOMETRY_BUCKET);y++)for(let x=Math.floor(box.x0/GEOMETRY_BUCKET);x<=Math.floor(box.x1/GEOMETRY_BUCKET);x++){
      const id=`${x},${y}`;if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(box);
    }
  }
  geometryCache.set(s,{boxes,layers});return boxes;
}
// Each question gets its own broad phase, and the layer IS the kind filter:
// walking never sifts a prop's parts, standing sight looks only at walls, and
// anything in flight skips reservations. A caller must name its question.
const GEOMETRY_LAYERS={walk:box=>blocksWalking(box),air:box=>occupiesAir(box),wall:box=>box.kind==='wall',flame:box=>box.kind==='wall'||box.kind==='glass'};
// Broad phase shared by movement, sight, silhouettes and area weapons. The
// interaction system invalidates this cache immediately after a door changes.
export function geometryNear(s,a,b,padding,layer){
  if(!GEOMETRY_LAYERS[layer])throw Error(`geometryNear needs a layer (${Object.keys(GEOMETRY_LAYERS).join(', ')}), not ${layer}.`);
  if(![a.x,a.y,b.x,b.y,padding].every(Number.isFinite)||padding<0)return [];
  geometry(s);const buckets=geometryCache.get(s).layers[layer],boxes=new Set();
  const x0=Math.min(a.x,b.x)-padding,x1=Math.max(a.x,b.x)+padding,y0=Math.min(a.y,b.y)-padding,y1=Math.max(a.y,b.y)+padding;
  for(let y=Math.floor(y0/GEOMETRY_BUCKET);y<=Math.floor(y1/GEOMETRY_BUCKET);y++)for(let x=Math.floor(x0/GEOMETRY_BUCKET);x<=Math.floor(x1/GEOMETRY_BUCKET);x++)for(const box of buckets.get(`${x},${y}`)||[])if(box.x1>=x0&&box.x0<=x1&&box.y1>=y0&&box.y0<=y1)boxes.add(box);
  return [...boxes];
}
// Geometry kinds answer different questions; tests/short-measure-scenery.test.mjs
// runs the whole table. Walls, crates, chests, open doors, imported obstacles and
// prop reservations stand on the ground from 0 to their height. A prop's parts
// each fill only their own [z0, height]. Walking asks the ground; anything that
// travels through the air asks the parts, so the air beside or under them stays open.
export const blocksWalking=box=>box.kind!=='part';
const occupiesAir=box=>box.kind!=='prop';
const STANDING_EYE=1.1,PRONE_EYE=.3;
const eyeHeight=u=>u.stance==='prone'?PRONE_EYE:u.stance==='kneeling'?.75:STANDING_EYE;
const bodyHeight=u=>u.stance==='prone'?.42:u.stance==='kneeling'?1.15:1.75;
const pointBoxDistance=(p,b)=>Math.hypot(Math.max(b.x0-p.x,0,p.x-b.x1),Math.max(b.y0-p.y,0,p.y-b.y1));
function insideWorld(s,p,padding=0){const b=worldBounds(s);return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.x-.5+padding&&p.x<=b.x+b.w-.5-padding&&p.y>=b.y-.5+padding&&p.y<=b.y+b.h-.5-padding;}
export function freePoint(s,p,ignoreId=null,{units=true,radius=RADIUS}={}){const provider=providerFor(s);if(provider){const actor=s.units.find(u=>u.id===ignoreId)||hero(s);return provider.occupancy(s,actor,{...p,h:p.h??actor.h,floorId:p.floorId??actor.floorId},{units,resolve:true,ignoreId});}if(!insideWorld(s,p,radius))return false;if(geometryNear(s,p,p,radius,'walk').some(b=>pointBoxDistance(p,b)<radius-EPS))return false;return !units||!s.units.some(u=>alive(u)&&u.id!==ignoreId&&distance(u,p)<RADIUS+radius-EPS);}
function boxInterval(a,b,box){let lo=0,hi=1;for(const [k,min,max] of [['x',box.x0,box.x1],['y',box.y0,box.y1]]){const d=b[k]-a[k];if(Math.abs(d)<EPS){if(a[k]<min||a[k]>max)return null;continue;}const t0=(min-a[k])/d,t1=(max-a[k])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;}return [lo,hi];}
function intersectsBox(a,b,box){const span=boxInterval(a,b,box);return !!span&&span[1]>EPS&&span[0]<1-EPS;}
// The parameter span within [0,1] where a segment, rising linearly from height
// za at a to zb at b, is inside both the box's footprint and its [z0, height].
function airSpan(a,b,za,zb,box){
  const span=boxInterval(a,b,box);if(!span)return null;
  let [lo,hi]=span;const dz=zb-za,z0=box.z0??0;
  if(Math.abs(dz)<EPS){if(za<z0||za>box.height)return null;}
  else{const t0=(z0-za)/dz,t1=(box.height-za)/dz;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;}
  return [lo,hi];
}
// Only walls block standing or kneeling sight. Between two prone animals any
// solid that crosses their eye line blocks it, at its own height.
export function lineClear(s,a,b){
  if(![a.x,a.y,b.x,b.y].every(Number.isFinite))return false;
  const provider=providerFor(s);if(provider)return !provider.trace(s,{...a,h:a.eyeH??actorEye(a)},{...b,h:b.eyeH??actorEye(b)},{purpose:'sight'});
  if(a.stance!=='prone'||b.stance!=='prone')return !geometryNear(s,a,b,0,'wall').some(box=>intersectsBox(a,b,box)&&(!box.windowPart||!!airSpan(a,b,a.h??eyeHeight(a),b.h??eyeHeight(b),box)));
  return !geometryNear(s,a,b,0,'air').some(box=>box.kind!=='glass'&&intersectsBox(a,b,box)&&(box.kind==='wall'&&!box.windowPart||!!airSpan(a,b,PRONE_EYE,PRONE_EYE,box)));
}
export function walkSegment(s,a,b,ignoreId=null){const provider=providerFor(s);if(provider){const actor=s.units.find(u=>u.id===ignoreId)||hero(s);return provider.sweep(s,actor,{...a,h:a.h??actor.h,floorId:a.floorId??actor.floorId},b).ok;}return sceneryWalk(s,a,b)&&unitsWalk(s,a,b,ignoreId);}
// The scenery half of a walk: every 10 cm sample inside the world and clear of walk-blocking boxes.
function sceneryWalk(s,a,b){
  if(!insideWorld(s,b,RADIUS))return false;
  const blockers=geometryNear(s,a,b,RADIUS,'walk'),steps=Math.max(1,Math.ceil(distance(a,b)/.1));
  for(let i=1;i<=steps;i++){
    const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};
    if(!insideWorld(s,p,RADIUS)||blockers.some(box=>pointBoxDistance(p,box)<RADIUS-EPS))return false;
  }
  return true;
}
// The unit half: every sample clear of living units other than ignoreId. A unit
// outside the walk's box grown by two radii cannot reach any sample, so it is skipped.
function unitsWalk(s,a,b,ignoreId){
  const pad=2*RADIUS,x0=Math.min(a.x,b.x)-pad,x1=Math.max(a.x,b.x)+pad,y0=Math.min(a.y,b.y)-pad,y1=Math.max(a.y,b.y)+pad;
  const units=s.units.filter(u=>alive(u)&&u.id!==ignoreId&&u.x>=x0&&u.x<=x1&&u.y>=y0&&u.y<=y1);if(!units.length)return true;
  const steps=Math.max(1,Math.ceil(distance(a,b)/.1));
  for(let i=1;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(units.some(u=>distance(u,p)<2*RADIUS-EPS))return false;}
  return true;
}
// Scenery alone decides whether a grid node is clear and whether a straight walk to
// a neighbouring node is, so searches share those answers through one table per
// geometry (a door changing rebuilds the geometry and so starts a fresh table).
// Units are checked afresh every time. 0 unknown, 1 clear, 2 blocked. The stand-ins
// for last-seen points inside scenery (standIns) depend on the scenery alone too.
const sceneryGrids=new WeakMap();
function sceneryGrid(s){
  const boxes=geometry(s);let grid=sceneryGrids.get(boxes);
  if(!grid){const {width,height}=gridDimensions(s);grid={width,height,nodes:new Uint8Array(width*height),walks:new Uint8Array(width*height*9),standIns:new Map()};sceneryGrids.set(boxes,grid);}
  return grid;
}
// freePoint for an integer grid node, its scenery half read from the table.
function nodeClear(s,grid,q,ignoreId){
  const inside=q.x>=0&&q.y>=0&&q.x<grid.width&&q.y<grid.height,i=q.y*grid.width+q.x;
  let open=inside?grid.nodes[i]:0;if(!open){open=freePoint(s,q,null,{units:false})?1:2;if(inside)grid.nodes[i]=open;}
  return open===1&&!s.units.some(u=>alive(u)&&u.id!==ignoreId&&distance(u,q)<2*RADIUS-EPS);
}
// walkSegment from grid node p to a neighbouring node q, its scenery half read from the table.
function linkClear(s,grid,p,q,ignoreId){
  const inside=p.x>=0&&p.y>=0&&p.x<grid.width&&p.y<grid.height,i=(p.y*grid.width+p.x)*9+(q.y-p.y+1)*3+(q.x-p.x+1);
  let open=inside?grid.walks[i]:0;if(!open){open=sceneryWalk(s,p,q)?1:2;if(inside)grid.walks[i]=open;}
  return open===1&&unitsWalk(s,p,q,ignoreId);
}
export function canSee(s,a,b){const d=distance(a,b),range=identifyRange(a,b,a.team==='squad'?35:26)*(b.sneaking?.7:1);return alive(a)&&d<=Math.max(1.5,range)&&lineClear(s,a,b);}
export function visibleOpponents(s){
  const u=hero(s);
  if(!alive(u))return [];
  // Prefer nearby contacts with clear silhouettes and strong sight acuity.
  // Cover lowers clarity without hiding an already identified opponent's head.
  return s.units.filter(g=>g.team==='guard'&&alive(g)&&s.detected.has(g.id)&&canSee(s,u,g)).map(g=>{
    const d=distance(u,g),nx=-(g.y-u.y)/Math.max(d,EPS),ny=(g.x-u.x)/Math.max(d,EPS);
    const exposed=[-RADIUS,-RADIUS/2,0,RADIUS/2,RADIUS].filter(offset=>{
      const p={x:g.x+nx*offset,y:g.y+ny*offset};
      if(s.spatial)return !providerFor(s).trace(s,{x:u.x,y:u.y,h:actorEye(u)},{...p,h:g.h+bodyHeight(g)*.62},{purpose:'sight'});
      // Columns conceal whatever stands behind their footprint; a part conceals
      // only where it crosses the line from the viewer's eye to the torso.
      return !geometryNear(s,u,p,0,'air').some(box=>box.kind!=='glass'&&intersectsBox(u,p,box)&&(box.kind!=='part'&&!box.windowPart||!!airSpan(u,p,eyeHeight(u),bodyHeight(g)*.62,box)));
    }).length/5;
    const clarity=(.5+exposed*.5)*identifyRange(u,g,35)/35*(g.sneaking?.7:1);
    return {unit:g,distance:d,score:d/Math.max(.01,clarity)};
  }).sort((a,b)=>a.score-b.score||a.distance-b.distance||a.unit.id-b.unit.id).map(contact=>contact.unit);
}
function visibility(s){
  const provider=providerFor(s);if(provider){
    const u=hero(s),range=35;s.visible=new Set([cellKey(s,u)]);s.seen.add(cellKey(s,u));
    for(const p of provider.visibilityPoints(u,range)){
      if(!provider.trace(s,{x:u.x,y:u.y,h:actorEye(u)},{...p,h:p.h+1.1},{purpose:'sight'})){const k=cellKey(s,p);s.visible.add(k);s.seen.add(k);}
    }
    // A visible chest or door must not conceal itself by occluding the ground
    // underneath its own footprint. Reveal its cell from its actual surface.
    for(const object of s.interactables)if(Number.isFinite(object.h)&&distance(u,object)<=range&&!provider.trace(s,{x:u.x,y:u.y,h:actorEye(u)},{x:object.x,y:object.y,h:object.h+(object.anchorHeight??.8)},{purpose:'sight',ignoreRig:object.rigId||object.id})){
      const k=cellKey(s,object);s.visible.add(k);s.seen.add(k);
    }
    for(const id of s.detected){const target=s.units.find(unit=>unit.id===id);if(target){const k=cellKey(s,target);s.visible.add(k);s.seen.add(k);}}
    s.fogAt=rememberedPoint(u);return;
  }
  const u=hero(s),b=worldBounds(s),{width,height}=gridDimensions(s),range=35;
  const x0=Math.max(0,Math.ceil(b.x),Math.ceil(u.x-range)),x1=Math.min(width-1,Math.ceil(b.x+b.w)-1,Math.floor(u.x+range));
  const y0=Math.max(0,Math.ceil(b.y),Math.ceil(u.y-range)),y1=Math.min(height-1,Math.ceil(b.y+b.h)-1,Math.floor(u.y+range));
  s.visible=new Set();
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(distance(u,{x,y})<range&&lineClear(s,u,{x,y})){const k=key(x,y);s.visible.add(k);s.seen.add(k);}
  s.fogAt={x:u.x,y:u.y};
}
export function refresh(s,{forceFog=false}={}){const u=hero(s);s.detected=new Set(s.units.filter(g=>g.team==='guard'&&alive(g)&&canSee(s,u,g)).map(g=>g.id));for(const g of s.units.filter(g=>g.team==='guard'&&alive(g)))if(canSee(s,g,u)){guardAwareness.observe(s,g,u);}if(!s.fogAt||distance(u,s.fogAt)>.25||forceFog)visibility(s);if(!alive(u)){s.phase='lost';s.solo.status='lost';s.queue=[];u.isMoving=false;s.revision++;return;}const guards=s.units.filter(g=>g.team==='guard'&&alive(g));if(!guards.length&&!firePending(s)){if(s.phase!=='won')s.queue=[];s.phase='won';}else if(s.phase!=='enemy'){const contact=s.engaged||firePending(s)||guards.some(g=>g.alert&&distance(g,u)<=WEAPONS[g.weapon].range+g.maxAp);if(contact&&s.phase!=='player'){s.phase='player';s.round++;u.ap=u.burningTurns?0:u.maxAp;s.queue=[];u.isMoving=false;log(s,'Contact. Movement now spends AP by distance.');}else if(!contact&&s.phase==='player'){s.phase='explore';s.queue=[];u.isMoving=false;log(s,'Contact broken. Real-time exploration resumed.');}}s.revision++;}
export function stop(s){if(s.spatial)providerFor(s).navigation?.cancel(s);s.queue=[];hero(s).isMoving=false;s.revision++;}
// Exhaustion changes the movement mode without cancelling held input or a route.
function walkWhenExhausted(s,u){if(u.running&&u.stamina<=EPS*(u.stance==='prone'?3:4)){u.running=false;u.sneaking=false;u.stamina=0;s.revision++;}}
function movementAllowed(s,u,enemy,investigation){return enemy?s.phase==='enemy'&&!u.burningTurns:investigation?alive(u)&&u.team==='guard'&&!u.burningTurns&&['explore','won'].includes(s.phase):canControl(s,u);}
// Swept-disc collision prevents tunnelling. AP charges accepted displacement,
// including wall slides, rather than requested input or pathfinder cells.
export function travel(s,u,dx,dy,{enemy=false,investigation=false,distanceBudget}={}){if(s.spatial)return spatialTravel(s,u,dx,dy,{enemy,investigation,distanceBudget});if(!movementAllowed(s,u,enemy,investigation)||!Number.isFinite(dx)||!Number.isFinite(dy))return 0;const requested=Math.hypot(dx,dy);if(requested<EPS)return 0;walkWhenExhausted(s,u);const rate=movementRate(u),spends=enemy||s.phase==='player',staminaRate=u.stance==='prone'?3:u.running?4:u.sneaking?2:1;const budget=Math.min(requested,spends?u.ap/rate:Infinity,u.running||u.sneaking||u.stance==='prone'?u.stamina/staminaRate:Infinity);if(budget<EPS){u.isMoving=false;return 0;}const steps=Math.ceil(budget/.07),sx=dx/requested*budget/steps,sy=dy/requested*budget/steps;let walked=0;for(let i=0;i<steps;i++){let nx=u.x+sx,ny=u.y+sy;if(!freePoint(s,{x:nx,y:ny},u.id)){if(freePoint(s,{x:nx,y:u.y},u.id))ny=u.y;else if(freePoint(s,{x:u.x,y:ny},u.id))nx=u.x;else break;}const d=Math.hypot(nx-u.x,ny-u.y);if(d<EPS)break;u.heading=Math.atan2(ny-u.y,nx-u.x)*180/Math.PI;u.x=nx;u.y=ny;walked+=d;if(spends)u.ap=Math.max(0,u.ap-d*rate);u.stamina=Math.max(0,u.stamina-d*staminaRate);u.travelled+=d;fireRules.enterFire(s,u);if(u.burningTurns)break;}u.isMoving=walked>EPS&&!u.burningTurns;walkWhenExhausted(s,u);if(walked){if(u.team==='squad'){s.solo.distance+=walked;if(spends)s.solo.apDistance+=walked*rate;}refresh(s);}return walked;}
// A stable heap preserves tie order without sorting the whole frontier on every
// expansion. The cap also bounds an unreachable request in a large open sector.
function spatialTravel(s,u,dx,dy,{enemy=false,investigation=false,distanceBudget}={}){
  if(!movementAllowed(s,u,enemy,investigation)||![dx,dy].every(Number.isFinite))return 0;
  const horizontal=Math.hypot(dx,dy),requested=distanceBudget??horizontal;if(horizontal<EPS||!Number.isFinite(requested)||requested<=0)return 0;
  walkWhenExhausted(s,u);const provider=providerFor(s),rate=movementRate(u),spends=enemy||s.phase==='player',staminaRate=u.stance==='prone'?3:u.running?4:u.sneaking?2:1;
  const budget=Math.min(requested,spends?u.ap/rate:Infinity,u.running||u.sneaking||u.stance==='prone'?u.stamina/staminaRate:Infinity);if(budget<EPS){u.isMoving=false;return 0;}
  const steps=Math.ceil(budget/.07),sx=dx*budget/requested/steps,sy=dy*budget/requested/steps;let walked=0;
  for(let i=0;i<steps;i++){
    let result=provider.advance(s,u,sx,sy,budget/steps);
    if(result.distance<EPS&&sx&&sy){result=provider.advance(s,u,sx,0,budget/steps);if(result.distance<EPS)result=provider.advance(s,u,0,sy,budget/steps);}
    if(result.distance<EPS)break;
    const p=result.point,d=result.distance;u.heading=Math.atan2(p.y-u.y,p.x-u.x)*180/Math.PI;u.x=p.x;u.y=p.y;u.h=p.h;u.floorId=p.floorId;u.z=provider.floorById.get(p.floorId).index;
    if(p.stairId)u.stairId=p.stairId;else delete u.stairId;
    walked+=d;if(spends)u.ap=Math.max(0,u.ap-d*rate);u.stamina=Math.max(0,u.stamina-d*staminaRate);u.travelled+=d;fireRules.enterFire(s,u);if(u.burningTurns)break;
  }
  u.isMoving=walked>EPS&&!u.burningTurns;walkWhenExhausted(s,u);
  if(walked){if(u.team==='squad'){s.solo.distance+=walked;if(spends)s.solo.apDistance+=walked*rate;}refresh(s);}
  return walked;
}
export const NAVIGATION_NODE_LIMIT=8192;
// Grid nodes around p that u could stand on and reach from p in a straight walk, nearest first.
function gridNodesAround(s,u,p){
  const a=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const q={x:Math.round(p.x)+dx,y:Math.round(p.y)+dy};if(freePoint(s,q,u.id)&&walkSegment(s,p,q,u.id))a.push(q);
  }
  return a.sort((a,b)=>distance(a,p)-distance(b,p));
}
// A* over integer grid nodes joined by straight walks, from the start nodes (each
// entered at its cost, 0 if it has none) to the first node isGoal accepts. Returns
// the nodes walked, a start first, or null. A caller may pass sealed(reached), asked
// once after SEALED_CHECK expansions: true ends the search as unreachable.
const SEALED_CHECK=256;
function gridSearch(s,u,starts,isGoal,estimate,sealed=null,nodeLimit=NAVIGATION_NODE_LIMIT){
  const open=new PathFrontier(),grid=sceneryGrid(s);
  const cost=new Map(),parents=new Map(),points=new Map(),links=new Map(),passable=new Map();
  for(const start of starts){const sk=key(start.x,start.y),g=start.cost??0;if(g>=(cost.get(sk)??Infinity))continue;cost.set(sk,g);points.set(sk,{x:start.x,y:start.y});open.push({x:start.x,y:start.y,g,f:g+estimate(start)});}
  let found=null,expanded=0;
  while(open.items.length&&expanded<nodeLimit){
    const p=open.pop(),pk=key(p.x,p.y);if(p.g>(cost.get(pk)??Infinity))continue;
    if(isGoal(p,pk)){found=p;break;}expanded++;
    if(sealed&&expanded===SEALED_CHECK&&sealed(cost))return null;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(!dx&&!dy)continue;
      const q={x:p.x+dx,y:p.y+dy},qk=key(q.x,q.y),g=p.g+Math.hypot(dx,dy);
      if(g>=(cost.get(qk)??Infinity))continue;
      if(!passable.has(qk))passable.set(qk,nodeClear(s,grid,q,u.id));if(!passable.get(qk))continue;
      // Direction matters because swept sampling includes its destination.
      const link=pk+'>'+qk;if(!links.has(link))links.set(link,linkClear(s,grid,p,q,u.id));if(!links.get(link))continue;
      cost.set(qk,g);parents.set(qk,pk);points.set(qk,q);open.push({...q,g,f:g+estimate(q)});
    }
  }
  if(!found)return null;
  const raw=[];let current=key(found.x,found.y);while(current){raw.unshift(points.get(current));current=parents.get(current);}
  return raw;
}
// Waypoints from u along raw, each the farthest node still reachable in a straight walk.
function smoothRoute(s,u,raw){
  const result=[];let a=u,index=0;
  while(index<raw.length){let far=index;for(let j=raw.length-1;j>=index;j--)if(walkSegment(s,a,raw[j],u.id)){far=j;break;}const b=raw[far];result.push({...b,z:0,cost:distance(a,b)*movementRate(u)});a=b;index=far+1;}
  return result;
}
export function navigationPath(s,u,x,y,point,{nodeLimit=NAVIGATION_NODE_LIMIT}={}){
  if(s.spatial)return providerFor(s).path(s,u,{x,y,...(point||{})},{rate:movementRate(u),nodeLimit});
  const end={x,y};if(!freePoint(s,end,u.id))return null;
  if(walkSegment(s,u,end,u.id))return [{...end,z:0,cost:distance(u,end)*movementRate(u)}];
  const starts=searchStarts(s,u),goals=gridNodesAround(s,u,end);if(!starts.length||!goals.length)return null;
  const goalKeys=new Set(goals.map(p=>key(p.x,p.y))),raw=gridSearch(s,u,starts,(p,pk)=>goalKeys.has(pk),q=>distance(q,end),null,nodeLimit);
  if(!raw)return null;
  const via=starts.find(p=>p.x===raw[0].x&&p.y===raw[0].y).via;
  return smoothRoute(s,u,via?[via,...raw,end]:[...raw,end]);
}
export function move(s,u,x,y,point){if(!canControl(s,u))return false;const path=navigationPath(s,u,x,y,point);if(!path?.length)return false;s.queue=path;s.revision++;return true;}
export function requestNavigationPath(s,u,point){
  if(!s.spatial)return Promise.resolve(navigationPath(s,u,point.x,point.y,point));
  stop(s);if(!canControl(s,u))return Promise.resolve(null);
  const planner=providerFor(s).navigation;return planner?planner.request(s,u,point,{rate:movementRate(u)}):Promise.resolve(navigationPath(s,u,point.x,point.y,point));
}
export function acceptNavigationPath(s,u,path){
  if(!canControl(s,u)||!path?.length||!s.spatial||!providerFor(s).navigation.accepts(s,u,path,movementRate(u)))return false;
  s.queue=path.map(p=>({...p}));s.revision++;return true;
}
export const navigationStatus=s=>s?.spatial?providerFor(s).navigation?.status(s)??null:null;
export function disposeNavigation(s){if(s?.spatial)providerFor(s).navigation?.dispose(s);}
export function turnTo(s,u,heading){if(!canControl(s,u)||!Number.isFinite(heading))return false;u.heading=heading;refresh(s);return true;}
export function setMovementMode(s,u,mode){if(!canControl(s,u)||!['run','sneak','walk'].includes(mode))return false;stop(s);u.running=mode==='run';u.sneaking=mode==='sneak';walkWhenExhausted(s,u);s.revision++;return true;}
export function setStance(s,u,stance){if(!canControl(s,u)||!['standing','kneeling','prone'].includes(stance)||u.stance===stance||s.spatial&&!providerFor(s).occupancy(s,{...u,stance},u))return false;stop(s);u.stance=stance;refresh(s,{forceFog:true});return true;}
const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
export const grenadeCost=u=>WEAPONS.grenade.cost*(['pistol','pistol-offhand','smg'].includes(u.weapon)?.5:1);
export function grenadeTrajectory(a,b){
  const rise=Math.min(2.5,distance(a,b)*.35);
  return Array.from({length:33},(_,i)=>{const t=i/32;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.h!==undefined&&b.h!==undefined?(a.h+1.1)*(1-t)+(b.h+.08)*t+Math.sin(t*Math.PI)*rise:1.1*(1-t)+.08*t+Math.sin(t*Math.PI)*rise};});
}
function grenadePathBlocked(s,path){
  if(s.spatial)return path.slice(1).some((b,i)=>providerFor(s).trace(s,{x:path[i].x,y:path[i].y,h:path[i].z},{x:b.x,y:b.y,h:b.z},{purpose:'shot'}));
  return geometryNear(s,path[0],path.at(-1),0,'air').some(box=>{
    for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(airSpan(a,b,a.z,b.z,box))return true;}
    return false;
  });
}
export const grenadeAffects=(s,point,target)=>s.spatial?providerFor(s).combat.blastAffects(s,point,target,WEAPONS.grenade.blast):distance(target,point)<=WEAPONS.grenade.blast&&lineClear(s,point,target);
// The fill stops at walls and unexplored ground. The outer ring still shows the
// maximum blast radius; neither the preview nor its camera changes visibility.
export function grenadeBlastFootprint(s,point){
  if(s.spatial){const landing=providerFor(s).combat.grenadeLanding(s,hero(s),point);return landing?providerFor(s).combat.blastFootprint(s,landing,WEAPONS.grenade.blast):[];}
  if(!s.seen.has(key(point.x,point.y)))return [];
  const radius=WEAPONS.grenade.blast,walls=geometryNear(s,point,point,radius,'wall');
  return Array.from({length:97},(_,i)=>{
    const angle=i/96*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle),end={x:point.x+dx*radius,y:point.y+dy*radius};
    let reach=radius;
    for(const wall of walls){const span=wall.windowPart?airSpan(point,end,1.1,1.1,wall):boxInterval(point,end,wall);if(span&&span[1]>EPS)reach=Math.min(reach,Math.max(0,span[0]*radius-.01));}
    for(let d=0;d<=reach;d+=.1)if(!s.seen.has(key(point.x+dx*d,point.y+dy*d))){reach=Math.max(0,d-.1);break;}
    return {x:point.x+dx*reach,y:point.y+dy*reach};
  });
}
export function previewGrenade(s,u,point){
  if(s.spatial){
    const provider=providerFor(s),landing=provider.combat.grenadeLanding(s,u,point),w=WEAPONS.grenade,cost=grenadeCost(u),d=landing?distance(u,landing):Infinity;let reason='';
    if(!canControl(s,u))reason='Wait for your turn';else if(!(u.ammo.grenade>0))reason='No grenades remaining';else if(!landing)reason='Choose a supported landing point';else if(!s.seen.has(cellKey(s,landing)))reason='Choose an explored landing point';else if(d>w.range+EPS)reason='Out of throwing range';else if(grenadePathBlocked(s,grenadeTrajectory(u,landing)))reason='Throw path is blocked';else if(u.ap+EPS<cost)reason='Not enough AP';
    return {ok:!reason,reason,cost,point:landing,distance:d,blast:w.blast,discounted:cost<w.cost,selfDanger:!!landing&&grenadeAffects(s,landing,u)};
  }
  const w=WEAPONS.grenade,cost=grenadeCost(u),valid=point&&Number.isFinite(point.x)&&Number.isFinite(point.y),d=valid?distance(u,point):Infinity;
  let reason='';
  if(!canControl(s,u))reason='Wait for your turn';
  else if(!(u.ammo.grenade>0))reason='No grenades remaining';
  else if(!valid||!insideWorld(s,point))reason='Choose a point on the field';
  else if(!s.seen.has(key(point.x,point.y)))reason='Choose an explored landing point';
  else if(d>w.range+EPS)reason='Out of throwing range';
  else if(geometryNear(s,point,point,.04,'walk').some(box=>pointBoxDistance(point,box)<.04))reason='Landing point is inside an obstacle';
  else if(grenadePathBlocked(s,grenadeTrajectory(u,point)))reason='Throw path is blocked';
  else if(u.ap+EPS<cost)reason='Not enough AP';
  return {ok:!reason,reason,cost,distance:d,blast:w.blast,discounted:cost<w.cost,selfDanger:!!valid&&grenadeAffects(s,point,u)};
}
export function throwGrenade(s,u,point){
  const p=previewGrenade(s,u,point);if(!p.ok)return false;
  if(s.spatial)point=p.point;
  stop(s);if(s.phase!=='player'){s.engaged=true;refresh(s);}
  u.ap=Math.max(0,u.ap-p.cost);u.ammo.grenade--;syncAmmo(u,'grenade');u.heading=headingTo(u,point);
  const impactEvent={explosions:[]},fireBefore=s.fireAnimationSequence||0,windowBefore=s.windowSequence||0;
  let hits=0;for(const target of s.units.filter(alive))if(alive(target)&&grenadeAffects(s,point,target)){
    if(!detonateImpact(s,u,target,'torso',WEAPONS.grenade,impactEvent))hurt(s,target,Math.round(WEAPONS.grenade.damage*Math.max(.2,1-distance(target,point)/(p.blast+1))));hits++;
  }
  windowBlast(s,point,p.blast);
  log(s,`${u.name} threw a grenade (${p.cost} AP).`);
  for(const guard of s.units.filter(g=>g.team==='guard'&&alive(g)))if(distance(u,guard)<=WEAPONS.grenade.range*2){guard.alert=true;guard.lastKnown=rememberedPoint(u);guard.alertAge=0;}
  s.effect={sequence:[{shooter:u.id,ax:u.x,ay:u.y,bx:point.x,by:point.y,...(s.spatial?{ah:u.h,bh:point.h}:{}),hit:hits>0,weapon:'grenade',blast:p.blast,...impactEvent,windowSequences:windowReceipts(s,windowBefore),fireSequences:(s.fireAnimations||[]).filter(e=>e.sequence>fireBefore).map(e=>e.sequence)}]};
  refresh(s);return true;
}
export function previewAttack(s,a,b,burst=false,zone='torso',token=null,aimLevel='hip'){
  if(b?.ground)return previewPointAttack(s,a,b,burst,aimLevel);
  if(!alive(a)||!alive(b)||a.team===b.team)return {ok:false,reason:'Choose a living opponent'};
  if(a.weapon==='grenade'){if(!s.detected.has(b.id))return {ok:false,reason:'Target is not visible'};return {...previewGrenade(s,a,b),chance:100,rounds:1,cover:0};}
  const w=WEAPONS[a.weapon],aim=shotAim(w,aimLevel,burst),cost=aim.cost,d=distance(a,b),rounds=burst&&w.burstRounds?w.burstRounds:1,ballistic=!!w.mag&&!w.blast&&!w.incendiary;
  let reason='';
  if(a.team==='squad'&&!s.detected.has(b.id))reason='Target is not visible';
  else if(a.burningTurns)reason='On fire: running in panic';
  else if(!ballistic&&!lineClear(s,a,b)&&!w.arc)reason='Blocked by a wall';
  else if(d>w.range+EPS)reason='Out of range';
  else if(w.mag&&(a.ammo[a.weapon]??0)<rounds)reason='Reload first';
  else if((combatCosts(s)||a.team==='guard')&&a.ap+EPS<cost)reason='Not enough AP';
  const cover=s.spatial?providerFor(s).combat.cover(s,a,b):geometryNear(s,b,b,.9,'walk').some(box=>(box.kind==='crate'||box.cover)&&pointBoxDistance(b,box)<.9&&intersectsBox(a,b,{x0:box.x0-.3,x1:box.x1+.3,y0:box.y0-.3,y1:box.y1+.3}))?20:0;
  const aimChance=Math.round(Math.max(5,Math.min(95,weaponAccuracy(a)+(w.accuracy||0)-(w.rangeLoss||0)*d/w.range+(aim.accuracy||0)+(AIM_ZONES[zone]?.accuracy||0)-cover+(a.stance==='kneeling'?5:a.stance==='prone'?10:0))));
  const impact=ballistic&&d<=w.range+EPS?confirmedImpact(s,a,b,zone):null,exposed=!ballistic||impact?.unit?.id===b.id,breach=ballistic&&impact?.box?.kind==='glass';
  if(ballistic&&!exposed&&!breach&&!reason)reason=(AIM_ZONES[zone]?.label||'Aim point')+' is blocked by '+(impact?.unit?.name||'cover');
  const warning=breach?(rounds>1?'Glass intercepts the first shot; later burst rounds can reach the target.':'Glass intercepts this shot. It can break the pane, but cannot hit the target yet.') : '';
  return {ok:!reason,reason,cost,chance:exposed?aimChance:0,aimChance,rounds,distance:d,cover,exposed,breach,warning,...(breach?{chanceLabel:'FIRST-SHOT TARGET CHANCE'}:{})};
}

// AFT core/engine.js enemyTurn/fleeTurn uses this exact preferred zone order.
// Keep its exposed-zone policy, with a glass-breach fallback after clear shots.
export const GUARD_FIRE_ZONES=Object.freeze(['torso','head','legs','weapon']);
export function guardFireZone(s,guard,target){
  if(!canSee(s,guard,target))return null;
  let breach=null;
  for(const zone of GUARD_FIRE_ZONES){const preview=previewAttack(s,guard,target,false,zone);if(preview.ok&&preview.exposed)return zone;if(preview.ok&&preview.breach&&breach===null)breach=zone;}
  return breach;
}
function kill(s,u){const living=alive(u);u.hp=0;u.ap=0;u.casualty='dead';u.burningTurns=0;u.isMoving=false;interactionRules.registerBody(s,u);if(living)log(s,u.name+' is down.');}
function hurt(s,u,damage){if(!alive(u))return;u.hp=Math.max(0,u.hp-damageAfterResistance(u,damage));if(!u.hp)kill(s,u);}
function flameAffects(s,a,u,heading){
  if(s.spatial)return providerFor(s).combat.flameAffects(s,a,u,heading,WEAPONS.flamethrower.range);
  const angle=Math.abs(((headingTo(a,u)-heading+540)%360)-180);
  if(!alive(u)||u.id===a.id||distance(a,u)>WEAPONS.flamethrower.range||angle>=24)return false;
  const source=eyeHeight(a),heights=u.stance==='prone'?[.3,.42,.15]:u.stance==='kneeling'?[.75,1.15,.2]:[1.1,1.75,.5];
  const blockers=geometryNear(s,a,u,0,'air');
  // The recorded jet is horizontal at the operator's stance height. A lower
  // broken cell must not deal damage behind a still-clipped upper aim cone.
  if(blockers.some(box=>box.windowPart&&boxInterval(a,u,box)?.[1]>EPS&&!!airSpan(a,u,source,source,box)))return false;
  return heights.some(height=>!blockers.some(box=>{if(box.windowPart)return false;const span=boxInterval(a,u,box);return !!span&&span[1]>EPS&&span[0]<1-EPS&&!!airSpan(a,u,source,height,box);}));
}
const flameShape=(s,a,range)=>s.spatial?providerFor(s).combat.flameShape(s,a,range):recordFlame(a,range,geometryNear(s,a,a,range,'flame'),s.visible);
function resolveFlame(s,a,event={explosions:[]}){
  const impacts=[];
  for(const u of s.units)if(flameAffects(s,a,u,a.heading)){
    const before=u.hp,visible=s.visible.has(cellKey(s,u))&&(u.team==='squad'||s.detected.has(u.id));
    if(!detonateImpact(s,a,u,'torso',WEAPONS.flamethrower,event)){kill(s,u);recordBurn(s,u,'ash');}
    impacts.push({id:u.id,x:u.x,y:u.y,before,after:u.hp,dead:!alive(u),visible});
  }
  return impacts;
}
export function previewFlame(s,a,heading){
  const w=WEAPONS.flamethrower,valid=Number.isFinite(heading);let reason='';
  if(!canControl(s,a))reason='Wait for your turn';
  else if(a.weapon!=='flamethrower')reason='Equip the flamethrower';
  else if(!valid)reason='Choose a direction';
  else if(!(a.ammo.flamethrower>0))reason='Reload first';
  else if(a.ap+EPS<w.cost)reason='Not enough AP';
  const direction=valid?((heading%360)+360)%360:a.heading;
  const shape=flameShape(s,{...a,heading:direction},w.range);
  const contacts=s.units.filter(u=>(u.team==='squad'||s.detected.has(u.id))&&s.visible.has(cellKey(s,u))&&flameAffects(s,a,u,direction)).map(u=>({id:u.id,name:u.name,team:u.team}));
  return {ok:!reason,reason,cost:w.cost,range:w.range,spread:48,heading:direction,shape,contacts};
}
export function fireFlame(s,a,heading){
  const p=previewFlame(s,a,heading);if(!p.ok)return false;
  stop(s);if(s.phase!=='player'){s.engaged=true;refresh(s);}
  a.ap=Math.max(0,a.ap-p.cost);a.ammo.flamethrower--;syncAmmo(a,'flamethrower');a.heading=p.heading;
  const impactEvent={explosions:[]},fireBefore=s.fireAnimationSequence||0,windowBefore=s.windowSequence||0,flame=flameShape(s,a,p.range),impacts=resolveFlame(s,a,impactEvent),angle=a.heading*Math.PI/180;
  log(s,`${a.name} fired a flamethrower cone (${p.cost} AP).`);
  for(const guard of s.units.filter(u=>u.team==='guard'&&alive(u)))if(distance(a,guard)<=p.range*2){guard.alert=true;guard.lastKnown=rememberedPoint(a);guard.alertAge=0;}
  s.effect={sequence:[{shooter:a.id,ax:a.x,ay:a.y,bx:a.x+Math.cos(angle)*p.range,by:a.y+Math.sin(angle)*p.range,incendiary:true,hit:impacts.length>0,weapon:'flamethrower',shot:0,shots:1,flame,impacts,...impactEvent,windowSequences:windowReceipts(s,windowBefore),fireSequences:(s.fireAnimations||[]).filter(e=>e.sequence>fireBefore).map(e=>e.sequence)}]};
  refresh(s);return true;
}
function syncAmmo(unit,weapon){for(const item of unit.pack||[])if(item.type==='weapon'&&item.kind===weapon)item.rounds=unit.ammo[weapon]||0;}
function detonateImpact(s,shooter,victim,zone,weapon,event){
  if(!alive(victim))return false;
  const chance=weapon.mag?tankExplosionChance(victim,zone):0;
  if(chance>0&&random(s)<chance){(event.explosions??=[]).push(fuelRules.explode(s,victim));return true;}return false;
}
const windowReceipts=(s,before)=>(s.windowEvents||[]).filter(e=>e.sequence>before).map(e=>e.sequence);
function windowBlast(s,origin,radius,options={}){
  const events=windowSystem.blast(s,origin,radius,{occluded:(a,b)=>!lineClear(s,{...a,h:1.1},b),...options});
  if(events.length)geometryCache.delete(s);return events;
}
export function previewPointAttack(s,a,point,burst=false,aimLevel='hip'){
  const w=WEAPONS[a?.weapon],aim=w&&shotAim(w,aimLevel,burst),rounds=burst&&w?.burstRounds?w.burstRounds:1,d=point?distance(a,point):Infinity;
  const placed=point?.windowId!==undefined?windowSystem.compile(s).find(r=>r.placement.id===point.windowId):null,ceiling=placed?.spec.height??2;
  let reason='';
  if(!canControl(s,a))reason='Wait for your turn';
  else if(!point?.ground||point.windowId!==undefined&&!placed||![point.x,point.y,point.h].every(Number.isFinite)||point.h<0||point.h>ceiling||!insideWorld(s,point)||!s.seen.has(key(point.x,point.y)))reason='Choose a visible window';
  else if(!w||w.incendiary||a.weapon==='grenade')reason='Use the area weapon controls';
  else if(d>w.range+EPS)reason='Out of range';
  else if(w.mag&&(a.ammo[a.weapon]??0)<rounds)reason='Reload first';
  else if(combatCosts(s)&&a.ap+EPS<aim.cost)reason='Not enough AP';
  return {ok:!reason,reason,cost:aim?.cost??0,rounds,distance:d,cover:0,chance:Math.round(Math.max(5,Math.min(95,weaponAccuracy(a)+(w?.accuracy||0)-(w?.rangeLoss||0)*d/(w?.range||1)+(aim?.accuracy||0))))};
}
export function confirmedImpact(s,a,b,zone='torso'){
  if(s.spatial)return providerFor(s).combat.impact(s,a,b,zone);
  const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy,source=eyeHeight(a),height=bodyHeight;
  const end=b.ground?b.h:zone==='head'?height(b):zone==='legs'?height(b)*.25:height(b)*.62,dh=end-source;
  let blocked=1+EPS,obstacle=null;
  for(const box of geometryNear(s,a,b,0,'air')){
    const span=airSpan(a,b,source,end,box);if(span&&span[0]>EPS&&span[0]<blocked){blocked=span[0];obstacle={box,t:blocked,point:{x:a.x+dx*blocked,y:a.y+dy*blocked,h:source+dh*blocked}};}
  }
  return s.units.filter(u=>alive(u)&&u.id!==a.id).map(unit=>{
    const t=length2?((unit.x-a.x)*dx+(unit.y-a.y)*dy)/length2:1,h=source+dh*t;
    if(t<=0||t>1+EPS||t>blocked||h<0||h>height(unit)||Math.hypot(unit.x-a.x-dx*t,unit.y-a.y-dy*t)>RADIUS)return null;
    return {unit,t,zone:unit.id===b.id?zone:h>height(unit)*.8?'head':h<height(unit)*.32?'legs':'torso'};
  }).filter(Boolean).sort((a,b)=>a.t-b.t||a.unit.id-b.unit.id)[0]||obstacle;
}
export function attack(s,a,b,burst=false,byAI=false,zone='torso',reaction=false,aimLevel='hip'){
  if(byAI?s.phase!=='enemy'||!alive(a)||a.burningTurns:!canControl(s,a))return false;
  const p=previewAttack(s,a,b,burst,zone,null,aimLevel);if(!p.ok)return false;if(a.weapon==='grenade')return throwGrenade(s,a,b);
  stop(s);const weapon=a.weapon,w=WEAPONS[weapon];if(!byAI&&s.phase!=='player'){s.engaged=true;refresh(s);}
  a.ap=Math.max(0,a.ap-p.cost);a.heading=headingTo(a,b);
  const hp=b.hp??0,sequence=[];let hits=0;
  for(let round=0;round<p.rounds&&alive(a)&&!a.burningTurns;round++){
    if(w.mag&&!(a.ammo[weapon]>0))break;if(w.mag){a.ammo[weapon]--;syncAmmo(a,weapon);}
    const fireBefore=s.fireAnimationSequence||0,windowBefore=s.windowSequence||0,event={shooter:a.id,target:b.id,zone,ax:a.x,ay:a.y,bx:b.x,by:b.y,...(s.spatial?{ah:a.h,bh:b.h+bodyHeight(b)*.62}:{}),incendiary:w.incendiary,hit:false,weapon,shot:round,explosions:[]};sequence.push(event);
    if(w.incendiary){event.flame=flameShape(s,a,w.range);event.impacts=resolveFlame(s,a,event);event.hit=event.impacts.length>0;}
    else if(w.blast){
      const impact=confirmedImpact(s,a,b,zone),origin=s.spatial?impact?.point||b:impact?.box?.windowPart?impact.point:b;event.bx=origin.x;event.by=origin.y;if(s.spatial)event.bh=origin.h;
      for(const victim of s.units.filter(alive))if(alive(victim)&&(s.spatial?providerFor(s).combat.blastAffects(s,origin,victim,w.blast):distance(victim,origin)<=w.blast&&lineClear(s,origin,victim))){if(!detonateImpact(s,a,victim,'torso',w,event))hurt(s,victim,Math.round(w.damage*Math.max(.2,1-distance(victim,origin)/(w.blast+1))));event.hit=true;}
      windowBlast(s,origin,w.blast);
    }else{
      const rolledHit=random(s)*100<(p.aimChance??p.chance),impact=rolledHit?(w.mag||s.windows?.length?confirmedImpact(s,a,b,zone):alive(b)?{unit:b,zone}:null):null;
      if(impact?.box){event.bx=impact.point.x;event.by=impact.point.y;event.bh=impact.point.h;
        if(impact.box.kind==='glass'){const record=windowSystem.compile(s).find(r=>r.placement.id===impact.box.windowId),local=windowToLocal(record.placement,{...a,h:eyeHeight(a)});
          const broken=windowSystem.breakPane(s,impact.box.windowId,impact.box.paneId,impact.point,{cause:w.mag?'bullet':'melee',direction:local[2]<0?1:-1});if(broken){geometryCache.delete(s);event.glass=true;}
        }
      }else if(impact?.unit){const victim=impact.unit;event.hit=true;event.impact={unitId:victim.id,zone:impact.zone};event.bx=victim.x;event.by=victim.y;if(s.spatial)event.bh=impact.point?.h??victim.h+bodyHeight(victim)*.62;
        if(!detonateImpact(s,a,victim,impact.zone,w,event))hurt(s,victim,Math.round((w.pellets?w.damage*w.pellets*.48:w.damage)*(AIM_ZONES[impact.zone]?.damage||1)));
      }
    }
    event.windowSequences=windowReceipts(s,windowBefore);event.fireSequences=(s.fireAnimations||[]).filter(e=>e.sequence>fireBefore).map(e=>e.sequence);if(event.hit)hits++;
  }
  for(const event of sequence)event.shots=sequence.length;
  log(s,`${a.name} → ${b.name||'window'}: ${b.ground?sequence.some(e=>e.glass)?'glass broken':'shot':hits?Math.round(hp-b.hp)+' damage':'miss'} (${p.chance}%).`);
  for(const g of s.units.filter(g=>g.team==='guard'&&alive(g)))if(distance(a,g)<=w.range*2){g.alert=true;g.lastKnown=rememberedPoint(a);g.alertAge=0;}
  s.effect={sequence,cost:p.cost};refresh(s);return true;
}
export function equip(s,u,id){if(!canControl(s,u)||!u.pack.some(i=>i.kind===id)||u.weapon===id)return false;const cost=combatCosts(s)?u.slots.includes(id)?2:3:0;if(u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.weapon=id;log(s,'Equipped '+WEAPONS[id].name+'.');return true;}
export function reload(s,u){if(!canControl(s,u))return false;const w=WEAPONS[u.weapon],count=Math.min(w.mag-(u.ammo[u.weapon]??0),u.ammoPouch[u.weapon]||0),cost=combatCosts(s)?3:0;if(!count||u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.ammo[u.weapon]+=count;u.ammoPouch[u.weapon]-=count;syncAmmo(u,u.weapon);log(s,'Reloaded '+count+' rounds.');return true;}
export function endTurn(s){if(s.phase!=='player'||s.solo.status!=='active'||s.spatial&&providerFor(s).isMoving(s))return false;stop(s);for(const unit of s.units)fireRules.panicRun(s,unit);s.phase='enemy';s.enemyIndex=1;s.enemyDelay=.35;s.engaged=false;for(const g of s.units.filter(g=>g.team==='guard'))g.ap=g.burningTurns?0:g.maxAp;guardAwareness.round(s);s.revision++;return true;}
// A guard within ARRIVED of its last waypoint has arrived. A route can also open at
// its own grid node, inside that distance; it walks on to the next waypoint
// instead of ending its turn there.
const ARRIVED=.08;
function enemyStep(s,dt){
  const u=hero(s),g=s.units[s.enemyIndex];
  if(!g){const retry=guardCoordination.retry(s);if(retry!==null){s.enemyIndex=retry;s.enemyDelay=.15;return;}guardCoordination.settle(s);fireRules.finishRound(s);s.round++;s.panicDelay=3;u.ap=alive(u)&&!u.burningTurns?u.maxAp:0;u.stamina=Math.min(u.maxStamina,u.stamina+10);s.phase='player';refresh(s);return;}
  if(!alive(g)||g.burningTurns||!g.alert&&!g.yieldRequest&&!['searching','standdown'].includes(guardState(g))||g.ap<.02){g.isMoving=false;s.enemyIndex++;s.enemyDelay=.15;return;}
  s.enemyDelay-=dt;if(s.enemyDelay>0)return;
  if(guardCoordination.step(s,g,dt))return;
  if(!g.alert&&guardAwareness.step(s,g,dt)){if(g.ap<.02||guardState(g)==='rest')g.ap=0;return;}
  const zone=guardFireZone(s,g,u);if(zone){attack(s,g,u,false,true,zone);s.enemyDelay=.6;return;}
  if(g.ammo[g.weapon]===0&&g.ap>=3){const count=Math.min(WEAPONS[g.weapon].mag,g.ammoPouch[g.weapon]||0);if(count){g.ammo[g.weapon]=count;g.ammoPouch[g.weapon]-=count;g.ap-=3;s.enemyDelay=.4;return;}}
  if(g.ap<WEAPONS[g.weapon].cost&&canSee(s,g,u)&&distance(g,u)<=WEAPONS[g.weapon].range){g.ap=0;return;}
  const path=g.lastKnown?approachPath(s,g,g.lastKnown):null,next=path?.length>1&&distance(g,path[0])<ARRIVED?path[1]:path?.[0];
  if(!next){if(!path&&guardCoordination.request(s,g,g.lastKnown)){g.isMoving=false;s.enemyIndex++;s.enemyDelay=.15;}else g.ap=0;return;}
  const d=distance(g,next);if(d<ARRIVED){g.ap=0;return;}const step=Math.min(d,movementSpeed(g)*dt);if(!travel(s,g,(next.x-g.x)/d*step,(next.y-g.y)/d*step,{enemy:true,distanceBudget:step}))g.ap=0;
}
export function tick(s,dt=1/60,input=null){if(s.solo.status!=='active')return false;dt=Math.max(0,Math.min(.05,dt));s.elapsed+=dt;if(s.spatial&&providerFor(s).tick(s,dt)){refresh(s,{forceFog:!providerFor(s).isMoving(s)});return true;}for(const u of s.units)u.isMoving=false;if(s.phase==='enemy'){enemyStep(s,dt);return true;}if(['explore','won'].includes(s.phase))guardAwareness.explore(s,dt);const u=hero(s);if(u.burningTurns){refresh(s);if(s.phase==='player'){s.panicDelay=Math.max(0,(s.panicDelay??3)-dt);if(!s.panicDelay)endTurn(s);}return true;}walkWhenExhausted(s,u);if(input&&Math.hypot(input.x,input.y)>.1){if(s.spatial)providerFor(s).navigation?.cancel(s);s.queue=[];const n=Math.max(1,Math.hypot(input.x,input.y));travel(s,u,input.x/n*movementSpeed(u)*dt,input.y/n*movementSpeed(u)*dt);}else if(s.queue.length){const p=s.queue[0],d=distance(u,p);if(d<.025)s.queue.shift();else{const step=Math.min(d,movementSpeed(u)*dt),moved=travel(s,u,(p.x-u.x)/d*step,(p.y-u.y)/d*step,{distanceBudget:step});if(!moved||s.phase==='player'&&u.ap<EPS)s.queue=[];}}else if(s.phase==='explore'||s.phase==='won')u.stamina=Math.min(u.maxStamina,u.stamina+dt*2);return true;}
const fireRules=createFireRules({kill,walkSegment,random,key,log});
const fuelRules=createFuelRules({kill,ignite:fireRules.ignite,recordBurn,inside:insideWorld,log,windowBlast});
const guardAwareness=createGuardAwareness({alive,point:rememberedPoint,distance,sees:(s,g)=>canSee(s,g,hero(s))?hero(s):null,free:freePoint,path:(s,g,p)=>navigationPath(s,g,p.x,p.y,p,{nodeLimit:128}),travel,speed:movementSpeed,refresh});
const guardCoordination=createGuardCoordination({alive,distance,point:rememberedPoint,approach:approachPath,free:freePoint,walk:walkSegment,travel,speed:movementSpeed,shadow:(s,b,p)=>{
  const shadow={...s,units:s.units.flatMap(u=>u!==b?[u]:p?[{...u,...p}]:[])};
  if(geometryCache.has(s))geometryCache.set(shadow,geometryCache.get(s));return shadow;
}});
export const ignite=(s,u)=>{const result=fireRules.ignite(s,u);if(result)refresh(s);return result;};
export const enterFire=(s,u)=>{const result=fireRules.enterFire(s,u);if(result)refresh(s);return result;};
const interactionRules=createInteractionSystem({hero,canControl,combatCosts,distance,geometry,spatial:providerFor,blocksWalking,pointBoxDistance,refresh,stop,log,clearGeometry:s=>geometryCache.delete(s),weapons:WEAPONS,radius:RADIUS});
export const interactionObjects=s=>interactionRules.objects(s);
export const nearbyInteractions=s=>interactionRules.nearby(s);
export const previewInteraction=(s,id,action,itemId)=>interactionRules.preview(s,id,action,itemId);
export const performInteraction=(s,id,action,itemId)=>interactionRules.perform(s,id,action,itemId);
// Existing mission/menu callers use the same validated actions as the hand.
export function interaction(s){const mission=missionForState(s),object=nearbyInteractions(s).find(object=>['ledger','objective','extract'].includes(object.kind));if(!object)return null;return {...object.actions[0],kind:object.kind,label:object.kind==='extract'?mission.extraction.label:'Take the '+mission.objective.name.toLowerCase()};}
export function interact(s){const secured=objectiveSecured(s);return performInteraction(s,secured?'extraction':missionForState(s).objective.id,secured?'extract':'collect').ok;}
export function dressing(s){const u=hero(s),cost=combatCosts(s)?3:0;if(!canControl(s,u)||s.solo.dressings<1||u.hp>=u.maxHp||u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.hp=Math.min(u.maxHp,u.hp+35);s.solo.dressings--;log(s,u.name+' used a field dressing (+35 HP).');return true;}
export function encodeSave(s){return JSON.stringify(s,(k,v)=>['effect','fireAnimations','windowEvents'].includes(k)?undefined:v instanceof Set?{$set:[...v]}:v);}
export function decodeSave(text){
  const s=JSON.parse(text,(_,v)=>v&&Array.isArray(v.$set)?new Set(v.$set):v);
  if(s?.solo?.version!==2||!validBuild(s.solo.build)||!Array.isArray(s.units)||s.units.filter(u=>u?.team==='squad').length!==1||!['active','extracted','lost'].includes(s.solo.status)||!['visible','seen','detected'].every(k=>s[k] instanceof Set))throw Error('Unsupported solo save.');
  const mission=missionForState(s);s.solo.missionId=mission.id;
  if(s.solo.authoredMap&&mission.id!==WINDOW_REVIEW_ID)throw Error('Unsupported authored operation save.');
  const map=s.solo.authoredMap?adaptAftSector(s.solo.authoredMap):missionMap(mission.id,mission.layoutVersion??1),{width,height}=gridDimensions(map),canonical={map:map.terrain,worldBounds:map.worldBounds};
  if(!map.spatialProvider&&s.spatial)throw Error('Unexpected spatial save.');
  const provider=map.spatialProvider?restoreColdwellBase(s,map):null;
  if(!Array.isArray(s.map)||s.map.length!==height||s.map.some(row=>!Array.isArray(row)||row.length!==width)||s.units.some(u=>!u||!insideWorld(canonical,u)||!Number.isFinite(u.hp)||!Number.isFinite(u.ap)||u.lastKnown&&!insideWorld(canonical,u.lastKnown)))throw Error('Unsupported solo save.');
  if(s.fogAt&&!insideWorld(canonical,s.fogAt))throw Error('Unsupported visibility save.');
  const validCell=value=>{if(typeof value!=='string')return false;let cell=value;if(provider){const parts=value.split('@');if(parts.length!==2||!provider.floorById.has(parts[0]))return false;cell=parts[1];}if(!/^\d+,\d+$/.test(cell))return false;const [x,y]=cell.split(',').map(Number);return x<width&&y<height&&insideWorld(canonical,{x,y});};
  if(['visible','seen'].some(name=>[...s[name]].some(value=>!validCell(value)))||[...s.detected].some(id=>!s.units.some(u=>u.id===id)))throw Error('Unsupported visibility save.');
  if(!provider&&(!s.edges||typeof s.edges!=='object'||Array.isArray(s.edges)||Object.entries(s.edges).some(([edge,kind])=>{const match=/^[es]:(\d+):(\d+)$/.exec(edge);return !match||+match[1]>=width||+match[2]>=height||!['wall','door','closed-door'].includes(kind); })))throw Error('Unsupported geometry save.');
  if(s.queue===undefined)s.queue=[];
  if(!Array.isArray(s.queue)||s.queue.some(p=>!p||!insideWorld(canonical,p,RADIUS)||!Number.isFinite(p.cost)||p.cost<0))throw Error('Unsupported movement save.');
  if(Array.isArray(s.interactables)&&s.interactables.some(object=>object?.kind!=='body'&&(!object||!insideWorld(canonical,object))))throw Error('Unsupported object save.');
  // Saved terrain/door state remains played state. Imported immutable scenery
  // is always rebuilt from the mission, never trusted from a save or a window.
  mapMetadata(s,map);windowSystem.restore(s);
  if(s.solo.objectives===undefined)s.solo.objectives={};
  if(!s.solo.objectives||typeof s.solo.objectives!=='object'||Array.isArray(s.solo.objectives)||Object.entries(s.solo.objectives).some(([id,value])=>id!==mission.objective.id||typeof value!=='boolean'))throw Error('Unsupported objective save.');
  if(mission.id===DEFAULT_MISSION_ID&&s.solo.ledger)s.solo.objectives.ledger=true;
  if(s.solo.inspected===undefined)s.solo.inspected=[];
  if(!Array.isArray(s.solo.inspected)||s.solo.inspected.some(id=>!mission.clues.some(clue=>clue.id===id)))throw Error('Unsupported inspection save.');
  fireRules.restore(s,p=>insideWorld(canonical,p));fuelRules.restore(s);
  interactionRules.restore(s);
  guardCoordination.restore(s,p=>insideWorld(canonical,p,RADIUS));
  guardAwareness.restore(s,p=>insideWorld(canonical,p)&&(!provider||Number.isFinite(p.h)&&provider.floorById.has(p.floorId)),s.solo.authoredMap?.guards||mission.guards);
  return provider?validateColdwellObjects(s,mission):releaseFromScenery(s);
}
// The nearest spot around p (never p itself) where a unit could stand, scanned
// outward in 5 cm rings of 32 bearings; null beyond maxRadius metres.
function nearestStanding(s,p,ignoreId,maxRadius){
  for(let ring=1;ring*.05<=maxRadius+EPS;ring++){const r=ring*.05;for(let i=0;i<32;i++){const a=i/32*Math.PI*2,q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};if(freePoint(s,q,ignoreId))return q;}}
  return null;
}
// Approach goals are remembered ground points: retain standing sight, independent
// of the quarry's current stance. Window heads/sills block only at their actual
// height; ordinary walls keep the existing opaque footprint rule.
function standingWallHit(a,b,box){return intersectsBox(a,b,box)&&(!box.windowPart||!!airSpan(a,b,STANDING_EYE,STANDING_EYE,box));}
// Expand footprints by ARRIVED without stretching a window member vertically.
// The 8 cm horizontal stopping margin still protects a goal's standing view.
function wideSight(s,a,b,margin){return !geometryNear(s,a,b,margin,'wall').some(box=>standingWallHit(a,b,{...box,x0:box.x0-margin,x1:box.x1+margin,y0:box.y0-margin,y1:box.y1+margin}));}
// A guard closing on its quarry stops 0.75 m short of it. With a straight walk to
// that spot, and a clear line from it to the quarry, it walks straight there.
// Otherwise one search takes it to the nearest node, by walking distance, that
// stands within QUARRY_REACH of the quarry and sees it past the walls; from there
// the straight walk usually opens. The goal set depends on the quarry and the
// scenery alone, not on where the guard stands, so a step cannot flip the plan, and
// no single solid or cut-off spot can freeze the guard. Sight is tested with walls
// grown by ARRIVED, so it holds wherever the guard stops. Nothing is held between
// ticks: a resumed save plans exactly the same route.
export const QUARRY_REACH=2;
const SEALED_BUDGET=128;
// A last-seen point inside scenery (a door shut over it, a leaf swung onto it, a prop
// an old save predates) is no spot an animal could stand on, and close to it nothing
// can see it. Its stand-ins are clear points that would see it but for what covers it
// (the boxes within a body's radius of it), scanned in 5 cm rings (32 bearings) out to
// 0.7 m beyond the first ring that has one (a shut door's clearance is 0.62 m across,
// so the far side is always reached) and at most 1.5 m: one for each group of them
// that see one another past the walls, the innermost of each. A shut door gets one on
// each side, an open leaf one on each face, and nothing behind a wall gets one. The
// search takes goals round every stand-in, so a guard walks to whichever side of a
// shut door it reaches first. Units are left out, so nobody's body pushes a stand-in
// away, and the stand-ins depend on the point and the scenery alone; they are kept
// per geometry.
export function standIns(s,p){
  if(freePoint(s,p,null,{units:false}))return [p];
  const grid=sceneryGrid(s),k=`${p.x},${p.y}`;if(grid.standIns.has(k))return grid.standIns.get(k);
  const cover=new Set(geometryNear(s,p,p,RADIUS,'walk').filter(box=>pointBoxDistance(p,box)<RADIUS-EPS));
  const seesPast=q=>!geometryNear(s,p,q,0,'wall').some(box=>!cover.has(box)&&standingWallHit(p,q,box));
  let clear=[];
  for(let ring=1,last=30;ring<=last;ring++){
    for(let i=0;i<32;i++){const a=i/32*Math.PI*2,q={x:p.x+Math.cos(a)*ring*.05,y:p.y+Math.sin(a)*ring*.05};if(freePoint(s,q,null,{units:false})&&seesPast(q))clear.push(q);}
    if(clear.length&&last===30)last=Math.min(30,ring+14);
  }
  const stands=[],sees=(a,b)=>lineClear(s,{...a,stance:'standing'},{...b,stance:'standing'});
  while(clear.length){const q=clear[0];stands.push(q);clear=clear.filter(r=>!sees(r,q));}
  grid.standIns.set(k,Object.freeze(stands));return stands;
}
// The nodes a guard's search starts from: normally the nearest node it can walk
// straight to. A route smoothed along a wall can cross a strip so narrow that no node
// is a straight walk from it (Short Measure has one, between the ration room's south
// wall and the sealed-load-arrival prop). A guard standing in one may leave along any
// of 32 bearings: on each, the first point 10-150 cm out from which a node is a
// straight walk starts the search at the cost of walking there and on to the node, so
// the guard leaves by the way that is shortest to walk, as it takes a door's side.
function searchStarts(s,g){
  const node=gridNodesAround(s,g,g)[0];if(node)return [{...node,cost:0}];
  const starts=new Map();
  for(let i=0;i<32;i++){
    const a=i/32*Math.PI*2;
    for(let ring=2;ring<=30;ring++){
      const q={x:g.x+Math.cos(a)*ring*.05,y:g.y+Math.sin(a)*ring*.05};
      if(!freePoint(s,q,g.id)||!walkSegment(s,g,q,g.id))break;
      const node=gridNodesAround(s,g,q)[0];if(!node)continue;
      const k=key(node.x,node.y),cost=distance(g,q)+distance(q,node);
      if(!(starts.get(k)?.cost<=cost))starts.set(k,{...node,cost,via:q});
      break;
    }
  }
  return [...starts.values()];
}
export function approachPath(s,g,lastSeen){
  if(s.spatial)return providerFor(s).approachPath(s,g,lastSeen,{rate:movementRate(g)});
  const quarries=standIns(s,lastSeen);if(!quarries.length)return null;
  // The straight walk tries the stand-ins nearest first; the search weighs them all.
  for(const quarry of [...quarries].sort((a,b)=>distance(a,g)-distance(b,g))){
    const range=distance(g,quarry),offset=Math.min(.75,range),aim={x:quarry.x-(quarry.x-g.x)/Math.max(range,.001)*offset,y:quarry.y-(quarry.y-g.y)/Math.max(range,.001)*offset};
    if(wideSight(s,aim,quarry,ARRIVED)&&freePoint(s,aim,g.id)&&walkSegment(s,g,aim,g.id))return [{...aim,z:0,cost:distance(g,aim)*movementRate(g)}];
  }
  const goals=[],taken=new Set(),grid=sceneryGrid(s);
  const reach=QUARRY_REACH+EPS;
  for(const q of quarries)for(let y=Math.ceil(q.y-reach);y<=q.y+reach;y++)for(let x=Math.ceil(q.x-reach);x<=q.x+reach;x++){const p={x,y},pk=key(x,y);if(!taken.has(pk)&&distance(p,q)<=reach&&nodeClear(s,grid,p,g.id)&&wideSight(s,p,q,ARRIVED)){taken.add(pk);goals.push(p);}}
  const starts=goals.length?searchStarts(s,g):[];if(!starts.length)return null;
  // A quarry behind closed doors sits in a small pocket: after SEALED_CHECK nodes
  // without reaching it, flood back from its goals, and when that flood runs dry
  // within SEALED_BUDGET nodes without meeting the guard's search, stop there
  // instead of searching the rest of the map every round.
  const goalKeys=new Set(goals.map(p=>key(p.x,p.y))),sealed=reached=>{
    const seen=new Set(goalKeys),queue=[...goals];
    for(let i=0;i<queue.length;i++){
      const p=queue[i];if(reached.has(key(p.x,p.y)))return false;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const q={x:p.x+dx,y:p.y+dy},qk=key(q.x,q.y);if((!dx&&!dy)||seen.has(qk)||!nodeClear(s,grid,q,g.id)||!linkClear(s,grid,q,p,g.id))continue;
        seen.add(qk);queue.push(q);if(queue.length>SEALED_BUDGET)return false;
      }
    }
    return true;
  };
  const estimate=quarries.length===1?q=>Math.max(0,distance(q,quarries[0])-QUARRY_REACH):q=>Math.min(...quarries.map(c=>Math.max(0,distance(q,c)-QUARRY_REACH)));
  const raw=gridSearch(s,g,starts,(p,pk)=>goalKeys.has(pk),estimate,sealed);if(!raw)return null;
  const via=starts.find(p=>p.x===raw[0].x&&p.y===raw[0].y).via;
  return smoothRoute(s,g,via?[via,...raw]:raw);
}
// A save written before a prop became solid may store a living animal inside it
// (Short Measure's ration scale stands where its clue marker once had no
// collision). Such a unit moves to the nearest clear point, scanned outward in
// 5 cm rings; every other played position is kept exactly.
function releaseFromScenery(s){
  for(const u of s.units){
    if(!alive(u)||freePoint(s,u,u.id,{units:false}))continue;
    const best=nearestStanding(s,u,u.id,3);
    if(!best)continue;
    u.x=best.x;u.y=best.y;u.isMoving=false;
    if(u.team==='squad')s.queue=[];
  }
  return s;
}
export const Core={tankExplosionChance,ignite,enterFire,WEAPONS,AIM_ZONES,key,cellKey,visibleCells,alive,movementModeOf,movementRate,movementSpeed,combatCosts,canControl,canSee,visibleOpponents,refresh,log,stop,travel,navigationPath,requestNavigationPath,acceptNavigationPath,navigationStatus,disposeNavigation,move,turnTo,setMovementMode,setStance,grenadeCost,grenadeTrajectory,grenadeAffects,grenadeBlastFootprint,previewGrenade,throwGrenade,previewFlame,fireFlame,previewPointAttack,previewAttack,attack,equip,reload,endTurn,headingTo,interactionObjects,nearbyInteractions,previewInteraction,performInteraction};
