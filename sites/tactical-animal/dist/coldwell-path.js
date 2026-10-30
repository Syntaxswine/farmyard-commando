import {PathFrontier} from './path-frontier.js';
import {actorHeight,spatialDistance} from './spatial-provider.js';

const EPS=1e-5;
const point=p=>({x:p.x,y:p.y,h:p.h,floorId:p.floorId,...(p.stairId?{stairId:p.stairId}:{})});
const length=(from,route)=>{let total=0;for(const p of route){total+=spatialDistance(from,p);from=p;}return total;};
export const coldwellNavigationGeometry=state=>JSON.stringify([state.spatial.revision,(state.interactables||[]).filter(o=>o.kind==='chest').map(o=>[o.id,o.x,o.y,o.h,o.footprint])]);

// An authored stair is a coarse link, not hundreds of raster expansions. The
// same stable A* heap still searches walking links on an individual floor. Lazy
// link validation avoids searching distant, irrelevant floor connections.
export function coldwellPath(provider,state,actor,goals,{rate=1,nodeLimit=8192}={}){
  const ends=goals.map(p=>provider.resolve(state,p,actor)).filter(p=>p&&provider.occupancy(state,actor,p)&&Number.isFinite(provider.floorExtra[provider.floorIndex.get(actor.floorId)]?.[provider.floorIndex.get(p.floorId)]));
  if(!ends.length)return null;
  const nodes=[{...point(actor),id:'start'},...provider.anchors,...ends.map((p,i)=>({...p,id:'goal:'+i}))],edges=new Map();
  provider.coarseLinkCache??=new WeakMap();let cached=provider.coarseLinkCache.get(state.spatial);
  const cacheKey=coldwellNavigationGeometry(state)+':'+actor.stance;
  if(cached?.key!==cacheKey){cached={key:cacheKey,links:new Map()};provider.coarseLinkCache.set(state.spatial,cached);}
  let expanded=0,validated=0;
  const stairOf=p=>p.stair||provider.stairById.get(p.stairId);
  for(const a of nodes)for(const b of nodes){
    if(a===b||a.id.startsWith('goal:')||b.id==='start')continue;
    const stair=stairOf(a),shared=stair&&stair===stairOf(b);
    if(!shared&&(a.stairId||b.stairId||a.floorId!==b.floorId))continue;
    const route=shared?provider.stairPart(stair,a,b):null;
    edges.set(a.id+'>'+b.id,{from:a,to:b,stair:shared?stair:null,route:null,weight:route?length(a,route):spatialDistance(a,b),authored:route});
  }
  const neighbours=new Map(nodes.map(p=>[p.id,[]]));for(const edge of edges.values())neighbours.get(edge.from.id).push(edge);
  const search=()=>{
    const open=new PathFrontier(),cost=new Map([['start',0]]),parents=new Map();
    const estimate=p=>Math.min(...ends.map(end=>spatialDistance(p,end)));
    open.push({...nodes[0],g:0,f:estimate(nodes[0])});
    while(open.items.length){
      const p=open.pop();if(p.g>(cost.get(p.id)??Infinity))continue;expanded++;
      if(p.id.startsWith('goal:')){const route=[];let id=p.id;while(id!=='start'){const edge=parents.get(id);route.unshift(edge);id=edge.from.id;}return route;}
      for(const edge of neighbours.get(p.id)){
        if(!Number.isFinite(edge.weight))continue;
        const g=p.g+edge.weight;if(g>=(cost.get(edge.to.id)??Infinity)-EPS)continue;
        cost.set(edge.to.id,g);parents.set(edge.to.id,edge);open.push({...edge.to,g,f:g+estimate(edge.to)});
      }
    }
    return null;
  };
  const liveNear=(a,b)=>(state.units||[]).some(u=>u.hp>0&&u.id!==actor.id&&u.x>=Math.min(a.x,b.x)-.46&&u.x<=Math.max(a.x,b.x)+.46&&u.y>=Math.min(a.y,b.y)-.46&&u.y<=Math.max(a.y,b.y)+.46&&u.h+actorHeight(u)>Math.min(a.h,b.h)&&u.h<Math.max(a.h,b.h)+actorHeight(actor));
  for(let candidate;candidate=search();){
    const edge=candidate.find(e=>e.route===null);
    if(!edge){
      const result=[];let from=actor;
      for(const p of candidate.flatMap(e=>e.route))if(spatialDistance(from,p)>EPS){result.push({...point(p),cost:spatialDistance(from,p)*rate});from=p;}
      provider.lastSearch={expanded,validated,found:true,nodeLimit,coarse:true};return result;
    }
    validated++;
    if(edge.stair){
      let from=edge.from;const certified=provider.stairClear(state,actor,edge.stair);
      const clear=edge.authored.every(p=>{const ok=certified&&!liveNear(from,p)||provider.sweep(state,actor,from,p).ok;from=p;return ok;});
      edge.route=clear?edge.authored:[];edge.weight=clear?length(edge.from,edge.route):Infinity;
    }else{
      const key=JSON.stringify([point(edge.from),point(edge.to),nodeLimit]);
      if(!cached.links.has(key)){
        if(cached.links.size>=512)cached.links.clear();
        cached.links.set(key,spatialDistance(edge.from,edge.to)<EPS?[]:provider.gridPath({...state,units:[]},{...actor,...point(edge.from),stairId:edge.from.stairId},edge.to,{rate:1,nodeLimit,goals:[edge.to],localOnly:true}));
      }
      edge.route=cached.links.get(key);
      let from=edge.from;
      if(edge.route?.some(p=>{const near=liveNear(from,p);from=p;return near;}))edge.route=provider.gridPath(state,{...actor,...point(edge.from),stairId:edge.from.stairId},edge.to,{rate:1,nodeLimit,goals:[edge.to],localOnly:true});
      edge.weight=edge.route?length(edge.from,edge.route):Infinity;edge.route??=[];
    }
  }
  provider.lastSearch={expanded,validated,found:false,nodeLimit,coarse:true};return null;
}
