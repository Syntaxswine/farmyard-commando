import {ColdwellGeometry} from './coldwell-geometry.js';
import {ColdwellRigRules} from './coldwell-rigs.js';
import {ColdwellCombat} from './coldwell-combat.js';
import {COLDWELL_CAPABILITIES} from './coldwell-loader.js';
import {PathFrontier} from './path-frontier.js';
import {actorHeight,spatialDistance} from './spatial-provider.js';
import {siloToWorld,mixPoint,floorId,toThree,fromThree,polygonContains} from './coldwell-space.js';
import {Vector3,Ray,Plane,Box3} from './aft/tactics/vendor/three.module.js';

const RADIUS=.23,EPS=1e-5;
const xy=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function coldwellStairRoute(stair){
  const {x,z}=stair.footprint,base=stair.fromY,rise=stair.rise;
  const points=[stair.bottomAnchor];
  for(let i=0;i<6;i++)points.push([x+1+(i+.5)*.25,base+(i+1)*rise,z+.6]);
  points.push([x+3.25,base+1.06,z+.6],[x+3.25,base+1.06,z+2.4]);
  for(let i=0;i<6;i++)points.push([x+2.5-(i+.5)*.25,base+(i+7)*rise,z+2.4]);
  points.push(stair.topAnchor);
  return points.map((p,i)=>({...siloToWorld(p),floorId:i===points.length-1?stair.toFloorId:stair.fromFloorId,...(i>0&&i<points.length-1?{stairId:stair.id}:{})}));
}

