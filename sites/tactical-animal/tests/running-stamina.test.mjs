import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,createSoloGame,hero,travel,tick,refresh,distance,encodeSave,decodeSave} from '../dist/solo-game.js';
import {app} from './app-harness.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function field(combat=false){
  const state=createSoloGame(),unit=hero(state);unit.x=4;unit.y=25;
  for(const guard of state.units.slice(1)){guard.x=36;guard.y=27;guard.alert=false;if(!combat)guard.hp=0;}
  if(combat){state.engaged=true;state.phase='player';}refresh(state);unit.ap=12;
  return {state,unit};
}

test('exhausted running falls back to walking while held input keeps moving at walking speed and AP cost',()=>{
  for(const stance of ['standing','kneeling']){
    const {state,unit}=field(true);unit.stance=stance;Core.setMovementMode(state,unit,'run');unit.stamina=.4;
    tick(state,.05,{x:1,y:0});close(unit.x,4.1);close(unit.stamina,0);assert.equal(Core.movementModeOf(unit),'walk');assert.equal(unit.stance,stance);
    const before={x:unit.x,ap:unit.ap,apDistance:state.solo.apDistance},step=Core.movementSpeed(unit)*.05;
    tick(state,.05,{x:1,y:0});close(unit.x-before.x,step);close(before.ap-unit.ap,step*Core.movementRate(unit));close(state.solo.apDistance-before.apDistance,step*Core.movementRate(unit));
    assert.equal(unit.isMoving,true);assert.equal(unit.stamina,0);
  }
});

test('an already exhausted runner walks on the first frame without a running-speed or AP discount',()=>{
  for(const stamina of [0,2e-7,4e-7]){
    const {state,unit}=field(true);unit.running=true;unit.stamina=stamina;
    tick(state,.05,{x:1,y:0});close(unit.x,4.18);close(unit.ap,12-.36);assert.equal(unit.running,false);assert.equal(unit.isMoving,true);
  }
});

test('a planned route survives exhaustion and reaches its destination without renewed input',()=>{
  const {state,unit}=field();Core.setMovementMode(state,unit,'run');unit.stamina=.08;
  assert.equal(Core.move(state,unit,6,25),true);tick(state,.05);assert.ok(state.queue.length);assert.equal(unit.running,false);
  for(let i=0;i<30&&state.queue.length;i++)tick(state,.05);
  assert.ok(distance(unit,{x:6,y:25})<.025);assert.equal(state.queue.length,0);assert.equal(Core.movementModeOf(unit),'walk');
});

test('walking fallback still stops at the AP budget and cannot pass through walls',()=>{
  const {state,unit}=field(true);unit.running=true;unit.stamina=0;unit.ap=.31;
  close(travel(state,unit,1,0),.155);close(unit.x,4.155);close(unit.ap,0);assert.equal(travel(state,unit,1,0),0);
  unit.x=20.18;unit.y=10;unit.ap=5;unit.running=true;const before={x:unit.x,y:unit.y,ap:unit.ap,stamina:unit.stamina};
  assert.equal(travel(state,unit,1,0),0);assert.deepEqual({x:unit.x,y:unit.y,ap:unit.ap,stamina:unit.stamina},before);assert.equal(unit.running,false);
});

test('fallback persists through saving and stamina recovery until the player chooses to run again',()=>{
  const {state,unit}=field();unit.running=true;unit.stamina=.4;tick(state,.05,{x:1,y:0});
  const restored=decodeSave(encodeSave(state)),animal=hero(restored);assert.equal(animal.running,false);
  assert.equal(Core.setMovementMode(restored,animal,'run'),true);assert.equal(Core.movementModeOf(animal),'walk');
  tick(restored,.05);assert.ok(animal.stamina>0);assert.equal(Core.movementModeOf(animal),'walk');
  assert.equal(Core.setMovementMode(restored,animal,'run'),true);assert.equal(Core.movementModeOf(animal),'run');
});

test('joystick input continues after exhaustion and the real movement control shows Off / walk',()=>{
  const a=app();a.el('movement-cycle').click();assert.equal(a.u.running,true);a.u.stamina=.2;
  a.drag(-40,0);a.advance(4);assert.equal(Core.movementModeOf(a.u),'walk');assert.equal(a.el('movement-label').textContent,'OFF');
  const before={x:a.u.x,y:a.u.y};a.advance(4);assert.ok(distance(before,a.u)>.5);assert.equal(a.u.isMoving,true);
  a.el('joystick').fire('pointerup');a.advance(2);assert.equal(a.u.isMoving,false);assert.equal(a.u.running,false);
});

test('keyboard input and tap-to-move routes also keep moving after running stamina is spent',()=>{
  const keyboard=app();keyboard.u.running=true;keyboard.u.stamina=0;keyboard.key('s');const start={x:keyboard.u.x,y:keyboard.u.y};
  keyboard.advance(5);keyboard.key('s','keyup');assert.ok(distance(start,keyboard.u)>.7);assert.equal(keyboard.el('movement-label').textContent,'OFF');
  const route=app();route.el('movement-cycle').click();route.u.stamina=.2;route.view.options.onPick({x:3,y:25});route.advance(20);
  assert.ok(distance(route.u,{x:3,y:25})<.025);assert.equal(route.s.queue.length,0);assert.equal(route.u.running,false);assert.equal(route.el('movement-label').textContent,'OFF');
});
