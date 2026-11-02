import {providerFor} from './spatial-provider.js';
import {missionForState,objectiveSecured} from './missions.js';

// Canonical Coldwell cells have centres at n + .5. The saved raster index is n;
// each floor retains its own knowledge. The legacy minimap stays unchanged.
export function drawColdwellMinimap(canvas,state,{floorId=state.units.find(u=>u.team==='squad').floorId}={}){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,provider=providerFor(state),floor=provider.floorById.get(floorId);if(!floor)return;
  const width=state.map[0].length,height=state.map.length,scale=Math.min((w-12)/width,(h-12)/height),ox=(w-width*scale)/2,oy=(h-height*scale)/2;
  ctx.fillStyle='#1b2219';ctx.fillRect(0,0,w,h);const prefix=floorId+'@',seen=new Set([...state.seen].filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length)));
  for(const cell of seen){const [x,y]=cell.split(',').map(Number);if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)continue;const raw=floor.index===22?state.map[y][x]:'floor',tile=raw==='void'?'floor':raw;ctx.fillStyle=tile==='crate'?'#746b4e':tile==='floor'||tile==='concrete'?'#686d51':tile==='ground-asphalt'?'#575954':'#3e4b31';ctx.fillRect(ox+x*scale,oy+y*scale,scale+.2,scale+.2);}
  if(floor.index===22){
    const doors=new Map(state.interactables.filter(o=>o.kind==='rig').map(o=>[provider.geometry.rigs.get(o.rigId)?.sourceEdge,o]));ctx.strokeStyle='#acaa88';ctx.lineWidth=Math.max(1,scale*.14);ctx.beginPath();
    for(const [edge,kind]of Object.entries(state.edges)){const door=doors.get(edge);if(door?door.open:kind==='door')continue;const [axis,sx,sy]=edge.split(':'),x=+sx,y=+sy;if(!seen.has(x+','+y)&&!seen.has((x+(axis==='e'?1:0))+','+(y+(axis==='s'?1:0))))continue;if(axis==='e'){ctx.moveTo(ox+(x+1)*scale,oy+y*scale);ctx.lineTo(ox+(x+1)*scale,oy+(y+1)*scale);}else{ctx.moveTo(ox+x*scale,oy+(y+1)*scale);ctx.lineTo(ox+(x+1)*scale,oy+(y+1)*scale);}}
    ctx.stroke();
  }
  const dot=(p,color,r)=>{if(p.floorId!==floorId)return;ctx.fillStyle=color;ctx.beginPath();ctx.arc(ox+p.x*scale,oy+p.y*scale,r,0,Math.PI*2);ctx.fill();},mission=missionForState(state);
  if(!objectiveSecured(state))dot(mission.objective,'#df613f',Math.max(2,scale*.45));dot(mission.extraction,'#c4d29a',Math.max(2,scale*.45));for(const id of state.detected){const guard=state.units.find(u=>u.id===id);if(guard?.hp>0)dot(guard,'#e16a47',Math.max(2,scale*.32));}
  const unit=state.units.find(u=>u.team==='squad');if(unit.floorId===floorId){ctx.save();ctx.translate(ox+unit.x*scale,oy+unit.y*scale);ctx.rotate(unit.heading*Math.PI/180+Math.PI/2);ctx.fillStyle='#f3edd1';const r=Math.max(3,scale*.5);ctx.beginPath();ctx.moveTo(0,-r*1.5);ctx.lineTo(r,r);ctx.lineTo(0,r*.45);ctx.lineTo(-r,r);ctx.closePath();ctx.fill();ctx.restore();}
  ctx.fillStyle='#e3dec6';ctx.font='11px system-ui';ctx.fillText?.(floor.label,8,14);
}
