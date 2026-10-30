import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadColdwell} from '../dist/coldwell-loader.js';
import {ColdwellProvider} from '../dist/coldwell-provider.js';
import {spatialDistance} from '../dist/spatial-provider.js';
const bundle=await loadColdwell({baseURL:new URL('../dist/coldwell/',import.meta.url),fetcher:async url=>new Response(fs.readFileSync(url))});
const provider=new ColdwellProvider(bundle),state={spatial:provider.createState(),units:[]};

test('every native stair interval passes full continuous body sweeps in both directions',()=>{
  for(const stair of provider.stairs)for(const direction of [1,-1]){
    const route=direction===1?stair.route:[...stair.route].reverse(),actor={id:0,stance:'standing'};
    for(let i=1;i<route.length;i++)assert.equal(provider.sweep(state,actor,route[i-1],route[i]).ok,true,stair.id+' '+direction+' segment '+i);
    assert.ok(Math.abs(Math.abs(route.at(-1).h-route[0].h)-2.12)<1e-7);
  }
});
test('the first portal return follows both flights and the real landing at 3D distance cost',()=>{
  const stair=provider.stairById.get('portal-stair-21'),actor={id:0,hp:100,stance:'standing',...stair.route.at(-1)};
  const route=provider.path(state,actor,stair.route[0],{rate:2});assert.ok(route?.length>12);assert.ok(route.some(p=>p.x===74.75&&p.y===114.1));assert.ok(route.some(p=>p.x===74.75&&p.y===115.9));
  let previous=actor,total=0;for(const p of route){total+=spatialDistance(previous,p);assert.deepEqual(Object.keys(p).sort(),['cost','floorId','h','x','y',...(p.stairId?['stairId']:[])].sort());previous=p;}
  assert.ok(Math.abs(route.reduce((n,p)=>n+p.cost,0)-total*2)<1e-7);assert.ok(total>7);assert.equal(previous.floorId,'coldwell-datum-21');
  assert.equal(provider.sweep(state,actor,actor,stair.route[0]).ok,false,'A diagonal shortcut through landings cannot replace the stair.');
});
test('gait-sized advances keep height continuous and charge the actual walked length',()=>{
  const stair=provider.stairById.get('portal-stair-21');let actor={id:0,hp:100,stance:'standing',...stair.route[0]},walked=0,steps=0;
  for(const destination of stair.route.slice(1)){
    while(spatialDistance(actor,destination)>.015&&steps++<500){
      const d=spatialDistance(actor,destination),step=Math.min(.07,d),dx=(destination.x-actor.x)/d*step,dy=(destination.y-actor.y)/d*step,result=provider.advance(state,actor,dx,dy,step);
      assert.ok(result.distance>0,'Native stair motion must progress.');assert.ok(result.distance<=step+1e-4);assert.ok(Math.abs(result.point.h-actor.h)<.071);
      walked+=result.distance;actor={...actor,...result.point};
    }
  }
  assert.ok(steps<500);assert.ok(Math.abs(actor.h-46.64)<.015);assert.ok(walked>7);assert.ok(Math.abs(actor.y-stair.route.at(-1).y)<.02);
});
test('stairs retain footprint, rail and upper-flight clearance for lower stances',()=>{
  for(const id of ['shaft-stair-21','capsule-stair-17','portal-stair-21'])for(const stance of ['kneeling','prone']){
    const stair=provider.stairById.get(id),actor={id:0,stance};
    for(let i=1;i<stair.route.length;i++)assert.equal(provider.sweep(state,actor,stair.route[i-1],stair.route[i]).ok,true,id+' '+stance+' '+i);
    assert.equal(provider.occupancy(state,actor,{...stair.route[4],y:stair.route[4].y+.6}),false,'The unsupported gap between flights remains blocked.');
  }
});
test('offscreen unit blockers and the open shaft remain authoritative',()=>{
  const actor={id:0,stance:'standing',x:155.5,y:103.5,h:42.4,floorId:'coldwell-datum-20'};
  assert.equal(provider.sweep(state,actor,actor,{...actor,x:149.5}).ok,false);
  const other={...actor,id:1,hp:100,stance:'standing',x:156.2};const saved={...state,units:[other]};
  assert.equal(provider.sweep(saved,actor,actor,{...actor,x:156.2}).ok,false);
  saved.units[0]={...other,h:40.28,floorId:'coldwell-datum-19'};assert.equal(provider.sweep(saved,actor,actor,{...actor,x:156.2}).ok,true);
});
