import {compileWorld} from './vendor/nautilus/8c4670450cb2b38c1e1abd811d633c22de9e2b7c/packages/world-core/queries.js';
import {Vector3,Triangle,Ray,Box3} from './aft/tactics/vendor/three.module.js';
import {siloToWorld,siteToWorld,rigPoint,toThree,fromThree,triangleFromArray,capsuleTriangleHit,polygonContains,supportedDisc,floorId} from './coldwell-space.js';
import {interactionFootprint} from './interactions.js';

const EPS=5e-5,vec=(x,y,z)=>new Vector3(x,y,z),boundsOf=points=>{
  const box=new Box3();for(const point of points)box.expandByPoint(point);return box;
};
const worldBox=box=>({min:{x:box.min.x,y:box.min.z,h:box.min.y},max:{x:box.max.x,y:box.max.z,h:box.max.y}});
const inflated=box=>{const value=box.clone();for(const axis of ['x','y','z'])if(value.max[axis]-value.min[axis]<1e-5){value.min[axis]-=1e-5;value.max[axis]+=1e-5;}return value;};
const polygonBounds=shape=>({x0:Math.min(...shape.outline.map(p=>p[0])),x1:Math.max(...shape.outline.map(p=>p[0])),y0:Math.min(...shape.outline.map(p=>p[1])),y1:Math.max(...shape.outline.map(p=>p[1]))});
const touches=(p,r,b)=>p.x+r>=b.x0&&p.x-r<=b.x1&&p.y+r>=b.y0&&p.y-r<=b.y1;

