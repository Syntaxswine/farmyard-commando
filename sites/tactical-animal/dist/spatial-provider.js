// Optional runtime seam. Large immutable query data never enters game saves.
const providers=new Map(),bindings=new WeakMap();
export const SPATIAL_SCHEMA=1;
export function registerSpatialProvider(id,provider){
  if(typeof id!=='string'||!provider||provider.schema!==SPATIAL_SCHEMA)throw Error('Unsupported spatial provider.');
  for(const method of ['createState','validateState','supportAt','occupancy','sweep','trace','path','pick'])if(typeof provider[method]!=='function')throw Error('Incomplete spatial provider: '+method);
  if(providers.has(id)&&providers.get(id)!==provider)throw Error('Spatial provider identity is already registered.');
  providers.set(id,provider);return provider;
}
export function providerFor(state){
  if(!state.spatial)return null;
  let provider=bindings.get(state);
  if(!provider){provider=providers.get(state.spatial.provider);if(!provider)throw Error('Required spatial provider is not loaded.');provider.validateState(state.spatial);bindings.set(state,provider);}
  return provider;
}
export function attachSpatial(state,id,saved){
  const provider=providers.get(id);if(!provider)throw Error('Required spatial provider is not loaded.');
  const value=saved??provider.createState();provider.validateState(value);state.spatial=value;bindings.set(state,provider);return provider;
}
export const floorKey=(point,x=point.x,y=point.y)=>`${point.floorId}@${Math.floor(x)},${Math.floor(y)}`;
export const spatialDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.h??0)-(b.h??0));
export const actorHeight=actor=>actor.stance==='prone'?.42:actor.stance==='kneeling'?1.15:1.75;
export const actorEye=actor=>(actor.h??0)+(actor.stance==='prone'?.3:actor.stance==='kneeling'?.75:1.1);
