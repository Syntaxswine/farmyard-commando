import {describeWindow} from './art/windows/catalog.js';
import {makeWindowSystem} from './window-system.js';
const cache=new Map();
export function windowDefinition(id,joins={}){
  const raw=describeWindow(id,joins);if(cache.has(raw.cacheKey))return cache.get(raw.cacheKey);
  const part=p=>({id:p.id,role:p.role,min:p.bounds.min,max:p.bounds.max});
  const spec={id:raw.id,width:raw.span,panes:raw.panes.map(part),solids:raw.solids.map(part),raw};cache.set(raw.cacheKey,spec);return spec;
}
export const windowSystem=makeWindowSystem(windowDefinition);
