import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as game from '../dist/solo-game.js';
import * as controls from '../dist/mobile-controls.js';
import * as grenadeControls from '../dist/grenade-controls.js';

// Run the actual application input handlers with a lightweight DOM and renderer.
// Simulation, AP, inventory, path validation, and save behavior remain real.
function app(){
  const elements=new Map(),events=new Map(),saved=new Map(),views=[];let animation;
  class Element {
    constructor(id=''){this.id=id;this.style={};this.dataset={};this.children=[];this.listeners=new Map();this.hidden=false;this.open=false;this.textContent='';this.captures=new Set();this.classList={add(){},remove(){},toggle(){}};}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
    closest(){return null;}
    getBoundingClientRect(){return {left:100,top:600,width:155,height:155,bottom:755};}
    setPointerCapture(id){this.captures.add(id);}
    hasPointerCapture(id){return this.captures.has(id);}
    releasePointerCapture(id){this.captures.delete(id);}
    showModal(){this.open=true;}
    close(){this.open=false;}
    click(){this.onclick?.();}
    fire(type,extra={}){const event={type,pointerId:1,button:0,clientX:177.5,clientY:677.5,target:this,preventDefault(){},...extra};this['on'+type]?.(event);for(const fn of this.listeners.get(type)||[])fn(event);}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const doc={getElementById:el,querySelector:el,createElement:()=>new Element(),body:new Element(),hidden:false,addEventListener(){}};
  class FieldView {
    constructor(_container,options){this.options=options;this.follow=true;views.push(this);}
    setGame(state){this.state=state;}
    beginGrenadeAim(){this.preview=null;this.aiming=true;}
    endGrenadeAim(){this.aiming=false;}
    previewGrenade(point,preview){this.preview={point:{...point},...preview};}
    route(){} center(){} sync(){} dispose(){}
  }
  saved.set('tactical-animal-build-v1',JSON.stringify({...game.DEFAULT_BUILD,utility:'grenade'}));
  const context={...game,...controls,...grenadeControls,FieldView,drawMinimap(){},document:doc,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},setTimeout,clearTimeout,performance:{now:()=>0},requestAnimationFrame:fn=>animation=fn,innerHeight:844,addEventListener:(name,fn)=>events.set(name,fn),console};
  vm.runInNewContext(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  el('deploy').click();const view=views.at(-1),s=view.state,u=game.hero(s);
  const key=(name,type='keydown')=>events.get(type)({key:name,target:{tagName:'BODY',closest:()=>null},preventDefault(){},repeat:false});
  const advance=(count=1)=>{for(let i=0;i<count;i++)animation((s.elapsed+.05)*1000);};
  const drag=(x,y)=>{el('joystick').fire('pointerdown');el('joystick').fire('pointermove',{clientX:177.5+x,clientY:677.5+y});};
  return {el,view,s,u,key,advance,drag,events};
}
const snapshot=u=>({x:u.x,y:u.y,ap:u.ap,hp:u.hp,grenades:u.ammo.grenade,weapon:u.weapon,ammo:{...u.ammo}});

test('joystick aim and release hold a preview without walking or consuming AP or grenades',()=>{
  const a=app(),before=snapshot(a.u);a.el('grenade').click();assert.equal(a.el('grenade').disabled,true);
  a.drag(40,-40);const point={...a.view.preview.point};a.advance(10);
  assert.equal(a.el('grenade').disabled,true);assert.deepEqual(snapshot(a.u),before);
  a.el('joystick').fire('pointerup');a.advance(3);
  assert.deepEqual(a.view.preview.point,point);assert.equal(a.el('grenade').disabled,false);assert.deepEqual(snapshot(a.u),before);
  a.el('grenade').click();assert.equal(a.u.ammo.grenade,before.grenades-1);assert.equal(a.u.ap,before.ap-5);assert.equal(a.u.weapon,before.weapon);assert.equal(a.u.x,before.x);assert.equal(a.u.y,before.y);
  a.el('grenade').click();assert.equal(a.el('grenade').disabled,true);assert.equal(a.u.ammo.grenade,before.grenades-1);
});
test('cancellation, pointer loss, and Escape never throw or resume held movement',()=>{
  const a=app(),before=snapshot(a.u);a.el('grenade').click();a.drag(40,-40);a.el('joystick').fire('pointercancel');a.advance(3);
  assert.equal(a.view.aiming,true);assert.deepEqual(snapshot(a.u),before);
  a.key('Escape');a.advance(3);assert.equal(a.view.aiming,false);assert.deepEqual(snapshot(a.u),before);
  a.el('grenade').click();assert.equal(a.el('grenade').disabled,true);a.el('cancel-grenade').click();a.advance(3);assert.deepEqual(snapshot(a.u),before);
});
test('keyboard aim, blocked movement actions, and ground taps cannot move or end the turn',()=>{
  const a=app(),before=snapshot(a.u);a.key('g');a.key('w');a.key('d');a.advance(25);
  a.key('w','keyup');a.key('d','keyup');const point={...a.view.preview.point};
  a.view.options.onPick({x:10,y:25});a.key(' ');a.advance(3);
  assert.deepEqual(snapshot(a.u),before);assert.equal(a.s.phase,'explore');assert.deepEqual(a.view.preview.point,point);
  assert.equal(a.el('look').disabled,true);assert.equal(a.el('stance-cycle').disabled,true);assert.equal(a.el('movement-cycle').disabled,true);
  a.key('Enter');assert.equal(a.u.ammo.grenade,before.grenades-1);assert.equal(a.u.ap,before.ap-5);
});
test('invalid landing points disable Throw and Enter leaves resources untouched',()=>{
  const a=app(),before=snapshot(a.u);a.key('g');a.drag(-60,0);a.el('joystick').fire('pointerup');
  assert.equal(a.el('grenade').disabled,true);assert.match(a.el('grenade-warning').textContent,/point on the field/);
  a.key('Enter');assert.deepEqual(snapshot(a.u),before);
});
