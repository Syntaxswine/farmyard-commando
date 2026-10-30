import {attachSpatial,providerFor,spatialDistance} from './spatial-provider.js';
import {coldwellRigObjects} from './coldwell-operation.js';

// Saves retain mutable simulation state. Immutable source geometry is loaded
// and verified first, then rebound by its exact source digest and stable IDs.
export function restoreColdwellBase(state,map){
  if(!state.spatial||state.spatial.provider!==map.spatialProvider)throw Error('Missing Coldwell spatial save.');
  const provider=attachSpatial(state,map.spatialProvider,state.spatial);
  if(JSON.stringify(state.edges)!==JSON.stringify(map.edges))throw Error('Unsupported Coldwell source edges.');
  state.map=structuredClone(map.terrain);state.edges=structuredClone(map.edges);
  const position=(p,{support=false}={})=>{
    if(!p||![p.x,p.y,p.h].every(Number.isFinite)||!provider.floorById.has(p.floorId))throw Error('Unsupported Coldwell position.');
    if(p.stairId&&!provider.stairById.has(p.stairId))throw Error('Unsupported Coldwell stair.');
    if(p.stairId){const q=provider.resolve(state,p,p);if(!q||q.stairId!==p.stairId||q.floorId!==p.floorId||Math.abs(q.h-p.h)>.025)throw Error('Unsupported Coldwell stair position.');}
    else if(Math.abs(p.h-provider.floorById.get(p.floorId).elevationM)>.025)throw Error('Unsupported Coldwell floor height.');
    if(support&&!provider.supportAt(state,p,{step:!!p.stairId}))throw Error('Unsupported Coldwell support.');
  };
  const ids=new Set();
  for(const unit of state.units){
    if(!Number.isSafeInteger(unit.id)||unit.id<0||ids.has(unit.id)||!['standing','kneeling','prone'].includes(unit.stance))throw Error('Unsupported Coldwell actor.');ids.add(unit.id);position(unit,{support:true});
    unit.z=provider.floorById.get(unit.floorId).index;
    if(unit.lastKnown)position(unit.lastKnown);
  }
  if(state.fogAt)position(state.fogAt);
  for(const point of state.queue||[])position(point,{support:true});
  return provider;
}

export function validateColdwellObjects(state,mission){
  const provider=providerFor(state),expected=[...mission.containers,...mission.clues,...coldwellRigObjects(provider)],objects=new Map(state.interactables.map(o=>[o.id,o]));
  if(state.interactables.some(o=>o.kind!=='body'&&!expected.some(e=>e.id===o.id)))throw Error('Unknown Coldwell object.');
  for(const original of expected){
    const object=objects.get(original.id);
    if(!object||object.kind!==original.kind||object.floorId!==original.floorId||spatialDistance(object,original)>1e-8)throw Error('Missing or moved Coldwell object.');
    if(object.kind==='rig'){
      if(object.rigId!==original.rigId)throw Error('Unsupported Coldwell rig identity.');
      const target=state.spatial.transitions[object.rigId]?.to??state.spatial.poses[object.rigId];
      if(object.open!==(target>0))throw Error('Inconsistent Coldwell machinery state.');
    }
    for(const [key,value]of Object.entries(original))if(!['open','searched','inventory'].includes(key))object[key]=structuredClone(value);
  }
  if(mission.objective.containerId){
    const records=objects.get(mission.objective.containerId).inventory.some(item=>item.id===mission.objective.id),secured=!!state.solo.objectives[mission.objective.id];
    if(records===secured||secured&&!state.solo.inspected.includes(mission.objective.requiresClue))throw Error('Inconsistent Coldwell records save.');
  }
  for(const unit of state.units)if(unit.hp>0&&!provider.occupancy(state,unit,unit,{units:false}))throw Error('Coldwell actor has invalid support or clearance.');
  return state;
}
