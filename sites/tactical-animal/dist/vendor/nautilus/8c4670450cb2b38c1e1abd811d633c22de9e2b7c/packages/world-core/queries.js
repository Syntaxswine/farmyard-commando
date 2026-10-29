import {openWorld} from './state.js';
import {fields,identifier,finite,boolean,point,box,overlaps,bytes,ordered,fail} from './validation.js';

const axes=['x','y','h'],copy=value=>structuredClone(value),compare=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function union(records){const result=copy(records[0].bounds);for(const record of records)for(const key of axes){result.min[key]=Math.min(result.min[key],record.bounds.min[key]);result.max[key]=Math.max(result.max[key],record.bounds.max[key]);}return result;}
function build(records,counter){
  if(!records.length)return null;counter.nodes++;const bounds=union(records);
  if(records.length<=8)return {bounds,records};
  const axis=axes.reduce((best,key)=>bounds.max[key]-bounds.min[key]>bounds.max[best]-bounds.min[best]?key:best,'x');
  records.sort((a,b)=>(a.bounds.min[axis]+a.bounds.max[axis])-(b.bounds.min[axis]+b.bounds.max[axis])||compare(a,b));const middle=Math.floor(records.length/2);
  return {bounds,left:build(records.slice(0,middle),counter),right:build(records.slice(middle),counter)};
}
function intersect(from,to,bounds){
  let near=0,far=1,normal={x:0,y:0,h:0};const startedInside=axes.every(key=>from[key]>=bounds.min[key]&&from[key]<=bounds.max[key]);
  for(const key of axes){const direction=to[key]-from[key];if(direction===0){if(from[key]<bounds.min[key]||from[key]>bounds.max[key])return null;continue;}
    let a=(bounds.min[key]-from[key])/direction,b=(bounds.max[key]-from[key])/direction;if(a>b)[a,b]=[b,a];
    if(a>near){near=a;normal={x:0,y:0,h:0};normal[key]=direction>0?-1:1;}far=Math.min(far,b);if(near>far)return null;
  }
  return {fraction:near,normal,startedInside};
}

/** Immutable, static AABB snapshot; no renderer, physics clock or hidden-floor filter.
 * Changes require compilation of a new validated snapshot. This is not a sphere
 * sweep, arbitrary-mesh collider, route executor, fall/damage or perception system.
 */
export function compileWorld(input){
  const state=openWorld(input),floors=new Map(state.floors.map(floor=>[floor.id,floor])),buckets=new Map(),counter={nodes:0};
  const bucket=id=>{if(!buckets.has(id))buckets.set(id,{surfaces:[],entities:[],links:[]});return buckets.get(id);};
  for(const surface of state.surfaces)bucket(surface.floorId).surfaces.push(surface);
  for(const entity of state.entities)bucket(entity.floorId).entities.push(entity);
  for(const link of state.links){bucket(link.from.floorId).links.push(link);bucket(link.to.floorId).links.push(link);}
  const tree=build([...state.surfaces],counter),serializedBytes=bytes(JSON.stringify(ordered(state)));
  function knownFloor(id){identifier(id,'/floorId');if(!floors.has(id))fail('MISSING_FLOOR','/floorId','No floor has ID '+id+'.');return floors.get(id);}
  function candidates(bounds){let visitedNodes=0,examinedSurfaces=0;const records=[];
    const visit=node=>{if(!node)return;visitedNodes++;if(!overlaps(node.bounds,bounds))return;if(node.records){for(const record of node.records){examinedSurfaces++;if(overlaps(record.bounds,bounds))records.push(record);}}else{visit(node.left);visit(node.right);}};
    visit(tree);return {records,visitedNodes,examinedSurfaces};
  }
  return Object.freeze({
    snapshot:()=>copy(state),
    getFloor(id){return copy(knownFloor(id));},
    recordsForFloor(id){knownFloor(id);return copy(buckets.get(id)||{surfaces:[],entities:[],links:[]});},
    linksFrom(id){knownFloor(id);return copy((buckets.get(id)?.links||[]).filter(link=>link.from.floorId===id||link.bidirectional));},
    stats(){return {floorCount:state.floors.length,allocatedFloorBuckets:buckets.size,surfaces:state.surfaces.length,entities:state.entities.length,links:state.links.length,bvhNodes:counter.nodes,serializedBytes,denseCells:0};},
    queryBounds(bounds){box(bounds);const found=candidates(bounds);return {surfaces:copy(found.records.sort(compare)),visitedNodes:found.visitedNodes,examinedSurfaces:found.examinedSurfaces};},
    traceSegment(settings){
      fields(settings,['from','to'],'/segment');point(settings.from,'/segment/from');point(settings.to,'/segment/to');const {from,to}=settings;let best=null;
      const visit=node=>{if(!node)return;const broad=intersect(from,to,node.bounds);if(!broad||best&&broad.fraction>best.fraction)return;
        if(node.records){for(const surface of node.records){const hit=intersect(from,to,surface.bounds);if(!hit)continue;if(!best||hit.fraction<best.fraction||hit.fraction===best.fraction&&surface.id<best.surfaceId)best={...hit,surfaceId:surface.id,anchorFloorId:surface.floorId,role:surface.role,point:Object.fromEntries(axes.map(key=>[key,from[key]+(to[key]-from[key])*hit.fraction]))};}}
        else{visit(node.left);visit(node.right);}};
      visit(tree);return best;
    },
    findSupport(settings){
      fields(settings,['position','maxDropM','requireFloor'],'/support');point(settings.position,'/support/position');finite(settings.maxDropM,0,4096,'/support/maxDropM');boolean(settings.requireFloor,'/support/requireFloor');
      const {position,maxDropM,requireFloor}=settings,found=candidates({min:{x:position.x,y:position.y,h:position.h-maxDropM},max:{...position}});
      const surface=found.records.filter(record=>record.supports&&record.bounds.max.h<=position.h&&position.h-record.bounds.max.h<=maxDropM).sort((a,b)=>b.bounds.max.h-a.bounds.max.h||compare(a,b))[0];
      // A nearer support without a declared floor cannot be tunneled through to
      // find a more convenient floor below it. The caller can inspect it with
      // requireFloor:false; this provider never invents a floor from its height.
      if(requireFloor&&surface?.supportFloorId===null)return null;
      return surface?{surfaceId:surface.id,floorId:surface.supportFloorId,anchorFloorId:surface.floorId,role:surface.role,point:{x:position.x,y:position.y,h:surface.bounds.max.h},dropM:position.h-surface.bounds.max.h}:null;
    }
  });
}
