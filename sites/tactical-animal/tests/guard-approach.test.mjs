import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,distance,canSee,tick,encodeSave,decodeSave,navigationPath,QUARRY_REACH} from '../dist/solo-game.js';

// One alert guard closing on an animal that stays put (cases come from the seeded
// approach censuses in docs/guard-approach.md); every other guard is down.
function field(mission,heroAt,guardAt,{doors=false,heading,lastKnown=heroAt}={}){
  const base=createSoloGame(DEFAULT_BUILD,1947,mission);
  if(doors)for(const o of base.interactables)if(o.kind==='door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s),g=s.units[1];   // a fresh object: the opened doors rebuild geometry
  for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{...heroAt,ap:20,hp:10000,maxHp:10000});Object.assign(g,{...guardAt,alert:true,lastKnown:{...lastKnown},alertAge:0,...(heading===undefined?{}:{heading})});
  s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  return s;
}
// Plays rounds and returns the rounds in which the guard opened fire (each shot
// leaves a new effect naming its shooter) and how often its step turned back.
function approach(mission,heroAt,guardAt,{rounds=3,...options}={}){
  const s=field(mission,heroAt,guardAt,options),u=hero(s),g=s.units[1];
  let firing=0,reversals=0,last=null,saw=false;
  for(let round=0;round<rounds;round++){
    s.phase='player';s.engaged=true;let fired=false,effect=s.effect;Core.endTurn(s);
    for(let frame=0;s.phase==='enemy'&&frame<2000;frame++){
      const at={x:g.x,y:g.y};tick(s,.05);saw||=canSee(s,g,u);
      if(g.x!==at.x||g.y!==at.y){const step={x:g.x-at.x,y:g.y-at.y};if(last&&step.x*last.x+step.y*last.y<-.5*Math.hypot(step.x,step.y)*Math.hypot(last.x,last.y))reversals++;last=step;}
      if(s.effect!==effect){effect=s.effect;fired||=s.effect?.sequence?.[0]?.shooter===g.id;}
    }
    if(fired)firing++;
  }
  return {s,g,u,firing,reversals,saw};
}
const engages=(mission,cases,rounds=2)=>{for(const [heroAt,guardAt,heading,doors] of cases){
  const {g,firing}=approach(mission,heroAt,guardAt,{heading,doors,rounds});
  assert.ok(firing>=1,`${mission} ${JSON.stringify(heroAt)}: the guard never fired, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
  assert.equal(g.alert,true);
}};

test('a guard goes round a crate to the animal beside it instead of freezing',()=>{
  // Each 0.75 m spot lies inside the crate; the old approach froze with no route.
  engages('night-ledger',[[{x:22.788,y:15.948},{x:19.283,y:13.6},296.3,false],[{x:14.66,y:18.022},{x:13.509,y:22.114},197.7,true]]);
});

test('a guard reaches an animal against a wall, whichever side of it the 0.75 m spot falls',()=>{
  // Night Ledger: the spot is inside the wall. Short Measure's packing hall: the spot
  // lies on the guard's side of the north wall, where the old approach walked 4.4 m
  // to stand 0.75 m from the animal, blind, until its alert lapsed.
  engages('night-ledger',[[{x:35.576,y:.975},{x:36.733,y:5.187},97,true]]);
  engages('short-measure',[[{x:19.494,y:7.176},{x:20.56,y:12.21},274.2,true]]);
});

test('Road Checkpoint guards do the same across a large sector',()=>{
  engages('road-checkpoint',[[{x:98.43,y:125.953},{x:96.317,y:120.088},248.1,true],[{x:118.839,y:115.831},{x:116.825,y:115.188},278,true]]);
});

test('the plan holds when the 0.75 m spot sits on a clearance edge',()=>{
  // Beside the ration scale the spot flips between free and solid with each 18 cm
  // step. Two plans keyed on it (walk to the spot, or around to the far side) sent
  // the guard back and forth on the spot; one goal set around the animal does not.
  const {g,firing,reversals}=approach('short-measure',{x:6.863,y:20.154},{x:8.732,y:15.13},{heading:236.1,doors:true});
  assert.equal(reversals,0,`the guard turned back ${reversals} times`);
  assert.ok(firing>=1,`the guard never fired, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
});

test('a goal keeps its view of the animal wherever the guard stops beside it',()=>{
  // Node (34,12) sees the animal past a wall end by a hair; a guard stopping 6 cm
  // off it, inside the 8 cm at which it counts as arrived, could not, and froze
  // there. Goals are judged with walls grown by those 8 cm.
  const {g,firing}=approach('short-measure',{x:32.146,y:11.501},{x:36.717,y:10.464},{heading:122.4,doors:true});
  assert.ok(firing>=1,`the guard never fired, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
});

test('a straight walk still stops exactly 0.75 m short of where the animal was seen',()=>{
  // Open ground, the animal long gone: the guard walks straight to the 0.75 m spot on
  // its own line, as before, rather than to a grid node's line.
  const lastKnown={x:9.42,y:8.227},guardAt={x:5.668,y:6.159},d=distance(guardAt,lastKnown);
  const aim={x:lastKnown.x-(lastKnown.x-guardAt.x)/d*.75,y:lastKnown.y-(lastKnown.y-guardAt.y)/d*.75};
  const {g,saw}=approach('night-ledger',{x:5,y:24},guardAt,{lastKnown,heading:0,rounds:2});
  assert.equal(saw,false);
  assert.ok(distance(g,aim)<.08,`the guard stopped ${distance(g,aim).toFixed(3)} m from the 0.75 m spot`);
});

test('a routed approach still ends 0.75 m short of where the animal was seen',()=>{
  // No straight walk at first: the search takes the guard to a node within
  // QUARRY_REACH that sees the spot, and from there it walks straight to 0.75 m short.
  const lastKnown={x:23.324,y:23.319};
  const {g,saw}=approach('night-ledger',{x:5,y:24},{x:19.933,y:18.749},{lastKnown,heading:0,rounds:3});
  assert.equal(saw,false);
  assert.ok(distance(g,lastKnown)<=.75+.08,`the guard stopped ${distance(g,lastKnown).toFixed(2)} m away (reach ${QUARRY_REACH} m)`);
});

test('an animal shut behind closed doors costs one bounded search, not the whole sector',()=>{
  // The quarry's goals sit in a small pocket. After 256 nodes the search floods back
  // from them, finds the pocket sealed and stops; the full search read the unit
  // list 18,010 times (each freePoint and walkSegment reads it once).
  const s=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint'),u=hero(s),g=s.units[1];
  for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{x:114.921,y:109.319,ap:20,hp:10000,maxHp:10000});Object.assign(g,{x:113.354,y:101.868,alert:true,lastKnown:{x:114.921,y:109.319},alertAge:0});
  s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  const units=s.units;let reads=0;Object.defineProperty(s,'units',{get(){reads++;return units;}});
  Core.endTurn(s);reads=0;for(let frame=0;s.phase==='enemy'&&frame<2000;frame++)tick(s,.05);
  assert.equal(distance(g,{x:113.354,y:101.868}),0,'no route exists, so the guard stays put');
  assert.ok(reads<3000,`the guard's turn read the unit list ${reads} times`);
});

test('a door opening between searches reopens the route at once',()=>{
  // Searches share one scenery table per geometry. Opening the warehouse door
  // rebuilds the geometry, so the very next search must route through the doorway
  // (no straight walk exists either way: the line runs into the wall beside it).
  const s=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),u=hero(s),cost=path=>path.reduce((total,p)=>total+p.cost,0);
  Object.assign(u,{x:6,y:15});const around=navigationPath(s,u,9,18);
  assert.ok(cost(around)>30,`with the door shut the route goes round (${cost(around)} AP)`);
  Object.assign(u,{x:7,y:18});assert.ok(Core.performInteraction(s,'warehouse-door','open').ok);
  Object.assign(u,{x:6,y:15});const through=navigationPath(s,u,9,18);
  assert.ok(through.length>1&&cost(through)<12,`with the door open the route costs ${cost(through)} AP`);
});

test('a save taken mid-approach resumes on exactly the same route',()=>{
  // Nothing about the approach is held between ticks: saved and reloaded at any
  // tick of its turn, a guard walks on exactly as the one never saved.
  const cases=[['short-measure',{x:19.494,y:7.176},{x:20.56,y:12.21},{heading:274.2,doors:true}],['night-ledger',{x:22.788,y:15.948},{x:19.283,y:13.6},{heading:296.3}],['night-ledger',{x:5,y:24},{x:19.933,y:18.749},{heading:0,lastKnown:{x:23.324,y:23.319}}]];
  const walk=(s,ticks)=>{const g=s.units[1],trail=[];for(let i=0;i<ticks;i++){if(s.phase!=='enemy'){s.phase='player';s.engaged=true;Core.endTurn(s);}tick(s,.05);trail.push([g.x,g.y]);}return trail;};
  for(const [mission,heroAt,guardAt,options] of cases)for(const at of [10,16,24]){
    const s=field(mission,heroAt,guardAt,options);Core.endTurn(s);walk(s,at);
    assert.ok(distance(s.units[1],guardAt)>.1,`${mission} tick ${at}: the save is taken mid-walk`);
    const resumed=decodeSave(encodeSave(s));
    assert.deepEqual(walk(resumed,60),walk(s,60),`${mission}: resumed at tick ${at}`);
  }
});
