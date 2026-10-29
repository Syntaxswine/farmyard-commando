import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {WINDOW_IDS,WINDOW_DEFINITIONS,WINDOW_METRICS,describeWindow} from '../dist/art/windows/catalog.js';
import {createWindowLibrary} from '../dist/art/windows/geometry.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('36 definitions preserve wall scale and one full-span clear pane',()=>{
 assert.equal(WINDOW_IDS.length,36);assert.equal(new Set(WINDOW_IDS).size,36);
 for(const def of WINDOW_DEFINITIONS){
  const s=describeWindow(def.id);assert.ok(Object.isFrozen(s.panes[0].bounds.min));
  assert.equal(s.wallHeight,2);assert.equal(s.wallThickness,.16);assert.equal(s.frameDepth,.20);
  assert.equal(s.panes.length,def.columns*def.rows);assert.equal(s.panes[0].id,'r0c0');
  for(const p of s.panes){assert.ok(p.width>0&&p.height>0);assert.deepEqual(p.normal,[0,0,1]);assert.deepEqual(p.bounds.min.slice(2),[-.004]);}
  if(def.patternId==='clear'){
   assert.equal(s.panes.length,1);assert.equal(s.solids.filter(p=>p.role==='mullion').length,0);close(s.panes[0].width,def.span-.11);
  }
  const lower=s.solids.find(p=>p.role==='lower-wall');assert.equal(!!lower,def.heightId==='waist');if(lower)close(lower.bounds.max[1],.845);
 }
});

test('each divided pane occupies its own disjoint aperture cell',()=>{
 for(const id of WINDOW_IDS){const s=describeWindow(id),panes=s.panes;
  for(const p of panes){
   assert.ok(p.bounds.min[0]>=s.aperture.min[0]-1e-8&&p.bounds.max[0]<=s.aperture.max[0]+1e-8);
   assert.ok(p.bounds.min[1]>=s.sill-1e-8&&p.bounds.max[1]<=s.head+1e-8);
   for(const q of panes)if(q!==p){const dx=Math.min(p.bounds.max[0],q.bounds.max[0])-Math.max(p.bounds.min[0],q.bounds.min[0]),dy=Math.min(p.bounds.max[1],q.bounds.max[1])-Math.max(p.bounds.min[1],q.bounds.min[1]);assert.ok(dx<=0||dy<=0);}
  }
  close(panes.at(-1).bounds.max[0],s.aperture.max[0]);close(panes.at(-1).bounds.max[1],s.head);
 }
});

test('all definitions and join combinations fit their declared geometry at every rotation',()=>{
 const lib=createWindowLibrary();
 try{for(const id of WINDOW_IDS)for(const left of [false,true])for(const right of [false,true])for(const rotation of [0,90,180,270]){
  const a=lib.build(id,{joins:{left,right},rotation}),s=a.spec,b=new T.Box3().setFromObject(a.root),size=b.getSize(new T.Vector3());
  close(size.y,2);close(size.x,rotation%180?s.frameDepth:s.span);close(size.z,rotation%180?s.span:s.frameDepth);close(b.min.y,0);
  assert.equal(a.solidParts().length,s.solids.length);assert.equal(a.paneParts().length,s.panes.length);
  for(const p of a.paneParts()){
   const physical=new T.Box3().setFromBufferAttribute(p.geometry.attributes.position).applyMatrix4(p.matrixWorld),declared=a.paneWorldBounds(p.id);
   physical.min.toArray().forEach((n,i)=>close(n,declared.min[i]));physical.max.toArray().forEach((n,i)=>close(n,declared.max[i]));
  }
  a.dispose();
 }}finally{lib.dispose();}
});

test('a selected cell hides its glass and reflection while all solid structure survives',()=>{
 const lib=createWindowLibrary();
 try{for(const id of WINDOW_IDS){const a=lib.build(id),last=a.spec.panes.at(-1).id;
  const before=a.solidParts().map(p=>({id:p.id,m:p.matrixWorld.toArray()}));
  a.setPaneVisible(last,false);assert.equal(a.paneParts().length,a.spec.panes.length-1);assert.equal(a.panes.get(last).root.visible,false);
  assert.ok([...a.panes.values()].filter(p=>p.id!==last).every(p=>p.root.visible));assert.deepEqual(a.solidParts().map(p=>({id:p.id,m:p.matrixWorld.toArray()})),before);
  assert.equal(a.paneParts({includeHidden:true}).length,a.spec.panes.length);a.setPaneVisible(last,true);assert.equal(a.paneParts().length,a.spec.panes.length);a.dispose();
 }}finally{lib.dispose();}
});

test('joined placements share one normal-width post and retain stable pane IDs',()=>{
 const a=describeWindow('window.waist.grid-3x2.1m',{right:true}),b=describeWindow('window.waist.grid-3x2.1m',{left:true});
 const right=a.solids.find(p=>p.id==='frame.right').bounds,left=b.solids.find(p=>p.id==='frame.left').bounds;
 close(right.max[0],left.min[0]+1);close(right.max[0]-right.min[0]+left.max[0]-left.min[0],WINDOW_METRICS.post);
 assert.deepEqual(a.panes.map(p=>p.id),describeWindow(a.id).panes.map(p=>p.id));assert.notEqual(a.cacheKey,describeWindow(a.id).cacheKey);
});

test('world transforms, validation and ownership remain explicit',()=>{
 const lib=createWindowLibrary(),a=lib.build('window.waist.grid-3x2.3m',{rotation:90,finish:'ivory',wall:'concrete'});
 a.root.position.set(10,4,20);const b=a.paneWorldBounds('r0c0');assert.ok(b.min[1]>=4.9&&b.min[0]>9.99&&b.max[0]<10.01);
 const resources=new Set();a.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);if(o.material.map)resources.add(o.material.map);}});
 const counts=new Map([...resources].map(r=>[r,0]));for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
 assert.throws(()=>a.setPaneVisible('missing',false),/Unknown/);assert.throws(()=>a.setPaneVisible('r0c0',0),/boolean/);
 for(const joins of [{left:1},{other:true},null])assert.throws(()=>describeWindow(a.spec.id,joins),/joins/);
 assert.throws(()=>lib.build('missing'),/Unknown/);assert.throws(()=>lib.build(a.spec.id,{rotation:45}),/Invalid/);
 a.dispose();a.dispose();lib.dispose();lib.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.equal(lib.stats().assets,0);assert.throws(()=>a.paneParts(),/disposed/);assert.throws(()=>lib.build(a.spec.id),/disposed/);
});
