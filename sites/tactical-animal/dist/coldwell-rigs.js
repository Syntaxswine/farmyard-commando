import {actorHeight,actorEye,spatialDistance} from './spatial-provider.js';
import {capsuleTriangleHit} from './coldwell-space.js';
const EPS=1e-8,copy=value=>structuredClone(value);

// Farmyard action/state adapter around the original source poses. It owns no
// meshes or renderer clock. The same accepted pose drives queries and art.
export class ColdwellRigRules{
  constructor(provider){this.provider=provider;this.geometry=provider.geometry;this.rigs=provider.geometry.rigs;this.previewCache=new WeakMap();this.radii=new Map();
    for(const rig of this.rigs.values()){let radius=0;for(const batch of this.geometry.rigBatches.get(rig.id))for(let i=batch.offset;i<batch.offset+batch.count;i+=3)radius=Math.max(radius,Math.hypot(provider.bundle.positions[i],provider.bundle.positions[i+2]));this.radii.set(rig.id,radius);}
  }
  duration(rig){return rig.kind==='door'?.65:1.2;}
  moving(state){return Object.keys(state.spatial.transitions).length>0;}
  validate(saved){
    if(!saved.poses||Object.getPrototypeOf(saved.poses)!==Object.prototype||Object.keys(saved.poses).length!==this.rigs.size)throw Error('Unsupported Coldwell poses.');
    for(const rig of this.rigs.values())if(!Number.isFinite(saved.poses[rig.id])||saved.poses[rig.id]<0||saved.poses[rig.id]>rig.maximum)throw Error('Invalid Coldwell rig save.');
    if(!saved.transitions||Object.getPrototypeOf(saved.transitions)!==Object.prototype||Object.keys(saved.transitions).length>1)throw Error('Unsupported Coldwell transitions.');
    for(const [id,t]of Object.entries(saved.transitions)){
      const rig=this.rigs.get(id);
      if(!rig||!t||Object.keys(t).sort().join(',')!=='duration,elapsed,from,to'||![t.from,t.to,t.elapsed,t.duration].every(Number.isFinite)||t.from<0||t.to<0||t.from>rig.maximum||t.to>rig.maximum||t.from===t.to||t.duration!==this.duration(rig)||t.elapsed<0||t.elapsed>=t.duration||Math.abs(saved.poses[id]-(t.from+(t.to-t.from)*t.elapsed/t.duration))>1e-8)throw Error('Invalid Coldwell transition save.');
    }
  }
  canReach(state,actor,object){
    if(!Number.isFinite(object.h)||!this.provider.floorById.has(object.floorId)||spatialDistance(actor,object)>object.range+EPS)return false;
    const from={x:actor.x,y:actor.y,h:actorEye(actor)},to={x:object.x,y:object.y,h:object.h+(object.anchorHeight??.8)},options={ignoreRig:object.rigId||object.id};
    return !this.provider.trace(state,from,to,{...options,purpose:'sight'})&&!this.provider.trace(state,from,to,{...options,purpose:'reach'});
  }
  preview(state,id,to){
    const rig=this.rigs.get(id),from=state.spatial.poses[id];
    if(!rig||!Number.isFinite(to)||to<0||to>rig.maximum||to===from)return {ok:false,reason:'That machinery position is unavailable.'};
    if(this.moving(state))return {ok:false,reason:'Wait for the machinery to finish moving.'};
    const actors=(state.units||[]).filter(u=>Number.isFinite(u.h));
    const key=JSON.stringify([state.spatial.revision,id,from,to,actors.map(u=>[u.id,u.x,u.y,u.h,u.stance,u.hp]),(state.interactables||[]).filter(o=>o.kind==='chest').map(o=>[o.id,o.x,o.y,o.h])]);
    let cache=this.previewCache.get(state.spatial);if(!cache){cache=new Map();this.previewCache.set(state.spatial,cache);}if(cache.has(key))return copy(cache.get(key));
    const finish=result=>{if(cache.size>=32)cache.clear();cache.set(key,result);return copy(result);};
    if(rig.kind==='platform')for(const actor of [...actors,...(state.interactables||[]).filter(o=>o.kind==='chest'),...(state.fires||[]).filter(p=>p.turns>0)]){
      const support=this.provider.supportAt(state,actor,{radius:.23,maxDrop:.22,maxRise:.22});if(support?.surfaceId===id)return finish({ok:false,reason:'The service bridge is occupied.'});
    }
    const bounds=rig.motionBounds;
    const relevant=actors.filter(u=>!bounds||u.x+.23>=bounds.min.x&&u.x-.23<=bounds.max.x&&u.y+.23>=bounds.min.y&&u.y-.23<=bounds.max.y&&u.h+(u.hp>0?actorHeight(u):.35)>=bounds.min.h&&u.h<=bounds.max.h);
    if(relevant.length){
      const amount=Math.abs(to-from),travel=rig.kind==='door'?this.radii.get(id)*amount*Math.PI/180:Math.hypot(...rig.travel)*amount,steps=Math.max(1,Math.ceil(travel/.025)),padding=travel/steps+.00005;
      // Every intermediate triangle is within this motion bound of a sampled
      // pose. Inflate only the contact test to cover the intervening sweep.
      for(let i=0;i<=steps;i++){
        const record=this.geometry.rigGeometry(id,from+(to-from)*i/steps);
        for(const actor of relevant){
          const height=actor.hp>0?actorHeight(actor):.35;
          if(actor.x+.23+padding<record.box.min.x||actor.x-.23-padding>record.box.max.x||actor.y+.23+padding<record.box.min.z||actor.y-.23-padding>record.box.max.z||actor.h+height+padding<record.box.min.y||actor.h-padding>record.box.max.y)continue;
          if(this.geometry.triangles(record,triangle=>capsuleTriangleHit(actor,actor,height,.23,triangle,padding)?false:undefined)===false)return finish({ok:false,reason:'A body is in the machinery sweep.'});
        }
      }
    }
    return finish({ok:true,reason:'',from,to,duration:this.duration(rig)});
  }
  start(state,id,to){
    const result=this.preview(state,id,to);if(!result.ok)return result;
    state.spatial.transitions[id]={from:result.from,to,elapsed:0,duration:result.duration};state.spatial.revision++;return result;
  }
  tick(state,dt){
    if(!this.moving(state))return false;
    for(const [id,t]of Object.entries(state.spatial.transitions)){
      t.elapsed=Math.min(t.duration,t.elapsed+dt);state.spatial.poses[id]=t.from+(t.to-t.from)*t.elapsed/t.duration;
      if(t.elapsed===t.duration){state.spatial.poses[id]=t.to;delete state.spatial.transitions[id];}
    }
    state.spatial.revision++;state.revision++;return true;
  }
}
