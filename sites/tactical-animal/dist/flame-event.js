// Solo coordinates are metres: (x,y) on the ground, h above it. The inherited
// painted renderer consumes these as Three (x,h,y), without AFT floor scaling.
export const FLAME_RAY_COUNT=37,FLAME_HALF_ANGLE=24*Math.PI/180;
const cell=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
const gap=(a,b)=>a.kind==='hidden'||a.kind!==b.kind||Math.abs(a.distance-b.distance)>1.05;

function wallEntry(a,b,box){
  let low=0,high=1;
  for(const [key,min,max] of [['x',box.x0,box.x1],['y',box.y0,box.y1]]){
    const delta=b[key]-a[key];
    if(Math.abs(delta)<1e-9){if(a[key]<min||a[key]>max)return null;continue;}
    const p=(min-a[key])/delta,q=(max-a[key])/delta;low=Math.max(low,Math.min(p,q));high=Math.min(high,Math.max(p,q));
    if(low>high)return null;
  }
  return high>1e-7?low:null;
}

export function recordFlame(source,range,geometry,visible){
  const heading=source.heading*Math.PI/180,h=source.stance==='prone'?.3:source.stance==='kneeling'?.75:1.1;
  const origin={x:source.x,y:source.y,h},walls=geometry.filter(box=>box.kind==='wall'),sourceVisible=visible.has(cell(source.x,source.y));
  const rays=Array.from({length:FLAME_RAY_COUNT},(_,i)=>{
    const angle=heading-FLAME_HALF_ANGLE+2*FLAME_HALF_ANGLE*i/(FLAME_RAY_COUNT-1),dx=Math.cos(angle),dy=Math.sin(angle),end={x:source.x+dx*range,y:source.y+dy*range};
    let reach=range,kind=sourceVisible?'range':'hidden';
    for(const box of walls){const entry=wallEntry(source,end,box);if(entry!==null&&entry*range<=reach){reach=Math.max(0,entry*range-.025);kind='wall';}}
    if(!sourceVisible){reach=0;kind='hidden';}
    else for(let d=0;d<=reach+.08;d+=.08){const at=Math.min(reach,d);if(!visible.has(cell(source.x+dx*at,source.y+dy*at))){reach=Math.max(0,at-.08);kind='fog';break;}}
    return {x:source.x+dx*reach,y:source.y+dy*reach,h,distance:reach,kind};
  });
  const visibleCells=[...visible].filter(key=>{const [x,y]=key.split(',').map(Number);return Math.hypot(x-source.x,y-source.y)<=range+1;});
  return {origin,heading,range,halfAngle:FLAME_HALF_ANGLE,rays,visibleCells,sourceVisible,source:{id:source.id,species:source.species,stance:source.stance,heading:source.heading,x:source.x,y:source.y}};
}

// Same conservative wedge contract as the inherited sheets, also enforced on
// every painted fragment so billboards cannot spill beyond a clipped endpoint.
export function pointInFlame(shape,point){
  const x=point.x-shape.origin.x,y=point.y-shape.origin.y,angle=Math.atan2(Math.sin(Math.atan2(y,x)-shape.heading),Math.cos(Math.atan2(y,x)-shape.heading));
  if(!shape.sourceVisible||Math.abs(angle)>shape.halfAngle+1e-8)return false;
  const i=Math.max(0,Math.min(35,Math.floor((angle+shape.halfAngle)/(2*shape.halfAngle)*36))),a=shape.rays[i],b=shape.rays[i+1];
  return !gap(a,b)&&(b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x)>=-1e-8;
}

export function flameFogMask(shape,visible,bytes=new Uint8Array(40*30*4)){
  bytes.fill(0);
  for(const key of shape.visibleCells){if(!visible.has(key))continue;const [x,y]=key.split(',').map(Number);if(x>=0&&x<40&&y>=0&&y<30){const at=(y*40+x)*4;bytes[at]=bytes[at+1]=bytes[at+2]=bytes[at+3]=255;}}
  return bytes;
}

// Preserve a visible expanding front and cutoff even if a first texture load
// or a slow frame spans the entire nominal 2.1-second presentation.
export function advanceFlameClock(active,now,reduced=false){
  if(active.last===null){active.last=now;active.elapsed=0;return 0;}
  let next=active.elapsed+Math.max(0,now-active.last)/1000;active.last=now;
  if(!reduced&&!active.shown&&next>=.32){next=Math.min(next,.56);active.shown=true;}
  else if(!reduced&&!active.tailShown&&next>=1.02){next=Math.min(next,1.24);active.tailShown=true;}
  active.elapsed=next;return next;
}
