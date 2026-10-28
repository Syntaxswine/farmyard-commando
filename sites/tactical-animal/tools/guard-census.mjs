// Seeded guard-approach census (docs/guard-approach.md). One alert guard, 2-9 m from
// an animal that stands 0.24-0.74 m from a walk-blocking box, plays four rounds;
// doors are open in 70% of cases. Run from the repository root:
//   node sites/tactical-animal/tools/guard-census.mjs <mission> <mode> <seed> <cases> [name=checkout ...]
// mode blocked: only cases whose 0.75 m-short spot is solid (main's freeze rule)
//      near:    no filter on that spot
//      props:   PR #21's census beside Short Measure's props, <cases> per prop
// With no checkout named, this one is censused; the first named checkout places
// the cases and runs the oracle. A case is FROZEN when the guard never fires and its
// alert lapses; STALLED when a turn ends with AP left, no shot, no step and no
// sight of the animal. The oracle walks the grid graph from the guard to the
// nearest node with a wall-clear line to the animal within weapon range.
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const [mission,mode,seedArg,casesArg,...named]=process.argv.slice(2);
if(!mission||!['blocked','near','props'].includes(mode)||!Number.isFinite(+seedArg)||!(+casesArg>0))throw Error('usage: guard-census.mjs <mission> <blocked|near|props> <seed> <cases> [name=checkout ...]');
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const trees=named.length?named.map(a=>a.split(/=(.*)/s).slice(0,2)):[['this',here]];
const M={};for(const [name,root] of trees)M[name]=await import(pathToFileURL(path.join(root,'sites/tactical-animal/dist/solo-game.js')).href);
const names=Object.keys(M),ref=M[names[0]];
const random=(seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;})(+seedArg);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function field(T,doors){const s=T.createSoloGame(T.DEFAULT_BUILD,1947,mission);if(doors)for(const o of s.interactables)if(o.kind==='door'){o.open=true;s.edges[o.edge]='door';}return {...s};}
function play(T,c){
  const s=field(T,c.doors),u=T.hero(s),g=s.units[1];for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{...c.heroAt,ap:20,hp:1e6,maxHp:1e6});Object.assign(g,{...c.guardAt,heading:c.heading,alert:true,lastKnown:{...c.heroAt},alertAge:0,hp:1e6});
  T.Core.refresh(s,{forceFog:true});
  let fired=0,stalls=0,reversals=0,last=null;const ticks=[],stepping=[];
  for(let round=0;round<4;round++){s.phase='player';s.engaged=true;let effect=s.effect;T.Core.endTurn(s);
    for(let f=0;s.phase==='enemy'&&f<3000;f++){
      const at={x:g.x,y:g.y},ap=g.ap,shot=s.effect,t0=performance.now();T.tick(s,.05);const ms=performance.now()-t0;ticks.push(ms);
      if(ap>.5&&g.ap===0&&s.effect===shot&&g.x===at.x&&g.y===at.y&&!T.canSee(s,g,u))stalls++;
      if(g.x!==at.x||g.y!==at.y){stepping.push(ms);const step={x:g.x-at.x,y:g.y-at.y};if(last&&step.x*last.x+step.y*last.y<-.5*Math.hypot(step.x,step.y)*Math.hypot(last.x,last.y))reversals++;last=step;}
      if(s.effect!==effect){effect=s.effect;if(s.effect?.sequence?.[0]?.shooter===g.id)fired++;}
    }}
  return {fired,stalls,reversals,alert:g.alert,ticks,stepping,end:[+g.x.toFixed(2),+g.y.toFixed(2)]};
}
function oracle(c){
  const s=field(ref,c.doors),u=ref.hero(s),g=s.units[1];for(const other of s.units.slice(2))other.hp=0;Object.assign(u,c.heroAt);Object.assign(g,c.guardAt);
  const range=Math.min(ref.Core.WEAPONS[g.weapon].range,26),key=p=>p.x+','+p.y,best=new Map(),open=[];
  const fires=p=>dist(p,u)<=range&&ref.lineClear(s,{...p,stance:'standing'},{...u,stance:'standing'});
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q={x:Math.round(g.x)+dx,y:Math.round(g.y)+dy};if(ref.freePoint(s,q,g.id)&&ref.walkSegment(s,g,q,g.id)){best.set(key(q),dist(g,q));open.push({p:q,d:dist(g,q)});}}
  for(let n=0;open.length&&n<20000;n++){open.sort((a,b)=>a.d-b.d);const {p,d}=open.shift();if(d>best.get(key(p)))continue;if(fires(p))return +d.toFixed(1);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q={x:p.x+dx,y:p.y+dy},nd=d+Math.hypot(dx,dy);if((dx||dy)&&nd<(best.get(key(q))??Infinity)&&ref.freePoint(s,q,g.id)&&ref.walkSegment(s,p,q,g.id)){best.set(key(q),nd);open.push({p:q,d:nd});}}}
  return null;
}
function place(b){
  const side=Math.floor(random()*4),gap=.24+random()*.5,along=random();
  const heroAt=side===0?{x:b.x0+(b.x1-b.x0)*along,y:b.y0-gap}:side===1?{x:b.x0+(b.x1-b.x0)*along,y:b.y1+gap}:side===2?{x:b.x0-gap,y:b.y0+(b.y1-b.y0)*along}:{x:b.x1+gap,y:b.y0+(b.y1-b.y0)*along};
  const angle=random()*Math.PI*2,radius=2+random()*7;
  return {heroAt,guardAt:{x:heroAt.x+Math.cos(angle)*radius,y:heroAt.y+Math.sin(angle)*radius},heading:random()*360,doors:random()<.7,radius,box:b.kind+(b.interactionId?':'+b.interactionId:b.placementId?':'+b.placementId:'')};
}
const aimOf=c=>({x:c.heroAt.x-(c.heroAt.x-c.guardAt.x)/c.radius*.75,y:c.heroAt.y-(c.heroAt.y-c.guardAt.y)/c.radius*.75});
const shut=field(ref,false),opened=field(ref,true),cases=[];
if(mode==='props'){
  // PR #21's filter, kept so its numbers reproduce: positions checked with the doors
  // shut, the spot within 0.23 m of that prop, a fixed number of tries per prop.
  for(const b of ref.geometry(shut).filter(b=>b.kind==='prop'))for(let k=0,taken=0;k<(+seedArg===9001?6000:4000)&&taken<+casesArg;k++){
    const c=place(b);if(!ref.freePoint(shut,c.heroAt,null,{units:false})||!ref.freePoint(shut,c.guardAt,null,{units:false}))continue;
    const a=aimOf(c);if(Math.hypot(Math.max(b.x0-a.x,0,a.x-b.x1),Math.max(b.y0-a.y,0,a.y-b.y1))>=.23)continue;taken++;cases.push(c);}
}else{
  const boxes=ref.geometry(shut).filter(b=>b.kind!=='part');
  for(let k=0;k<+casesArg*60&&cases.length<+casesArg;k++){
    const c=place(boxes[Math.floor(random()*boxes.length)]),probe=c.doors?opened:shut;   // an open leaf is solid
    if(!ref.freePoint(probe,c.heroAt,null,{units:false})||!ref.freePoint(probe,c.guardAt,null,{units:false}))continue;
    if(mode==='blocked'&&ref.freePoint(probe,aimOf(c),null,{units:false}))continue;cases.push(c);}
}
const sum=Object.fromEntries(names.map(n=>[n,{fired:0,frozen:0,stalled:0,stuck:0,reachable:0,jitter:0,ticks:[],stepping:[]}]));let onlyFirst=0,onlySecond=0,both=0;const shots=[0,0];
for(const c of cases){
  const out=Object.fromEntries(names.map(n=>[n,play(M[n],c)])),frozen=names.filter(n=>!out[n].fired&&!out[n].alert);
  for(const n of names){const S=sum[n],o=out[n];if(o.fired)S.fired++;if(o.reversals>3)S.jitter++;S.ticks.push(...o.ticks);S.stepping.push(...o.stepping);if(frozen.includes(n)){S.frozen++;if(o.stalls)S.stalled++;}}
  if(names.length>1){const [a,b]=names;if(out[a].fired&&!out[b].fired)onlyFirst++;if(!out[a].fired&&out[b].fired)onlySecond++;if(out[a].fired&&out[b].fired){both++;shots[0]+=out[a].fired;shots[1]+=out[b].fired;}}
  if(frozen.length){const L=oracle(c);for(const n of frozen){if(L!==null&&L<=10)sum[n].reachable++;if(L!==null&&out[n].stalls)sum[n].stuck++;}
    if(process.env.ROWS)console.log(JSON.stringify({box:c.box,heroAt:[c.heroAt.x,c.heroAt.y],guardAt:[c.guardAt.x,c.guardAt.y],heading:c.heading,doors:c.doors,frozen,oracle:L,ends:Object.fromEntries(names.map(n=>[n,out[n].end]))}));}
}
const q=(a,p)=>a.length?+Float64Array.from(a).sort()[Math.min(a.length-1,Math.floor(p*(a.length-1)))].toFixed(2):0;
console.log(`${mission} ${mode} seed ${seedArg}: ${cases.length} approaches`);
for(const n of names){const S=sum[n];console.log(`${n}: fired ${S.fired}, frozen ${S.frozen} (stalled ${S.stalled}, ${S.stuck} of them with a firing node reachable; firing node within a 10 m walk ${S.reachable}), turned back >3 times ${S.jitter} | tick ms p99 ${q(S.ticks,.99)} p999 ${q(S.ticks,.999)} max ${q(S.ticks,1)}, stepping p50 ${q(S.stepping,.5)} p99 ${q(S.stepping,.99)}`);}
if(names.length>1)console.log(`engaged only in ${names[0]} ${onlyFirst}, only in ${names[1]} ${onlySecond}; both in ${both}, shots ${shots[0]} / ${shots[1]}`);
