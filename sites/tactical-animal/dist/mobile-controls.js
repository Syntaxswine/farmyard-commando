// Bounce at the ends instead of wrapping from prone straight to standing.
export function cycleStep(values,current,direction=1){
  const index=values.indexOf(current);
  if(index<0||values.length<2)throw Error('A cycle needs a current value and at least two choices.');
  if(index===0)direction=1;
  else if(index===values.length-1)direction=-1;
  return {value:values[index+direction],direction};
}

// The animal is the final stop in this forward-only camera cycle. A null focus
// means the next tap starts again at the first visible opponent.
export function nextCameraFocus(contacts,focusedId){
  const index=contacts.findIndex(contact=>contact.id===focusedId);
  return contacts[index+1]??null;
}

// Let the native click handle taps and keyboard activation. A held or cancelled
// pointer suppresses its following click so opening choices never changes state.
export function bindPressHold(button,{tap,hold,canUse,press=()=>{},delay=450}){
  let pointer=null,origin=null,timer=null,suppressClick=false;
  const clear=()=>{clearTimeout(timer);timer=null;};
  const cancel=()=>{if(pointer===null)return;clear();pointer=null;suppressClick=true;};
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0||pointer!==null||!canUse())return;
    pointer=event.pointerId;origin={x:event.clientX,y:event.clientY};suppressClick=false;
    button.setPointerCapture(pointer);press();
    timer=setTimeout(()=>{timer=null;if(pointer!==null&&canUse()){suppressClick=true;hold();}},delay);
  });
  button.addEventListener('pointermove',event=>{
    if(event.pointerId===pointer&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>14)cancel();
  });
  button.addEventListener('pointerup',event=>{if(event.pointerId===pointer){clear();pointer=null;}});
  for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,cancel);
  button.addEventListener('click',event=>{
    if(suppressClick&&event.detail!==0){suppressClick=false;event.preventDefault();return;}
    suppressClick=false;
    if(canUse())tap();
  });
  button.addEventListener('contextmenu',event=>event.preventDefault());
  button.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'&&canUse()){event.preventDefault();hold();}
  });
  globalThis.addEventListener?.('blur',cancel);
}
