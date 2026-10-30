import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,guardState,reportNoise,encodeSave,decodeSave} from '../dist/solo-game.js';
function field(){const s=createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1947,'road-checkpoint'),u=hero(s),a=s.units[1],b=s.units[2],c=s.units[3];s.units=[u,a,b,c];Object.assign(u,{x:20,y:20,hp:10000,maxHp:10000});Object.assign(a,{x:88,y:120});Object.assign(b,{x:117,y:112});Object.assign(c,{x:141,y:110});Core.refresh(s);return {s,u,a,b,c};}
const report=(at=0,round=0)=>({point:{x:90,y:120},targetId:0,observerId:1,observedAt:at,observedRound:round,via:1});
test('a friendly shooter relays the actual hostile fix, never its own position',()=>{
  const {s,u,a,b}=field();Object.assign(u,{x:90,y:120});Core.refresh(s);assert.equal(Core.canSee(s,b,u),false);s.phase='enemy';a.ap=100;
  assert.ok(Core.attack(s,a,u,false,true));assert.deepEqual(b.lastKnown,{x:90,y:120});assert.notDeepEqual(b.lastKnown,{x:a.x,y:a.y});assert.equal(b.contact.observerId,a.id);assert.equal(guardState(b),'alert');assert.deepEqual(a.lastKnown,{x:u.x,y:u.y});
});
test('relay chains preserve observation age/provenance and cannot refresh a stale fix',()=>{
  const {s,a,b,c}=field();a.contact=report();a.lastKnown={...a.contact.point};s.round=1;s.elapsed=4;
  reportNoise(s,a,50);assert.equal(b.alertAge,1);assert.equal(b.contact.observedAt,0);assert.equal(b.contact.observedRound,0);
  reportNoise(s,b,50);assert.equal(c.contact.observerId,1);assert.equal(c.contact.via,2);assert.equal(c.contact.observedAt,0);assert.equal(c.alertAge,1);
  const old=structuredClone(c.contact);s.elapsed=10;reportNoise(s,b,50);
  assert.deepEqual(c.contact,old);assert.equal(guardState(c),'suspicious');assert.deepEqual(c.search.cells[0],{x:b.x,y:b.y});assert.equal(c.lastKnown,null);
});
test('a listener keeps a newer firsthand observation and saved reports retain their timestamps',()=>{
  const {s,a,b}=field();s.round=2;s.elapsed=8;a.contact=report(4,1);b.contact={...report(7,2),observerId:b.id,via:b.id,point:{x:110,y:110}};b.lastKnown={...b.contact.point};b.alert=true;b.state='alert';const before=structuredClone(b.contact);
  reportNoise(s,a,100);assert.deepEqual(b.contact,before);assert.deepEqual(b.lastKnown,{x:110,y:110});
  const saved=encodeSave(s),resumed=decodeSave(saved);assert.deepEqual(resumed.units[2].contact,before);
  for(const mutate of [s=>s.units[2].contact.observedAt=100,s=>s.units[2].contact.observerId=-1,s=>s.units[2].contact.point.x=-5]){const bad=JSON.parse(saved);mutate(bad);assert.throws(()=>decodeSave(JSON.stringify(bad)),/contact/);}
});
test('no-fix friendly, player and unknown sounds supply only an audible source point within the old radius',()=>{
  for(const kind of ['guard','squad','unknown']){const {s,u,a,b,c}=field(),source=kind==='guard'?a:kind==='squad'?u:{id:999,team:'unknown',x:88,y:120};if(kind==='squad')Object.assign(u,{x:88,y:120});
    reportNoise(s,source,32);assert.equal(guardState(b),'suspicious');assert.deepEqual(b.search.cells[0],{x:source.x,y:source.y});assert.equal(b.contact,undefined);assert.equal(c.lastHeard,undefined);assert.equal(b.lastKnown,null);
  }
});
test('real player firearm, directional flame and grenade hooks use sound investigation behind an opaque wall',()=>{
  for(const kind of ['firearm','flame','grenade']){const {s,u,a,b}=field();s.units=[u,b];Object.assign(u,{x:117,y:117,ap:100});Core.refresh(s);assert.equal(Core.canSee(s,b,u),false);s.phase='player';s.engaged=true;
    if(kind==='firearm'){const p={ground:true,x:120,y:117,h:1.1};s.seen.add(Core.key(p.x,p.y));assert.ok(Core.attack(s,u,p));}
    if(kind==='flame'){u.weapon='flamethrower';u.ammo.flamethrower=5;assert.ok(Core.fireFlame(s,u,90));}
    if(kind==='grenade'){const p={x:120,y:120};s.seen.add(Core.key(p.x,p.y));assert.ok(Core.throwGrenade(s,u,p));}
    assert.equal(guardState(b),'suspicious',kind);assert.deepEqual(b.search.cells[0],{x:u.x,y:u.y});assert.equal(b.contact,undefined);
  }
});