export class ColdwellProvider{
  constructor(bundle){
    this.schema=1;this.id='coldwell-native-v1';this.bundle=bundle;this.geometry=new ColdwellGeometry(bundle);this.capabilities=COLDWELL_CAPABILITIES;
    this.floors=this.geometry.floors;this.floorById=new Map(this.floors.map(f=>[f.id,f]));
    this.stairs=bundle.data.semantics.stairs.map(s=>({...s,route:coldwellStairRoute(s)}));
    this.stairById=new Map(this.stairs.map(s=>[s.id,s]));this.navigationCache=new WeakMap();this.occupancyCache=new WeakMap();this.linkCache=new WeakMap();
    this.anchors=this.stairs.flatMap(s=>[{...s.route[0],id:s.id+':bottom',stair:s,side:0},{...s.route.at(-1),id:s.id+':top',stair:s,side:1}]);
    this.rigRules=new ColdwellRigRules(this);this.combat=new ColdwellCombat(this);
  }
  createState(){return {provider:this.id,version:1,sourceDigest:this.bundle.manifest.sourceDigest,revision:0,poses:Object.fromEntries(this.bundle.data.rigs.map(r=>[r.id,0])),transitions:{}};}
  validateState(saved){
    if(!saved||saved.provider!==this.id||saved.version!==1||saved.sourceDigest!==this.bundle.manifest.sourceDigest||!Number.isSafeInteger(saved.revision)||saved.revision<0||!saved.poses||Object.keys(saved.poses).length!==this.bundle.data.rigs.length)throw Error('Unsupported Coldwell source or state.');
    this.rigRules.validate(saved);
    return saved;
  }
  supportAt(state,point,options){return this.geometry.supportAt(state,point,options);}
  trace(state,from,to,options){return this.geometry.trace(state,from,to,options);}
  canReach(state,actor,object){return this.rigRules.canReach(state,actor,object);}
  previewRig(state,id,to){return this.rigRules.preview(state,id,to);}
  startRig(state,id,to){return this.rigRules.start(state,id,to);}
  tick(state,dt){return this.rigRules.tick(state,dt);}
  isMoving(state){return this.rigRules.moving(state);}
  visibilityPoints(actor,range){
    const points=new Map();
    for(const shape of this.geometry.support){
      if(Math.abs(shape.h-actor.h)>range)continue;
      const b=shape.bounds;
      for(let y=Math.max(0,Math.ceil(b.y0),Math.ceil(actor.y-range));y<=Math.min(239,Math.floor(b.y1),Math.floor(actor.y+range));y++)for(let x=Math.max(0,Math.ceil(b.x0),Math.ceil(actor.x-range));x<=Math.min(239,Math.floor(b.x1),Math.floor(actor.x+range));x++){
        const p={x,y,h:shape.h,floorId:shape.floorId};if(spatialDistance(actor,p)>range||!polygonContains(p,shape))continue;points.set(shape.floorId+'@'+x+','+y,p);
      }
    }
    return points.values();
  }
  profile(point,reference){
    let best=null;
    for(const stair of this.stairs){
      if(point.stairId&&stair.id!==point.stairId)continue;
      if(reference.h<stair.route[0].h-.3||reference.h>stair.route.at(-1).h+.3)continue;
      for(let i=1;i<stair.route.length;i++){
        const a=stair.route[i-1],b=stair.route[i],dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
        const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(length2||1))),q=mixPoint(a,b,t),gap=xy(point,q);
        if(gap>.451||Math.abs(q.h-reference.h)>.3)continue;
        const score=gap*100+Math.abs(q.h-reference.h);
        if(!best||score<best.score){
          const atTop=spatialDistance(q,stair.route.at(-1))<.01,atBottom=spatialDistance(q,stair.route[0])<.01;
          best={...q,x:point.x,y:point.y,floorId:atTop?stair.toFloorId:stair.fromFloorId,stairId:atTop||atBottom?undefined:stair.id,score};
        }
      }
    }
    return best;
  }
  resolve(state,point,from=point){
    const reference={...point,h:point.h??from.h,floorId:point.floorId??from.floorId};
    if(![reference.x,reference.y,reference.h].every(Number.isFinite))return null;
    const profile=this.profile(reference,reference),support=this.supportAt(state,profile||reference,{step:!!profile?.stairId});
    if(!support)return null;
    const position=profile?{x:profile.x,y:profile.y,h:profile.h,floorId:profile.floorId,...(profile.stairId?{stairId:profile.stairId}:{})}:support;
    if(Math.abs(position.h-support.h)>.201)return null;
    return position;
  }
  occupancy(state,actor,point,{units=true,resolve=false,ignoreId=actor.id}={}){
    const p=resolve?this.resolve(state,point,actor):point,height=actorHeight(actor);
    if(!p||![p.x,p.y,p.h].every(Number.isFinite)||p.x<RADIUS||p.y<RADIUS||p.x>240-RADIUS||p.y>240-RADIUS||!this.floorById.has(p.floorId))return false;
    const stable=!p.stairId&&Number.isInteger(p.x*2)&&Number.isInteger(p.y*2),key=stable?`${actor.stance}:${p.floorId}:${p.x}:${p.y}:${p.h}`:null;
    let cache=this.occupancyCache.get(state.spatial),clear;
    if(stable){const objects=(state.interactables||[]).filter(o=>o.kind==='chest').map(o=>[o.id,o.x,o.y,o.h]).join('|'),revision=state.spatial.revision+':'+objects;if(cache?.revision!==revision){cache={revision,points:new Map()};this.occupancyCache.set(state.spatial,cache);}clear=cache.points.get(key);}
    if(clear===undefined){const support=this.supportAt(state,p,{step:!!p.stairId});clear=!!support&&Math.abs(support.h-p.h)<=(p.stairId?.221:.041)&&!this.geometry.bodyHit(state,p,p,{height,radius:RADIUS,step:!!p.stairId});if(stable){if(cache.points.size>=8192)cache.points.clear();cache.points.set(key,clear);}}
    if(!clear)return false;
    return !units||!(state.units||[]).some(u=>u.hp>0&&u.id!==ignoreId&&xy(u,p)<2*RADIUS-EPS&&u.h+actorHeight(u)>p.h+EPS&&p.h+height>u.h+EPS);
  }
  sweep(state,actor,from,to,{units=true,resolve=true}={}){
    const destination={...to,h:to.h??from.h,floorId:to.floorId??from.floorId},length=spatialDistance(from,destination),steps=Math.max(1,Math.ceil(length/.06));
    let last={...from},walked=0;
    for(let i=1;i<=steps;i++){
      const raw=mixPoint(from,destination,i/steps);if(to.stairId)raw.stairId=to.stairId;
      const point=resolve?this.resolve(state,raw,last):raw;
      if(!point||!this.occupancy(state,actor,point,{units})||this.geometry.bodyHit(state,last,point,{height:actorHeight(actor),radius:RADIUS,step:!!(last.stairId||point.stairId)}))return {ok:false,point:last,distance:walked};
      walked+=spatialDistance(last,point);last=point;
    }
    return {ok:true,point:last,distance:walked};
  }
  advance(state,actor,dx,dy,budget){
    const target=this.resolve(state,{x:actor.x+dx,y:actor.y+dy},actor);if(!target)return {distance:0,point:actor};
    let ratio=1;
    if(spatialDistance(actor,target)>budget+EPS){
      let lo=0,hi=1;
      for(let i=0;i<14;i++){const t=(lo+hi)/2,p=this.resolve(state,{x:actor.x+dx*t,y:actor.y+dy*t},actor);if(p&&spatialDistance(actor,p)<=budget)lo=t;else hi=t;}ratio=lo;
    }
    const result=this.sweep(state,actor,actor,{x:actor.x+dx*ratio,y:actor.y+dy*ratio});return result;
  }
  stairClear(state,actor,stair){
    let cache=this.navigationCache.get(state.spatial);
    const key=state.spatial.revision+':'+actor.stance;
    if(cache?.key!==key){cache={key,links:new Map()};this.navigationCache.set(state.spatial,cache);}
    if(!cache.links.has(stair.id)){
      let clear=true;
      for(let i=1;i<stair.route.length;i++)if(!this.sweep(state,actor,stair.route[i-1],stair.route[i],{units:false}).ok){clear=false;break;}
      cache.links.set(stair.id,clear);
    }
    return cache.links.get(stair.id);
  }
  stairPart(stair,from,to){
    const parameter=p=>{let best=Infinity,at=0;for(let i=1;i<stair.route.length;i++){const a=stair.route[i-1],b=stair.route[i],dx=b.x-a.x,dy=b.y-a.y,dh=b.h-a.h,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy+(p.h-a.h)*dh)/(dx*dx+dy*dy+dh*dh))),q=mixPoint(a,b,t),d=spatialDistance(p,q);if(d<best){best=d;at=i-1+t;}}return at;};
    const a=parameter(from),b=parameter(to),nodes=stair.route.filter((_,i)=>i>Math.min(a,b)+EPS&&i<Math.max(a,b)-EPS);if(a>b)nodes.reverse();return [...nodes,to];
  }
  pathLink(state,actor,from,to){
    if(from.stairId||to.stairId||from.h!==to.h||![from.x,from.y,to.x,to.y].every(n=>Number.isInteger(n*2)))return this.sweep(state,actor,from,to).ok;
    let cache=this.linkCache.get(state.spatial);const revision=state.spatial.revision+':'+actor.stance+':'+(state.interactables||[]).filter(o=>o.kind==='chest').map(o=>[o.id,o.x,o.y,o.h]).join('|');
    if(cache?.revision!==revision){cache={revision,links:new Map()};this.linkCache.set(state.spatial,cache);}
    const a=`${from.x},${from.y}`,b=`${to.x},${to.y}`,key=from.floorId+'@'+(a<b?a+'>'+b:b+'>'+a);let clear=cache.links.get(key);
    if(clear===undefined){clear=this.sweep(state,actor,from,to,{units:false}).ok;if(cache.links.size>=16384)cache.links.clear();cache.links.set(key,clear);}if(!clear)return false;
    const dx=to.x-from.x,dy=to.y-from.y,length2=dx*dx+dy*dy,height=actorHeight(actor);
    return !(state.units||[]).some(u=>{if(u.hp<=0||u.id===actor.id||u.h+actorHeight(u)<=from.h||from.h+height<=u.h)return false;const t=Math.max(0,Math.min(1,((u.x-from.x)*dx+(u.y-from.y)*dy)/(length2||1)));return Math.hypot(u.x-from.x-dx*t,u.y-from.y-dy*t)<2*RADIUS-EPS;});
  }
  path(state,actor,destination,{rate=1,nodeLimit=8192,goals=[destination]}={}){
    const ends=goals.map(p=>this.resolve(state,p,actor)).filter(p=>p&&this.occupancy(state,actor,p)).sort((a,b)=>spatialDistance(actor,a)-spatialDistance(actor,b));if(!ends.length)return null;
    const end=ends[0],clean=p=>({x:p.x,y:p.y,h:p.h,floorId:p.floorId,...(p.stairId?{stairId:p.stairId}:{})});
    if(actor.floorId===end.floorId&&!actor.stairId&&!end.stairId&&this.sweep(state,actor,actor,end).ok)return [{...clean(end),cost:spatialDistance(actor,end)*rate}];
    const key=p=>p.id||`${p.floorId}@${p.x},${p.y}`,open=new PathFrontier(),cost=new Map(),parents=new Map(),points=new Map(),links=new Map(),valid=new Map();
    const start={...actor,id:'start'},targets=ends.map((p,i)=>({...p,id:'goal:'+i})),estimate=p=>Math.min(...ends.map(end=>spatialDistance(p,end)));let expanded=0,found=null;
    const floorPoint=(x,y,floor)=>({x,y,h:this.floorById.get(floor).elevationM,floorId:floor});
    const clear=p=>{const id=key(p);if(!valid.has(id))valid.set(id,this.occupancy(state,actor,p));return valid.get(id);};
    const neighbours=p=>{
      const result=[],floor=this.floorById.get(p.floorId);if(!floor)return result;
      const add=(q,via=null)=>{if(!clear(q))return;if(!via&&!this.pathLink(state,actor,p,q))return;const route=via||[q];let d=0,previous=p;for(const node of route){d+=spatialDistance(previous,node);previous=node;}result.push({point:q,route,d});};
      for(const goal of targets){
        const stair=goal.stairId&&this.stairById.get(goal.stairId);
        if(stair&&(p.stair===stair||p.id==='start'&&p.stairId===stair.id)){
          const route=this.stairPart(stair,p,goal);if(route.every((q,i)=>this.sweep(state,actor,i?route[i-1]:p,q).ok))add(goal,route);
        }else if(p.floorId===goal.floorId&&spatialDistance(p,goal)<1.1)add(goal);
      }
      if(p.id==='start'&&p.stairId){const stair=this.stairById.get(p.stairId);for(const anchor of this.anchors.filter(a=>a.stair===stair)){const route=this.stairPart(stair,p,anchor);if(route.every((q,i)=>this.sweep(state,actor,i?route[i-1]:p,q).ok))add(anchor,route);}}
      const rx=Math.round(p.x*2)/2,ry=Math.round(p.y*2)/2;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const q=floorPoint(rx+dx*.5,ry+dy*.5,p.floorId);if(xy(p,q)>1e-5&&q.x>=RADIUS&&q.y>=RADIUS&&q.x<=240-RADIUS&&q.y<=240-RADIUS)add(q);}
      for(const anchor of this.anchors)if(anchor.floorId===p.floorId&&xy(anchor,p)<=.8&&anchor.id!==p.id)add(anchor);
      if(p.stair&&this.stairClear(state,actor,p.stair)){
        const route=p.side?[...p.stair.route].reverse():p.stair.route,other=this.anchors.find(a=>a.stair===p.stair&&a.side!==p.side);
        const ordered=route.slice(1);if(ordered.every((q,i)=>this.sweep(state,actor,i?ordered[i-1]:p,q).ok))add(other,ordered);
      }
      return result;
    };
    points.set('start',start);cost.set('start',0);open.push({...start,g:0,f:estimate(start)});
    while(open.items.length&&expanded++<nodeLimit){
      const p=open.pop(),id=key(p);if(p.g>(cost.get(id)??Infinity))continue;if(id.startsWith('goal:')){found=id;break;}
      for(const edge of neighbours(p)){
        const q=edge.point,qk=key(q),g=p.g+edge.d;if(g>=(cost.get(qk)??Infinity))continue;
        cost.set(qk,g);parents.set(qk,id);points.set(qk,q);links.set(qk,edge.route);open.push({...q,g,f:g+estimate(q)});
      }
    }
    this.lastSearch={expanded,found:!!found,nodeLimit};if(!found)return null;
    const legs=[];let current=found;while(current!=='start'){legs.unshift(links.get(current));current=parents.get(current);}
    const raw=legs.flat(),route=[];let from=actor;
    for(let i=0;i<raw.length;){let far=i;
      if(!from.stairId&&!raw[i].stairId)for(let j=i+1;j<raw.length&&!raw[j].stairId&&raw[j].floorId===from.floorId;j++)if(this.sweep(state,actor,from,raw[j]).ok)far=j;
      const p=raw[far];if(spatialDistance(from,p)>EPS)route.push({...clean(p),cost:spatialDistance(from,p)*rate});from=p;i=far+1;
    }
    return route;
  }
  approachPath(state,actor,lastSeen,options){
    if(!lastSeen||!Number.isFinite(lastSeen.h)||!this.floorById.has(lastSeen.floorId))return null;
    const goals=Array.from({length:24},(_,i)=>{const angle=i/24*Math.PI*2;return {...lastSeen,x:lastSeen.x+Math.cos(angle)*.75,y:lastSeen.y+Math.sin(angle)*.75};}).filter(p=>!this.trace(state,{...p,h:p.h+1.1},{...lastSeen,h:lastSeen.h+1.1},{purpose:'sight'}));
    return this.path(state,actor,lastSeen,{nodeLimit:128,...options,goals});
  }
  pick(state,from,direction,{min=-.5,max=64}={}){
    const ray=new Ray(toThree(from),new Vector3(direction.x,direction.h,direction.y).normalize());let result=null;
    for(const shape of this.geometry.support){
      if(shape.h<min||shape.h>max)continue;
      const point=ray.intersectPlane(new Plane(new Vector3(0,1,0),-shape.h),new Vector3());if(!point)continue;
      const p=fromThree(point);if(!polygonContains(p,shape))continue;const distance=point.distanceTo(ray.origin);
      if(!result||distance<result.distance)result={...p,floorId:shape.floorId,distance};
    }
    const far=ray.at(200,new Vector3());
    // Reuse source upward-facing tread/bridge triangles for the visible hit.
    const nearBox={min:{x:Math.min(ray.origin.x,far.x),y:Math.min(ray.origin.y,far.y),z:Math.min(ray.origin.z,far.z)},max:{x:Math.max(ray.origin.x,far.x),y:Math.max(ray.origin.y,far.y),z:Math.max(ray.origin.z,far.z)}};
    for(const record of this.geometry.nearby(state,new Box3(new Vector3(nearBox.min.x,nearBox.min.y,nearBox.min.z),new Vector3(nearBox.max.x,nearBox.max.y,nearBox.max.z))))if(record.kind==='stair'||record.rig?.kind==='platform')this.geometry.triangles(record,triangle=>{
      if(triangle.getNormal(new Vector3()).y<.999)return;const point=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,new Vector3());if(!point||point.y<min||point.y>max)return;const distance=point.distanceTo(ray.origin);if(result&&result.distance<=distance)return;
      const p=fromThree(point),resolved=this.resolve(state,p,p);if(resolved)result={...resolved,distance};
    });
    return result;
  }
}
