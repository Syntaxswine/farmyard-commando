import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,navigationPath,walkSegment,distance,freePoint,encodeSave,decodeSave,tick} from '../dist/solo-game.js';
const from={x:8.367,y:22.905};
function field(){
  const base=createSoloGame(DEFAULT_BUILD,1947,'short-measure');
  for(const o of base.interactables)if(o.kind==='door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s);for(const g of s.units.slice(1))g.hp=0;
  Object.assign(u,{...from,ap:1000});s.phase='player';s.engaged=true;return {s,u};
}
test('player escapes a narrow strip to the exact clicked endpoint through costed legal segments',()=>{
  for(const end of [{x:2.074,y:18.537},{x:4.5,y:23.6},{x:15,y:25},{x:13,y:23.2}]){
    const {s,u}=field(),route=navigationPath(s,u,end.x,end.y);assert.ok(route?.length);assert.deepEqual({x:route.at(-1).x,y:route.at(-1).y},end);
    let total=0,at=u;
    for(const p of route){assert.ok(freePoint(s,p,u.id)&&walkSegment(s,at,p,u.id));total+=distance(at,p);assert.ok(Math.abs(p.cost-distance(at,p)*Core.movementRate(u))<1e-8);at=p;}
    const ap=u.ap;for(const p of route){s.phase='player';assert.ok(Core.travel(s,u,p.x-u.x,p.y-u.y)>0);assert.ok(distance(u,p)<1e-7);}
    assert.ok(Math.abs(ap-u.ap-total*Core.movementRate(u))<1e-7);assert.ok(distance(u,end)<1e-7);
  }
});
test('strip route survives a mid-move save and a live body can still interrupt it',()=>{
  const {s,u}=field(),end={x:2.074,y:18.537};s.units=s.units.slice(0,2);s.units[1].hp=100;Object.assign(s.units[1],{x:33,y:28});
  assert.ok(Core.move(s,u,end.x,end.y));for(let n=0;n<4;n++)tick(s,.05);
  const restored=decodeSave(encodeSave(s));
  for(let n=0;n<30;n++){tick(s,.05);tick(restored,.05);assert.deepEqual(restored,s);}
  Core.stop(s);assert.deepEqual(s.queue,[]);
});
test('a body entering a previously planned strip route interrupts movement without overlap',()=>{
  const {s,u}=field(),destination={x:13,y:23.2};s.units[1].hp=100;Object.assign(s.units[1],{x:33,y:28});
  assert.ok(Core.move(s,u,destination.x,destination.y));Object.assign(s.units[1],destination);
  for(let n=0;n<100;n++)tick(s,.05);assert.ok(distance(u,s.units[1])>=.46-1e-6);assert.equal(s.queue.length,0);
});
