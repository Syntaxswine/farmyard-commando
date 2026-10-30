import {Ray,Vector3} from './aft/tactics/vendor/three.module.js';
import {actorHeight,actorEye,spatialDistance,floorKey} from './spatial-provider.js';
import {recordFlame} from './flame-event.js';
import {toThree,fromThree} from './coldwell-space.js';
const RADIUS=.23,alive=u=>u.hp>0;
export class ColdwellCombat{
  constructor(provider){this.provider=provider;}
  visibleCells(state,floorId){const prefix=floorId+'@';return new Set([...state.visible].filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length)));}
  cover(state,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    return [-RADIUS,0,RADIUS].some(offset=>this.provider.trace(state,{x:a.x,y:a.y,h:actorEye(a)},{x:b.x-dy/d*offset,y:b.y+dx/d*offset,h:b.h+actorHeight(b)*.62},{purpose:'shot'}))?20:0;
  }
  impact(state,a,b,zone){
    const from={x:a.x,y:a.y,h:actorEye(a)},height=zone==='head'?actorHeight(b):zone==='legs'?actorHeight(b)*.25:actorHeight(b)*.62,to={x:b.x,y:b.y,h:b.ground?b.h:b.h+height};
    const obstacle=this.provider.trace(state,from,to),origin=toThree(from),end=toThree(to),length=origin.distanceTo(end),ray=new Ray(origin,end.clone().sub(origin).normalize());
    let best=obstacle?{box:{kind:obstacle.kind,rigId:obstacle.rigId},t:obstacle.fraction,point:obstacle.point}:null;
    if(!length)return best;
    for(const unit of state.units)if(alive(unit)&&unit.id!==a.id){
      const low=new Vector3(unit.x,unit.h+RADIUS,unit.y),high=new Vector3(unit.x,unit.h+Math.max(RADIUS,actorHeight(unit)-RADIUS),unit.y),onRay=new Vector3(),onBody=new Vector3();
      if(ray.distanceSqToSegment(low,high,onRay,onBody)>RADIUS*RADIUS)continue;
      const t=onRay.distanceTo(origin)/length;if(t<=1e-7||t>1+1e-7||best&&t>=best.t)continue;
      const relative=(onRay.y-unit.h)/actorHeight(unit);best={unit,t,point:fromThree(onRay),zone:unit.id===b.id?zone:relative>.8?'head':relative<.32?'legs':'torso'};
    }
    return best;
  }
  grenadeLanding(state,actor,point){
    if(!point||![point.x,point.y].every(Number.isFinite))return null;
    const support=this.provider.supportAt(state,{...point,h:point.h??actor.h},{radius:.04,maxRise:.03,maxDrop:64});
    return support&&!this.provider.geometry.bodyHit(state,support,support,{height:.08,radius:.04})?support:null;
  }
  blastAffects(state,point,target,radius){
    return spatialDistance(point,target)<=radius&&!this.provider.trace(state,{x:point.x,y:point.y,h:point.h+.08},{x:target.x,y:target.y,h:target.h+actorHeight(target)*.62},{purpose:'shot'});
  }
  blastFootprint(state,point,radius){
    if(!state.seen.has(floorKey(point)))return [];
    return Array.from({length:97},(_,i)=>{
      const angle=i/96*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle),end={x:point.x+dx*radius,y:point.y+dy*radius,h:point.h+.08};
      const hit=this.provider.trace(state,{...point,h:point.h+.08},end),reach=hit?Math.max(0,hit.fraction*radius-.01):radius;let explored=reach;
      for(let d=0;d<=reach;d+=.1)if(!state.seen.has(floorKey(point,point.x+dx*d,point.y+dy*d))){explored=Math.max(0,d-.1);break;}
      return {x:point.x+dx*explored,y:point.y+dy*explored,h:point.h};
    });
  }
  flameShape(state,actor,range){return recordFlame(actor,range,[],this.visibleCells(state,actor.floorId),{trace:(from,to)=>this.provider.trace(state,from,to,{purpose:'shot'})});}
  flameAffects(state,actor,target,heading,range){
    const angle=Math.abs(((Math.atan2(target.y-actor.y,target.x-actor.x)*180/Math.PI-heading+540)%360)-180),h=actorEye(actor);
    return alive(target)&&target.id!==actor.id&&spatialDistance(actor,target)<=range&&angle<24&&h>=target.h&&h<=target.h+actorHeight(target)&&!this.provider.trace(state,{x:actor.x,y:actor.y,h},{x:target.x,y:target.y,h},{purpose:'shot'});
  }
}
