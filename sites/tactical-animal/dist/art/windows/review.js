import * as T from '../../aft/tactics/vendor/three.module.js';
import {WINDOW_DEFINITIONS,describeWindow} from './catalog.js';
import {createWindowLibrary} from './geometry.js';
import {createWindowPreview} from './preview-renderer.js';

const catalog=document.querySelector('#catalog'),status=document.querySelector('#status'),library=createWindowLibrary(),renderer=createWindowPreview();
const scene=new T.Scene();scene.background=new T.Color(0x9ca48f);scene.add(new T.HemisphereLight(0xfff0d0,0x59695e,2.4));const sun=new T.DirectionalLight(0xffe6ba,2.6);sun.position.set(-3,8,5);scene.add(sun);
const camera=new T.OrthographicCamera(-4,4,2.5,-2.5,.1,40),cube=new T.BoxGeometry(1,1,1),surfaces=[0x8c927f,0x617460,0xd6c79d].map(color=>new T.MeshStandardMaterial({color,roughness:1}));
let generation=0,disposed=false;
const box=(parent,mat,at,size,angle=0)=>{const mesh=new T.Mesh(cube,mat);mesh.position.set(...at);mesh.scale.set(...size);mesh.rotation.z=angle;parent.add(mesh);return mesh;};
function thumbnail(def,finish,wall,view,requestedPane){
 const intact=library.build(def.id,{finish,wall}),missing=library.build(def.id,{finish,wall}),id=missing.panes.has(requestedPane)?requestedPane:missing.spec.panes.at(-1).id;missing.setPaneVisible(id,false);
 const group=new T.Group();scene.add(group);
 try{
  const offset=def.span/2+.24,sign=view==='back'?-1:1;
  for(const [i,asset] of [intact,missing].entries()){
   asset.root.position.x=(i?1:-1)*offset*sign;group.add(asset.root);
   box(group,surfaces[0],[asset.root.position.x,-.035,0],[def.span+.14,.06,.75]);
   box(group,surfaces[1],[asset.root.position.x,.99,-sign*.34],[def.span-.025,1.96,.025]);
   box(group,surfaces[2],[asset.root.position.x,1.06,-sign*.31],[def.span*.76,.10,.02],sign*.21);
  }
  const bounds=new T.Box3().setFromObject(group),center=bounds.getCenter(new T.Vector3());camera.up.set(0,1,0);
  camera.position.copy(center).add(view==='front'?new T.Vector3(0,.15,9):view==='back'?new T.Vector3(-5,3.1,-8):new T.Vector3(5,3.1,8));camera.lookAt(center);camera.updateMatrixWorld(true);
  const projected=new T.Box3();for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const size=projected.getSize(new T.Vector3()),half=Math.max(size.x/2,size.y/2*768/480)*1.12;Object.assign(camera,{left:-half,right:half,top:half*480/768,bottom:-half*480/768});camera.updateProjectionMatrix();
  return {src:renderer.render(scene,camera),pane:id};
 }finally{intact.dispose();missing.dispose();group.removeFromParent();}
}
async function render(){
 const current=++generation,values=Object.fromEntries([...document.querySelectorAll('select')].map(s=>[s.id,s.value]));catalog.replaceChildren();status.textContent='Rendering windows…';
 const defs=WINDOW_DEFINITIONS.filter(d=>(values.height==='all'||d.heightId===values.height)&&(values.span==='all'||d.span===+values.span)&&(values.pattern==='all'||d.patternId===values.pattern));
 for(const def of defs){
  if(disposed||current!==generation)return;
  const preview=thumbnail(def,values.finish,values.wall,values.view,values.pane),card=document.createElement('article');card.className='card';
  const picture=document.createElement('div');picture.className='picture';const img=document.createElement('img');img.src=preview.src;img.width=768;img.height=480;img.alt=`${def.name}, ${def.span} metres: intact and pane ${preview.pane} removed`;picture.append(img);
  const labels=document.createElement('div');labels.className='labels';labels.innerHTML=`<span>INTACT</span><span>${preview.pane.toUpperCase()} REMOVED</span>`;picture.append(labels);card.append(picture);
  const info=document.createElement('div');info.className='info';const heading=document.createElement('h2');heading.textContent=def.name;info.append(heading);
  const dims=document.createElement('div');dims.className='dimensions';dims.textContent=`${def.span} m span · 2 m wall · ${describeWindow(def.id).panes.length} ${def.rows*def.columns===1?'pane':'panes'} · sill ${def.sill} m`;info.append(dims);
  const id=document.createElement('p');id.className='id';id.textContent=def.id;info.append(id);card.append(info);catalog.append(card);await new Promise(requestAnimationFrame);
 }
 if(current===generation)status.textContent=`${defs.length} ${defs.length===1?'design':'designs'} · ${defs.length*2} window states · ${renderer.mode} preview · ready`;
}
function dispose(){if(disposed)return;disposed=true;generation++;library.dispose();cube.dispose();surfaces.forEach(m=>m.dispose());renderer.dispose();}
document.querySelector('#filters').addEventListener('submit',e=>e.preventDefault());for(const select of document.querySelectorAll('select'))select.addEventListener('change',()=>render().catch(e=>{status.textContent=e.message;}));
addEventListener('pagehide',dispose,{once:true});addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
render().catch(e=>{status.textContent=e.message;dispose();});
