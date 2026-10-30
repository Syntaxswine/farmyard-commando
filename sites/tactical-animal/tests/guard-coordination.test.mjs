import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,approachPath,freePoint,walkSegment,distance,tick,encodeSave,decodeSave} from '../dist/solo-game.js';
function doorway(){
  const base=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint');for(const o of base.interactables)if(o.id==='checkpoint-front-door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s),g=s.units[1],b=s.units[2];s.units=[u,g,b];
  Object.assign(u,{x:117,y:112,hp:10000,maxHp:10000});Object.assign(g,{x:88,y:120,heading:0,alert:true,lastKnown:{x:117,y:112}});Object.assign(b,{x:117,y:115.2,alert:false});Core.refresh(s,{forceFog:true});s.phase='player';s.engaged=true;return {s,g,b};
}
test('a friendly doorway blocker yields in its own turn, paying AP/stamina, and the waiter retries',()=>{
  const {s,g,b}=doorway();assert.equal(approachPath(s,g,g.lastKnown),null);const at={x:b.x,y:b.y},beforeStamina=b.stamina;Core.endTurn(s);
  let requested=false,yielded=false,requestAP,maxTick=0;
  for(let n=0;n<3000&&s.phase==='enemy';n++){
    const t=performance.now();tick(s,.05);maxTick=Math.max(maxTick,performance.now()-t);
    if(b.yieldRequest){requested=true;requestAP??=b.ap;assert.ok(freePoint(s,b.yieldRequest.point,b.id));assert.ok(walkSegment(s,b,b.yieldRequest.point,b.id));}
    if(requested&&!b.yieldRequest&&distance(b,at)>.1){yielded=true;assert.ok(b.ap<requestAP);}
    assert.ok(distance(g,b)>=.46-1e-6);
  }
  assert.ok(requested&&yielded);assert.ok(b.stamina<beforeStamina);assert.ok(distance(g,{x:88,y:120})>1,'waiter uses its remaining AP after the legal yield');
  assert.ok(!b.yieldRequest&&!g.yieldWait);assert.notEqual(s.phase,'enemy');assert.ok(maxTick<1000,`bounded request took ${maxTick} ms`);
});
test('a pending yield resumes with the same decisions, timing and resources',()=>{
  const {s,g,b}=doorway();Core.endTurn(s);for(let n=0;n<100&&!b.yieldRequest;n++)tick(s,.05);assert.ok(b.yieldRequest&&g.yieldWait);
  const saved=encodeSave(s),restored=decodeSave(saved);
  for(let n=0;n<400&&s.phase==='enemy';n++){tick(s,.05);tick(restored,.05);assert.equal(encodeSave(restored),encodeSave(s));}
  for(const mutate of [s=>s.units[2].yieldRequest.from=999,s=>s.units[2].yieldRequest.elapsed=-1,s=>s.units[1].yieldWait.for=0]){const bad=JSON.parse(saved);mutate(bad);assert.throws(()=>decodeSave(JSON.stringify(bad)),/coordination/);}
});
test('a physically sealed five-guard ring stays refused without remote yield requests',()=>{
  const s=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint'),g=s.units[1],ring=s.units.slice(2),centre={x:60.4,y:60.3};Object.assign(hero(s),{x:20,y:20});Object.assign(g,{...centre,alert:true,lastKnown:{x:70,y:66}});
  ring.forEach((u,i)=>{const a=i/ring.length*Math.PI*2;Object.assign(u,{x:centre.x+Math.cos(a)*.47,y:centre.y+Math.sin(a)*.47,alert:false});});
  assert.equal(approachPath(s,g,g.lastKnown),null);s.phase='player';Core.endTurn(s);
  for(let n=0;n<20;n++)tick(s,.05);assert.equal(distance(g,centre),0);assert.ok(!ring.some(u=>u.yieldRequest));
});

test('two-way doorway contention settles deterministically without reciprocal request cycles',()=>{
  function run(){const {s,g,b}=doorway();Object.assign(hero(s),{x:20,y:20});Object.assign(b,{alert:true,lastKnown:{x:88,y:120}});
    const initial=[{x:g.x,y:g.y},{x:b.x,y:b.y}];let requests=0;
    for(let round=0;round<3;round++){s.phase='player';s.engaged=true;Core.endTurn(s);let previous=false;
      for(let n=0;s.phase==='enemy'&&n<3000;n++){
        tick(s,.05);assert.ok(distance(g,b)>=.46-1e-6);
        const pending=!!b.yieldRequest;if(pending&&!previous)requests++;previous=pending;assert.ok(!g.yieldRequest,'lower ID wins contention');
      }
      assert.notEqual(s.phase,'enemy');
    }
    assert.ok(requests<=3);assert.ok(distance(g,initial[0])>1||distance(b,initial[1])>1);return encodeSave(s);
  }
  assert.equal(run(),run());
});
