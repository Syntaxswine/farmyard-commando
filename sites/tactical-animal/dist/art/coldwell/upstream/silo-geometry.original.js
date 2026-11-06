// Original native-metre geometry. The clipping/UV approach develops the author's
// published fort geometry at 65c06735396e14b8774ae1e7d5ad61969692963f;
// no donor runtime or renderer is imported. Source provenance is in art/silo/.
export const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/length(a)),mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
export const SILO_MATERIALS=Object.freeze({
 concrete:{tile:0,repeat:3,color:[.94,.96,.96],roughness:.95},seafoam:{tile:1,repeat:2,color:[1,1,1],roughness:.77,metalness:.12},
 ivory:{tile:2,repeat:2.5,color:[1,1,1],roughness:.86},steel:{tile:3,repeat:1.5,color:[1,1,1],roughness:.68,metalness:.22},
 floor:{tile:0,repeat:2.5,color:[.76,.79,.76],roughness:.98},rubber:{tile:null,repeat:1,color:[.055,.065,.06],roughness:1},
 brass:{tile:null,repeat:1,color:[.54,.43,.20],roughness:.62,metalness:.35},yellow:{tile:null,repeat:1,color:[.84,.58,.13],roughness:.84},
 red:{tile:null,repeat:1,color:[.47,.12,.08],roughness:.84},glass:{tile:null,repeat:1,color:[.09,.19,.17],roughness:.34,metalness:.2},
 dark:{tile:null,repeat:1,color:[.07,.085,.08],roughness:.91},linen:{tile:2,repeat:2,color:[.68,.70,.61],roughness:1}
});
for(const spec of Object.values(SILO_MATERIALS))Object.freeze(spec);
export const area=poly=>Math.abs(poly.reduce((n,p,i)=>{const q=poly[(i+1)%poly.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2);
const EPS=1e-9;
export function clip(poly,a,b,inside=true){
 const out=[],side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],sp=side(p),sq=side(q),ip=inside?sp>=-EPS:sp<=EPS,iq=inside?sq>=-EPS:sq<=EPS;
  if(ip)out.push(p);if(ip!==iq){const t=sp/(sp-sq);out.push(mix(p,q,t));}}
 return out.filter((p,i)=>length(sub(p,out[(i+out.length-1)%out.length]))>EPS);
}
export function intersect(poly,convex){for(let i=0;i<convex.length&&poly.length>=3;i++)poly=clip(poly,convex[i],convex[(i+1)%convex.length]);return poly;}
export function subtract(poly,hole){
 const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))],p=bounds(poly),h=bounds(hole);
 if(p[2]<=h[0]+EPS||p[0]>=h[2]-EPS||p[3]<=h[1]+EPS||p[1]>=h[3]-EPS)return [poly];
 const result=[];for(let i=0;i<hole.length&&poly.length>=3;i++){const outside=clip(poly,hole[i],hole[(i+1)%hole.length],false);if(outside.length>=3&&area(outside)>EPS)result.push(outside);poly=clip(poly,hole[i],hole[(i+1)%hole.length]);}return result;
}
export const rectangle=({x,z,width,depth})=>[[x,z],[x+width,z],[x+width,z+depth],[x,z+depth]];
export const circle=(center,radius,segments=96)=>Array.from({length:segments},(_,i)=>[center[0]+radius*Math.cos(i/segments*Math.PI*2),center[1]+radius*Math.sin(i/segments*Math.PI*2)]);
export function tileFloor(outline,holes=[]){
 const minX=Math.floor(Math.min(...outline.map(p=>p[0]))-.5),maxX=Math.ceil(Math.max(...outline.map(p=>p[0]))+.5),minZ=Math.floor(Math.min(...outline.map(p=>p[1]))-.5),maxZ=Math.ceil(Math.max(...outline.map(p=>p[1]))+.5),cells=[];
 for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
  let pieces=[intersect([[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]],outline)].filter(p=>p.length>=3&&area(p)>EPS);
  for(const hole of holes)pieces=pieces.flatMap(p=>subtract(p,hole));
  const total=pieces.reduce((s,p)=>s+area(p),0);if(total<EPS)continue;
  if(total>1+1e-7)throw Error('Floor cell overlap at '+x+','+z);
  const full=Math.abs(total-1)<1e-8;
  cells.push({x,z,full,area:total,polygons:full?[[[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]]]:pieces});
 }
 return cells;
}
export class Surfaces {
 constructor(lod='game',uvMode='metres'){if(!['game','source'].includes(lod)||!['metres','atlas'].includes(uvMode))throw Error('Choose source/game geometry and metres/atlas UVs.');this.lod=lod;this.uvMode=uvMode;this.batches=new Map();this.kind='structure';this.zone='component';this.level=0;this.highLevel=0;}
 channel(kind,level,highLevel=level){this.kind=kind;this.level=level;this.highLevel=highLevel;return this;}
 batch(material){const key=[this.zone,this.kind,this.level,this.highLevel,material].join(':');if(!this.batches.has(key))this.batches.set(key,{zone:this.zone,kind:this.kind,level:this.level,highLevel:this.highLevel,material,positions:[],normals:[],uvs:[]});return this.batches.get(key);}
 emit(vertices,material){const b=this.batch(material);for(const v of vertices){b.positions.push(...v.p);b.normals.push(...unit(v.n));b.uvs.push(...v.uv);}}
 tri(a,b,c,material,normals=null,uvs=null){
  const cr=cross(sub(b,a),sub(c,a));if(length(cr)<1e-10)return;const n=unit(cr),spec=SILO_MATERIALS[material];if(!spec)throw Error('Unknown silo material: '+material);
  let u=Math.abs(n[1])>.999?[1,0,0]:unit([n[2],0,-n[0]]),v=unit(cross(n,u));if(v[1]<0){u=mul(u,-1);v=mul(v,-1);}
  const verts=[a,b,c].map((p,i)=>({p,n:normals?.[i]||n,uv:uvs?.[i]||[dot(p,u)/spec.repeat,dot(p,v)/spec.repeat]}));
  if(this.uvMode==='metres'||spec.tile===null){this.emit(verts,material);return;}
  const lo=[0,1].map(i=>Math.floor(Math.min(...verts.map(v=>v.uv[i])))),hi=[0,1].map(i=>Math.ceil(Math.max(...verts.map(v=>v.uv[i])))),inset=.02;
  const cut=(poly,axis,bound,greater)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=v=>greater?v.uv[axis]>=bound-EPS:v.uv[axis]<=bound+EPS,ia=inside(a),ib=inside(b);if(ia)out.push(a);if(ia!==ib){const t=(bound-a.uv[axis])/(b.uv[axis]-a.uv[axis]);out.push({p:mix(a.p,b.p,t),n:mix(a.n,b.n,t),uv:mix(a.uv,b.uv,t)});}}return out;};
  for(let x=lo[0];x<hi[0];x++)for(let y=lo[1];y<hi[1];y++){let poly=verts;for(const [axis,bound,greater]of [[0,x,true],[0,x+1,false],[1,y,true],[1,y+1,false]])poly=cut(poly,axis,bound,greater);
   for(let i=1;i<poly.length-1;i++){const triangle=[poly[0],poly[i],poly[i+1]];if(length(cross(sub(triangle[1].p,triangle[0].p),sub(triangle[2].p,triangle[0].p)))<1e-10)continue;
    this.emit(triangle.map(v=>({...v,uv:[(spec.tile%2+inset+(v.uv[0]-x)*(1-2*inset))/2,(1-Math.floor(spec.tile/2)+inset+(v.uv[1]-y)*(1-2*inset))/2]})),material);}
  }
 }
 face(points,material,normal){let accumulated=[0,0,0];for(let i=1;i<points.length-1;i++)accumulated=add(accumulated,cross(sub(points[i],points[0]),sub(points[i+1],points[0])));if(dot(accumulated,normal)<0)points=[...points].reverse();for(let i=1;i<points.length-1;i++)this.tri(points[0],points[i],points[i+1],material);}
 box(center,size,material,bevel=false,yaw=0){
  if(size.some(n=>!Number.isFinite(n)||n<=0))throw Error('Positive box dimensions required.');
  const h=size.map(n=>n/2),transform=p=>add(center,[p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),p[1],-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw)]),normal=n=>[n[0]*Math.cos(yaw)+n[2]*Math.sin(yaw),n[1],-n[0]*Math.sin(yaw)+n[2]*Math.cos(yaw)];
  if(!bevel||this.lod==='game'||Math.min(...size)<.04){const[x,y,z]=h;for(const[pts,n]of [
   [[[x,-y,-z],[x,y,-z],[x,y,z],[x,-y,z]],[1,0,0]],[[[-x,-y,z],[-x,y,z],[-x,y,-z],[-x,-y,-z]],[-1,0,0]],
   [[[-x,y,-z],[-x,y,z],[x,y,z],[x,y,-z]],[0,1,0]],[[[-x,-y,z],[-x,-y,-z],[x,-y,-z],[x,-y,z]],[0,-1,0]],
   [[[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],[0,0,1]],[[[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]],[0,0,-1]]])this.face(pts.map(transform),material,normal(n));return;}
  const r=Math.min(.018,Math.min(...size)*.14);
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const a=(axis+1)%3,b=(axis+2)%3,pts=[];for(const[sa,sb]of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=[0,0,0];p[axis]=sign*h[axis];p[a]=sa*(h[a]-r);p[b]=sb*(h[b]-r);pts.push(transform(p));}const n=[0,0,0];n[axis]=sign;this.face(pts,material,normal(n));}
  for(let axis=0;axis<3;axis++){const a=(axis+1)%3,b=(axis+2)%3;for(const sa of [-1,1])for(const sb of [-1,1]){const pts=[];for(const[end,t]of [[-1,0],[1,0],[1,1],[-1,1]]){const p=[0,0,0];p[axis]=end*(h[axis]-r);p[a]=sa*(h[a]-(t?r:0));p[b]=sb*(h[b]-(t?0:r));pts.push(transform(p));}this.face(pts,material,sub(pts.reduce((s,p)=>add(s,mul(p,.25)),[0,0,0]),center));}}
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const pts=[[x*h[0],y*(h[1]-r),z*(h[2]-r)],[x*(h[0]-r),y*h[1],z*(h[2]-r)],[x*(h[0]-r),y*(h[1]-r),z*h[2]]].map(transform);this.face(pts,material,sub(pts.reduce((s,p)=>add(s,mul(p,1/3)),[0,0,0]),center));}
 }
 rod(a,b,radius,material,sides=this.lod==='source'?20:8){
  const axis=unit(sub(b,a)),u=unit(cross(Math.abs(axis[1])>.9?[1,0,0]:[0,1,0],axis)),v=cross(axis,u);
  for(let i=0;i<sides;i++){const p=mul(add(mul(u,Math.cos(i/sides*Math.PI*2)),mul(v,Math.sin(i/sides*Math.PI*2))),radius),q=mul(add(mul(u,Math.cos((i+1)/sides*Math.PI*2)),mul(v,Math.sin((i+1)/sides*Math.PI*2))),radius);
   this.face([add(a,p),add(a,q),add(b,q),add(b,p)],material,add(p,q));this.face([a,add(a,q),add(a,p)],material,mul(axis,-1));this.face([b,add(b,p),add(b,q)],material,axis);}
 }
 prism(poly,top,thickness,material){
  this.face(poly.map(([x,z])=>[x,top,z]),material,[0,1,0]);this.face(poly.map(([x,z])=>[x,top-thickness,z]),material,[0,-1,0]);
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];this.face([[a[0],top,a[1]],[b[0],top,b[1]],[b[0],top-thickness,b[1]],[a[0],top-thickness,a[1]]],material,[b[1]-a[1],0,a[0]-b[0]]);}
 }
}
