import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {setTimeout as delay} from 'node:timers/promises';
import {loadColdwell} from '../dist/coldwell-loader.js';
import {ColdwellProvider} from '../dist/coldwell-provider.js';
import {registerSpatialProvider,spatialDistance} from '../dist/spatial-provider.js';
import {registerColdwellOperations} from '../dist/coldwell-operation.js';
import {createSoloGame,hero,Core,encodeSave,decodeSave} from '../dist/solo-game.js';

const workers=new Set(),bundle=await loadColdwell({baseURL:new URL('../dist/coldwell/',import.meta.url),fetcher:async url=>new Response(fs.readFileSync(url))});
const provider=new ColdwellProvider(bundle,{createWorker:url=>{
  const worker=new Worker(new URL('./coldwell-worker-harness.mjs',import.meta.url),{workerData:{url:url.href}});workers.add(worker);worker.once('exit',()=>workers.delete(worker));
  return {postMessage:data=>worker.postMessage(data),terminate:()=>worker.terminate(),addEventListener:(name,listener)=>worker.on(name,data=>listener(name==='message'?{data}:{message:data.message}))};
}});
registerSpatialProvider(provider.id,provider);registerColdwellOperations(provider);
const cases=[['portal',1],['portal',5],['shaft',22]];
function setup(kind,count){
  const state=createSoloGame(undefined,1947,'coldwell-traversal'),actor=hero(state),stairs=Array.from({length:count},(_,i)=>provider.stairById.get(kind+'-stair-'+(21-i)));
  state.units=[actor];Object.assign(actor,stairs[0].route.at(-1));Core.refresh(state,{forceFog:true});return {state,actor,stairs,end:stairs.at(-1).route[0]};
}
async function searching(state){for(let i=0;i<400;i++){if(Core.navigationStatus(state).searching)return;await delay(10);}assert.fail('The real worker did not begin its search.');}
async function retire(state){Core.disposeNavigation(state);await Promise.all([...workers].map(w=>w.terminate()));}

for(const [kind,count] of cases)test(`one public request plans and completes all ${count} authored ${kind} intervals`,{timeout:300000},async()=>{
  const {state,actor,stairs,end}=setup(kind,count);let beats=0;const timer=setInterval(()=>beats++,10),started=performance.now();
  try{
    const pending=Core.requestNavigationPath(state,actor,end),returned=performance.now()-started;assert.ok(returned<100,'Request creation must return to the UI immediately.');
    const route=await pending,planned=performance.now()-started;assert.ok(planned<30000,`Cold planning took ${planned} ms.`);assert.ok(beats>=5,'The event loop must keep running during exact planning.');
    assert.deepEqual(new Set(route.map(p=>p.stairId).filter(Boolean)),new Set(stairs.map(s=>s.id)));
    assert.deepEqual(route.at(-1),{...end,cost:spatialDistance(stairs.at(-1).route[1],end)*Core.movementRate(actor)});
    assert.equal(Core.acceptNavigationPath(state,actor,route),true);
    const restored=decodeSave(encodeSave(state));assert.deepEqual(restored.queue,state.queue);
    for(const point of route){const distance=spatialDistance(actor,point);Core.travel(state,actor,point.x-actor.x,point.y-actor.y,{distanceBudget:distance});assert.ok(spatialDistance(actor,point)<.025,`Traversal stopped before ${JSON.stringify(point)}.`);}
    assert.ok(spatialDistance(actor,end)<.025);assert.equal(actor.floorId,end.floorId);assert.ok(actor.hp>0);
    console.log(JSON.stringify({kind,count,requestMs:returned,planningMs:planned,heartbeats:beats,waypoints:route.length,arrived:actor.floorId}));
  }finally{clearInterval(timer);await retire(state);}
});

for(const [kind,count] of cases)test(`a running ${count}-interval request cancels without resources or a late route`,{timeout:15000},async()=>{
  const {state,actor,end}=setup(kind,count),before={x:actor.x,y:actor.y,h:actor.h,ap:actor.ap,ammo:{...actor.ammo},seed:state.seed,distance:state.solo.distance};
  try{
    const pending=Core.requestNavigationPath(state,actor,end);const rejected=assert.rejects(pending,{name:'AbortError'});await searching(state);const at=performance.now();Core.stop(state);await rejected;
    assert.ok(performance.now()-at<100);assert.equal(Core.navigationStatus(state).worker,false);await delay(50);assert.deepEqual(state.queue,[]);
    assert.deepEqual({x:actor.x,y:actor.y,h:actor.h,ap:actor.ap,ammo:actor.ammo,seed:state.seed,distance:state.solo.distance},before);
  }finally{await retire(state);}
});

test('completed worker caches retain route determinism, and stale plans cannot be committed',{timeout:30000},async()=>{
  const {state,actor,end}=setup('portal',5);
  try{
    const first=await Core.requestNavigationPath(state,actor,end),again=await Core.requestNavigationPath(state,actor,end);assert.deepEqual(again,first);assert.equal(Core.acceptNavigationPath(state,actor,first),false);assert.equal(Core.acceptNavigationPath(state,actor,again),true);
    Core.disposeNavigation(state);Core.stop(state);const pending=Core.requestNavigationPath(state,actor,end),rejected=assert.rejects(pending,{name:'AbortError'});await searching(state);assert.equal(provider.startRig(state,'silo-cover',1).ok,true);await rejected;assert.deepEqual(state.queue,[]);
    assert.equal(Core.acceptNavigationPath(state,actor,again),false);
  }finally{await retire(state);}
});
