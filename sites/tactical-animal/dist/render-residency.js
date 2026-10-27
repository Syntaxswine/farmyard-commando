import {blockWindow,gridDimensions,worldBounds} from './world-grid.js';
import {FIELD_CAMERA} from './grenade-controls.js';

export function windowChanges(previous,next){
  const old=new Map((previous?.blocks||[]).map(block=>[block.id,block]));
  const ids=new Set(next.blocks.map(block=>block.id));
  return {retained:next.blocks.filter(block=>old.has(block.id)),created:next.blocks.filter(block=>!old.has(block.id)),disposed:[...old.values()].filter(block=>!ids.has(block.id))};
}

export function clampCameraPoint(state,point){
  const bounds=worldBounds(state);
  return {x:Math.max(bounds.x,Math.min(bounds.x+bounds.w-1,point.x)),y:Math.max(bounds.y,Math.min(bounds.y+bounds.h-1,point.y))};
}

// Orthographic ground-plane half extents per metre of vertical camera span.
// A wide landscape viewport can otherwise see beyond the nine resident blocks.
export function groundCameraExtents(viewport){
  const {x,y,z}=FIELD_CAMERA,horizontal=Math.hypot(x,z),length=Math.hypot(horizontal,y),aspect=viewport.width/viewport.height;
  return {x:(Math.abs(z)*aspect+Math.abs(x)*length/y)/horizontal/2,y:(Math.abs(x)*aspect+Math.abs(z)*length/y)/horizontal/2};
}

export function residentCameraSpan(state,point,viewport,requested){
  const dimensions=gridDimensions(state);
  if(dimensions.width<=72&&dimensions.height<=72)return requested;
  const focus=clampCameraPoint(state,point),window=blockWindow(state,focus),bounds=worldBounds(state),extent=groundCameraExtents(viewport);
  let span=requested;
  // The outside of the playable world is allowed to show the field background.
  // Only internal chunk boundaries constrain the field of view.
  if(window.x>bounds.x)span=Math.min(span,(focus.x-window.x+.5)/extent.x);
  if(window.x+window.w<bounds.x+bounds.w)span=Math.min(span,(window.x+window.w-.5-focus.x)/extent.x);
  if(window.y>bounds.y)span=Math.min(span,(focus.y-window.y+.5)/extent.y);
  if(window.y+window.h<bounds.y+bounds.h)span=Math.min(span,(window.y+window.h-.5-focus.y)/extent.y);
  return Math.max(.1,span-1e-6);
}
