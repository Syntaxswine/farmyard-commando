import {WEAPONS,AIM_ZONES} from './aft/tactics/solo-weapon-data.js';
import {initializeStats,weaponAccuracy,damageAfterResistance} from './aft/tactics/character-stats.js';
import {QUICKPLAY_PRESETS} from './aft/tactics/quickplay-presets.js';
import {identifyRange,headingTo} from './aft/tactics/core/perception.js';
import {shotAim} from './aft/tactics/aim-levels.js';
import {WALL_DIMENSIONS} from './world-dimensions.js';
import {createInteractionSystem,missionInteractables,interactionFootprint} from './interactions.js';
import {recordFlame} from './flame-event.js';
import {gridDimensions,worldBounds} from './world-grid.js';
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
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const key=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
export const hero=s=>s.units.find(u=>u.team==='squad');
export const alive=u=>!!u&&u.hp>0;
export const movementModeOf=u=>u.sneaking?'sneak':u.running?'run':'walk';
export const movementRate=u=>(u.stance==='prone'?8:u.stance==='kneeling'?4:2)*(u.running?.5:u.sneaking?1.5:1);
export const movementSpeed=u=>(u.stance==='prone'?.9:u.stance==='kneeling'?1.8:3.6)*(u.running?2:u.sneaking?.5:1);
export const combatCosts=s=>['player','enemy'].includes(s.phase)||s.units.some(g=>g.team==='guard'&&alive(g)&&g.alert);
export const canControl=(s,u)=>alive(u)&&u.team==='squad'&&['explore','player','won'].includes(s.phase)&&s.solo.status==='active';
export function validBuild(b){return !!b&&ANIMALS.some(a=>a.id===b.animal)&&PRIMARY.includes(b.primary)&&SECONDARY.includes(b.secondary)&&UTILITIES.includes(b.utility);}
export function normalizeBuild(b){return validBuild(b)?{animal:b.animal,primary:b.primary,secondary:b.secondary,utility:b.utility}:{...DEFAULT_BUILD};}
export function buildStats(b){const p=ANIMALS.find(a=>a.id===b.animal),u={team:'squad',name:p.name};initializeStats(u,p.stats);return u;}
export function log(s,message){s.log.unshift(message);s.log=s.log.slice(0,35);s.revision++;}
function makeUnit(id,team,name,species,weapon,x,y,heading,stats){const u={id,team,name,species,weapon,x,y,z:0,heading,stance:'standing',running:false,sneaking:false,travelled:0,isMoving:false,alert:false,lastKnown:null,alertAge:0,slots:[weapon],pack:[],ammo:{[weapon]:WEAPONS[weapon].mag},ammoPouch:{[weapon]:WEAPONS[weapon].mag*3}};initializeStats(u,stats);return u;}
function mapMetadata(state,map){
  // Mission scenery belongs to the full world, regardless of render residency.
  for(const name of ['props','obstacles','worldBounds','groundPalette']){
    if(map[name]===undefined)delete state[name];
    else state[name]=structuredClone(map[name]);
  }
}
export function createSoloGame(build=DEFAULT_BUILD,seed=1947,missionId=DEFAULT_MISSION_ID,{layoutVersion}={}){
  if(!validBuild(build))throw Error('Choose a valid animal and loadout.');
  const mission=getMission(missionId,layoutVersion),p=ANIMALS.find(a=>a.id===build.animal),m=missionMap(mission.id,mission.layoutVersion??1),u=makeUnit(0,'squad',p.name,p.species,build.primary,mission.spawn.x,mission.spawn.y,mission.spawn.heading,p.stats);
  u.slots=[build.primary,build.secondary];const kinds=[...u.slots,...(build.utility==='grenade'?['grenade']:[])];
  u.ammo=Object.fromEntries(kinds.map(k=>[k,WEAPONS[k].mag]));u.pack=kinds.map(kind=>({type:'weapon',kind,rounds:u.ammo[kind],condition:100}));if(build.secondary==='pistol')u.ammoPouch.pistol=24;
  const stats={strength:10,endurance:20,agility:22,firearms:35,perception:35,dexterity:35};
  const units=[u,...mission.guards.map((g,i)=>makeUnit(i+1,'guard',g.name,g.species,g.weapon,g.x,g.y,g.heading,stats))];
  if(mission.fallen){const f=mission.fallen,fallen=makeUnit(units.length,'guard',f.name,f.species,f.weapon,f.x,f.y,f.heading,stats);fallen.hp=0;fallen.casualty='dead';units.push(fallen);}
  const s={map:m.terrain,edges:m.edges,units,interactables:missionInteractables({missionId:mission.id,layoutVersion:mission.layoutVersion??1}),phase:'explore',round:0,selected:0,visible:new Set(),seen:new Set(),detected:new Set(),log:[],seed,revision:0,queue:[],enemyIndex:1,enemyDelay:0,elapsed:0,solo:{version:2,missionId:mission.id,layoutVersion:mission.layoutVersion??1,build:{...build},objectives:{},inspected:[],ledger:false,status:'active',dressings:build.utility==='dressing'?2:0,distance:0,apDistance:0}};
  mapMetadata(s,m);interactionRules.restore(s);refresh(s);log(s,mission.briefing);return s;
}
const geometryCache=new WeakMap(),GEOMETRY_BUCKET=8;
export function geometry(s){
  if(geometryCache.has(s))return geometryCache.get(s).boxes;const boxes=[];
  for(const [k,kind] of Object.entries(s.edges)){
    if(kind==='door')continue;const [axis,xs,ys]=k.split(':'),x=+xs+(axis==='e'?.5:0),y=+ys+(axis==='s'?.5:0);
    const hx=(axis==='e'?WALL_DIMENSIONS.thickness:WALL_DIMENSIONS.length)/2,hy=(axis==='s'?WALL_DIMENSIONS.thickness:WALL_DIMENSIONS.length)/2;
    const interactionId=s.interactables?.find(object=>object.kind==='door'&&object.edge===k)?.id;
    boxes.push({x0:x-hx,x1:x+hx,y0:y-hy,y1:y+hy,height:WALL_DIMENSIONS.height,kind:'wall',...(interactionId?{interactionId}:{})});
  }
  const cargo=missionForState(s).cover.filter(p=>s.interactables?.some(object=>object.kind==='clue'&&object.id===p.id));
  const {width,height}=gridDimensions(s);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(s.map[y][x]==='crate'){
    const placement=cargo.find(({rect:[cx,cy,w,h]})=>x>=cx&&x<cx+w&&y>=cy&&y<cy+h);
    boxes.push({x0:x-.48,x1:x+.48,y0:y-.48,y1:y+.48,height:.92,kind:'crate',...(placement?{interactionId:placement.id}:{})});
  }
  for(const box of s.obstacles||[])boxes.push({...box});
  for(const object of s.interactables||[])if(object.kind==='chest'||object.kind==='door'&&object.open)boxes.push({...interactionFootprint(object),kind:object.kind==='door'?'wall':'crate',interactionId:object.id});
  const buckets=new Map();
  for(const box of boxes)for(let y=Math.floor(box.y0/GEOMETRY_BUCKET);y<=Math.floor(box.y1/GEOMETRY_BUCKET);y++)for(let x=Math.floor(box.x0/GEOMETRY_BUCKET);x<=Math.floor(box.x1/GEOMETRY_BUCKET);x++){
    const id=`${x},${y}`;if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(box);
  }
  geometryCache.set(s,{boxes,buckets});return boxes;
}
// Broad phase shared by movement, sight, silhouettes and area weapons. The
// interaction system invalidates this cache immediately after a door changes.
export function geometryNear(s,a,b=a,padding=0){
  if(![a.x,a.y,b.x,b.y,padding].every(Number.isFinite)||padding<0)return [];
  geometry(s);const {buckets}=geometryCache.get(s),boxes=new Set();
  const x0=Math.min(a.x,b.x)-padding,x1=Math.max(a.x,b.x)+padding,y0=Math.min(a.y,b.y)-padding,y1=Math.max(a.y,b.y)+padding;
  for(let y=Math.floor(y0/GEOMETRY_BUCKET);y<=Math.floor(y1/GEOMETRY_BUCKET);y++)for(let x=Math.floor(x0/GEOMETRY_BUCKET);x<=Math.floor(x1/GEOMETRY_BUCKET);x++)for(const box of buckets.get(`${x},${y}`)||[])if(box.x1>=x0&&box.x0<=x1&&box.y1>=y0&&box.y0<=y1)boxes.add(box);
  return [...boxes];
}
const pointBoxDistance=(p,b)=>Math.hypot(Math.max(b.x0-p.x,0,p.x-b.x1),Math.max(b.y0-p.y,0,p.y-b.y1));
function insideWorld(s,p,padding=0){const b=worldBounds(s);return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.x-.5+padding&&p.x<=b.x+b.w-.5-padding&&p.y>=b.y-.5+padding&&p.y<=b.y+b.h-.5-padding;}
export function freePoint(s,p,ignoreId=null,{units=true,radius=RADIUS}={}){if(!insideWorld(s,p,radius))return false;if(geometryNear(s,p,p,radius).some(b=>pointBoxDistance(p,b)<radius-EPS))return false;return !units||!s.units.some(u=>alive(u)&&u.id!==ignoreId&&distance(u,p)<RADIUS+radius-EPS);}
function boxInterval(a,b,box){let lo=0,hi=1;for(const [k,min,max] of [['x',box.x0,box.x1],['y',box.y0,box.y1]]){const d=b[k]-a[k];if(Math.abs(d)<EPS){if(a[k]<min||a[k]>max)return null;continue;}const t0=(min-a[k])/d,t1=(max-a[k])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;}return [lo,hi];}
function intersectsBox(a,b,box){const span=boxInterval(a,b,box);return !!span&&span[1]>EPS&&span[0]<1-EPS;}
export function lineClear(s,a,b){return [a.x,a.y,b.x,b.y].every(Number.isFinite)&&!geometryNear(s,a,b).some(box=>(box.kind==='wall'||a.stance==='prone'&&b.stance==='prone')&&intersectsBox(a,b,box));}
export function walkSegment(s,a,b,ignoreId=null){
  if(!insideWorld(s,b,RADIUS))return false;
  const blockers=geometryNear(s,a,b,RADIUS),units=s.units.filter(u=>alive(u)&&u.id!==ignoreId),steps=Math.max(1,Math.ceil(distance(a,b)/.1));
  for(let i=1;i<=steps;i++){
    const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};
    if(!insideWorld(s,p,RADIUS)||blockers.some(box=>pointBoxDistance(p,box)<RADIUS-EPS)||units.some(u=>distance(u,p)<2*RADIUS-EPS))return false;
  }
  return true;
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
      return !geometryNear(s,u,p).some(box=>intersectsBox(u,p,box));
    }).length/5;
    const clarity=(.5+exposed*.5)*identifyRange(u,g,35)/35*(g.sneaking?.7:1);
    return {unit:g,distance:d,score:d/Math.max(.01,clarity)};
  }).sort((a,b)=>a.score-b.score||a.distance-b.distance||a.unit.id-b.unit.id).map(contact=>contact.unit);
}
function visibility(s){
  const u=hero(s),b=worldBounds(s),{width,height}=gridDimensions(s),range=35;
  const x0=Math.max(0,Math.ceil(b.x),Math.ceil(u.x-range)),x1=Math.min(width-1,Math.ceil(b.x+b.w)-1,Math.floor(u.x+range));
  const y0=Math.max(0,Math.ceil(b.y),Math.ceil(u.y-range)),y1=Math.min(height-1,Math.ceil(b.y+b.h)-1,Math.floor(u.y+range));
  s.visible=new Set();
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(distance(u,{x,y})<range&&lineClear(s,u,{x,y})){const k=key(x,y);s.visible.add(k);s.seen.add(k);}
  s.fogAt={x:u.x,y:u.y};
}
export function refresh(s,{forceFog=false}={}){const u=hero(s);s.detected=new Set(s.units.filter(g=>g.team==='guard'&&alive(g)&&canSee(s,u,g)).map(g=>g.id));for(const g of s.units.filter(g=>g.team==='guard'&&alive(g)))if(canSee(s,g,u)){g.alert=true;g.lastKnown={x:u.x,y:u.y};g.alertAge=0;}if(!s.fogAt||distance(u,s.fogAt)>.25||forceFog)visibility(s);if(!alive(u)){s.phase='lost';s.solo.status='lost';s.queue=[];u.isMoving=false;s.revision++;return;}const guards=s.units.filter(g=>g.team==='guard'&&alive(g));if(!guards.length){if(s.phase!=='won')s.queue=[];s.phase='won';}else if(s.phase!=='enemy'){const contact=s.engaged||guards.some(g=>g.alert&&distance(g,u)<=WEAPONS[g.weapon].range+g.maxAp);if(contact&&s.phase!=='player'){s.phase='player';s.round++;u.ap=u.maxAp;s.queue=[];u.isMoving=false;log(s,'Contact. Movement now spends AP by distance.');}else if(!contact&&s.phase==='player'){s.phase='explore';s.queue=[];u.isMoving=false;log(s,'Contact broken. Real-time exploration resumed.');}}s.revision++;}
export function stop(s){s.queue=[];hero(s).isMoving=false;s.revision++;}
// Exhaustion changes the movement mode without cancelling held input or a route.
function walkWhenExhausted(s,u){if(u.running&&u.stamina<=EPS*(u.stance==='prone'?3:4)){u.running=false;u.sneaking=false;u.stamina=0;s.revision++;}}
// Swept-disc collision prevents tunnelling. AP charges accepted displacement,
// including wall slides, rather than requested input or pathfinder cells.
export function travel(s,u,dx,dy,{enemy=false}={}){if((enemy?s.phase!=='enemy':!canControl(s,u))||!Number.isFinite(dx)||!Number.isFinite(dy))return 0;const requested=Math.hypot(dx,dy);if(requested<EPS)return 0;walkWhenExhausted(s,u);const rate=movementRate(u),spends=enemy||s.phase==='player',staminaRate=u.stance==='prone'?3:u.running?4:u.sneaking?2:1;const budget=Math.min(requested,spends?u.ap/rate:Infinity,u.running||u.sneaking||u.stance==='prone'?u.stamina/staminaRate:Infinity);if(budget<EPS){u.isMoving=false;return 0;}const steps=Math.ceil(budget/.07),sx=dx/requested*budget/steps,sy=dy/requested*budget/steps;let walked=0;for(let i=0;i<steps;i++){let nx=u.x+sx,ny=u.y+sy;if(!freePoint(s,{x:nx,y:ny},u.id)){if(freePoint(s,{x:nx,y:u.y},u.id))ny=u.y;else if(freePoint(s,{x:u.x,y:ny},u.id))nx=u.x;else break;}const d=Math.hypot(nx-u.x,ny-u.y);if(d<EPS)break;u.heading=Math.atan2(ny-u.y,nx-u.x)*180/Math.PI;u.x=nx;u.y=ny;walked+=d;if(spends)u.ap=Math.max(0,u.ap-d*rate);u.stamina=Math.max(0,u.stamina-d*staminaRate);u.travelled+=d;}u.isMoving=walked>EPS;walkWhenExhausted(s,u);if(walked){if(u.team==='squad'){s.solo.distance+=walked;if(spends)s.solo.apDistance+=walked*rate;}refresh(s);}return walked;}
// A stable heap preserves tie order without sorting the whole frontier on every
// expansion. The cap also bounds an unreachable request in a large open sector.
export const NAVIGATION_NODE_LIMIT=8192;
class PathFrontier{
  constructor(){this.items=[];this.sequence=0;}
  before(a,b){return a.f<b.f||a.f===b.f&&a.order<b.order;}
  push(point){const p={...point,order:this.sequence++},items=this.items;let i=items.length;items.push(p);while(i){const parent=(i-1)>>1;if(!this.before(p,items[parent]))break;items[i]=items[parent];i=parent;}items[i]=p;}
  pop(){const items=this.items,first=items[0],last=items.pop();if(items.length){let i=0;while(i*2+1<items.length){let child=i*2+1;if(child+1<items.length&&this.before(items[child+1],items[child]))child++;if(!this.before(items[child],last))break;items[i]=items[child];i=child;}items[i]=last;}return first;}
}
export function navigationPath(s,u,x,y){
  const end={x,y};if(!freePoint(s,end,u.id))return null;
  if(walkSegment(s,u,end,u.id))return [{...end,z:0,cost:distance(u,end)*movementRate(u)}];
  const candidates=p=>{
    const a=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const q={x:Math.round(p.x)+dx,y:Math.round(p.y)+dy};if(freePoint(s,q,u.id)&&walkSegment(s,p,q,u.id))a.push(q);
    }
    return a.sort((a,b)=>distance(a,p)-distance(b,p));
  };
  const start=candidates(u)[0],goals=candidates(end);if(!start||!goals.length)return null;
  const goalKeys=new Set(goals.map(p=>key(p.x,p.y))),open=new PathFrontier(),startKey=key(start.x,start.y);
  const cost=new Map([[startKey,0]]),parents=new Map(),points=new Map([[startKey,start]]),links=new Map(),passable=new Map();
  open.push({...start,g:0,f:distance(start,end)});let found=null,expanded=0;
  while(open.items.length&&expanded<NAVIGATION_NODE_LIMIT){
    const p=open.pop(),pk=key(p.x,p.y);if(p.g>(cost.get(pk)??Infinity))continue;
    if(goalKeys.has(pk)){found=p;break;}expanded++;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(!dx&&!dy)continue;
      const q={x:p.x+dx,y:p.y+dy},qk=key(q.x,q.y),g=p.g+Math.hypot(dx,dy);
      if(g>=(cost.get(qk)??Infinity))continue;
      if(!passable.has(qk))passable.set(qk,freePoint(s,q,u.id));if(!passable.get(qk))continue;
      // Direction matters because swept sampling includes its destination.
      const link=pk+'>'+qk;if(!links.has(link))links.set(link,walkSegment(s,p,q,u.id));if(!links.get(link))continue;
      cost.set(qk,g);parents.set(qk,pk);points.set(qk,q);open.push({...q,g,f:g+distance(q,end)});
    }
  }
  if(!found)return null;
  const raw=[end];let current=key(found.x,found.y);while(current){raw.unshift(points.get(current));current=parents.get(current);}
  const result=[];let a=u,index=0;
  while(index<raw.length){let far=index;for(let j=raw.length-1;j>=index;j--)if(walkSegment(s,a,raw[j],u.id)){far=j;break;}const b=raw[far];result.push({...b,z:0,cost:distance(a,b)*movementRate(u)});a=b;index=far+1;}
  return result;
}
export function move(s,u,x,y){if(!canControl(s,u))return false;const path=navigationPath(s,u,x,y);if(!path?.length)return false;s.queue=path;s.revision++;return true;}
export function turnTo(s,u,heading){if(!canControl(s,u)||!Number.isFinite(heading))return false;u.heading=heading;refresh(s);return true;}
export function setMovementMode(s,u,mode){if(!canControl(s,u)||!['run','sneak','walk'].includes(mode))return false;stop(s);u.running=mode==='run';u.sneaking=mode==='sneak';walkWhenExhausted(s,u);s.revision++;return true;}
export function setStance(s,u,stance){if(!canControl(s,u)||!['standing','kneeling','prone'].includes(stance)||u.stance===stance)return false;stop(s);u.stance=stance;refresh(s,{forceFog:true});return true;}
const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
export const grenadeCost=u=>WEAPONS.grenade.cost*(['pistol','pistol-offhand','smg'].includes(u.weapon)?.5:1);
export function grenadeTrajectory(a,b){
  const rise=Math.min(2.5,distance(a,b)*.35);
  return Array.from({length:33},(_,i)=>{const t=i/32;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:1.1*(1-t)+.08*t+Math.sin(t*Math.PI)*rise};});
}
function grenadePathBlocked(s,path){
  return geometryNear(s,path[0],path.at(-1)).some(box=>{
    const height=box.height;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],span=boxInterval(a,b,box);
      if(span&&Math.min(...span.map(t=>a.z+(b.z-a.z)*t))<=height)return true;
    }
    return false;
  });
}
export const grenadeAffects=(s,point,target)=>distance(target,point)<=WEAPONS.grenade.blast&&lineClear(s,point,target);
// The fill stops at walls and unexplored ground. The outer ring still shows the
// maximum blast radius; neither the preview nor its camera changes visibility.
export function grenadeBlastFootprint(s,point){
  if(!s.seen.has(key(point.x,point.y)))return [];
  const radius=WEAPONS.grenade.blast,walls=geometryNear(s,point,point,radius).filter(box=>box.kind==='wall');
  return Array.from({length:97},(_,i)=>{
    const angle=i/96*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle),end={x:point.x+dx*radius,y:point.y+dy*radius};
    let reach=radius;
    for(const wall of walls){const span=boxInterval(point,end,wall);if(span&&span[1]>EPS)reach=Math.min(reach,Math.max(0,span[0]*radius-.01));}
    for(let d=0;d<=reach;d+=.1)if(!s.seen.has(key(point.x+dx*d,point.y+dy*d))){reach=Math.max(0,d-.1);break;}
    return {x:point.x+dx*reach,y:point.y+dy*reach};
  });
}
export function previewGrenade(s,u,point){
  const w=WEAPONS.grenade,cost=grenadeCost(u),valid=point&&Number.isFinite(point.x)&&Number.isFinite(point.y),d=valid?distance(u,point):Infinity;
  let reason='';
  if(!canControl(s,u))reason='Wait for your turn';
  else if(!(u.ammo.grenade>0))reason='No grenades remaining';
  else if(!valid||!insideWorld(s,point))reason='Choose a point on the field';
  else if(!s.seen.has(key(point.x,point.y)))reason='Choose an explored landing point';
  else if(d>w.range+EPS)reason='Out of throwing range';
  else if(geometryNear(s,point,point,.04).some(box=>pointBoxDistance(point,box)<.04))reason='Landing point is inside an obstacle';
  else if(grenadePathBlocked(s,grenadeTrajectory(u,point)))reason='Throw path is blocked';
  else if(u.ap+EPS<cost)reason='Not enough AP';
  return {ok:!reason,reason,cost,distance:d,blast:w.blast,discounted:cost<w.cost,selfDanger:!!valid&&grenadeAffects(s,point,u)};
}
export function throwGrenade(s,u,point){
  const p=previewGrenade(s,u,point);if(!p.ok)return false;
  stop(s);if(s.phase!=='player'){s.engaged=true;refresh(s);}
  u.ap=Math.max(0,u.ap-p.cost);u.ammo.grenade--;u.heading=headingTo(u,point);
  let hits=0;for(const target of s.units.filter(alive))if(grenadeAffects(s,point,target)){
    hurt(s,target,Math.round(WEAPONS.grenade.damage*Math.max(.2,1-distance(target,point)/(p.blast+1))));hits++;
  }
  log(s,`${u.name} threw a grenade (${p.cost} AP).`);
  for(const guard of s.units.filter(g=>g.team==='guard'&&alive(g)))if(distance(u,guard)<=WEAPONS.grenade.range*2){guard.alert=true;guard.lastKnown={x:u.x,y:u.y};guard.alertAge=0;}
  s.effect={sequence:[{shooter:u.id,ax:u.x,ay:u.y,bx:point.x,by:point.y,hit:hits>0,weapon:'grenade',blast:p.blast}]};
  refresh(s);return true;
}
export function previewAttack(s,a,b,burst=false,zone='torso',token=null,aimLevel='hip'){if(!alive(a)||!alive(b)||a.team===b.team)return {ok:false,reason:'Choose a living opponent'};if(a.weapon==='grenade'){if(!s.detected.has(b.id))return {ok:false,reason:'Target is not visible'};return {...previewGrenade(s,a,b),chance:100,rounds:1,cover:0};}const w=WEAPONS[a.weapon],aim=shotAim(w,aimLevel,burst),cost=aim.cost,d=distance(a,b),rounds=burst&&w.burstRounds?w.burstRounds:1;let reason='';if(a.team==='squad'&&!s.detected.has(b.id))reason='Target is not visible';else if(!lineClear(s,a,b)&&!w.arc)reason='Blocked by a wall';else if(d>w.range+EPS)reason='Out of range';else if(w.mag&&(a.ammo[a.weapon]??0)<rounds)reason='Reload first';else if((combatCosts(s)||a.team==='guard')&&a.ap+EPS<cost)reason='Not enough AP';const cover=geometryNear(s,b,b,.9).some(box=>box.kind==='crate'&&pointBoxDistance(b,box)<.9&&intersectsBox(a,b,{x0:box.x0-.3,x1:box.x1+.3,y0:box.y0-.3,y1:box.y1+.3}))?20:0;const chance=Math.max(5,Math.min(95,weaponAccuracy(a)+(w.accuracy||0)-(w.rangeLoss||0)*d/w.range+(aim.accuracy||0)+(AIM_ZONES[zone]?.accuracy||0)-cover+(a.stance==='kneeling'?5:a.stance==='prone'?10:0)));return {ok:!reason,reason,cost,chance:Math.round(chance),rounds,distance:d,cover};}
function hurt(s,u,damage){u.hp=Math.max(0,u.hp-damageAfterResistance(u,damage));if(!u.hp){u.casualty='dead';u.isMoving=false;interactionRules.registerBody(s,u);log(s,u.name+' is down.');}}
function flameAffects(s,a,u,heading){const angle=Math.abs(((headingTo(a,u)-heading+540)%360)-180);return alive(u)&&u.id!==a.id&&distance(a,u)<=WEAPONS.flamethrower.range&&angle<24&&lineClear(s,a,u);}
function resolveFlame(s,a){
  const impacts=[];
  for(const u of s.units)if(flameAffects(s,a,u,a.heading)){
    const before=u.hp,visible=s.visible.has(key(u.x,u.y))&&(u.team==='squad'||s.detected.has(u.id));
    hurt(s,u,WEAPONS.flamethrower.damage*Math.max(.25,1-distance(a,u)/14));
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
  const shape=recordFlame({...a,heading:direction},w.range,geometryNear(s,a,a,w.range),s.visible);
  const contacts=s.units.filter(u=>(u.team==='squad'||s.detected.has(u.id))&&s.visible.has(key(u.x,u.y))&&flameAffects(s,a,u,direction)).map(u=>({id:u.id,name:u.name,team:u.team}));
  return {ok:!reason,reason,cost:w.cost,range:w.range,spread:48,heading:direction,shape,contacts};
}
export function fireFlame(s,a,heading){
  const p=previewFlame(s,a,heading);if(!p.ok)return false;
  stop(s);if(s.phase!=='player'){s.engaged=true;refresh(s);}
  a.ap=Math.max(0,a.ap-p.cost);a.ammo.flamethrower--;a.heading=p.heading;
  const flame=recordFlame(a,p.range,geometryNear(s,a,a,p.range),s.visible),impacts=resolveFlame(s,a),angle=a.heading*Math.PI/180;
  log(s,`${a.name} fired a flamethrower cone (${p.cost} AP).`);
  for(const guard of s.units.filter(u=>u.team==='guard'&&alive(u)))if(distance(a,guard)<=p.range*2){guard.alert=true;guard.lastKnown={x:a.x,y:a.y};guard.alertAge=0;}
  s.effect={sequence:[{shooter:a.id,ax:a.x,ay:a.y,bx:a.x+Math.cos(angle)*p.range,by:a.y+Math.sin(angle)*p.range,incendiary:true,hit:impacts.length>0,weapon:'flamethrower',shot:0,shots:1,flame,impacts}]};
  refresh(s);return true;
}
export function attack(s,a,b,burst=false,byAI=false,zone='torso',reaction=false,aimLevel='hip'){
  if(byAI?s.phase!=='enemy':!canControl(s,a))return false;
  const p=previewAttack(s,a,b,burst,zone,null,aimLevel);if(!p.ok)return false;if(a.weapon==='grenade')return throwGrenade(s,a,b);
  stop(s);const w=WEAPONS[a.weapon];if(!byAI&&s.phase!=='player'){s.engaged=true;refresh(s);}
  a.ap=Math.max(0,a.ap-p.cost);if(w.mag)a.ammo[a.weapon]-=p.rounds;a.heading=headingTo(a,b);
  let hits=0;const hp=b.hp,shots=[],flame=w.incendiary?recordFlame(a,w.range,geometryNear(s,a,a,w.range),s.visible):null,impacts=[];
  if(w.blast){
    for(const u of s.units.filter(alive))if(distance(u,b)<=w.blast&&lineClear(s,b,u)){hurt(s,u,Math.round(w.damage*Math.max(.2,1-distance(u,b)/(w.blast+1))));hits++;}
    shots.push(hits>0);
  }else if(w.incendiary){
    impacts.push(...resolveFlame(s,a));hits=impacts.length;
    shots.push(hits>0);
  }else for(let i=0;i<p.rounds;i++){
    const hit=random(s)*100<p.chance;shots.push(hit);
    if(hit){hurt(s,b,Math.round((w.pellets?w.damage*w.pellets*.48:w.damage)*(AIM_ZONES[zone]?.damage||1)));hits++;}
  }
  log(s,`${a.name} → ${b.name}: ${hits?Math.round(hp-b.hp)+' damage':'miss'} (${p.chance}%).`);
  for(const g of s.units.filter(g=>g.team==='guard'&&alive(g)))if(distance(a,g)<=w.range*2){g.alert=true;g.lastKnown={x:a.x,y:a.y};g.alertAge=0;}
  s.effect={sequence:shots.map((hit,shot)=>({shooter:a.id,target:b.id,ax:a.x,ay:a.y,bx:b.x,by:b.y,incendiary:w.incendiary,hit,weapon:a.weapon,shot,shots:shots.length,...(flame?{flame,impacts}:{} )}))};
  refresh(s);return true;
}
export function equip(s,u,id){if(!canControl(s,u)||!u.pack.some(i=>i.kind===id)||u.weapon===id)return false;const cost=combatCosts(s)?u.slots.includes(id)?2:3:0;if(u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.weapon=id;log(s,'Equipped '+WEAPONS[id].name+'.');return true;}
export function reload(s,u){if(!canControl(s,u))return false;const w=WEAPONS[u.weapon],count=Math.min(w.mag-(u.ammo[u.weapon]??0),u.ammoPouch[u.weapon]||0),cost=combatCosts(s)?3:0;if(!count||u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.ammo[u.weapon]+=count;u.ammoPouch[u.weapon]-=count;log(s,'Reloaded '+count+' rounds.');return true;}
export function endTurn(s){if(s.phase!=='player'||s.solo.status!=='active')return false;stop(s);s.phase='enemy';s.enemyIndex=1;s.enemyDelay=.35;s.engaged=false;for(const g of s.units.filter(g=>g.team==='guard')){g.ap=g.maxAp;g.alertAge++;if(g.alertAge>3&&!canSee(s,g,hero(s)))g.alert=false;}s.revision++;return true;}
function enemyStep(s,dt){const u=hero(s);let g=s.units[s.enemyIndex];if(!g){s.round++;u.ap=u.maxAp;u.stamina=Math.min(u.maxStamina,u.stamina+10);s.phase='player';refresh(s);return;}if(!alive(g)||!g.alert||g.ap<.02){g.isMoving=false;s.enemyIndex++;s.enemyDelay=.15;return;}s.enemyDelay-=dt;if(s.enemyDelay>0)return;const p=previewAttack(s,g,u);if(p.ok&&canSee(s,g,u)){attack(s,g,u,false,true);s.enemyDelay=.6;return;}if(g.ammo[g.weapon]===0&&g.ap>=3){const count=Math.min(WEAPONS[g.weapon].mag,g.ammoPouch[g.weapon]||0);if(count){g.ammo[g.weapon]=count;g.ammoPouch[g.weapon]-=count;g.ap-=3;s.enemyDelay=.4;return;}}if(g.ap<WEAPONS[g.weapon].cost&&canSee(s,g,u)&&distance(g,u)<=WEAPONS[g.weapon].range){g.ap=0;return;}const goal=g.lastKnown||u,range=distance(g,goal),offset=Math.min(.75,range),tx=goal.x-(goal.x-g.x)/Math.max(range,.001)*offset,ty=goal.y-(goal.y-g.y)/Math.max(range,.001)*offset,path=navigationPath(s,g,tx,ty),next=path?.[0];if(!next){g.ap=0;return;}const d=distance(g,next);if(d<.08){g.ap=0;return;}const step=Math.min(d,movementSpeed(g)*dt);if(!travel(s,g,(next.x-g.x)/d*step,(next.y-g.y)/d*step,{enemy:true}))g.ap=0;}
export function tick(s,dt=1/60,input=null){if(s.solo.status!=='active')return false;dt=Math.max(0,Math.min(.05,dt));s.elapsed+=dt;for(const u of s.units)u.isMoving=false;if(s.phase==='enemy'){enemyStep(s,dt);return true;}const u=hero(s);walkWhenExhausted(s,u);if(input&&Math.hypot(input.x,input.y)>.1){s.queue=[];const n=Math.max(1,Math.hypot(input.x,input.y));travel(s,u,input.x/n*movementSpeed(u)*dt,input.y/n*movementSpeed(u)*dt);}else if(s.queue.length){const p=s.queue[0],d=distance(u,p);if(d<.025)s.queue.shift();else{const step=Math.min(d,movementSpeed(u)*dt),moved=travel(s,u,(p.x-u.x)/d*step,(p.y-u.y)/d*step);if(!moved||s.phase==='player'&&u.ap<EPS)s.queue=[];}}else if(s.phase==='explore'||s.phase==='won')u.stamina=Math.min(u.maxStamina,u.stamina+dt*2);return true;}
const interactionRules=createInteractionSystem({hero,canControl,combatCosts,distance,geometry,pointBoxDistance,refresh,stop,log,clearGeometry:s=>geometryCache.delete(s),weapons:WEAPONS,radius:RADIUS});
export const interactionObjects=s=>interactionRules.objects(s);
export const nearbyInteractions=s=>interactionRules.nearby(s);
export const previewInteraction=(s,id,action,itemId)=>interactionRules.preview(s,id,action,itemId);
export const performInteraction=(s,id,action,itemId)=>interactionRules.perform(s,id,action,itemId);
// Existing mission/menu callers use the same validated actions as the hand.
export function interaction(s){const mission=missionForState(s),object=nearbyInteractions(s).find(object=>['ledger','objective','extract'].includes(object.kind));if(!object)return null;return {...object.actions[0],kind:object.kind,label:object.kind==='extract'?mission.extraction.label:'Take the '+mission.objective.name.toLowerCase()};}
export function interact(s){const secured=objectiveSecured(s);return performInteraction(s,secured?'extraction':missionForState(s).objective.id,secured?'extract':'collect').ok;}
export function dressing(s){const u=hero(s),cost=combatCosts(s)?3:0;if(!canControl(s,u)||s.solo.dressings<1||u.hp>=u.maxHp||u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.hp=Math.min(u.maxHp,u.hp+35);s.solo.dressings--;log(s,u.name+' used a field dressing (+35 HP).');return true;}
export function encodeSave(s){return JSON.stringify(s,(_,v)=>v instanceof Set?{$set:[...v]}:v);}
export function decodeSave(text){
  const s=JSON.parse(text,(_,v)=>v&&Array.isArray(v.$set)?new Set(v.$set):v);
  if(s?.solo?.version!==2||!validBuild(s.solo.build)||!Array.isArray(s.units)||s.units.filter(u=>u?.team==='squad').length!==1||!['active','extracted','lost'].includes(s.solo.status)||!['visible','seen','detected'].every(k=>s[k] instanceof Set))throw Error('Unsupported solo save.');
  const mission=missionForState(s);s.solo.missionId=mission.id;
  const map=missionMap(mission.id,mission.layoutVersion??1),{width,height}=gridDimensions(map),canonical={map:map.terrain,worldBounds:map.worldBounds};
  if(!Array.isArray(s.map)||s.map.length!==height||s.map.some(row=>!Array.isArray(row)||row.length!==width)||s.units.some(u=>!u||!insideWorld(canonical,u)||!Number.isFinite(u.hp)||!Number.isFinite(u.ap)||u.lastKnown&&!insideWorld(canonical,u.lastKnown)))throw Error('Unsupported solo save.');
  if(s.fogAt&&!insideWorld(canonical,s.fogAt))throw Error('Unsupported visibility save.');
  const validCell=value=>{if(typeof value!=='string'||!/^\d+,\d+$/.test(value))return false;const [x,y]=value.split(',').map(Number);return x<width&&y<height&&insideWorld(canonical,{x,y});};
  if(['visible','seen'].some(name=>[...s[name]].some(value=>!validCell(value)))||[...s.detected].some(id=>!s.units.some(u=>u.id===id)))throw Error('Unsupported visibility save.');
  if(!s.edges||typeof s.edges!=='object'||Array.isArray(s.edges)||Object.entries(s.edges).some(([edge,kind])=>{const match=/^[es]:(\d+):(\d+)$/.exec(edge);return !match||+match[1]>=width||+match[2]>=height||!['wall','door','closed-door'].includes(kind);}))throw Error('Unsupported geometry save.');
  if(s.queue===undefined)s.queue=[];
  if(!Array.isArray(s.queue)||s.queue.some(p=>!p||!insideWorld(canonical,p,RADIUS)||!Number.isFinite(p.cost)||p.cost<0))throw Error('Unsupported movement save.');
  if(Array.isArray(s.interactables)&&s.interactables.some(object=>object?.kind!=='body'&&(!object||!insideWorld(canonical,object))))throw Error('Unsupported object save.');
  // Saved terrain/door state remains played state. Imported immutable scenery
  // is always rebuilt from the mission, never trusted from a save or a window.
  mapMetadata(s,map);
  if(s.solo.objectives===undefined)s.solo.objectives={};
  if(!s.solo.objectives||typeof s.solo.objectives!=='object'||Array.isArray(s.solo.objectives)||Object.entries(s.solo.objectives).some(([id,value])=>id!==mission.objective.id||typeof value!=='boolean'))throw Error('Unsupported objective save.');
  if(mission.id===DEFAULT_MISSION_ID&&s.solo.ledger)s.solo.objectives.ledger=true;
  if(s.solo.inspected===undefined)s.solo.inspected=[];
  if(!Array.isArray(s.solo.inspected)||s.solo.inspected.some(id=>!mission.clues.some(clue=>clue.id===id)))throw Error('Unsupported inspection save.');
  return interactionRules.restore(s);
}
export const Core={WEAPONS,AIM_ZONES,key,alive,movementModeOf,movementRate,movementSpeed,combatCosts,canControl,canSee,visibleOpponents,refresh,log,stop,travel,navigationPath,move,turnTo,setMovementMode,setStance,grenadeCost,grenadeTrajectory,grenadeAffects,grenadeBlastFootprint,previewGrenade,throwGrenade,previewFlame,fireFlame,previewAttack,attack,equip,reload,endTurn,headingTo,interactionObjects,nearbyInteractions,previewInteraction,performInteraction};
