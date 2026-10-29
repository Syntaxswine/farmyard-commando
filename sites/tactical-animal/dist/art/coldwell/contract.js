// Farmyard-owned Coldwell art boundary. No renderer, I/O or authoritative state.
export const COLDWELL_ART_VERSION='coldwell-art/1';
export const COLDWELL_METRICS=Object.freeze({tile:1,block:24,world:240,storey:2.12,wall:2,slab:.12,surface:46.64,supportRoof:48.76});
export const SOURCE=Object.freeze({farmyard:'251bf8094b5f9ebe44208443084c1a6d6658512a',engine:'8c4670450cb2b38c1e1abd811d633c22de9e2b7c',silo:'3b9d4004a7e51e5d345cded068fc46eab2f320a2',outerSHA256:'4abaee28fa9070f53a8923db28e2f92f8618d7443dfe16c5ae4421e21de87b36',siloSHA256:'b489bb7439a22746281eb2dcc052cd124cc77917a9c00aeaa4c02ee5f1db873f'});
export const FRAMES=Object.freeze({silo:Object.freeze([38.5,46.64,85.5]),site:Object.freeze([.5,46.64,.5])});
const finite=(...n)=>n.every(Number.isFinite);
export function toCanonical(frame,point){
 if(frame==='canonical'){if(!point||!finite(point.x,point.y,point.h))throw Error('Invalid canonical point');return {x:point.x,y:point.y,h:point.h};}
 const o=Object.hasOwn(FRAMES,frame)?FRAMES[frame]:null;if(!o||!Array.isArray(point)||point.length!==3||!finite(...point))throw Error('Invalid Coldwell source frame/point');
 return {x:point[0]+o[0],y:point[2]+o[2],h:point[1]+o[1]};
}
export function toThree(point){if(!point||!finite(point.x,point.y,point.h))throw Error('Invalid canonical point');return [point.x,point.h,point.y];}
export function canonicalBounds(frame,bounds){return {min:toCanonical(frame,bounds.min),max:toCanonical(frame,bounds.max)};}
export function intersects(bounds,rect,bands){
 return bounds.max.x>rect.x&&bounds.min.x<rect.x+rect.w&&bounds.max.y>rect.y&&bounds.min.y<rect.y+rect.h&&bands.some(b=>bounds.max.h>=b.min&&bounds.min.h<=b.max);
}
export function normalizeVisibleRegion({rect,heightBands,cutaway={}}={}){
 if(!rect||!finite(rect.x,rect.y,rect.w,rect.h)||rect.w<=0||rect.h<=0)throw Error('Supply a positive canonical metre rect {x,y,w,h}');
 if(!Array.isArray(heightBands)||!heightBands.length||heightBands.some(b=>!b||!finite(b.min,b.max)||b.min>b.max))throw Error('Supply canonical metre heightBands:[{min,max}]');
 if(!cutaway||typeof cutaway!=='object'||Array.isArray(cutaway)||Object.keys(cutaway).some(k=>!['roofs','canopies','display','plane'].includes(k)))throw Error('Invalid Coldwell cutaway');
 const c={roofs:true,canopies:true,display:true,...cutaway};for(const key of ['roofs','canopies','display'])if(typeof c[key]!=='boolean')throw Error('Cutaway visibility switches must be boolean');
 if(c.plane!==undefined&&c.plane!==null){const p=c.plane;if(!Array.isArray(p.normal)||p.normal.length!==3||!finite(...p.normal,p.constant)||Math.hypot(...p.normal)<1e-10)throw Error('Cutaway plane uses Three normal [x,h,y] and a finite constant');const length=Math.hypot(...p.normal);c.plane={normal:p.normal.map(n=>n/length),constant:p.constant/length};}
 return {rect:{...rect},heightBands:heightBands.map(b=>({min:b.min,max:b.max})),cutaway:c};
}
export function nearbyHeightBand(height,{below=1,above=1}={}){
 if(!finite(height)||![below,above].every(n=>Number.isInteger(n)&&n>=0))throw Error('Invalid development floor band');
 const base=Math.floor((height+1e-7)/COLDWELL_METRICS.storey)*COLDWELL_METRICS.storey;
 return [{min:base-below*COLDWELL_METRICS.storey-COLDWELL_METRICS.slab,max:base+(above+1)*COLDWELL_METRICS.storey}];
}
