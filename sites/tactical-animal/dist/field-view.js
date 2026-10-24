import * as T from './aft/tactics/vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from './aft/tactics/animal-motion-catalog.js';
import {createAnimalPaint} from './aft/tactics/animal-motion-paint.js';
import {createWeaponModel} from './aft/tactics/weapon-models.js';
import {createWorkerLocomotion} from './aft/tactics/worker-locomotion.js';
import {createBattlePosture} from './aft/tactics/battle-posture.js';
import {DaylightRig} from './aft/tactics/daylight-rig.js';
import {OriginalEnvironment} from './original-art.js';
import {BRIEF, hero, Core} from './solo-game.js';
import {FIELD_CAMERA,grenadeCameraFrame} from './grenade-controls.js';
import {InteractionScenery} from './interaction-view.js';

const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
// Distinct tracer pulses make each committed burst round readable. A shorter
// lifetime than the interval prevents identical paths merging into one beam.
const BURST_SHOT_INTERVAL=140,BURST_TRACER_DURATION=90;
export class FieldView {
  constructor(container, {onPick, onLoading, onError, getAimViewport}) {
    this.container=container;this.onPick=onPick;this.onLoading=onLoading;this.onError=onError;this.getAimViewport=getAimViewport;
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.setClearColor(0x17241e);
    container.append(this.renderer.domElement);
    this.scene=new T.Scene();this.scene.fog=new T.Fog(0x17241e,38,75);
    this.daylight=new DaylightRig(this.scene,this.renderer);this.daylight.sun.shadow.mapSize.set(1024,1024);
    this.camera=new T.OrthographicCamera();this.target=V(5,0,24);this.span=13;this.follow=true;
    this.ray=new T.Raycaster();this.plane=new T.Plane(V(0,1,0),0);
    this.environment=new T.Group();this.scene.add(this.environment);
    this.actors=new Map();this.data=new Map();this.pending=new Map();this.failed=new Set();this.generation=0;this.samples=new Map();this.effects=[];
    this.loader=new T.TextureLoader();this.loader.setPath(new URL('./aft/tactics/',import.meta.url).href);this.pointers=new Map();this.disposables=[];
    this.marker=new T.Mesh(new T.RingGeometry(.32,.4,32),new T.MeshBasicMaterial({color:0xf2c56a,side:T.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.marker.position.y=.025;this.marker.visible=false;this.scene.add(this.marker);
    const blast=Core.WEAPONS.grenade.blast;this.blastMarker=new T.Mesh(new T.RingGeometry(blast-.04,blast,64),new T.MeshBasicMaterial({color:0xf4a568,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));this.blastMarker.rotation.x=-Math.PI/2;this.blastMarker.visible=false;this.scene.add(this.blastMarker);
    this.blastArea=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0xf4a568,side:T.DoubleSide,transparent:true,opacity:.17,depthWrite:false}));this.blastArea.visible=false;this.scene.add(this.blastArea);
    this.pathLine=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xe6b464,transparent:true,opacity:.85}));this.scene.add(this.pathLine);
    this.pointerDown=e=>this.down(e);this.pointerMove=e=>this.drag(e);this.pointerUp=e=>this.up(e);
    container.addEventListener('pointerdown',this.pointerDown);container.addEventListener('pointermove',this.pointerMove);container.addEventListener('pointerup',this.pointerUp);container.addEventListener('pointercancel',this.pointerUp);
    this.wheel=e=>{e.preventDefault();this.zoom(Math.exp(e.deltaY*.001));};container.addEventListener('wheel',this.wheel,{passive:false});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.left=-this.span*w/h/2;this.camera.right=this.span*w/h/2;this.camera.top=this.span/2;this.camera.bottom=-this.span/2;this.camera.near=.1;this.camera.far=120;this.camera.updateProjectionMatrix();this.updateCamera();}
  updateCamera(){this.camera.position.copy(this.target).add(V(FIELD_CAMERA.x,FIELD_CAMERA.y,FIELD_CAMERA.z));this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  zoom(factor){if(this.grenadeCamera){this.grenadeCamera.baseSpan=T.MathUtils.clamp(this.grenadeCamera.baseSpan*factor,6,35);return;}this.returnSpan=null;this.span=T.MathUtils.clamp(this.span*factor,6,35);this.resize();}
  center(){if(this.grenadeCamera)this.endGrenadeAim();this.focusedId=null;this.follow=true;if(this.state){const u=hero(this.state);this.target.set(u.x,0,u.y);this.updateCamera();}}
  focusOpponent(id){const u=this.state?.units.find(v=>v.id===id&&v.team==='guard'&&Core.alive(v)&&this.state.detected.has(v.id));if(!u)return false;if(this.grenadeCamera)this.endGrenadeAim();this.focusedId=id;this.follow=false;this.target.set(u.x,0,u.y);this.updateCamera();return true;}
  ground(clientX,clientY){const r=this.container.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);return this.ray.ray.intersectPlane(this.plane,V());}
  interactionAnchor(object){const height=object.kind==='door'?2.15:object.kind==='chest'?1.15:.7,point=V(object.x,height,object.y).project(this.camera);return {x:(point.x+1)*this.container.clientWidth/2,y:(1-point.y)*this.container.clientHeight/2,visible:Math.abs(point.x)<.95&&Math.abs(point.y)<.95&&Math.abs(point.z)<1};}
  down(e){if(e.button!==0||this.grenadeCamera)return;this.container.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size===1)this.gesture={x:e.clientX,y:e.clientY,target:this.target.clone(),moved:false,at:performance.now()};if(this.pointers.size===2){const [a,b]=[...this.pointers.values()];this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),span:this.span};this.gesture.moved=true;}}
  drag(e){const point=this.pointers.get(e.pointerId);if(!point)return;point.x=e.clientX;point.y=e.clientY;
    if(this.pointers.size===2&&this.pinch){const [a,b]=[...this.pointers.values()];this.span=T.MathUtils.clamp(this.pinch.span*this.pinch.distance/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),6,35);this.resize();return;}
    if(!this.gesture)return;const dx=e.clientX-this.gesture.x,dy=e.clientY-this.gesture.y;if(Math.hypot(dx,dy)<8&&!this.gesture.moved)return;this.gesture.moved=true;this.follow=false;this.focusedId=null;
    // Map screen displacement to the ground plane using the current camera basis.
    const right=V().setFromMatrixColumn(this.camera.matrixWorld,0),up=V().setFromMatrixColumn(this.camera.matrixWorld,1);up.y=0;up.normalize();
    this.target.copy(this.gesture.target).addScaledVector(right,-dx*this.span/this.container.clientHeight).addScaledVector(up,dy*this.span/this.container.clientHeight*1.65);this.updateCamera();
  }
  up(e){if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);if(this.pointers.size){this.gesture.moved=true;return;}
    const g=this.gesture;this.gesture=null;this.pinch=null;if(!g||g.moved||e.type==='pointercancel')return;
    const point=this.ground(e.clientX,e.clientY);if(!point)return;
    const picks=[...this.actors.values()].filter(a=>a.root.visible&&a.pick.visible).map(a=>a.pick).concat(this.interactionArt?.picks||[]);
    const hit=this.ray.intersectObjects(picks,false)[0];
    this.onPick(hit?hit.object.userData.interactionId?{interactionId:hit.object.userData.interactionId}:{unitId:hit.object.userData.unitId}:{x:point.x,y:point.z});
  }
  setGame(s){this.generation++;this.state=s;this.samples.clear();this.failed.clear();for(const a of this.actors.values())this.disposeActor(a);this.actors.clear();this.pending.clear();this.clearEnvironment();this.buildEnvironment(s);this.center();this.lastRevision=-1;this.lastEffect=null;this.route([]);}
  reportLoading(){this.onLoading(this.artBusy||this.propBusy||this.pending.size>0||this.failed.size>0);}
  clearEnvironment(){this.interactionArt?.dispose();this.interactionArt=null;this.art?.dispose();this.art=null;this.environment.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.environment.clear();for(const t of this.disposables)t.dispose();this.disposables=[];}
  buildEnvironment(s){
    const generation=this.generation;this.artBusy=true;
    this.art=new OriginalEnvironment(this.renderer,s,{
      onLoading:busy=>{if(generation===this.generation){this.artBusy=busy;this.reportLoading();}},
      onError:message=>{if(generation===this.generation){this.failed.add('environment');this.onError(message);}},
    });this.environment.add(this.art.root);
    this.propBusy=true;this.interactionArt=new InteractionScenery(s,{
      onLoading:busy=>{if(generation===this.generation){this.propBusy=busy;this.reportLoading();}},
      onError:message=>{if(generation===this.generation){this.failed.add('interaction-art');this.onError(message);}},
    });this.environment.add(this.interactionArt.root);
    this.objectivePin=this.makePin(BRIEF.objective,0xe16b3d);this.extractionPin=this.makePin(BRIEF.extraction,0xc4d29a);
    // Rail lines and loading-yard markings are scenery; the engine owns all collision.
    for(let x=3;x<37;x+=3){const mark=new T.Mesh(new T.PlaneGeometry(1.2,.06),new T.MeshBasicMaterial({color:0xb0a475,transparent:true,opacity:.16}));mark.rotation.x=-Math.PI/2;mark.position.set(x,.003,26.8);this.environment.add(mark);}
  }
  makePin(point,color){const group=new T.Group();group.position.set(point.x,0,point.y);const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.8,side:T.DoubleSide});const ring=new T.Mesh(new T.RingGeometry(.36,.45,32),mat);ring.rotation.x=-Math.PI/2;ring.position.y=.035;group.add(ring);const shaft=new T.Mesh(new T.CylinderGeometry(.017,.017,1.6,6),mat.clone());shaft.position.y=.8;group.add(shaft);const flag=new T.Mesh(new T.OctahedronGeometry(.14),mat.clone());flag.position.y=1.65;group.add(flag);this.environment.add(group);return group;}
  route(path=[]){this.blastMarker.visible=false;this.blastArea.visible=false;this.grenadePreviewKey='';this.marker.material.color.setHex(0xf2c56a);this.pathLine.material.color.setHex(0xe6b464);this.pathLine.geometry.dispose();this.pathLine.geometry=new T.BufferGeometry().setFromPoints(path.map(p=>V(p.x,.06,p.y)));const end=path.at(-1);this.marker.visible=!!end;if(end)this.marker.position.set(end.x,.035,end.y);}
  beginGrenadeAim(){
    const baseSpan=this.grenadeCamera?.baseSpan??this.returnSpan??this.span;
    for(const id of this.pointers.keys())if(this.container.hasPointerCapture(id))this.container.releasePointerCapture(id);
    this.pointers.clear();this.gesture=null;this.pinch=null;this.focusedId=null;this.follow=false;this.returnSpan=null;
    this.grenadeCamera={baseSpan,point:null,until:null};this.route([]);
  }
  endGrenadeAim({linger=0}={}){
    this.route([]);
    if(!this.grenadeCamera)return;
    if(linger){this.grenadeCamera.until=performance.now()+linger;return;}
    this.returnSpan=this.grenadeCamera.baseSpan;this.grenadeCamera=null;this.focusedId=null;this.follow=true;
  }
  previewGrenade(point,preview){
    if(this.grenadeCamera)this.grenadeCamera.point={...point};
    const signature=[point.x,point.y,this.state.revision,preview.ok,preview.selfDanger].join(':');
    if(signature===this.grenadePreviewKey)return;this.grenadePreviewKey=signature;
    const color=!preview.ok||preview.selfDanger?0xf08068:0xf4c77a;
    this.pathLine.material.color.setHex(color);this.pathLine.geometry.dispose();
    this.pathLine.geometry=new T.BufferGeometry().setFromPoints(Core.grenadeTrajectory(hero(this.state),point).map(p=>V(p.x,p.z,p.y)));
    this.marker.visible=true;this.marker.position.set(point.x,.035,point.y);this.marker.material.color.setHex(color);
    this.blastMarker.position.set(point.x,.05,point.y);this.blastMarker.material.color.setHex(color);this.blastMarker.visible=true;
    const edge=Core.grenadeBlastFootprint(this.state,point),vertices=[];
    for(let i=1;i<edge.length;i++)vertices.push(point.x,.045,point.y,edge[i-1].x,.045,edge[i-1].y,edge[i].x,.045,edge[i].y);
    this.blastArea.geometry.dispose();this.blastArea.geometry=new T.BufferGeometry();this.blastArea.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));this.blastArea.material.color.setHex(color);this.blastArea.visible=vertices.length>0;
  }
  trackGrenadeCamera(now){
    const aim=this.grenadeCamera;if(!aim)return;
    if(aim.until&&now>=aim.until){this.endGrenadeAim();return;}
    const u=hero(this.state),points=aim.point?Core.grenadeTrajectory(u,aim.point):[{x:u.x,y:u.y,z:1.8}];
    points.push({x:u.x,y:u.y,z:0},{x:u.x,y:u.y,z:1.8});
    if(aim.point)for(let i=0;i<16;i++){const a=i/16*Math.PI*2;points.push({x:aim.point.x+Math.cos(a)*Core.WEAPONS.grenade.blast,y:aim.point.y+Math.sin(a)*Core.WEAPONS.grenade.blast,z:0});}
    const frame=grenadeCameraFrame(points,{width:this.container.clientWidth,height:this.container.clientHeight,...this.getAimViewport?.()},aim.baseSpan);
    this.target.lerp(V(frame.target.x,0,frame.target.y),.14);this.span+=(frame.span-this.span)*.14;this.resize();
  }
  async actor(u){
    if(this.actors.has(u.id)||this.pending.has(u.id)||this.failed.has(u.id))return;
    const generation=this.generation,profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===u.species);this.pending.set(u.id,generation);this.onLoading(true);
    let worker,paint,posture,locomotion,root,pick,ring;
    try{
      if(!profile)throw Error('Unknown animal: '+u.species);
      if(!this.data.has(profile.file))this.data.set(profile.file,fetch(new URL('./aft/tactics/'+profile.file,import.meta.url)).then(r=>{if(!r.ok)throw Error('Cannot load '+profile.file);return r.json();}));
      worker=profile.create(await this.data.get(profile.file));paint=await createAnimalPaint(this.renderer,worker,profile,this.loader,'normal',true);
      if(generation!==this.generation){paint.dispose();worker.dispose();return;}
      for(const part of worker.parts){part.material=paint.material;part.frustumCulled=false;}
      worker.equipWeapon(createWeaponModel(u.weapon));locomotion=createWorkerLocomotion(worker,profile);posture=createBattlePosture(worker,profile);root=new T.Group();root.add(worker.root);
      ring=new T.Mesh(new T.RingGeometry(.28,.34,32),new T.MeshBasicMaterial({color:u.team==='squad'?0xd8dfb1:0xe2633c,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.018;root.add(ring);
      const shadow=new T.Mesh(new T.CircleGeometry(.3,20),new T.MeshBasicMaterial({color:0x131b12,transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.x=1.3;shadow.position.y=.01;root.add(shadow);
      pick=new T.Mesh(new T.BoxGeometry(.8,1.8,.8),new T.MeshBasicMaterial({visible:false}));pick.position.y=.9;pick.userData.unitId=u.id;root.add(pick);
      const a={worker,paint,profile,locomotion,posture,root,pick,ring,shadow,weapon:u.weapon,equipment:worker.weapon};this.actors.set(u.id,a);this.scene.add(root);
    }catch(error){paint?.dispose();worker?.weapon?.dispose();worker?.dispose();if(generation===this.generation){this.failed.add(u.id);console.error('Animal model failed',error);this.onError(error.message||'An animal texture could not load.');}}
    finally{if(this.pending.get(u.id)===generation)this.pending.delete(u.id);if(generation===this.generation)this.reportLoading();}
  }
  disposeActor(a){this.scene.remove(a.root);a.locomotion.dispose();a.paint.dispose();a.equipment.dispose();a.worker.dispose();for(const o of [a.pick,a.ring,a.shadow]){o.geometry.dispose();o.material.dispose();}}
  queueEffects(effect,now){
    let previousRound=null;
    for(const event of effect.sequence||[effect]){
      const thrown=event.weapon==='grenade',burst=event.shots>1,at=now+(burst?event.shot*BURST_SHOT_INTERVAL:0);
      const points=thrown?Core.grenadeTrajectory({x:event.ax,y:event.ay},{x:event.bx,y:event.by}).map(p=>V(p.x,p.z,p.y)):[V(event.ax,1.1,event.ay),V(event.bx,.9,event.by)];
      const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:event.incendiary?0xff7835:0xf6d68c,transparent:true,opacity:.9}));
      const visual={line,at,ttl:thrown?700:burst?BURST_TRACER_DURATION:240,started:!burst,previous:burst?previousRound:null};
      line.visible=at<=now;this.scene.add(line);this.effects.push(visual);if(burst)previousRound=visual;
      if(thrown){const ring=new T.Mesh(new T.RingGeometry(event.blast-.07,event.blast,64),new T.MeshBasicMaterial({color:0xf4a568,side:T.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(event.bx,.07,event.by);this.scene.add(ring);this.effects.push({line:ring,at,ttl:700});}
    }
  }
  animateEffects(now){
    this.effects=this.effects.filter(effect=>{
      // A slow frame must not expire an unseen round or start all the remaining
      // rounds together. Rebase each pulse on the preceding round's real start.
      if(effect.previous){
        if(!effect.previous.started){effect.line.visible=false;return true;}
        effect.at=Math.max(effect.at,effect.previous.at+BURST_SHOT_INTERVAL);
      }
      if(effect.started===false&&now>=effect.at){effect.at=now;effect.started=true;}
      const age=now-effect.at;
      if(age<0){effect.line.visible=false;return true;}
      if(age<effect.ttl){effect.line.visible=true;effect.line.material.opacity=1-age/effect.ttl;return true;}
      this.scene.remove(effect.line);effect.line.geometry.dispose();effect.line.material.dispose();return false;
    });
  }
  sync(s,now){this.state=s;const u=hero(s),visible=s.units.filter(v=>v.team==='squad'||(v.hp>0?s.detected.has(v.id):s.visible.has(Core.key(v.x,v.y))));
    for(const [id,a] of this.actors)a.root.visible=visible.some(v=>v.id===id);
    for(const v of visible){let a=this.actors.get(v.id);if(!a){this.actor(v);continue;}const old=this.samples.get(v.id)||{blend:0,pose:{kneel:0,prone:0,down:v.hp<=0?1:0,dead:v.hp<=0?1:0}},blend=old.blend+((v.isMoving?1:0)-old.blend)*.2,goal={kneel:v.stance==='kneeling'?1:0,prone:v.stance==='prone'?1:0,down:v.hp<=0?1:0,dead:v.hp<=0?1:0};const pose=Object.fromEntries(Object.entries(goal).map(([k,value])=>[k,Math.abs(value-old.pose[k])<.005?value:old.pose[k]+(value-old.pose[k])*.15]));const sample={...v,distance:v.travelled,blend:blend<.001?0:blend,pose};this.samples.set(v.id,sample);a.root.visible=true;a.pick.visible=true;a.ring.visible=v.hp>0;a.pick.scale.set(v.hp>0?1:1.6,v.hp>0?1:.2,v.hp>0?1:1.6);a.pick.position.y=v.hp>0?.9:.18;a.pick.userData.interactionId=v.hp<=0?'body:'+v.id:null;
      const signature=[v.weapon,sample.heading,sample.blend,sample.distance,JSON.stringify(sample.pose)].join(':');
      if(a.signature!==signature){a.signature=signature;if(a.weapon!==v.weapon){const old=a.equipment;a.equipment=createWeaponModel(v.weapon);a.worker.equipWeapon(a.equipment);old.dispose();a.weapon=v.weapon;}
        a.root.position.set(0,0,0);a.locomotion.apply({...sample,blend:sample.pose?.prone||sample.pose?.down?0:sample.blend});a.posture.apply(sample);if(sample.pose.down)a.posture.ground();}
      a.root.position.set(sample.x,0,sample.y);a.root.updateMatrixWorld(true);a.worker.skeleton.update();}
    if(this.grenadeCamera)this.trackGrenadeCamera(now);
    if(this.returnSpan!=null){this.span+=(this.returnSpan-this.span)*.14;if(Math.abs(this.returnSpan-this.span)<.01){this.span=this.returnSpan;this.returnSpan=null;}this.resize();}
    if(this.focusedId!=null){const contact=s.units.find(v=>v.id===this.focusedId&&Core.alive(v)&&s.detected.has(v.id));if(contact){this.target.lerp(V(contact.x,0,contact.y),.18);this.updateCamera();}else this.center();}
    if(this.follow){this.target.lerp(V(u.x,0,u.y),.18);this.updateCamera();}
    if(s.revision!==this.lastRevision){this.lastRevision=s.revision;this.art.update(s,u);this.interactionArt.update(s);
      this.objectivePin.visible=!s.solo.ledger;this.extractionPin.visible=true;
    }
    if(s.effect&&s.effect!==this.lastEffect){this.lastEffect=s.effect;this.queueEffects(s.effect,now);}
    this.animateEffects(now);
    if(this.lastLightAt===undefined||now-this.lastLightAt>=200){this.daylight.update(480,this.camera,now,true);this.lastLightAt=now;}
    this.marker.rotation.z=now*.0005;this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.generation++;this.resizeObserver.disconnect();this.container.removeEventListener('pointerdown',this.pointerDown);this.container.removeEventListener('pointermove',this.pointerMove);this.container.removeEventListener('pointerup',this.pointerUp);this.container.removeEventListener('pointercancel',this.pointerUp);this.container.removeEventListener('wheel',this.wheel);for(const a of this.actors.values())this.disposeActor(a);this.actors.clear();this.clearEnvironment();this.daylight.dispose();for(const e of this.effects){e.line.geometry.dispose();e.line.material.dispose();}this.marker.geometry.dispose();this.marker.material.dispose();this.blastMarker.geometry.dispose();this.blastMarker.material.dispose();this.blastArea.geometry.dispose();this.blastArea.material.dispose();this.pathLine.geometry.dispose();this.pathLine.material.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}

export function drawMinimap(canvas,s){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.fillStyle='#1b2219';ctx.fillRect(0,0,w,h);const scale=Math.min((w-12)/38,(h-12)/28),ox=(w-38*scale)/2,oy=(h-28*scale)/2;
  for(let y=1;y<=28;y++)for(let x=1;x<=38;x++){const known=s.seen.has(Core.key(x,y));if(!known)continue;ctx.fillStyle=s.map[y][x]==='crate'?'#746b4e':s.map[y][x]==='floor'?'#686d51':'#3e4b31';ctx.fillRect(ox+(x-1)*scale,oy+(y-1)*scale,scale+.2,scale+.2);}
  ctx.strokeStyle='#acaa88';ctx.lineWidth=Math.max(1,scale*.14);ctx.beginPath();for(const [edge,kind] of Object.entries(s.edges)){if(kind==='door')continue;const [axis,xs,ys]=edge.split(':'),x=+xs,y=+ys;if(!s.seen.has(Core.key(x,y)))continue;if(axis==='e'){ctx.moveTo(ox+(x-.5)*scale,oy+(y-1.5)*scale);ctx.lineTo(ox+(x-.5)*scale,oy+(y-.5)*scale);}else{ctx.moveTo(ox+(x-1.5)*scale,oy+(y-.5)*scale);ctx.lineTo(ox+(x-.5)*scale,oy+(y-.5)*scale);}}ctx.stroke();
  const dot=(p,color,r)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(ox+(p.x-1)*scale,oy+(p.y-1)*scale,r,0,Math.PI*2);ctx.fill();};
  dot(s.solo.ledger?BRIEF.extraction:BRIEF.objective,'#df613f',Math.max(2,scale*.45));for(const id of s.detected){const g=s.units.find(u=>u.id===id);if(g?.hp>0)dot(g,'#e16a47',Math.max(2,scale*.32));}
  const u=hero(s),x=ox+(u.x-1)*scale,y=oy+(u.y-1)*scale,heading=u.heading*Math.PI/180;ctx.save();ctx.translate(x,y);ctx.rotate(heading+Math.PI/2);ctx.fillStyle='#f3edd1';const r=Math.max(3,scale*.5);ctx.beginPath();ctx.moveTo(0,-r*1.5);ctx.lineTo(r,r);ctx.lineTo(0,r*.45);ctx.lineTo(-r,r);ctx.closePath();ctx.fill();ctx.restore();
}