export class ColdwellGeometry{
  constructor(bundle){
    this.bundle=bundle;this.records=new Map();this.broadRecords=new Map();this.rigs=new Map(bundle.data.rigs.map(r=>[r.id,r]));this.dynamicCache=new WeakMap();this.rigBatches=new Map();
    for(const batch of bundle.data.batches)if(batch.rigId){if(!this.rigBatches.has(batch.rigId))this.rigBatches.set(batch.rigId,[]);this.rigBatches.get(batch.rigId).push(batch);}
    this.positions=new Float32Array(bundle.positions.length);this.triangle=new Triangle();
    const surfaces=[],floors=bundle.data.plan.floors.map(f=>({id:f.id,index:f.index,label:f.label,elevationM:f.worldElevationM}));
    floors.push({id:'coldwell-roof-1',index:23,label:'Surface roofs',elevationM:48.76});this.floors=floors;
    this.support=[];
    for(const [semantics,transform]of [[bundle.data.semantics,siloToWorld],[bundle.data.infill,siteToWorld]])for(const floor of semantics.floors){
      const convert=poly=>poly.map(([x,y])=>{const p=transform([x,floor.nativeTop,y]);return [p.x,p.y];});
      const shape={id:floor.id,floorId:floor.floorId||floorId(22),h:floor.nativeTop+46.64,outline:convert(floor.outline),holes:floor.holes.map(convert)};
      shape.bounds=polygonBounds(shape);this.support.push(shape);
    }
    for(const panel of bundle.data.surfacePanels){
      const shape={id:panel.id,floorId:panel.floorId,h:panel.h,outline:[[panel.x,panel.y],[panel.x+panel.w,panel.y],[panel.x+panel.w,panel.y+panel.d],[panel.x,panel.y+panel.d]],holes:[]};shape.bounds=polygonBounds(shape);this.support.push(shape);
      const box=new Box3(vec(panel.x,panel.h-.12,panel.y),vec(panel.x+panel.w,panel.h,panel.y+panel.d));
      this.records.set(panel.id,{id:panel.id,box,kind:'floor',panel});surfaces.push(this.record(panel.id,box,panel.floorId));
    }
    for(const volume of bundle.data.surfaceVolumes){
      const box=new Box3(vec(...volume.min),vec(...volume.max));this.records.set(volume.id,{...volume,box});surfaces.push(this.record(volume.id,box,floorId(22)));
    }
    for(const batch of bundle.data.batches){
      if(batch.frame==='rig')continue;
      const transform=batch.frame==='silo'?siloToWorld:siteToWorld;
      for(let i=batch.offset;i<batch.offset+batch.count;i+=3){const p=transform(bundle.positions.subarray(i,i+3));this.positions.set([p.x,p.h,p.y],i);}
      for(let offset=batch.offset;offset<batch.offset+batch.count;offset+=9*32){
        const count=Math.min(9*32,batch.offset+batch.count-offset),box=new Box3();
        for(let i=offset;i<offset+count;i+=3)box.expandByPoint(vec().fromArray(this.positions,i));
        const id='native-'+offset;this.records.set(id,{id,box,batch,offset,count,kind:batch.kind});surfaces.push(this.record(id,box,floorId(batch.level)));
      }
    }
    // Reuse the released upstream BVH and validation. Records are broad phase;
    // every native hit below is confirmed against source triangles.
    this.world=compileWorld({kind:'nautilus-extended-world',version:1,id:'coldwell-static-geometry',name:'Coldwell immutable geometry',profileId:'native-metres-v1',bounds:{widthM:240,depthM:240,minHeightM:-.5,heightM:64},floors,surfaces,entities:[],links:[]});
  }
  record(sourceId,box,anchor){const id='broad-'+this.broadRecords.size;this.broadRecords.set(id,this.records.get(sourceId));return {id,floorId:anchor,role:'solid',bounds:worldBox(inflated(box)),supports:false,supportFloorId:null};}
  candidates(box){return this.world.queryBounds(worldBox(inflated(box))).surfaces.map(s=>this.broadRecords.get(s.id));}
  dynamics(state){
    const saved=state.spatial||state;let cache=this.dynamicCache.get(saved);
    if(cache?.revision===saved.revision)return cache.records;
    const records=[];
    for(const rig of this.rigs.values())records.push(this.rigGeometry(rig.id,saved.poses[rig.id]));
    cache={revision:saved.revision,records};this.dynamicCache.set(saved,cache);return records;
  }
  rigGeometry(id,pose){
    const rig=this.rigs.get(id);if(!rig)throw Error('Unknown Coldwell rig.');const batches=this.rigBatches.get(id),positions=new Float32Array(batches.reduce((n,b)=>n+b.count,0)),box=new Box3();let cursor=0;
    for(const batch of batches)for(let i=batch.offset;i<batch.offset+batch.count;i+=3){const p=rigPoint(rig,this.bundle.positions.subarray(i,i+3),pose);positions.set([p.x,p.h,p.y],cursor);cursor+=3;box.expandByPoint(vec(p.x,p.h,p.y));}
    return {rig,positions,box,kind:rig.kind,id:rig.id};
  }
  nearby(state,box){
    const objects=[];
    for(const object of state.interactables||[]){
      if(object.kind!=='chest')continue;const b=interactionFootprint(object),shape=new Box3(vec(b.x0,object.h,b.y0),vec(b.x1,object.h+b.height,b.y1));
      if(shape.intersectsBox(box))objects.push({id:object.id,box:shape,kind:'chest'});
    }
    return [...this.candidates(box),...this.dynamics(state).filter(r=>r.box.intersectsBox(box)),...objects];
  }
  triangles(record,visit){
    const array=record.positions||this.positions,start=record.offset||0,end=record.positions?.length??start+record.count;
    for(let i=start;i<end;i+=9)if(visit(triangleFromArray(array,i,this.triangle),i)===false)return false;
    return true;
  }
  trace(state,from,to,{purpose='shot',ignoreRig=null}={}){
    // Visibility only needs an obstruction, not the nearest impact. An exact
    // authored support polygon crossing proves a solid floor hit immediately;
    // holes retain their original outlines. Bullet impacts still use triangles.
    if(purpose==='sight'&&Math.abs(to.h-from.h)>EPS)for(const shape of this.support){
      const fraction=(shape.h-from.h)/(to.h-from.h);if(fraction<=1e-6||fraction>=1-1e-6)continue;
      const point={x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,h:shape.h};
      if(touches(point,0,shape.bounds)&&polygonContains(point,shape))return {fraction,point,id:shape.id,kind:'floor'};
    }
    const a=toThree(from),b=toThree(to),delta=b.clone().sub(a),length=delta.length();if(!length)return null;
    const ray=new Ray(a,delta.divideScalar(length)),box=boundsOf([a,b]);let best=null;
    if(purpose==='sight'&&from.h<46.64){
      // Reuse Nautilus's ray BVH before allocating a box-query candidate list.
      // Its envelope alone proves nothing: confirm the supplied mesh first.
      const broad=this.world.traceSegment({from:{x:from.x,y:from.y,h:from.h},to:{x:to.x,y:to.y,h:to.h}}),record=broad&&this.broadRecords.get(broad.surfaceId);
      if(record&&record.id!==ignoreRig&&!record.walkOnly&&record.blocksSight!==false){
        const point=new Vector3(),accept=p=>{const fraction=p.distanceTo(a)/length;if(fraction>1e-6&&fraction<=1+1e-6)best={fraction,point:fromThree(p),id:record.id,kind:record.kind};};
        if(!record.batch){const hit=ray.intersectBox(record.box,point);if(hit)accept(hit);}
        else this.triangles(record,triangle=>{const hit=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,point);if(hit){accept(hit);if(best)return false;}});
        if(best)return best;
      }
    }
    const prefixLength=Math.min(3,length),prefixEnd=ray.at(prefixLength,new Vector3()),prefix=boundsOf([a,prefixEnd]),visited=new Set();
    for(const region of length>3&&from.h<46.64?[prefix,box]:[box]){
    for(const record of this.nearby(state,region)){
      if(visited.has(record.id))continue;visited.add(record.id);
      if(record.id===ignoreRig||record.walkOnly&&purpose!=='reach'||purpose==='sight'&&record.blocksSight===false||purpose==='shot'&&record.blocksShot===false)continue;
      const entry=ray.intersectBox(record.box,new Vector3());if(!entry||entry.distanceToSquared(a)>length*length+EPS)continue;
      const hit=point=>{
        const fraction=point.distanceTo(a)/length;if(fraction<=1e-6||fraction>1+1e-6||best&&fraction>=best.fraction)return;
        best={fraction,point:fromThree(point),id:record.id,kind:record.kind,rigId:record.rig?.id};
      };
      if(!record.batch&&!record.positions)hit(entry);
      else this.triangles(record,triangle=>{const point=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,new Vector3());if(point)hit(point);});
    }
    if(best&&best.fraction*length<=prefixLength+EPS)break;
    }
    return best;
  }
  supportAt(state,point,{radius=.23,maxDrop=.22,maxRise=.22,step=false}={}){
    const min=point.h-(step?Math.max(maxDrop,.4):maxDrop)-EPS,max=point.h+(step?Math.max(maxRise,.4):maxRise)+EPS;
    const shapes=this.support.filter(s=>s.h>=min&&s.h<=max&&touches(point,radius,s.bounds));
    // The source's open treads and bridge grates are actual supporting triangles.
    const box=new Box3(vec(point.x-radius,min-.01,point.y-radius),vec(point.x+radius,max+.01,point.y+radius));
    for(const record of this.nearby(state,box))if(record.kind==='stair'||record.rig?.kind==='platform')this.triangles(record,triangle=>{
      if(Math.abs(triangle.a.y-triangle.b.y)>EPS||Math.abs(triangle.b.y-triangle.c.y)>EPS)return;
      const normal=triangle.getNormal(new Vector3());if(normal.y<.999)return;
      const h=triangle.a.y;if(h<min||h>max)return;
      const shape={id:record.rig?.id||record.batch.id,floorId:record.rig?floorId(record.rig.level):floorId(record.batch.level),h,step:true,outline:[triangle.a,triangle.b,triangle.c].map(p=>[p.x,p.z]),holes:[]};shape.bounds=polygonBounds(shape);shapes.push(shape);
    });
    const centres=shapes.filter(s=>polygonContains(point,s)).sort((a,b)=>b.h-a.h||a.id.localeCompare(b.id));
    for(const centre of centres){
      // A body's footprint may straddle two adjacent native stair treads. All
      // contacted pieces must remain within one ordinary riser of the feet.
      const stepHeight=step ? .4 : centre.step ? .205 : EPS;
      const nearby=shapes.filter(s=>Math.abs(s.h-centre.h)<=stepHeight);
      if(supportedDisc(point,radius,nearby))return {x:point.x,y:point.y,h:centre.h,floorId:centre.floorId,surfaceId:centre.id};
    }
    return null;
  }
  bodyHit(state,a,b,{height=1.75,radius=.23,step=false,ignoreRig=null}={}){
    const box=new Box3(vec(Math.min(a.x,b.x)-radius,Math.min(a.h,b.h),Math.min(a.y,b.y)-radius),vec(Math.max(a.x,b.x)+radius,Math.max(a.h,b.h)+height,Math.max(a.y,b.y)+radius));
    for(const record of this.nearby(state,box)){
      if(record.id===ignoreRig)continue;
      if(record.batch||record.positions){
        const blocked=this.triangles(record,triangle=>{
          // A 46 cm footprint straddles two 25 cm treads. Native risers are
          // 2.12/12 m, plus 16 mm nosing. Permit that authored leg clearance;
          // railings, upper flights and ceilings retain full body collision.
          if(step&&(record.kind==='stair'||record.rig?.kind==='platform')&&Math.max(triangle.a.y,triangle.b.y,triangle.c.y)<=Math.max(a.h,b.h)+.37)return;
          if(capsuleTriangleHit(a,b,height,radius,triangle))return false;
        })===false;
        if(blocked)return {id:record.id,rigId:record.rig?.id,kind:record.kind};
      }else{
        // These rectangular parts come unchanged from AFT's hybrid projection.
        // AABB is their actual declared geometry, unlike the native curved mesh.
        const expanded=record.box.clone();expanded.min.x-=radius;expanded.max.x+=radius;expanded.min.z-=radius;expanded.max.z+=radius;expanded.min.y-=height-EPS;expanded.max.y-=EPS;
        const start=toThree(a),end=toThree(b),delta=end.clone().sub(start),length=delta.length();
        if(expanded.containsPoint(start)||expanded.containsPoint(end))return {id:record.id,kind:record.kind};
        if(length){const point=new Ray(start,delta.divideScalar(length)).intersectBox(expanded,new Vector3());if(point&&point.distanceToSquared(start)<=length*length)return {id:record.id,kind:record.kind};}
      }
    }
    return null;
  }
}
