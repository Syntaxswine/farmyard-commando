// One deterministic request per guard per round. Yielding is a normal action in
// the blocker's own turn; the waiting guard can use only its unspent AP on retry.
export function createGuardCoordination({alive,distance,point,approach,free,walk,travel,speed,shadow}){
  function finish(s,g,ready){
    const request=g.yieldRequest,waiter=s.units.find(u=>u.id===request?.from);
    if(waiter?.yieldWait?.for===g.id)waiter.yieldWait.ready=ready;
    delete g.yieldRequest;
  }
  function request(s,g,fix){
    if(!fix||g.yieldRound===s.round||g.yieldRequest||g.yieldWait)return false;
    g.yieldRound=s.round;
    // A physically sealed ring must remain refused by the pathfinder. Do not
    // issue remote requests when this actor cannot even start a legal step.
    if(!Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return walk(s,g,{...point(g),x:g.x+Math.cos(a)*.1,y:g.y+Math.sin(a)*.1},g.id);}).some(Boolean))return false;
    const candidates=s.units.filter(b=>b.team===g.team&&alive(b)&&b.id>g.id&&s.units.indexOf(b)>s.enemyIndex&&!b.burningTurns&&b.ap>.02&&!b.yieldRequest&&!b.yieldWait&&(!s.spatial||b.floorId===fix.floorId))
      .sort((a,b)=>distance(a,fix)-distance(b,fix)||a.id-b.id).slice(0,4);
    for(const b of candidates){
      if(!approach(shadow(s,b,null),g,fix)?.length)continue;
      for(const radius of [1,1.4,1.8])for(let i=0;i<16;i++){
        const a=i*Math.PI/8,q={...point(b),x:b.x+Math.cos(a)*radius,y:b.y+Math.sin(a)*radius};
        if(!free(s,q,b.id)||!walk(s,b,q,b.id)||!approach(shadow(s,b,q),g,fix)?.length)continue;
        b.yieldRequest={from:g.id,point:q,round:s.round,elapsed:0};g.yieldWait={for:b.id,round:s.round,ready:false};return true;
      }
    }
    return false;
  }
  function step(s,g,dt){
    const r=g.yieldRequest;if(!r)return false;
    if(r.round!==s.round||!alive(s.units.find(u=>u.id===r.from))||r.elapsed>=1||g.ap<.02){finish(s,g,false);return false;}
    const d=distance(g,r.point);if(d<.025){finish(s,g,true);return false;}
    r.elapsed+=dt;const length=Math.min(d,speed(g)*dt),moved=travel(s,g,(r.point.x-g.x)/d*length,(r.point.y-g.y)/d*length,{enemy:true,distanceBudget:length});
    if(!moved)finish(s,g,false);return true;
  }
  function retry(s){
    for(const g of [...s.units].sort((a,b)=>a.id-b.id)){
      const w=g.yieldWait;if(!w)continue;delete g.yieldWait;
      if(w.round===s.round&&w.ready&&alive(g)&&g.ap>.02)return s.units.indexOf(g);
    }
    return null;
  }
  function restore(s,inside){
    const byId=id=>Number.isInteger(id)&&s.units.some(u=>u.id===id&&u.team==='guard');
    for(const g of s.units){
      if(g.yieldRound!==undefined&&(!Number.isInteger(g.yieldRound)||g.yieldRound<0||g.yieldRound>s.round))throw Error('Unsupported guard coordination save.');
      const r=g.yieldRequest,w=g.yieldWait;
      if(r&&(!byId(r.from)||r.from>=g.id||r.round!==s.round||!r.point||!inside(r.point)||!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>1.05))throw Error('Unsupported guard coordination save.');
      if(w&&(!byId(w.for)||w.for<=g.id||w.round!==s.round||typeof w.ready!=='boolean'))throw Error('Unsupported guard coordination save.');
      if(r&&s.spatial&&(!Number.isFinite(r.point.h)||r.point.floorId!==g.floorId))throw Error('Unsupported guard coordination floor.');
    }
  }
  function settle(s){for(const g of s.units){if(g.yieldRequest)finish(s,g,false);delete g.yieldWait;}}
  return {request,step,retry,restore,settle};
}
