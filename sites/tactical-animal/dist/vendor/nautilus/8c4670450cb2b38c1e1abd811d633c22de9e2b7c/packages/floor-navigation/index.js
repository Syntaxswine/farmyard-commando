// Floor identities and native metre heights belong to the host, never this widget.
export const FLOOR_MODES=Object.freeze({manual:'manual',character:'character-follow',contact:'contact-inspection'});
const validId=id=>typeof id==='string'?id.trim().length>0&&id.length<=128:Number.isSafeInteger(id);
function readFloors(floors){
 if(!Array.isArray(floors)||!floors.length)throw new TypeError('Supply at least one available floor.');
 const ids=new Set();
 return Object.freeze(floors.map(floor=>{
  if(!floor||!validId(floor.id)||ids.has(floor.id))throw new TypeError('Floor IDs must be unique strings or safe integers.');
  if(typeof floor.label!=='string'||!floor.label.trim()||floor.label.length>128||!Number.isFinite(floor.elevationM))throw new TypeError('Each floor needs a label and a finite native height in metres.');
  ids.add(floor.id);return Object.freeze({id:floor.id,label:floor.label,elevationM:floor.elevationM});
 }));
}
export function floorWindow(floors,selectedId){
 const index=floors.findIndex(floor=>floor.id===selectedId);
 if(index<0)throw new RangeError('The selected floor is unavailable.');
 const start=Math.max(0,Math.min(index-2,floors.length-5));
 return floors.slice(start,start+5);
}
export function floorKeyStep({key,repeat=false,defaultPrevented=false,composing=false,modified=false,blocked=false}){
 if(repeat||defaultPrevented||composing||modified||blocked)return 0;
 return key==='PageUp'?1:key==='PageDown'?-1:0;
}
// A host supplies monotonic milliseconds. One continuous gesture produces at
// most one step; inertia cannot race through a tower. No internal clock/timer.
export function createFloorWheel({threshold=40,idleMs=180}={}){
 if(!(threshold>0)||!(idleMs>0))throw new RangeError('Wheel thresholds must be positive.');
 let previous=-Infinity,total=0,latched=false,lastTime=-Infinity;
 return {reset(){previous=-Infinity;total=0;latched=false;lastTime=-Infinity;},step({deltaY,deltaMode=0,time}){
  if(!Number.isFinite(time)||time<lastTime)throw new RangeError('Supply monotonic wheel time.');
  lastTime=time;if(time-previous>=idleMs){total=0;latched=false;}previous=time;
  if(!Number.isFinite(deltaY)||![0,1,2].includes(deltaMode)||!deltaY||latched)return 0;
  const delta=deltaY*(deltaMode===1?16:deltaMode===2?400:1);
  if(Math.sign(delta)!==Math.sign(total))total=0;
  total+=delta;if(Math.abs(total)<threshold)return 0;
  latched=true;return total<0?1:-1;
 }};
}
export function createFloorNavigation({floors,selectedId,cancelPreview=()=>{},onFloorChange=()=>{},onModeChange=()=>{},onTrackingLost=()=>{}}){
 const available=readFloors(floors);
 if(!available.some(floor=>floor.id===selectedId))throw new RangeError('Choose an available initial floor.');
 for(const callback of [cancelPreview,onFloorChange,onModeChange,onTrackingLost])if(typeof callback!=='function')throw new TypeError('Floor callbacks must be functions.');
 let state=Object.freeze({floors:available,selectedId,mode:FLOOR_MODES.manual,character:null,contact:null,revision:0}),disposed=false,changing=false;
 const listeners=new Set(),floor=id=>state.floors.find(value=>value.id===id);
 const check=()=>{if(disposed)throw Error('Floor navigation is disposed.');if(changing)throw Error('Do not reenter floor navigation from host callbacks.');};
 const publish=patch=>{
  const previous=state;state=Object.freeze({...state,...patch,revision:state.revision+1});
  if(previous.mode!==state.mode)onModeChange(Object.freeze({from:previous.mode,to:state.mode}));
  for(const listener of listeners)listener(state);
 };
 const transition=(id,mode,source,patch={})=>{
  check();const target=floor(id);if(!target)throw new RangeError('That floor is unavailable.');
  const changed=id!==state.selectedId;
  if(changed){
   const event=Object.freeze({from:floor(state.selectedId),to:target,mode,source});
   changing=true;
   try{if(cancelPreview(event)===false||onFloorChange(event)===false)return false;}
   finally{changing=false;}
  }
  if(changed||mode!==state.mode||Object.keys(patch).some(key=>patch[key]!==state[key]))publish({...patch,selectedId:id,mode});
  return true;
 };
 const person=value=>{
  if(!value||!validId(value.id)||!floor(value.floorId))throw new TypeError('Supply a subject ID and its confirmed available floor.');
  return Object.freeze({id:value.id,floorId:value.floorId});
 };
 const api={
  get state(){return state;},
  get visibleFloors(){return floorWindow(state.floors,state.selectedId);},
  subscribe(listener){check();if(typeof listener!=='function')throw new TypeError('Subscribe with a function.');listeners.add(listener);listener(state);return()=>listeners.delete(listener);},
  select(id,{source='manual'}={}){return transition(id,FLOOR_MODES.manual,source,{contact:null});},
  step(direction,{source='manual'}={}){
   check();if(direction!==1&&direction!==-1)throw new RangeError('Step by one available floor.');
   const index=state.floors.findIndex(value=>value.id===state.selectedId),next=state.floors[index+direction];
   return next?api.select(next.id,{source}):false;
  },
  setCharacter(value){
   check();const character=value===null?null:person(value);
   if(state.mode===FLOOR_MODES.character&&character)return transition(character.floorId,state.mode,'character',{character});
   publish({character,...(!character&&state.mode===FLOOR_MODES.character?{mode:FLOOR_MODES.manual}:{})});return true;
  },
  followCharacter(){
   check();return state.character?transition(state.character.floorId,FLOOR_MODES.character,'character',{contact:null}):false;
  },
  inspectContact(value){
   check();if(value?.detected!==true)return false;const contact=person(value);
   return transition(contact.floorId,FLOOR_MODES.contact,'contact',{contact});
  },
  updateContact(value){
   check();if(state.mode!==FLOOR_MODES.contact||value?.id!==state.contact?.id)return false;
   if(value.detected!==true){
    const lost=state.contact;
    // Disarm live tracking before any fallback callback can fail or reject.
    publish({contact:null,mode:FLOOR_MODES.manual});onTrackingLost(Object.freeze({id:lost.id,lastKnownFloorId:lost.floorId}));
    return state.character?api.followCharacter():true;
   }
   const contact=person(value);return transition(contact.floorId,FLOOR_MODES.contact,'contact',{contact});
  },
  dispose(){disposed=true;listeners.clear();}
 };
 return Object.freeze(api);
}
