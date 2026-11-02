import {coldwellNavigationGeometry} from './coldwell-path.js';

const abort=()=>Object.assign(new Error('Route planning cancelled.'),{name:'AbortError'});
export const coldwellNavigationStamp=(state,actor,rate)=>JSON.stringify([coldwellNavigationGeometry(state),state.phase,state.round,[actor.id,actor.x,actor.y,actor.h,actor.floorId,actor.stairId,actor.stance,actor.running,actor.sneaking,rate],(state.units||[]).filter(u=>u.hp>0).map(u=>[u.id,u.x,u.y,u.h,u.stance])]);
const workerURL=()=>{const url=new URL('./coldwell-path-worker.js',import.meta.url),version=new URL(import.meta.url).searchParams.get('v');if(version)url.searchParams.set('v',version);return url;};

// Pending work and worker caches are presentation/session data, never saves.
// A cancelled search is terminated, so even an expensive exact query cannot
// delay cancellation. An idle worker is reused until the operation is left.
export class ColdwellNavigation{
  constructor(provider,{createWorker=url=>new Worker(url,{type:'module',name:'Coldwell route planner'})}={}){this.provider=provider;this.createWorker=createWorker;this.sessions=new WeakMap();this.plans=new WeakMap();}
  session(state){let s=this.sessions.get(state);if(!s){s={generation:0,status:'idle',worker:null,pending:null};this.sessions.set(state,s);}return s;}
  cancel(state){const s=this.session(state);s.generation++;if(s.pending){const pending=s.pending;s.pending=null;clearTimeout(pending.timer);s.worker?.terminate();s.worker=null;s.status='cancelled';pending.reject(abort());}}
  dispose(state){this.cancel(state);const s=this.session(state);s.worker?.terminate();s.worker=null;}
  status(state){const s=this.sessions.get(state);return s?{status:s.status,generation:s.generation,worker:!!s.worker,pending:!!s.pending,searching:!!s.pending&&!!s.searching,durationMs:s.durationMs,search:s.search}:{status:'idle',worker:false,pending:false};}
  accepts(state,actor,route,rate){const p=this.plans.get(route),s=this.session(state);return !!p&&p.state===state&&p.generation===s.generation&&p.stamp===coldwellNavigationStamp(state,actor,rate);}
  request(state,actor,destination,{rate=1}={}){
    this.cancel(state);const s=this.session(state),generation=s.generation,stamp=coldwellNavigationStamp(state,actor,rate),started=performance.now();s.status='planning';s.search=null;s.searching=false;
    return new Promise((resolve,reject)=>{
      const fail=error=>{if(s.pending?.generation!==generation)return;clearTimeout(s.pending.timer);s.pending=null;s.status='error';s.worker?.terminate();s.worker=null;reject(error);};
      s.pending={generation,reject,resolve,stamp,actor,rate,started,timer:setTimeout(()=>fail(new Error('Route planning timed out. Please try again.')),60000)};
      try{
        if(!s.worker){
          const worker=this.createWorker(workerURL());s.worker=worker;
          worker.addEventListener('error',event=>{if(s.worker!==worker||!s.pending)return;const p=s.pending;clearTimeout(p.timer);s.pending=null;s.status='error';worker.terminate();s.worker=null;p.reject(new Error(event.message||'Route planner could not start.'));});
          worker.addEventListener('message',({data})=>{
            const pending=s.pending;if(s.worker!==worker||!pending||data.generation!==pending.generation)return;
            if(data.error||data.sourceDigest!==this.provider.bundle.manifest.sourceDigest){clearTimeout(pending.timer);s.pending=null;s.status='error';worker.terminate();s.worker=null;pending.reject(new Error(data.error||'Route source changed.'));return;}
            if(data.type==='searching'){s.searching=true;return;}
            clearTimeout(pending.timer);s.pending=null;s.durationMs=performance.now()-pending.started;s.search=data.search;
            if(pending.stamp!==coldwellNavigationStamp(state,pending.actor,pending.rate)){s.status='stale';pending.reject(abort());return;}
            s.status='complete';if(data.route)this.plans.set(data.route,{state,stamp:pending.stamp,generation:pending.generation});pending.resolve(data.route);
          });
        }
        s.worker.postMessage({generation,sourceDigest:this.provider.bundle.manifest.sourceDigest,state:{spatial:state.spatial,units:state.units,interactables:(state.interactables||[]).filter(o=>o.kind==='chest')},actor:{...actor},destination,options:{rate}});
      }catch(error){fail(error);}
    });
  }
}
