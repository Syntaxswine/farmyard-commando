import {WINDOW_DEFINITIONS} from './art/windows/catalog.js';
import {createWindowLibrary} from './art/windows/geometry.js';
import {placedWindows,placeWindow,removeWindow,selectedWindow} from './window-authoring.js';
import {windowSystem} from './window-catalogue.js';
import {clipLegacyWindowBox} from './window-system.js';
import {windowReviewSource} from './window-review-map.js';
import {adaptAftSector} from './aft-sector.js';
const $=id=>document.getElementById(id),frame=$('designer');let api,library,assets=[];
for(const d of WINDOW_DEFINITIONS){const option=document.createElement('option');option.value=d.id;option.textContent=`${d.heightId==='waist'?'Waist':'Full'} · ${d.patternId} · ${d.span} m`;$('definition').append(option);}
const status=text=>$('status').textContent=text;
function clear(){for(const asset of assets)asset.dispose();assets=[];}
function controls(){if(!api?.document)return;const selected=selectedWindow(api.document.map,api.selection);$('place').disabled=api.loading||api.document.block||!api.selection||api.selection.type!=='edge'||!!api.selection.z;$('remove').disabled=api.loading||!selected;$('playtest').disabled=api.loading||api.document.block;}
async function edit(fn){try{if(api.loading)throw Error('Wait for the designer to finish loading.');api.document.replace(fn(api.document.map));await api.changed();controls();status('Window placement updated. Export, undo and redo use the designer’s existing controls.');}catch(e){status(e.message);}}
$('place').onclick=()=>edit(map=>placeWindow(map,api.selection,$('definition').value,{finish:$('finish').value}));
$('remove').onclick=()=>edit(map=>removeWindow(map,selectedWindow(map,api.selection)?.id));
$('playtest').onclick=()=>{try{const source=JSON.parse(api.export());adaptAftSector(source);localStorage.setItem('farmyard-window-authored-map',JSON.stringify(source));window.open('window-yard.html?authored=1','_blank','noopener');}catch(e){status('Playtest: '+e.message);}};
$('review').onclick=async()=>{try{if(!api)throw Error('The 3D designer needs WebGL before it can open the proving yard.');await api.open(JSON.stringify(windowReviewSource()));controls();status('Proving yard loaded in the designer. Select a wall to place a window, or Playtest map.');}catch(e){status(e.message);}};
function connect(){
  const current=frame.contentWindow?.editor3d;if(!current){status('The designer could not initialize. WebGL must be available to use its 3D view.');return;}
  api=current;library=createWindowLibrary();const scene=api.scene,base=scene.rebuild.bind(scene),select=scene.select.bind(scene);
  scene.select=value=>{select(value);controls();};
  scene.rebuild=()=>{
    clear();const map=api.document?.map,records=map?windowSystem.compile({map:map.terrain,windows:placedWindows(map)}):[],covered=new Set(records.flatMap(r=>r.edges)),prior=scene.world;
    // Adjust the borrowed legacy boxes for presentation only. The saved map
    // and pinned designer bytes remain untouched.
    if(prior)scene.world={...prior,boxes:prior.boxes.map(box=>clipLegacyWindowBox(box,covered)).filter(Boolean)};
    try{base();}finally{scene.world=prior;}
    if(scene.options.walls)for(const {placement:p}of records){const asset=library.build(p.definitionId,{joins:p.joins,finish:p.finish,wall:p.wall,rotation:p.rotation||0});asset.root.position.set(p.x,0,p.y);scene.scene.add(asset.root);assets.push(asset);}
  };
  scene.rebuild();controls();status('Select a ground-floor wall. A wide window starts at that wall cell and replaces its complete span. Playtest accepts flat ground maps.');
}
frame.addEventListener('load',connect);
// The iframe already owns and disposes its native scene on pagehide.
window.addEventListener('pagehide',()=>{clear();library?.dispose();});
