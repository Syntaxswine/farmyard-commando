import {FLOOR_MODES,floorKeyStep,createFloorWheel} from './index.js';
const fields='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="menu"],[role="listbox"]';
export function floorInputBlocked(doc,event){
 const targets=[event.target,doc.activeElement,...(event.composedPath?.()||[])];
 const overlay='dialog[open],[role="dialog"][aria-modal="true"],[role="menu"],[role="listbox"]';
 return targets.some(target=>target?.isContentEditable||target?.closest?.(fields))||
  [...doc.querySelectorAll(overlay)].some(node=>!node.closest('[hidden],[inert]')&&(node.checkVisibility?.({checkVisibilityCSS:true})??true));
}
export function mountFloorNavigation(container,controller,{keyboardTarget=container.ownerDocument,showModes=true,label='Floors',onError=error=>{throw error;}}={}){
 const doc=container.ownerDocument,element=doc.createElement('section'),wheel=createFloorWheel();
 element.className='nautilus-floor-nav';element.setAttribute('aria-label',label);
 const heading=doc.createElement('span');heading.className='fn-heading';heading.textContent=label;
 const strip=doc.createElement('div');strip.className='fn-strip';strip.setAttribute('role','group');strip.setAttribute('aria-label','Choose a floor');
 const button=(text,aria)=>{
  const value=doc.createElement('button');value.type='button';value.className='fn-button';value.textContent=text;
  if(aria)value.setAttribute('aria-label',aria);return value;
 };
 const previous=button('↓','Previous floor'),next=button('↑','Next floor');
 previous.dataset.action='previous';next.dataset.action='next';
 const labels=Array.from({length:5},()=>{const value=button('');value.classList.add('fn-floor');return value;});
 strip.append(previous,...labels,next);
 const readout=doc.createElement('output');readout.className='fn-readout';readout.setAttribute('aria-live','polite');readout.setAttribute('aria-atomic','true');
 const mode=doc.createElement('span');mode.className='fn-mode';
 const controls=doc.createElement('div');controls.className='fn-modes';
 const manual=button('Manual','Inspect floors manually'),follow=button('Return to character','Return to character follow');
 controls.append(manual,follow);controls.hidden=!showModes;
 element.append(heading,strip,readout,mode,controls);container.append(element);
 const act=operation=>{try{return operation();}catch(error){onError(error);return false;}};
 previous.onclick=()=>act(()=>controller.step(-1));next.onclick=()=>act(()=>controller.step(1));
 for(const value of labels)value.onclick=()=>act(()=>controller.select(value.floorId));
 manual.onclick=()=>act(()=>controller.select(controller.state.selectedId));follow.onclick=()=>act(()=>controller.followCharacter());
 const unsubscribe=controller.subscribe(state=>{
  const focused=doc.activeElement,refocus=labels.includes(focused)||(focused===previous&&!state.floors.some((floor,index)=>floor.id===state.selectedId&&index>0))||(focused===next&&state.selectedId===state.floors.at(-1).id);
  const visible=controller.visibleFloors,index=state.floors.findIndex(floor=>floor.id===state.selectedId),active=state.floors[index];
  previous.disabled=index===0;next.disabled=index===state.floors.length-1;
  strip.style.setProperty('--fn-visible',visible.length);
  labels.forEach((value,slot)=>{
   const floor=visible[slot];value.hidden=!floor;if(!floor)return;
   value.floorId=floor.id;value.dataset.floorId=String(floor.id);value.textContent=floor.label;
   value.setAttribute('aria-label','Floor '+floor.label+' · '+floor.elevationM.toLocaleString(undefined,{maximumFractionDigits:3})+' metres');
   value.setAttribute('aria-pressed',String(floor.id===state.selectedId));
  });
  readout.textContent='Floor '+active.label+' · '+active.elevationM.toLocaleString(undefined,{maximumFractionDigits:3})+' m';
  mode.textContent=state.mode===FLOOR_MODES.character?'Following character':state.mode===FLOOR_MODES.contact?'Inspecting detected contact':'Manual inspection';
  manual.setAttribute('aria-pressed',String(state.mode===FLOOR_MODES.manual));
  follow.disabled=!state.character;follow.setAttribute('aria-pressed',String(state.mode===FLOOR_MODES.character));
  if(refocus)labels.find(value=>!value.hidden&&value.floorId===state.selectedId)?.focus({preventScroll:true});
 });
 const keydown=event=>{
  if(!['PageUp','PageDown'].includes(event.key))return;
  const blocked=floorInputBlocked(doc,event),modified=event.ctrlKey||event.altKey||event.metaKey;
  if(blocked||modified||event.isComposing||event.defaultPrevented)return;
  event.preventDefault();
  const step=floorKeyStep({key:event.key,repeat:event.repeat,blocked,modified});
  if(step)act(()=>controller.step(step,{source:'keyboard'}));
 };
 const onWheel=event=>{
  if(event.ctrlKey||event.defaultPrevented||floorInputBlocked(doc,event))return;
  event.preventDefault();event.stopPropagation();
  const step=wheel.step({deltaY:event.deltaY,deltaMode:event.deltaMode,time:event.timeStamp});
  if(step)act(()=>controller.step(step,{source:'wheel'}));
 };
 keyboardTarget.addEventListener('keydown',keydown);element.addEventListener('wheel',onWheel,{passive:false});
 return Object.freeze({element,dispose(){unsubscribe();keyboardTarget.removeEventListener('keydown',keydown);element.removeEventListener('wheel',onWheel);element.remove();}});
}
