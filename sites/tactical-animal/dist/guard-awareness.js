// Small adaptation of AFT GUARD_STATES, settleRound, searchCells and
// stepInvestigation: observed fix -> local sweep -> authored post -> rest.
export const GUARD_STATES=Object.freeze(['rest','suspicious','alert','searching','standdown']);
export const guardState=g=>g.alert?'alert':g.state||'rest';
export function createGuardAwareness({alive,point,distance,sees,free,path,travel,speed,refresh}){
  function initialize(s,posts=[]){for(const g of s.units.filter(g=>g.team==='guard')){
    g.state??=g.alert?'alert':'rest';
    const authored=posts[g.id-1];g.post??={...point(authored||g),heading:authored?.heading??g.heading};
  }}
  function change(g,state){g.state=state;g.alert=state==='alert';delete g.guardRoute;delete g.search;delete g.returning;if(state==='standdown')g.returning={elapsed:0,blocked:0,wait:0};if(state==='rest'||state==='standdown')g.lastKnown=null;}
  function observe(s,g,target){
    if(g.state!=='alert')change(g,'alert');g.lastKnown=point(target);g.alertAge=0;g.alertClock=0;g.seenRound=s.round;
    g.contact={point:point(target),targetId:target.id,observerId:g.id,observedAt:s.elapsed,observedRound:s.round,via:g.id};
  }
  const age=(s,r)=>Math.max(0,s.round-r.observedRound,Math.floor((s.elapsed-r.observedAt)/3));
  const usable=(s,r)=>r&&age(s,r)<3;
  function newer(a,b,listener){if(!b)return true;return a.observedRound>b.observedRound||a.observedRound===b.observedRound&&(a.observedAt>b.observedAt||a.observedAt===b.observedAt&&a.observerId!==b.observerId&&b.observerId!==listener.id&&a.observerId<b.observerId);}
  // AFT shout forwards lastKnown. Preserve the original observation timestamp
  // and observer through each relay; an audible shot is not a new sighting.
  function signal(s,source,radius){
    const seen=source.team==='guard'&&sees(s,source);if(seen)observe(s,source,seen);
    const report=source.team==='guard'&&usable(s,source.contact)?source.contact:null;
    for(const g of s.units.filter(g=>g.team==='guard'&&alive(g)&&g!==source&&distance(g,source)<=radius)){
      const direct=sees(s,g);if(direct){observe(s,g,direct);continue;}
      if(report){
        if(!newer(report,g.contact,g))continue;
        change(g,'alert');g.contact={...structuredClone(report),via:source.id};g.lastKnown=point(report.point);g.alertAge=age(s,report);g.alertClock=Math.max(0,(s.elapsed-report.observedAt)%3);
      }else if(!usable(s,g.contact)){
        // Sound alone supplies the shooter's position, not a hostile identity.
        change(g,'suspicious');g.lastKnown=null;g.lastHeard={...point(source),sourceId:source.id,heardAt:s.elapsed,heardRound:s.round};
        g.search={cells:[point(source)],index:0,elapsed:0,dwell:0,blocked:0,wait:0};
      }
    }
  }
  function search(s,g){
    if(!g.lastKnown){change(g,'standdown');return;}
    const fix=point(g.lastKnown),candidates=[[6,0],[-6,0],[0,6],[0,-6],[6,6],[-6,6],[6,-6],[-6,-6]]
      .map(([x,y],index)=>({...fix,x:fix.x+x,y:fix.y+y,index})).filter(q=>free(s,q,g.id))
      .sort((a,b)=>distance(g,a)-distance(g,b)||a.index-b.index);
    const cells=[fix];
    for(const q of candidates){if(path(s,g,q)?.length)cells.push(point(q));if(cells.length===5)break;}
    change(g,'searching');g.search={cells,index:0,elapsed:0,dwell:0,blocked:0,wait:0};
  }
  function round(s){for(const g of s.units.filter(g=>g.team==='guard'&&alive(g))){
    const seen=sees(s,g);if(seen){observe(s,g,seen);continue;}
    if(guardState(g)==='alert'&&++g.alertAge>=3)search(s,g);
  }}
  function settle(g,home){change(g,'rest');if(home&&g.post)g.heading=g.post.heading;}
  function nextCell(g){delete g.guardRoute;g.search.index++;g.search.dwell=0;g.search.blocked=0;if(g.search.index>=g.search.cells.length)change(g,'standdown');}
  function step(s,g,dt,quota={left:1}){
    const state=guardState(g);if(!['suspicious','searching','standdown'].includes(state)||!alive(g)||g.burningTurns)return false;
    const seen=sees(s,g);if(seen){observe(s,g,seen);refresh(s);return true;}
    const investigating=state!=='standdown',task=investigating?g.search:g.returning;
    task.elapsed+=dt;
    if(task.elapsed>=(investigating?18:12)){if(investigating)change(g,'standdown');else settle(g,false);return true;}
    if(task.wait>0){task.wait=Math.max(0,task.wait-dt);return true;}
    const destination=investigating?task.cells[task.index]:g.post;
    if(!destination){settle(g,false);return true;}
    if(distance(g,destination)<.08){
      if(state==='standdown'){settle(g,true);return true;}
      task.dwell+=dt;if(task.dwell>=.6)nextCell(g);else g.heading=(g.heading+dt*180)%360;return true;
    }
    if(!g.guardRoute){
      if(quota.left<=0)return true;quota.left--;
      const route=path(s,g,destination);
      if(!route?.length){task.blocked++;task.wait=.5;if(task.blocked>=3){if(investigating)nextCell(g);else settle(g,false);}return true;}
      g.guardRoute=route;
    }
    while(g.guardRoute.length&&distance(g,g.guardRoute[0])<.025)g.guardRoute.shift();
    const next=g.guardRoute[0];if(!next){delete g.guardRoute;return true;}
    const d=distance(g,next),length=Math.min(d,speed(g)*dt),moved=travel(s,g,(next.x-g.x)/d*length,(next.y-g.y)/d*length,{enemy:s.phase==='enemy',investigation:s.phase!=='enemy',distanceBudget:length});
    if(!moved){delete g.guardRoute;task.blocked++;task.wait=.5;if(task.blocked>=3){if(investigating)nextCell(g);else settle(g,false);}}
    return true;
  }
  function explore(s,dt){const quota={left:2};for(const g of s.units){
    if(!['explore','won'].includes(s.phase))break;if(g.team!=='guard'||!alive(g))continue;
    if(guardState(g)==='alert'){
      const seen=sees(s,g);if(seen){observe(s,g,seen);refresh(s);continue;}
      g.alertClock=(g.alertClock||0)+dt;if(g.alertClock>=3){g.alertClock-=3;if(++g.alertAge>=3)search(s,g);}
    }
    step(s,g,dt,quota);
  }}
  function restore(s,inside,posts){
    initialize(s,posts);
    const finite=n=>Number.isFinite(n)&&n>=0,validRoute=r=>Array.isArray(r)&&r.length<=256&&r.every(p=>p&&inside(p)&&finite(p.cost));
    for(const g of s.units.filter(g=>g.team==='guard')){
      if(!GUARD_STATES.includes(g.state)||!inside(g.post)||!Number.isFinite(g.post.heading))throw Error('Unsupported guard awareness save.');
      if(g.alertClock!==undefined&&(!finite(g.alertClock)||g.alertClock>3.05))throw Error('Unsupported guard awareness clock.');
      if(g.contact&&(!inside(g.contact.point)||g.contact.targetId!==s.units.find(u=>u.team==='squad')?.id||!Number.isInteger(g.contact.observerId)||g.contact.observerId<1||!Number.isInteger(g.contact.via)||g.contact.via<1||!finite(g.contact.observedAt)||g.contact.observedAt>s.elapsed||!Number.isInteger(g.contact.observedRound)||g.contact.observedRound<0||g.contact.observedRound>s.round))throw Error('Unsupported guard contact save.');
      if(g.lastHeard&&(!inside(g.lastHeard)||!finite(g.lastHeard.heardAt)||g.lastHeard.heardAt>s.elapsed||!Number.isInteger(g.lastHeard.heardRound)||g.lastHeard.heardRound<0||g.lastHeard.heardRound>s.round||!Number.isInteger(g.lastHeard.sourceId)))throw Error('Unsupported guard sound save.');
      if(g.search&&(!Array.isArray(g.search.cells)||g.search.cells.length>5||!g.search.cells.length||g.search.cells.some(p=>!inside(p))||!Number.isInteger(g.search.index)||g.search.index<0||g.search.index>=g.search.cells.length||!['elapsed','dwell','blocked','wait'].every(k=>finite(g.search[k]))))throw Error('Unsupported guard search save.');
      if(g.returning&&!['elapsed','blocked','wait'].every(k=>finite(g.returning[k])))throw Error('Unsupported guard return save.');
      if(g.guardRoute&&!validRoute(g.guardRoute)||['searching','suspicious'].includes(g.state)&&!g.search||g.state==='standdown'&&!g.returning)throw Error('Unsupported guard route save.');
    }
  }
  return {initialize,observe,round,step,explore,restore,signal};
}
