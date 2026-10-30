import * as T from './aft/tactics/vendor/three.module.js';
import {createPaintedBlastEffects,loadPaintedBlastTextures} from './designer/a20b343a0234/tactics/painted-blast-effects.js';
import {tankCentre} from './designer/a20b343a0234/tactics/tank-blast-motion.js';
const base=new URL('./designer/a20b343a0234/tactics/',import.meta.url),V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),key=p=>`${p.floorId?p.floorId+'@':''}${Math.round(p.x)},${Math.round(p.y)}`;
export class SoloTankEffects{
  constructor(scene,{loadTexture=url=>new T.TextureLoader().loadAsync(url),reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,onError=error=>console.warn('Fuel artwork unavailable; simulation continues.',error)}={}){
    Object.assign(this,{scene,loadTexture,reducedMotion,onError,bursts:new Map(),sequence:0,disposed:false});
  }
  load(){if(this.ready)return;this.ready=loadPaintedBlastTextures({loadAsync:path=>this.loadTexture(new URL(path,base).href)}).then(textures=>{if(this.disposed)textures.forEach(t=>t.dispose());else this.textures=textures;},e=>this.onError(e));}
  observe(state,now,units,startFor=()=>now){
    this.state=state;this.now=now;this.reduced=!!this.reducedMotion();const shown=new Set(units.map(u=>u.id));
    for(const event of state.fireAnimations||[]){
      if(event.sequence<=this.sequence)continue;this.sequence=event.sequence;if(event.kind!=='tank'||this.reduced||!shown.has(event.unitId))continue;
      const point=event.route[0];this.bursts.set(event.sequence,{event,origin:V(point.x,(point.h??0)+.8,point.y),floor:point.h??0,floorId:point.floorId,worn:!!event.worn,waiting:true,start:now,queued:now});
      while(this.bursts.size>8)this.remove(this.bursts.keys().next().value);
    }
    for(const [sequence,b]of this.bursts){
      if(this.reduced||!shown.has(b.event.unitId)||now-b.queued>8000||!b.waiting&&now-b.start>=5400){this.remove(sequence);continue;}
      if(b.waiting){const start=startFor(b.event,now);if(start!==null){b.start=start;b.waiting=false;}}
    }
    if(this.bursts.size||state.fires?.length)this.load();
  }
  setOrigin(sequence,point){const b=this.bursts.get(sequence);if(b&&!b.originFixed){b.origin.copy(point);b.originFixed=true;}}
  captureOrigins(actors){for(const b of this.bursts.values())if(b.worn&&!b.originFixed){const actor=actors.get(b.event.unitId);if(actor?.worker.weapon?.id==='flamethrower')this.setOrigin(b.event.sequence,tankCentre(actor.worker));}}
  make(entry,ground=false){
    if(entry.effects||entry.loading||!this.textures)return;entry.loading=true;
    createPaintedBlastEffects(this.scene,null,entry.origin,{textures:this.textures,world:true,floor:entry.floor??0,fragmentCount:ground?0:8}).then(fx=>{if(entry.disposed)fx.dispose();else entry.effects=fx;}).catch(e=>this.onError(e));
  }
  draw(camera){
    if(this.state?.spatial)return this.drawSpatial(camera);
    if(!this.state)return;const visible=[...this.state.visible].map(k=>{const [x,z]=k.split(',').map(Number);return {x,z};});
    for(const b of this.bursts.values()){
      if(b.waiting||this.now<b.start||b.worn&&!b.originFixed)continue;
      this.make(b);if(b.effects){b.effects.setVisibility(visible);b.effects.update((this.now-b.start)/1000,{camera,contract:{origin:{x:0,y:0},fires:[]},groundOpacity:0});}
    }
    // Persistent cells rebuild from saves; old cells are never withheld by a
    // new explosion. Only newly committed cells wait for that impact's cue.
    const withheld=new Set([...this.bursts.values()].filter(b=>b.waiting||this.now<b.start).flatMap(b=>(b.event.fires||[]).map(key)));
    const cells=(this.state.fires||[]).filter(p=>p.turns>0&&this.state.visible.has(key(p))&&!withheld.has(key(p)));
    if(!cells.length){if(this.ground){this.ground.disposed=true;this.ground.effects?.dispose();this.ground=null;}return;}
    this.ground??={origin:V(0,1,0)};const signature=cells.map(key).join(';');
    if(this.ground.signature!==signature){this.ground.signature=signature;this.ground.contract={origin:{x:0,y:0},fires:cells};}
    this.make(this.ground,true);if(this.ground.effects){this.ground.effects.setVisibility(visible);this.ground.effects.update(this.reduced?100:100+this.now/1000,{camera,contract:this.ground.contract});}
  }
  drawSpatial(camera){
    const visible=floor=>[...this.state.visible].filter(k=>k.startsWith(floor+'@')).map(k=>{const [x,z]=k.split('@')[1].split(',').map(Number);return {x,z};});
    for(const b of this.bursts.values())if(!b.waiting&&this.now>=b.start&&(!b.worn||b.originFixed)){this.make(b);if(b.effects){b.effects.setVisibility(visible(b.floorId));b.effects.update((this.now-b.start)/1000,{camera,contract:{origin:{x:0,y:0},fires:[]},groundOpacity:0});}}
    const withheld=new Set([...this.bursts.values()].filter(b=>b.waiting||this.now<b.start).flatMap(b=>(b.event.fires||[]).map(key))),groups=new Map();
    for(const p of this.state.fires||[])if(p.turns>0&&this.state.visible.has(key(p))&&!withheld.has(key(p))){const id=p.floorId+'@'+p.h;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
    this.grounds??=new Map();for(const [id,entry]of this.grounds)if(!groups.has(id)){entry.disposed=true;entry.effects?.dispose();this.grounds.delete(id);}
    for(const [id,cells]of groups){let entry=this.grounds.get(id);if(!entry){entry={origin:V(0,cells[0].h+1,0),floor:cells[0].h};this.grounds.set(id,entry);}entry.contract={origin:{x:0,y:0},fires:cells};this.make(entry,true);if(entry.effects){entry.effects.setVisibility(visible(cells[0].floorId));entry.effects.update(this.reduced?100:100+this.now/1000,{camera,contract:entry.contract});}}
  }
  remove(sequence){const b=this.bursts.get(sequence);if(b){b.disposed=true;b.effects?.dispose();this.bursts.delete(sequence);}}
  dispose(){if(this.disposed)return;this.disposed=true;for(const sequence of this.bursts.keys())this.remove(sequence);if(this.ground){this.ground.disposed=true;this.ground.effects?.dispose();this.ground=null;}for(const entry of this.grounds?.values()||[]){entry.disposed=true;entry.effects?.dispose();}this.grounds?.clear();this.textures?.forEach(t=>t.dispose());}
}
