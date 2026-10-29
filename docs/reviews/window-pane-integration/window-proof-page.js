import * as T from './aft/tactics/vendor/three.module.js';
import {createSoloGame,DEFAULT_BUILD,hero,Core,encodeSave,decodeSave} from './solo-game.js?v=__VERSION__';
import {WindowScenery,WindowEffects} from './window-view.js?v=__VERSION__';
import {createWindowPreview} from './art/windows/preview-renderer.js?v=__VERSION__';
const $=id=>document.getElementById(id),rect={x:0,y:0,w:48,h:48},scene=new T.Scene(),renderer=createWindowPreview(1000,650),camera=new T.OrthographicCamera(-9,9,5.85,-5.85,.1,100);
scene.background=new T.Color(0x9ca48f);scene.add(new T.HemisphereLight(0xfff0d0,0x59695e,2.4));const sun=new T.DirectionalLight(0xffe6ba,2.6);sun.position.set(-3,8,5);scene.add(sun);camera.position.set(33,8,37);camera.lookAt(23,1,24.5);
let state,art,fx,time=0,saved,action='Ready';
function start(s){art?.dispose();fx?.dispose();state=s||createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1,'window-yard');art=new WindowScenery(state);scene.add(art.root);fx=new WindowEffects(scene,state,{reduced:()=>false});time=0;draw();}
function draw(){fx.observe(state,time,rect);art.update(state,rect,(id,pane)=>fx.holds(id,pane));$('proof').src=renderer.render(scene,camera);$('status').textContent=action+' · '+renderer.mode;const a=hero(state);$('report').textContent=JSON.stringify({ammo:a.ammo.assault,AP:a.ap,broken:state.windowBreaks||{},acceptedBreaks:state.windowSequence||0,transientReceipts:state.windowEvents?.length||0,effects:fx.stats(),visibleMeshes:Object.fromEntries([...art.assets].map(([id,asset])=>[id,[...asset.panes.keys()].filter(pane=>asset.isPaneVisible(pane))])),shots:state.effect?.sequence.map(e=>({shot:e.shot,glass:!!e.glass,unit:e.impact?.unitId,windowSequences:e.windowSequences}))},null,2);}
$('reset').onclick=()=>{action='Ready';start();};
$('burst').onclick=()=>{fx.unlock();Core.attack(state,hero(state),state.units[1],true);action='Committed burst';draw();};
$('cell').onclick=()=>{fx.unlock();Core.attack(state,hero(state),{ground:true,x:25,y:21.5,h:.4,name:'Lower centre pane'});action='Committed divided-cell shot';draw();};
$('frame').onclick=()=>{fx.unlock();Core.attack(state,hero(state),{ground:true,x:25,y:21.5,h:1,name:'Mullion'});action='Committed mullion shot';draw();};
$('blast').onclick=()=>{fx.unlock();Core.throwGrenade(state,hero(state),{x:20,y:23});action='Committed grenade';draw();};
$('step').onclick=()=>{time+=400;action='Sampled actual source shatter at '+time+' ms';draw();};
$('save').onclick=()=>{saved=encodeSave(state);action='Saved and restored; no transient effect replay';start(decodeSave(saved));};
$('revisit').onclick=()=>{art.update(state,{x:96,y:96,w:48,h:48});fx.observe(state,time,{x:96,y:96,w:48,h:48});action='Left and returned; no transient effect replay';draw();};
addEventListener('pagehide',()=>{art.dispose();fx.dispose();renderer.dispose();});start();
