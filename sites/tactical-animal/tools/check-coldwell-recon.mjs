import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loadColdwell} from '../dist/coldwell-loader.js';
import {ColdwellProvider} from '../dist/coldwell-provider.js';
import {registerSpatialProvider,spatialDistance} from '../dist/spatial-provider.js';
import {registerColdwellOperations} from '../dist/coldwell-operation.js';
import {createSoloGame,DEFAULT_BUILD,Core,hero,encodeSave,decodeSave,objectiveSecured} from '../dist/solo-game.js';
import {playColdwellRecon,COLDWELL_APPROACH} from '../tests/coldwell-scenarios.mjs';

const bundle=await loadColdwell({baseURL:new URL('../dist/coldwell/',import.meta.url),fetcher:async u=>new Response(fs.readFileSync(u))}),provider=new ColdwellProvider(bundle);
registerSpatialProvider(provider.id,provider);registerColdwellOperations(provider);
const output=path.resolve('artifacts/window-browser/coldwell-checkpoints.json');fs.mkdirSync(path.dirname(output),{recursive:true});
const report={version:1,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDigest:bundle.manifest.sourceDigest,fullyPlayed:true,simulationOnly:true,states:{},steps:[]};
const retain=()=>fs.writeFileSync(output,JSON.stringify(report));
const checkpoint=(id,state)=>{report.states[id]=encodeSave(state);assert.equal(encodeSave(decodeSave(report.states[id])),report.states[id]);retain();};
function walk(state,point){
  const unit=hero(state),route=Core.navigationPath(state,unit,point.x,point.y,point);assert.ok(route?.length);
  for(const end of route){const distance=spatialDistance(unit,end);Core.travel(state,unit,end.x-unit.x,end.y-unit.y,{distanceBudget:distance});assert.ok(spatialDistance(unit,end)<.025);}
}
const quiet=createSoloGame({...DEFAULT_BUILD,primary:'flamethrower',utility:'grenade'},1947,'coldwell-traversal');
for(const step of COLDWELL_APPROACH){
  if(step.action)assert.equal(Core.performInteraction(quiet,step.id,step.action).ok,true);else walk(quiet,step);
  if(step.x===94.5){walk(quiet,{x:94.5,y:143.2,h:46.64,floorId:'coldwell-datum-22'});checkpoint('quiet-gatehouse',quiet);walk(quiet,step);}
}
checkpoint('quiet-portal',quiet);
const state=createSoloGame(undefined,1947,'coldwell-recon'),started=performance.now();
try{
  const result=playColdwellRecon(state,{onStep:step=>{
    report.steps.push({step,hero:{x:hero(state).x,y:hero(state).y,h:hero(state).h,hp:hero(state).hp},phase:state.phase,round:state.round});
    if(step.x===74&&step.y===112.8)checkpoint('recon-records',state);
    retain();console.log('Coldwell route:',step.action?step.id+' / '+step.action:`${step.x},${step.y} / ${step.floorId}`);
  }});
  assert.equal(state.solo.status,'extracted');assert.equal(objectiveSecured(state),true);assert.ok(hero(state).hp>0);checkpoint('recon-extracted',state);
  report.result={...result,hp:hero(state).hp,distance:state.solo.distance,rounds:state.round,durationMs:Math.round(performance.now()-started),passed:true};retain();console.log('Coldwell Recon public-command route passed.');
}catch(error){report.failure=String(error.stack||error);report.states['failure']=encodeSave(state);retain();throw error;}
