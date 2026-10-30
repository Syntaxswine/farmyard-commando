import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,confirmedImpact,guardFireZone,tick} from '../dist/solo-game.js';

function field(kind='desk',stance='standing',guard=false){
  const base=createSoloGame(DEFAULT_BUILD,1947,kind==='desk'?'short-measure':'night-ledger');
  const s={...base,...(kind==='crate'?{obstacles:[{x0:4.88,x1:5.12,y0:2,y1:4,height:.92,kind:'crate'}]}:{})},u=hero(s),g=s.units[1];s.units=[u,g];
  Object.assign(u,{x:kind==='desk'?29.4:2,y:kind==='desk'?6.1:3,stance,ap:100,hp:10000,maxHp:10000});
  Object.assign(g,{x:kind==='desk'?34.6:8,y:u.y,stance:'kneeling',weapon:'rifle',hp:10000,maxHp:10000,ap:100,heading:180});g.ammo.rifle=5;g.ammoPouch.rifle=15;
  if(guard){const from={x:u.x,y:u.y,stance:u.stance},to={x:g.x,y:g.y,stance:g.stance};Object.assign(u,to);Object.assign(g,from,{heading:0,alert:true,lastKnown:{x:u.x,y:u.y},alertAge:0});}
  s.phase='player';s.engaged=true;s.seed=0;Core.refresh(s,{forceFog:true});return {s,u,g};
}

test('selected-zone preview uses the same first impact as the shot, above and below partial cover',()=>{
  for(const kind of ['desk','crate'])for(const stance of ['standing','kneeling']){
    const {s,u,g}=field(kind,stance);assert.equal(Core.canSee(s,u,g),true,'partial props still allow perception');
    for(const zone of ['torso','head','legs','weapon']){
      const impact=confirmedImpact(s,u,g,zone),p=Core.previewAttack(s,u,g,false,zone),clear=impact?.unit?.id===g.id;
      assert.equal(p.exposed,clear,`${kind}/${stance}/${zone}`);assert.equal(p.ok,clear);
      if(clear)assert.ok(p.chance>0);else{assert.equal(p.chance,0);assert.match(p.reason,/blocked/);}
    }
    if(stance==='standing'){
      const before={ammo:u.ammo.assault,ap:u.ap,seed:s.seed,hp:g.hp};
      for(let i=0;i<200;i++)assert.equal(Core.attack(s,u,g),false);
      assert.deepEqual({ammo:u.ammo.assault,ap:u.ap,seed:s.seed,hp:g.hp},before,'a blocked body location spends nothing');
    }
  }
});

test('guards choose an exposed body location instead of repeatedly shooting the shipping desk',()=>{
  const {s,u,g}=field('desk','standing',true);
  assert.equal(Core.previewAttack(s,g,u).chance,0);assert.equal(guardFireZone(s,g,u),'head');
  let effect=s.effect,shots=0;
  for(let round=0;round<4;round++){s.phase='player';Core.endTurn(s);
    for(let f=0;s.phase==='enemy'&&f<2000;f++){tick(s,.05);if(s.effect!==effect){effect=s.effect;for(const e of effect?.sequence||[])if(e.shooter===g.id){shots++;assert.equal(e.zone,'head');}}}}
  assert.ok(shots>0);
  // Seed 0's first four 11% head rolls miss. A normally accepted roll must hit
  // the body, rather than reproducing the desk interception behind a high %.
  s.seed=2048;s.phase='enemy';g.ap=100;g.ammo.rifle=5;
  assert.ok(Core.attack(s,g,u,false,true,'head'));assert.ok(u.hp<10000);
});

test('intervening bodies block the selected target and full cover supplies no firing zone',()=>{
  const base=field('crate'),s={...base.s,obstacles:[]},u=base.u,g=base.g;
  const blocker={...structuredClone(g),id:55,name:'Friendly blocker',team:'squad',x:5,y:3,stance:'standing'};s.units.push(blocker);
  const p=Core.previewAttack(s,u,g);assert.equal(p.ok,false);assert.equal(p.chance,0);assert.match(p.reason,/Friendly blocker/);
  const sealed={...s,obstacles:[{x0:4.8,x1:5.2,y0:2,y1:4,height:3,kind:'wall'}]};assert.equal(guardFireZone(sealed,g,u),null);
});

test('glass preview discloses the first-round interception while burst rounds still use their aim roll',()=>{
  const s=structuredClone(createSoloGame(DEFAULT_BUILD,1,'window-yard')),u=hero(s);s.units=[u];s.phase='player';s.engaged=true;
  Object.assign(u,{x:20,y:25,ap:99,stats:{...u.stats,firearms:100}});
  const g={...structuredClone(u),id:9,team:'guard',name:'Window target',x:20,y:19,hp:999,maxHp:999,weapon:'pistol'};s.units.push(g);s.detected.add(g.id);
  const p=Core.previewAttack(s,u,g,true);assert.equal(p.ok,true);assert.equal(p.exposed,false);assert.equal(p.breach,true);assert.equal(p.chance,0);assert.match(p.warning,/later burst/);
  s.seed=1;assert.ok(Core.attack(s,u,g,true));assert.ok(s.effect.sequence[0].glass);assert.ok(s.effect.sequence.slice(1).some(e=>e.impact?.unitId===g.id));
  assert.ok(Core.previewAttack(s,u,g).chance>0);
});
