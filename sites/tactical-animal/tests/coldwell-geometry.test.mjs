import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadColdwell} from '../dist/coldwell-loader.js';
import {ColdwellGeometry} from '../dist/coldwell-geometry.js';
import {siloToWorld} from '../dist/coldwell-space.js';
const bundle=await loadColdwell({baseURL:new URL('../dist/coldwell/',import.meta.url),fetcher:async u=>new Response(fs.readFileSync(u))});
const geometry=new ColdwellGeometry(bundle);
const state=()=>({poses:Object.fromEntries(bundle.data.rigs.map(r=>[r.id,0])),revision:0});

test('the reused Nautilus world validates all 23 datums plus roofs with sparse broad-phase allocation',()=>{
  const stats=geometry.world.stats();assert.equal(stats.floorCount,24);assert.equal(stats.denseCells,0);assert.ok(stats.surfaces<10000);assert.equal(geometry.supportAt(state(),{x:94.5,y:140.5,h:48.76})?.floorId,'coldwell-roof-1');
});
test('all 31 native stairs have supported bottom and top anchors at the exact supplied heights',()=>{
  const saved=state();
  for(const stair of bundle.data.semantics.stairs)for(const [name,point]of [['bottom',stair.bottomAnchor],['top',stair.topAnchor]]){
    const support=geometry.supportAt(saved,siloToWorld(point));assert.ok(support,stair.id+' '+name);assert.ok(Math.abs(support.h-(point[1]+46.64))<.001);
  }
});
test('source voids stay unsupported while real clipped infill and surface support remain',()=>{
  const saved=state();assert.equal(geometry.supportAt(saved,{x:149.5,y:103.5,h:46.64}),null);
  assert.equal(geometry.supportAt(saved,{x:149.5,y:103.5,h:42.4}),null);
  assert.ok(geometry.supportAt(saved,{x:141.4,y:95.4,h:46.64}));assert.ok(geometry.supportAt(saved,{x:104.5,y:190.5,h:46.64}));
});
test('native narrow phase leaves the outer AABB corners clear and blocks the actual curved shell',()=>{
  const saved=state(),c={x:149.5,y:103.5};
  assert.equal(geometry.trace(saved,{x:c.x+7.4,y:c.y+7.4,h:3},{x:c.x+8.3,y:c.y+8.3,h:3}),null);
  const hit=geometry.trace(saved,{x:c.x+7,y:c.y,h:3},{x:c.x+9,y:c.y,h:3});assert.equal(hit?.kind,'exterior');assert.ok(Math.abs(hit.point.x-(c.x+7.5))<.01);
});
test('actual portal opening transmits sight while its adjacent full-height panel blocks',()=>{
  const saved=state();assert.equal(geometry.trace(saved,{x:73.5,y:119,h:47.74},{x:73.5,y:117,h:47.74},{purpose:'sight'}),null);
  assert.ok(geometry.trace(saved,{x:75,y:119,h:47.74},{x:75,y:117,h:47.74},{purpose:'sight'}));
});
test('an intervening annular deck blocks vertical combat but its real hole stays open',()=>{
  const saved=state();assert.equal(geometry.trace(saved,{x:155.5,y:103.5,h:41},{x:155.5,y:103.5,h:43})?.kind,'floor');
  assert.equal(geometry.trace(saved,{x:147,y:103.5,h:41},{x:147,y:103.5,h:43}),null);
});
test('the same hinge pose changes confirmed hits independently of other doors and rendering',()=>{
  const saved=state(),a={x:72,y:103.5,h:37.14},b={x:74,y:103.5,h:37.14};
  assert.equal(geometry.trace(saved,a,b)?.rigId,'blast-door-west');saved.poses['blast-door-west']=90;saved.revision++;
  assert.equal(geometry.trace(saved,a,b),null);assert.equal(saved.poses['blast-door-east'],0);
});
test('sliding the authored cover exposes the shaft without adding a ground cap',()=>{
  const saved=state(),a={x:149.5,y:103.5,h:47},b={x:149.5,y:103.5,h:49};assert.equal(geometry.trace(saved,a,b)?.rigId,'silo-cover');
  saved.poses['silo-cover']=1;saved.revision++;assert.equal(geometry.trace(saved,a,b),null);assert.equal(geometry.supportAt(saved,{...a,h:46.64}),null);
});
