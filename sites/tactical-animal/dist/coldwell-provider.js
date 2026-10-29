import {ColdwellGeometry} from './coldwell-geometry.js';
import {PathFrontier} from './path-frontier.js';
import {actorHeight,spatialDistance} from './spatial-provider.js';
import {siloToWorld,mixPoint,floorId,toThree,fromThree,polygonContains} from './coldwell-space.js';
import {Vector3,Ray,Plane} from './aft/tactics/vendor/three.module.js';

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
    this.schema=1;this.id='coldwell-native-v1';this.bundle=bundle;this.geometry=new ColdwellGeometry(bundle);this.capabilities=[];
    this.floors=this.geometry.floors;this.floorById=new Map(this.floors.map(f=>[f.id,f]));
    this.stairs=bundle.data.semantics.stairs.map(s=>({...s,route:coldwellStairRoute(s)}));
    this.stairById=new Map(this.stairs.map(s=>[s.id,s]));this.navigationCache=new WeakMap();
    this.anchors=this.stairs.flatMap(s=>[{...s.route[0],id:s.id+':bottom',stair:s,side:0},{...s.route.at(-1),id:s.id+':top',stair:s,side:1}]);
  }
  createState(){return {provider:this.id,version:1,sourceDigest:this.bundle.manifest.sourceDigest,revision:0,poses:Object.fromEntries(this.bundle.data.rigs.map(r=>[r.id,0])),transitions:{}};}
  validateState(saved){
    if(!saved||saved.provider!==this.id||saved.version!==1||saved.sourceDigest!==this.bundle.manifest.sourceDigest||!Number.isSafeInteger(saved.revision)||saved.revision<0||!saved.poses||Object.keys(saved.poses).length!==this.bundle.data.rigs.length)throw Error('Unsupported Coldwell source or state.');
    for(const rig of this.bundle.data.rigs)if(!Number.isFinite(saved.poses[rig.id])||saved.poses[rig.id]<0||saved.poses[rig.id]>rig.maximum)throw Error('Invalid Coldwell rig save.');
    if(!saved.transitions||Array.isArray(saved.transitions)||Object.keys(saved.transitions).length)throw Error('Unsupported Coldwell transition save.');
    return saved;
  }
  supportAt(state,point,options){return this.geometry.supportAt(state,point,options);}
  trace(state,from,to,options){return this.geometry.trace(state,from,to,options);}
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
    const support=this.supportAt(state,p,{step:!!p.stairId});if(!support||Math.abs(support.h-p.h)>(p.stairId?.221:.041))return false;
    if(this.geometry.bodyHit(state,p,p,{height,radius:RADIUS,step:!!p.stairId}))return false;
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
      const add=(q,via=null)=>{if(!clear(q))return;if(!via&&!this.sweep(state,actor,p,q).ok)return;const route=via||[q];let d=0,previous=p;for(const node of route){d+=spatialDistance(previous,node);previous=node;}result.push({point:q,route,d});};
      for(const goal of targets)if(p.floorId===goal.floorId&&spatialDistance(p,goal)<1.1)add(goal);
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
    return this.path(state,actor,lastSeen,{...options,goals});
  }
  pick(state,from,direction,{min=-.5,max=64}={}){
    const ray=new Ray(toThree(from),new Vector3(direction.x,direction.h,direction.y).normalize());let result=null;
    for(const shape of this.geometry.support){
      if(shape.h<min||shape.h>max)continue;
      const point=ray.intersectPlane(new Plane(new Vector3(0,1,0),-shape.h),new Vector3());if(!point)continue;
      const p=fromThree(point);if(!polygonContains(p,shape))continue;const distance=point.distanceTo(ray.origin);
      if(!result||distance<result.distance)result={...p,floorId:shape.floorId,distance};
    }
    return result;
  }
}
