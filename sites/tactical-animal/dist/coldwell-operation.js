import {registerMissionAdapter} from './missions.js';
import {COLDWELL_DEFINITIONS} from './coldwell-missions.js';
import {siloToWorld,floorId} from './coldwell-space.js';
export function coldwellRigObjects(provider){
  return provider.bundle.data.rigs.map(rig=>{
    let point,name;
    if(rig.sourceEdge){const [axis,x,y]=rig.sourceEdge.split(':');point={x:+x+(axis==='s'?.5:1),y:+y+(axis==='s'?1:.5),h:46.64};name='Support building door';}
    else if(rig.kind==='door'){point=siloToWorld(provider.bundle.data.semantics.openings.find(o=>o.id===rig.id).center);name='Blast door · '+rig.id.split('-').at(-1);}
    else if(rig.kind==='platform'){point={x:154.1,y:103.5,h:rig.level*2.12};name='Service bridge · B'+(22-rig.level);}
    else{point={x:142.5,y:98.25,h:46.64};name='Silo cover';}
    return {id:rig.id,rigId:rig.id,kind:'rig',name,...point,floorId:floorId(rig.level),range:1.65,anchorHeight:rig.kind==='door'?1.2:.8,open:false,inventory:[],combatCost:rig.kind==='door'?1:2};
  });
}
export function coldwellMap(provider){
  const source=provider.bundle.data.surface;
  return {name:'Coldwell complete site',terrain:structuredClone(provider.bundle.terrain),edges:structuredClone(source.edges),worldBounds:{x:.5,y:.5,w:240,h:240},groundPalette:'coldwell',spatialProvider:provider.id,interactables:coldwellRigObjects(provider),starts:structuredClone(source.starts),exits:structuredClone(source.exits),props:source.props.map(p=>({...p,x:p.x+.5,y:p.y+.5,h:46.64+(p.z||0)*2.12,floorId:floorId(22)}))};
}
export function registerColdwellOperations(provider){for(const definition of COLDWELL_DEFINITIONS)registerMissionAdapter(definition.id,()=>coldwellMap(provider));}
