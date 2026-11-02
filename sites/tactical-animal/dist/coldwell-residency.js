import {blockWindow} from './world-grid.js';
export const COLDWELL_RENDER_DEFAULTS=Object.freeze({adjacentFloors:1,floorInterval:2.12});
export function coldwellVisibleRegion(focus,{adjacentFloors=1,roofs=false}={}){
  if(![focus.x,focus.y,focus.h].every(Number.isFinite)||!Number.isInteger(adjacentFloors)||adjacentFloors<0||adjacentFloors>3)throw Error('Invalid Coldwell visible region.');
  // The old tile centres are integers; canonical Coldwell tile edges are integers.
  const window=blockWindow({width:240,height:240},{x:focus.x-.5,y:focus.y-.5});
  const index=Math.max(0,Math.round(focus.h/2.12)),min=Math.max(-.5,(index-adjacentFloors)*2.12-.12),max=(index+adjacentFloors+1)*2.12+.01;
  return {rect:{x:window.x,y:window.y,w:window.w,h:window.h},heightBands:[{min,max}],cutaway:{roofs},blocks:window.blocks,key:`${window.key}:${index}:${adjacentFloors}:${roofs}`};
}
export function coldwellBoundsIntersect(bounds,{rect,heightBands}){
  return bounds.max[0]>=rect.x&&bounds.min[0]<=rect.x+rect.w&&bounds.max[2]>=rect.y&&bounds.min[2]<=rect.y+rect.h&&heightBands.some(b=>bounds.max[1]>=b.min&&bounds.min[1]<=b.max);
}
