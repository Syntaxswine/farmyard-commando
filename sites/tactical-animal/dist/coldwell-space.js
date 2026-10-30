import {Vector3,Ray,Triangle,Line3} from './aft/tactics/vendor/three.module.js';
import {transformSiloRigPoint} from './vendor/coldwell-silo/3b9d4004a7e51e5d345cded068fc46eab2f320a2/packages/silo/mesh.js';

export const COLDWELL_ORIGIN=Object.freeze({x:38.5,y:85.5,h:46.64});
export const COLDWELL_GROUND=46.64,COLDWELL_INTERVAL=2.12;
export const siloToWorld=([x,h,y])=>({x:x+38.5,y:y+85.5,h:h+46.64});
export const siteToWorld=([x,h,y])=>({x:x+.5,y:y+.5,h:h+46.64});
export const legacyCellToWorld=({x,y,z=0})=>({x:x+.5,y:y+.5,h:46.64+2.12*z});
export const toThree=point=>new Vector3(point.x,point.h,point.y);
export const fromThree=point=>({x:point.x,y:point.z,h:point.y});
export const floorId=index=>'coldwell-datum-'+String(index).padStart(2,'0');
export const mixPoint=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,h:a.h+(b.h-a.h)*t,floorId:t<.5?a.floorId:b.floorId});

// Reuse original source-native motion, adding canonical placement once.
export const rigPoint=(rig,point,pose)=>(rig.frame==='site'?siteToWorld:siloToWorld)(transformSiloRigPoint(rig,point,pose));
export function pointInPolygon(point,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(segmentDistance(point,a,b)<1e-7)return true;
    if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function segmentDistance(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point.x-a[0])*dx+(point.y-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(point.x-a[0]-dx*t,point.y-a[1]-dy*t);
}
export const polygonContains=(point,shape)=>pointInPolygon(point,shape.outline)&&!(shape.holes||[]).some(h=>pointInPolygon(point,h));
// Verify a circular footprint against the UNION of authored support polygons.
// Circle/edge crossings partition the perimeter; interior boundary probes also
// catch a small hole wholly contained by the footprint and shared-surface seams.
export function supportedDisc(point,radius,shapes){
  const contains=p=>shapes.some(s=>polygonContains(p,s));
  if(!contains(point))return false;if(radius===0)return true;
  const angles=[0,Math.PI*2],edges=[];
  for(const shape of shapes)for(const polygon of [shape.outline,...(shape.holes||[])])for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    if(!length2)continue;
    const ox=a[0]-point.x,oy=a[1]-point.y,B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-radius*radius,disc=B*B-4*length2*C;
    if(disc>=0)for(const t of [(-B-Math.sqrt(disc))/(2*length2),(-B+Math.sqrt(disc))/(2*length2)])if(t>=0&&t<=1)angles.push((Math.atan2(oy+dy*t,ox+dx*t)+Math.PI*2)%(Math.PI*2));
    if(segmentDistance(point,a,b)<radius+1e-7)edges.push({a,b,dx,dy,length2});
  }
  angles.sort((a,b)=>a-b);
  for(let i=1;i<angles.length;i++){const t=(angles[i-1]+angles[i])/2;if(!contains({x:point.x+Math.cos(t)*radius,y:point.y+Math.sin(t)*radius}))return false;}
  for(const {a,b,dx,dy,length2}of edges){
    const closest=Math.max(0,Math.min(1,((point.x-a[0])*dx+(point.y-a[1])*dy)/length2)),normal=1e-5/Math.sqrt(length2);
    for(const t of [0,closest,1])for(const sign of [-1,1]){
      const p={x:a[0]+dx*t-dy*normal*sign,y:a[1]+dy*t+dx*normal*sign};
      if(Math.hypot(p.x-point.x,p.y-point.y)<radius-1e-6&&!contains(p))return false;
    }
  }
  return true;
}
export function triangleFromArray(array,offset,triangle=new Triangle()){
  triangle.a.fromArray(array,offset);triangle.b.fromArray(array,offset+3);triangle.c.fromArray(array,offset+6);return triangle;
}
export function segmentTriangleDistanceSq(start,end,triangle){
  const delta=new Vector3().subVectors(end,start),length=delta.length();
  if(length){const ray=new Ray(start,delta.clone().divideScalar(length)),hit=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,new Vector3());if(hit&&hit.distanceToSquared(start)<=length*length+1e-10)return 0;}
  let distance=Math.min(triangle.closestPointToPoint(start,new Vector3()).distanceToSquared(start),triangle.closestPointToPoint(end,new Vector3()).distanceToSquared(end));
  const axis=new Line3(start,end);
  for(const vertex of [triangle.a,triangle.b,triangle.c])distance=Math.min(distance,axis.closestPointToPoint(vertex,true,new Vector3()).distanceToSquared(vertex));
  if(length){
    const ray=new Ray(start,delta.divideScalar(length));
    for(const [a,b]of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]){
      const onAxis=new Vector3(),onEdge=new Vector3(),d=ray.distanceSqToSegment(a,b,onAxis,onEdge);
      if(onAxis.distanceToSquared(start)<=length*length+1e-10)distance=Math.min(distance,d);
    }
  }
  return distance;
}
export function trianglesDistanceSq(a,b){
  let distance=Infinity;
  for(const [x,y]of [[a.a,a.b],[a.b,a.c],[a.c,a.a]])distance=Math.min(distance,segmentTriangleDistanceSq(x,y,b));
  for(const [x,y]of [[b.a,b.b],[b.b,b.c],[b.c,b.a]])distance=Math.min(distance,segmentTriangleDistanceSq(x,y,a));
  return distance;
}
// A translating vertical capsule sweeps a parallelogram plus its radius.
// Three's existing triangle/ray/closest-point math supplies the narrow phase.
export function capsuleTriangleHit(a,b,height,radius,triangle,padding=0){
  // A prone body's 46 cm footprint cannot form a capsule shorter than its
  // diameter. Keep the conservative footprint rather than inverting its axis.
  height=Math.max(height,2*radius);
  const low=p=>new Vector3(p.x,p.h+radius,p.y),high=p=>new Vector3(p.x,p.h+height-radius,p.y);
  const al=low(a),ah=high(a),bl=low(b),bh=high(b);
  if(al.distanceToSquared(bl)<1e-14)return segmentTriangleDistanceSq(al,ah,triangle)<(radius+padding-4e-5)**2;
  const one=new Triangle(al,ah,bh),two=new Triangle(al,bh,bl);
  return Math.min(trianglesDistanceSq(one,triangle),trianglesDistanceSq(two,triangle))<(radius+padding-4e-5)**2;
}
