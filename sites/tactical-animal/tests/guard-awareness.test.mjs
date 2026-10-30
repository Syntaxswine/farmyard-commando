import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,guardState,distance,tick,encodeSave,decodeSave} from '../dist/solo-game.js';
function field(){const s=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint'),u=hero(s),g=s.units[1];s.units=[u,g];Object.assign(u,{x:20,y:20,hp:10000,maxHp:10000});Object.assign(g,{alert:true,lastKnown:{x:94,y:120},alertAge:0});Core.refresh(s);return {s,u,g};}
function turn(s){s.phase='player';s.engaged=true;assert.ok(Core.endTurn(s));for(let n=0;s.phase==='enemy'&&n<3000;n++)tick(s,.05);assert.notEqual(s.phase,'enemy');}
test('three unseen rounds produce a bounded local search then return to the authored post',()=>{
  const {s,g}=field(),post={...g.post};turn(s);turn(s);assert.equal(guardState(g),'alert');
  s.phase='player';Core.endTurn(s);assert.equal(guardState(g),'searching');const cells=structuredClone(g.search.cells);assert.ok(cells.length>1&&cells.length<=5);assert.deepEqual(cells[0],{x:94,y:120});
  let moved=false;for(let n=0;n<2000&&guardState(g)!=='rest';n++){const before={x:g.x,y:g.y};tick(s,.05);moved||=distance(before,g)>.01;}
  assert.equal(guardState(g),'rest');assert.equal(s.phase,'explore');assert.ok(moved);assert.ok(distance(g,post)<.08);assert.equal(g.heading,post.heading);assert.equal(g.lastKnown,null);
});
test('exploration advances unseen alerts and a mid-search save preserves decisions and timing',()=>{
  const {s,g}=field();s.phase='explore';for(let n=0;n<190;n++)tick(s,.05);assert.equal(guardState(g),'searching');
  const save=encodeSave(s),restored=decodeSave(save);
  for(let n=0;n<500;n++){tick(s,.05);tick(restored,.05);assert.equal(encodeSave(restored),encodeSave(s));}
  for(const mutate of [s=>s.units[1].search.index=99,s=>s.units[1].search.cells[0].x=-100,s=>s.units[1].search.elapsed=-1]){const bad=JSON.parse(save);mutate(bad);assert.throws(()=>decodeSave(JSON.stringify(bad)),/search/);}
});
test('search uses the observed fix, never an unseen live hero, and direct sight interrupts it',()=>{
  const a=field(),b=field();Object.assign(b.u,{x:35,y:25});a.s.phase=b.s.phase='explore';
  for(let n=0;n<260;n++){tick(a.s,.05);tick(b.s,.05);assert.deepEqual(a.g,b.g);}
  assert.equal(guardState(a.g),'searching');Object.assign(a.u,{x:a.g.x+1,y:a.g.y});Core.refresh(a.s);
  assert.equal(guardState(a.g),'alert');assert.deepEqual(a.g.lastKnown,{x:a.u.x,y:a.u.y});assert.equal(a.g.search,undefined);assert.equal(a.g.guardRoute,undefined);
});
test('a blocked return settles reactively instead of holding the encounter forever',()=>{
  const {s,g}=field();g.alert=false;g.state='standdown';g.returning={elapsed:0,blocked:0,wait:0};g.post={x:117,y:112,heading:0};s.phase='explore';
  for(let n=0;n<500&&guardState(g)!=='rest';n++)tick(s,.05);assert.equal(guardState(g),'rest');assert.equal(s.phase,'explore');assert.ok(distance(g,g.post)>.08);
});
