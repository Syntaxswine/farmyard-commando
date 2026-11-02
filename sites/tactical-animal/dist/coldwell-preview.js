import {prepareColdwell} from './coldwell-runtime.js';
import {attachSpatial} from './spatial-provider.js';
import {createSoloGame,DEFAULT_BUILD,hero} from './solo-game.js';
import {FieldView} from './field-view.js';
import {PointLight,Vector3} from './aft/tactics/vendor/three.module.js';
const $=id=>document.getElementById(id);
let view,state,provider,frame,disposed=false,lastMetrics=0,pointLight=null,retiredArt=null;
const errors=[];
function fail(error){const message=error?.message||String(error);errors.push(message);$('error').textContent=message;$('loading').textContent='Preview could not finish.';}
function prepareState(){
  const state=createSoloGame(DEFAULT_BUILD),u=hero(state);
  state.units=[u];Object.assign(u,{x:104.5,y:190.5,h:46.64,floorId:'coldwell-datum-22',z:22});
  state.map=provider.bundle.terrain;state.edges=provider.bundle.data.surface.edges;state.worldBounds={x:.5,y:.5,w:240,h:240};state.interactables=[];state.windows=[];state.props=[];state.coldwellPreview=true;
  attachSpatial(state,provider.id);return state;
}
async function start(){
  provider=await prepareColdwell();state=prepareState();
  view=new FieldView($('viewport'),{floorContainer:$('floors'),onPick:point=>{$('picked').textContent=JSON.stringify(point);},onLoading:busy=>{$('loading').textContent=busy?'Loading bounded scene…':'Preview ready';},onError:fail});
  view.setGame(state);await view.artReady;await view.art?.whenIdle();
  function draw(now){if(disposed)return;if(pointLight)pointLight.position.set(view.target.x+2,view.target.y+3,view.target.z+2);view.sync(state,now);if(now-lastMetrics>500){lastMetrics=now;$('metrics').textContent=JSON.stringify(snapshot(),null,2);}frame=requestAnimationFrame(draw);}
  frame=requestAnimationFrame(draw);
}
const positions={approach:{x:104.5,y:183,h:46.64,floorId:'coldwell-datum-22'},gatehouse:{x:94.5,y:140,h:46.64,floorId:'coldwell-datum-22'},portal:{x:73.5,y:115,h:46.64,floorId:'coldwell-datum-22'},b1:{x:73.5,y:115,h:44.52,floorId:'coldwell-datum-21'},b5:{x:74.5,y:104,h:36.04,floorId:'coldwell-datum-17'},shaft:{x:149.5,y:103.5,h:36.04,floorId:'coldwell-datum-17'}};
for(const [id,point]of Object.entries(positions))$(id).onclick=()=>{if(view){view.focusFloorPoint(point);state.revision++;}};
$('reset').onclick=()=>{view?.center();if(state)state.revision++;};
for(const name of ['roofs','canopies','display'])$(name).onchange=()=>{if(view){view.coldwellCutaway=Object.fromEntries(['roofs','canopies','display'].map(k=>[k,$(k).checked]));state.revision++;}};
$('cover').oninput=()=>{if(state){state.spatial.poses['silo-cover']=Number($('cover').value);state.spatial.revision++;state.revision++;}};
$('point-shadow').onchange=()=>{if(!view)return;if($('point-shadow').checked){pointLight=new PointLight(0xffe9bf,20,25);pointLight.castShadow=true;pointLight.shadow.mapSize.set(256,256);view.scene.add(pointLight);view.renderer.shadowMap.enabled=true;}else{pointLight?.removeFromParent();pointLight?.shadow.dispose();pointLight=null;}};
$('unload').onclick=async()=>{if(!view)return;const old=view.art;view.setGame(state);await old?.retirement;await view.artReady;await view.art?.whenIdle();};
function snapshot(){return {preview:true,playable:false,disposed,retiredArt,source:provider?.bundle.manifest.sourceDigest,errors:[...errors],floor:view?.floorController?.state.selectedId,art:view?.art?.diagnostics(),renderer:view?{calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures}:null};}
async function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);pointLight?.removeFromParent();pointLight?.shadow.dispose();pointLight=null;const art=view?.art;await view?.dispose();retiredArt=art?.diagnostics();}
// Read-only diagnostics and graceful lifecycle endpoint for isolated acceptance.
globalThis.__coldwellPreview=Object.freeze({snapshot,project(point){const p=new Vector3(point.x,point.h,point.y).project(view.camera),r=$('viewport').getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1};},whenIdle:async()=>{await view?.artReady;await view?.art?.whenIdle();},dispose});
addEventListener('pagehide',()=>{void dispose();},{once:true});
start().catch(fail);
