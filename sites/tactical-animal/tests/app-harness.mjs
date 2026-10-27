import fs from 'node:fs';
import vm from 'node:vm';
import * as game from '../dist/solo-game.js';
import * as controls from '../dist/mobile-controls.js';
import * as grenadeControls from '../dist/grenade-controls.js';
import {selectInteractionTarget} from '../dist/interactions.js';
import {STANCE_ICONS} from '../dist/aft/tactics/battle-control-icons.js';

// Actual application handlers and simulation with a lightweight DOM/renderer.
export function app(){
  const elements=new Map(),events=new Map(),saved=new Map(),views=[];let animation;
  class Element {
    constructor(id=''){this.id=id;this.style={};this.dataset={};this.children=[];this.listeners=new Map();this.hidden=false;this.disabled=false;this.open=false;this.textContent='';this.captures=new Set();this.classList={add(){},remove(){},toggle(){}};}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
    prepend(...children){this.children.unshift(...children);}
    closest(){return null;}
    getBoundingClientRect(){return {left:100,top:600,width:155,height:155,bottom:755};}
    setPointerCapture(id){this.captures.add(id);}
    hasPointerCapture(id){return this.captures.has(id);}
    releasePointerCapture(id){this.captures.delete(id);}
    showModal(){this.open=true;}
    close(){this.open=false;}
    click(){if(!this.disabled)this.fire('click',{detail:1});}
    fire(type,extra={}){const event={type,pointerId:1,button:0,clientX:177.5,clientY:677.5,target:this,preventDefault(){},...extra};this['on'+type]?.(event);for(const fn of this.listeners.get(type)||[])fn(event);}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const doc={getElementById:el,querySelector:el,createElement:()=>new Element(),body:new Element(),hidden:false,addEventListener(){}};
  class FieldView {
    constructor(_container,options){this.options=options;this.follow=true;views.push(this);}
    setGame(state){this.state=state;this.options.onLoading(false);}
    interactionAnchor(){return {x:200,y:300,visible:true};}
    beginGrenadeAim(){this.preview=null;this.aiming=true;}
    endGrenadeAim(){this.aiming=false;}
    previewGrenade(point,preview){this.preview={point:{...point},...preview};}
    zoom(factor){this.zoomFactor=(this.zoomFactor||1)*factor;}
    route(){} center(){} sync(){} dispose(){}
  }
  saved.set('tactical-animal-build-v1',JSON.stringify({...game.DEFAULT_BUILD,utility:'grenade'}));
  const context={...game,...controls,...grenadeControls,selectInteractionTarget,STANCE_ICONS,weaponArtwork:()=>new Element(),FieldView,drawMinimap(){},document:doc,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},setTimeout,clearTimeout,performance:{now:()=>0},requestAnimationFrame:fn=>animation=fn,innerHeight:844,addEventListener:(name,fn)=>events.set(name,fn),console};
  vm.runInNewContext(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  el('deploy').click();const view=views.at(-1),s=view.state,u=game.hero(s);
  const key=(name,type='keydown')=>events.get(type)({key:name,target:{tagName:'BODY',closest:()=>null},preventDefault(){},repeat:false});
  const advance=(count=1)=>{for(let i=0;i<count;i++)animation((s.elapsed+.05)*1000);};
  const drag=(x,y)=>{el('joystick').fire('pointerdown');el('joystick').fire('pointermove',{clientX:177.5+x,clientY:677.5+y});};
  return {el,view,s,u,key,advance,drag,events,saved};
}
