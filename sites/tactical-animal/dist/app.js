import {ANIMALS,PRIMARY,SECONDARY,DEFAULT_BUILD,BRIEF,Core,normalizeBuild,buildStats,createSoloGame,hero,interaction,interact,dressing,tick,encodeSave,decodeSave,distance} from './solo-game.js';
import {FieldView,drawMinimap} from './field-view.js';
import {cycleStep,bindPressHold} from './mobile-controls.js';
const $=id=>document.getElementById(id),SAVE='tactical-animal-operation-v2',BUILD='tactical-animal-build-v1';
let build={...DEFAULT_BUILD},state=null,view=null,active=false,paused=false,selected=null,aim='hip',zone='torso',burst=false,contextKey='',lastTime=0,lastUI=0,lastSave=0,lastPhase='',stick={x:0,y:0},stickPointer=null,resultShown=false;
const keys=new Set(),overlay=$('overlay');
const picker=$('control-picker');
let pickerTrigger=null,stanceDirection=1,movementDirection=-1;
const stanceValues=['standing','kneeling','prone'],movementValues=['run','walk','sneak'];
const stanceNames={standing:'Standing',kneeling:'Kneeling',prone:'Prone / crawl'},movementNames={run:'Run',walk:'Off / walk',sneak:'Sneak'};
const poses={standing:'M12 4a3 3 0 1 0 0 .1M12 10v13m0-9-6 5m6-5 6 5m-6 4-5 11m5-11 6 11',kneeling:'M12 5a3 3 0 1 0 0 .1M12 11l1 10 9 1m-9-1-6 6h13m-8-12 9 3m-9-3-4 5',prone:'M5 20a3 3 0 1 0 0 .1M9 23h15l7 4m-7-4 8-2M9 23l6-6h8'};
const movementPoses={walk:'M18 4a3 3 0 1 0 0 .1M18 10l-2 12m2-9-8 7m8-7 7 6m-9 3-6 12m6-12 9 12',run:'M22 4a3 3 0 1 0 0 .1M21 10l-7 11m5-9-8-1-4 5m12-4 5 7 6-2M14 21l-7 5-4-4m11-1 9 5-2 8',sneak:'M17 9a3 3 0 1 0 0 .1M17 15l-3 7m2-5 10 3 3-3m-13 0-7 3M14 22l10 3-6 8m-4-11-7 8h8'};
const poseIcon=value=>`<svg viewBox="0 0 36 38" aria-hidden="true"><path d="${poses[value]||movementPoses[value]}"/></svg>`;
try{build=normalizeBuild(JSON.parse(localStorage.getItem(BUILD)||'null'));}catch{}
const storage={read(){try{return localStorage.getItem(SAVE);}catch{return null;}},write(){if(!state)return;try{localStorage.setItem(SAVE,encodeSave(state));}catch{toast('Device storage is full. Keep this tab open to retain the operation.');}}};
const speciesLabel=s=>s.replaceAll('-',' '),short=k=>Core.WEAPONS[k].short;
const gunIcon=k=>`<svg class="gun-icon" viewBox="0 0 100 30" aria-hidden="true"><path d="${k==='pistol'?'M18 9h54v8H47l-4 12H28l4-15H18z':k==='knife'?'M15 18h24l45-10-30 16H39v4H15z':k==='rpg'?'M5 13h65l12-6 13 9-13 9-12-6H45l-3 11h-9l2-11H5z':k==='flamethrower'?'M8 7h18v23H8zM26 24q15 2 18-8h43v5H59l-4 9h-8l2-14':`M6 12h33v-4h29v4h26v4H65l-3 13H51l-2-13H34l-8 8H6z${k==='sniper'?'M41 5h21M45 5v4M58 5v4':''}`}"/></svg>`;
function button(parent,label,cls,pressed,onClick){const b=document.createElement('button');b.type='button';b.className=cls;b.innerHTML=label;b.setAttribute('aria-pressed',String(pressed));b.onclick=onClick;parent.append(b);return b;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function renderPrep(){const p=ANIMALS.find(a=>a.id===build.animal),stats=buildStats(build);$('hero-portrait').src=`aft/assets/characters/armed/${p.species}-rifle.png`;$('hero-portrait').alt=`${p.name}, the ${speciesLabel(p.species)} worker`;$('hero-name').textContent=p.name;$('hero-species').textContent=speciesLabel(p.species);$('hero-role').textContent=p.label;document.querySelector('.portrait-number').textContent=String(ANIMALS.indexOf(p)+1).padStart(2,'0');$('stats').innerHTML=[['HEALTH',stats.maxHp],['ACTION POINTS',stats.maxAp],['PERCEPTION',stats.perception]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('animals').replaceChildren();for(const a of ANIMALS)button($('animals'),`<strong>${speciesLabel(a.species)}</strong><small>${a.name}</small>`,'animal-choice',a.id===build.animal,()=>{build.animal=a.id;renderPrep();});
  $('primary').replaceChildren();for(const k of PRIMARY){const w=Core.WEAPONS[k];button($('primary'),`${gunIcon(k)}<strong>${w.short}</strong><small>${w.cost} AP / ${w.range} m / ${w.mag} rounds</small>`,'weapon-choice',k===build.primary,()=>{build.primary=k;renderPrep();}).setAttribute('aria-label',w.name);}
  $('secondary').replaceChildren();for(const k of SECONDARY)button($('secondary'),`<span>${short(k)}</span><small>${k==='knife'?'MELEE':'8 ROUNDS'}</small>`,'small-choice',k===build.secondary,()=>{build.secondary=k;renderPrep();});
  $('utility').replaceChildren();for(const [k,label,detail] of [['dressing','Field dressing','×2'],['grenade','Frag grenades','×3']])button($('utility'),`<span>${label}</span><small>${detail}</small>`,'small-choice',k===build.utility,()=>{build.utility=k;renderPrep();});
  const skill=['hmg','rpg','flamethrower'].includes(build.primary)?'heavyWeapons':'firearms';$('primary-summary').textContent=`${skill==='firearms'?'FIREARMS':'HEAVY WEAPONS'} ${p.stats[skill]}`;$('equipment-note').textContent=`${Core.WEAPONS[build.primary].name}. ${p.name}'s ${skill==='firearms'?'firearms':'heavy weapons'} skill: ${p.stats[skill]}/100. Movement spends AP by distance, with no tile snapping.`;$('build-summary').textContent=`${p.name} / ${speciesLabel(p.species)} · ${short(build.primary)} + ${short(build.secondary)}`;
  $('resume').hidden=!storage.read();try{localStorage.setItem(BUILD,JSON.stringify(build));}catch{}
}
function showDialog(html,actions=[],{context=false}={}){
  if(picker.open)closePicker();
  paused=true;resetStick();keys.clear();
  $('overlay-content').innerHTML=html;
  $('context').hidden=!context;
  const row=$('overlay-actions');row.replaceChildren();
  for(const [label,fn,cls,disabled=false] of actions){
    const b=document.createElement('button');b.textContent=label;b.className=cls||'';b.disabled=disabled;
    b.onclick=()=>{closeDialog();fn();};row.append(b);
  }
  if(context){contextKey='';renderContext();}
  if(!overlay.open)overlay.showModal();
}
function closeDialog(){overlay.close();paused=false;lastTime=performance.now();}
overlay.addEventListener('cancel',()=>{paused=false;lastTime=performance.now();});
function start(s){try{view?.dispose();$('loading').textContent='Preparing the field…';$('loading').hidden=false;state=s;selected=null;contextKey='';resultShown=false;stanceDirection=1;movementDirection=-1;$('prep').hidden=true;$('battle').hidden=false;document.body.classList.add('in-battle');active=true;paused=false;view=new FieldView($('viewport'),{onPick:pick,onLoading:busy=>{$('loading').hidden=!busy;},onError:message=>{$('loading').hidden=false;$('loading').textContent='Animal artwork could not load. '+message;}});view.setGame(state);lastPhase=state.phase;lastTime=performance.now();lastUI=0;renderBattle();storage.write();}catch(error){active=false;view?.dispose();view=null;$('prep').hidden=false;$('battle').hidden=true;document.body.classList.remove('in-battle');toast('Cannot start 3D view: '+error.message);}}
function backToPrep(){storage.write();active=false;resetStick();view?.dispose();view=null;$('battle').hidden=true;$('prep').hidden=false;document.body.classList.remove('in-battle');renderPrep();}
$('deploy').onclick=()=>start(createSoloGame(build));$('resume').onclick=()=>{try{const s=decodeSave(storage.read());if(s.solo.status!=='active'){toast('That operation has ended. Deploy a new animal to begin again.');return;}start(s);}catch{toast('This saved operation is from an older prototype. Deploy a new animal.');}};
function act(fn){if(!state||paused)return;resetStick();keys.clear();fn();contextKey='';renderBattle();storage.write();}
function pick(p){if(!state||paused||state.phase==='enemy'||state.solo.status!=='active')return;resetStick();if(p.unitId!==undefined){if(p.unitId===0){operationMenu();return;}const target=state.units.find(u=>u.id===p.unitId);if(!state.detected.has(target?.id))return;Core.stop(state);Core.turnTo(state,hero(state),Core.headingTo(hero(state),target));selected={targetId:target.id};aim='hip';zone='torso';burst=false;}
  else{const path=Core.navigationPath(state,hero(state),p.x,p.y);if(!path){toast('No clear route to that point.');return;}view.route([hero(state),...path]);if(state.phase==='player')selected={point:p,path};else{Core.move(state,hero(state),p.x,p.y);selected=null;view.center();}}
  contextKey='';renderBattle();if(selected)operationMenu();
}
function renderContext(){if(!state)return;const u=hero(state),near=interaction(state),target=selected?.targetId!==undefined?state.units.find(v=>v.id===selected.targetId):null;
  if(target&&(!Core.alive(target)||!state.detected.has(target.id)))selected=null;
  const p=target&&selected?Core.previewAttack(state,u,target,burst,zone,null,aim):null;
  const sig=JSON.stringify([selected,near,aim,zone,burst,p,u.ap.toFixed(2),u.weapon,state.phase,[...state.detected],Math.round(u.x*10),Math.round(u.y*10),target?.hp]);if(sig===contextKey)return;contextKey=sig;const root=$('context');root.replaceChildren();
  if(state.phase==='enemy')return;
  function content(title,detail,label,fn,disabled=false){const copy=document.createElement('div');copy.className='context-copy';const h=document.createElement('strong');h.textContent=title;const small=document.createElement('small');small.textContent=detail;copy.append(h,small);root.append(copy);const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{closeDialog();act(fn);};root.append(b);return copy;}
  if(p){const copy=content(`${target.name} · ${speciesLabel(target.species)} · ${Math.ceil(target.hp)} HP`,`${p.distance?.toFixed(1)||distance(u,target).toFixed(1)} m · ${p.chance||0}% · ${p.cost||Core.WEAPONS[u.weapon].cost} AP${p.reason?' · '+p.reason:''}${Core.WEAPONS[u.weapon].blast?' · BLAST CAN HURT YOU':''}`,burst?'Fire burst':'Fire',()=>{Core.attack(state,u,target,burst,false,zone,false,aim);},!p.ok||!Core.canControl(state,u));
    const opts=document.createElement('div');opts.className='target-options';for(const [values,current,change,label] of [[{hip:'Quick shot',aimed:'Aimed',full:'Full aim'},aim,v=>aim=v,'Aim'],[{torso:'Torso',head:'Head',weapon:'Weapon',legs:'Legs'},zone,v=>zone=v,'Target zone']]){const select=document.createElement('select');select.setAttribute('aria-label',label);for(const [value,text] of Object.entries(values))select.add(new Option(text,value,false,value===current));select.onchange=()=>{change(select.value);contextKey='';renderContext();};opts.append(select);}if(Core.WEAPONS[u.weapon].burstRounds){const b=document.createElement('button');b.textContent=burst?'Burst ✓':'Burst';b.className='burst-toggle';b.onclick=()=>{burst=!burst;contextKey='';renderContext();};opts.append(b);}copy.append(opts);
  }else if(selected?.point){const path=Core.navigationPath(state,u,selected.point.x,selected.point.y),cost=path?.reduce((n,p)=>n+p.cost,0)||0,d=cost/Core.movementRate(u);content('Move to this point',`${d.toFixed(1)} m · ${cost.toFixed(1)} AP${cost>u.ap?' · stops when AP runs out':''}`,'Move',()=>{Core.move(state,u,selected.point.x,selected.point.y);selected=null;view.center();},!path||u.ap<.01);
  }else if(near){content(near.label,near.cost?`${near.cost} AP · then return to extraction`:'Leave with the ledger to finish the operation',near.kind==='extract'?'Extract ↗':'Collect',()=>interact(state),!near.ok);}
  else if(state.detected.size){const guard=[...state.detected].map(id=>state.units.find(v=>v.id===id)).sort((a,b)=>distance(u,a)-distance(u,b))[0];content('Visible contact',`${guard.name} · ${distance(u,guard).toFixed(1)} m`,'Target',()=>pick({unitId:guard.id}));}
  if(selected){const cancel=document.createElement('button');cancel.className='cancel-context';cancel.textContent='×';cancel.setAttribute('aria-label','Cancel selection');cancel.onclick=()=>{selected=null;view.route([]);contextKey='';renderContext();};root.append(cancel);}
}
function renderBattle(){if(!state)return;const u=hero(state),combat=state.phase==='player'||state.phase==='enemy',can=Core.canControl(state,u);
  $('battle-name').textContent=u.name;$('battle-species').textContent=speciesLabel(u.species);
  $('hp-label').textContent=`${Math.ceil(u.hp)} / ${u.maxHp} HP`;$('hp-bar').style.width=`${u.hp/u.maxHp*100}%`;
  $('ap').textContent=combat?Math.max(0,u.ap).toFixed(1):'∞';$('ap-label').textContent=combat?'AP':'FREE MOVE';
  $('end-turn').disabled=state.phase!=='player';
  $('end-turn').setAttribute('aria-label',state.phase==='enemy'?'Guards are acting':'End turn');
  $('turn-label').innerHTML=state.phase==='enemy'?'GUARD<br>TURN':'END<br>TURN';
  $('joystick').classList.toggle('unavailable',!can);
  const mode=Core.movementModeOf(u);
  renderCycle('movement',mode,mode==='walk'?'OFF':mode.toUpperCase(),movementNames[mode],can);
  renderCycle('stance',u.stance,{standing:'STAND',kneeling:'KNEEL',prone:'CRAWL'}[u.stance],stanceNames[u.stance],can);
  const contacts=Core.visibleOpponents(state),focused=contacts.find(g=>g.id===view?.focusedId);
  $('visible-count').textContent=contacts.length;$('look').disabled=!contacts.length||state.solo.status!=='active';
  $('look').classList.toggle('inspecting',!!focused);
  $('look').setAttribute('aria-label',`${contacts.length} visible opponent${contacts.length===1?'':'s'}. Focus next opponent.${focused?' Viewing '+focused.name+'.':''}`);
  drawMinimap($('minimap'),state);renderContext();
  if(state.solo.status!=='active'&&!resultShown){resultShown=true;storage.write();const win=state.solo.status==='extracted';showDialog(`<p class="eyebrow">OPERATION ${win?'COMPLETE':'LOST'}</p><h2>${win?'The books are open.':'One worker down.'}</h2><p>${win?`${u.name} returned with the wage ledger. ${Math.round(state.solo.distance)} metres travelled; ${state.round} combat rounds.`:'The factory kept its secrets this time. Try another animal, another loadout, or a quieter route.'}</p>`,[['Choose your next animal',backToPrep,'primary'],['Replay this loadout',()=>start(createSoloGame(state.solo.build))]]);}
}
$('end-turn').onclick=()=>act(()=>{selected=null;Core.endTurn(state);});
function renderCycle(kind,value,label,name,can){
  const b=$(kind+'-cycle');b.disabled=!can;b.setAttribute('aria-label',`${kind==='stance'?'Stance':'Movement'}: ${name.toLowerCase()}. Tap to cycle; hold for choices.`);
  if(b.dataset.value===value)return;b.dataset.value=value;
  $(kind+'-icon').innerHTML=poseIcon(value);$(kind+'-label').textContent=label;
}
function changeControl(kind,value){
  act(()=>{
    const u=hero(state),isStance=kind==='stance',values=isStance?stanceValues:movementValues,current=isStance?u.stance:Core.movementModeOf(u);
    const direction=Math.sign(values.indexOf(value)-values.indexOf(current));
    const changed=isStance?Core.setStance(state,u,value):Core.setMovementMode(state,u,value);
    if(changed&&direction){if(isStance)stanceDirection=direction;else movementDirection=direction;}
  });
}
function cycleControl(kind){
  const u=hero(state),isStance=kind==='stance',step=cycleStep(isStance?stanceValues:movementValues,isStance?u.stance:Core.movementModeOf(u),isStance?stanceDirection:movementDirection);
  changeControl(kind,step.value);
}
function pickerClosed(){paused=false;lastTime=performance.now();pickerTrigger?.setAttribute('aria-expanded','false');pickerTrigger=null;}
function closePicker(){picker.close();pickerClosed();}
picker.addEventListener('cancel',pickerClosed);
$('close-picker').onclick=closePicker;
picker.addEventListener('click',event=>{if(event.target!==picker)return;const r=picker.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePicker();});
function openPicker(kind){
  if(!state||paused||!Core.canControl(state,hero(state)))return;
  resetStick();keys.clear();Core.stop(state);paused=true;
  const u=hero(state),isStance=kind==='stance',values=isStance?stanceValues:movementValues,names=isStance?stanceNames:movementNames,current=isStance?u.stance:Core.movementModeOf(u);
  pickerTrigger=$(kind+'-cycle');pickerTrigger.setAttribute('aria-expanded','true');
  $('control-picker-title').textContent=isStance?'STANCE':'MOVEMENT';
  $('control-picker-hint').textContent=isStance?'Standing ↔ Kneeling ↔ Prone':'Run ↔ Off / walk ↔ Sneak';
  const row=$('control-choices');row.replaceChildren();
  for(const value of values){const b=button(row,`${poseIcon(value)}<span>${names[value]}</span>`,'',value===current,()=>{closePicker();changeControl(kind,value);});b.setAttribute('aria-label',names[value]);if(value===current)b.autofocus=true;}
  const bottom=innerHeight-pickerTrigger.getBoundingClientRect().top+10;
  picker.style.bottom=`${Math.max(12,Math.min(bottom,innerHeight-175))}px`;
  picker.showModal();
}
for(const kind of ['stance','movement'])bindPressHold($(kind+'-cycle'),{
  canUse:()=>!!state&&!paused&&Core.canControl(state,hero(state)),
  press:()=>{resetStick();keys.clear();Core.stop(state);},
  tap:()=>cycleControl(kind),hold:()=>openPicker(kind)
});
$('look').onclick=()=>{
  if(!state||paused)return;const contacts=Core.visibleOpponents(state);if(!contacts.length)return;
  const index=(contacts.findIndex(g=>g.id===view.focusedId)+1)%contacts.length;
  resetStick();keys.clear();Core.stop(state);view.focusOpponent(contacts[index].id);renderBattle();
};
$('zoom-in').onclick=()=>view?.zoom(.83);$('zoom-out').onclick=()=>view?.zoom(1.2);$('center').onclick=()=>view?.center();
function weaponSwapCost(u,kind){return Core.combatCosts(state)?u.slots.includes(kind)?2:3:0;}
function equipment(){
  const u=hero(state),can=Core.canControl(state,u);
  showDialog(`<p class="eyebrow">${u.name.toUpperCase()} / INVENTORY</p><h2>Equipment.</h2><p>${Math.round(u.stamina)} / ${u.maxStamina} stamina · ${u.ap.toFixed(1)} AP remaining.</p>`,[
    ...u.pack.map(i=>{
      const cost=weaponSwapCost(u,i.kind);
      const label=`${Core.WEAPONS[i.kind].name}${Core.WEAPONS[i.kind].mag?' · '+(u.ammo[i.kind]??0)+' loaded / '+(u.ammoPouch[i.kind]||0)+' reserve':''}${u.weapon===i.kind?' · equipped':cost?' · '+cost+' AP':''}`;
      return [label,()=>act(()=>Core.equip(state,u,i.kind)),'',!can||u.weapon===i.kind||u.ap<cost];
    }),
    ['Back to menu',operationMenu],['Return to operation',()=>{},'primary']
  ]);
}
function operationMenu(){
  if(!state)return;
  storage.write();
  const u=hero(state),w=Core.WEAPONS[u.weapon],can=Core.canControl(state,u),costs=Core.combatCosts(state);
  const other=u.weapon===state.solo.build.primary?state.solo.build.secondary:state.solo.build.primary;
  const swapCost=weaponSwapCost(u,other),actionCost=costs?' · 3 AP':'';
  const phase=state.phase==='enemy'?'Guard turn':state.phase==='player'?`Your turn · round ${state.round}`:'Real-time exploration';
  const utility=state.solo.build.utility==='dressing';
  showDialog(`<p class="eyebrow">OPERATION PAUSED</p><h2>Field menu.</h2><p class="menu-summary">${phase}<br>${u.name} · ${short(u.weapon)} · ${u.ap.toFixed(1)} AP</p>`,[
    ['Continue operation',()=>{},'primary'],
    ['Inventory & weapons',equipment],
    [`Switch to ${short(other)}${swapCost?' · '+swapCost+' AP':''}`,()=>act(()=>Core.equip(state,u,other)),'',!can||u.ap<swapCost],
    [`Reload ${short(u.weapon)} · ${u.ammo[u.weapon]??0}/${w.mag}${actionCost}`,()=>act(()=>Core.reload(state,u)),'',!can||!w.mag||u.ammo[u.weapon]>=w.mag||!(u.ammoPouch[u.weapon]>0)||costs&&u.ap<3],
    [utility?`Use field dressing ×${state.solo.dressings}${actionCost}`:`Equip grenade ×${u.ammo.grenade||0}${costs?' · '+weaponSwapCost(u,'grenade')+' AP':''}`,()=>act(()=>utility?dressing(state):Core.equip(state,u,'grenade')),'',!can||(utility?(state.solo.dressings===0||u.hp===u.maxHp||costs&&u.ap<3):u.ammo.grenade===0||u.weapon==='grenade'||u.ap<weaponSwapCost(u,'grenade'))],
    ['Mission & combat log',mission],['Controls',help],['Choose animal & loadout',backToPrep],['Restart this operation',()=>start(createSoloGame(state.solo.build))]
  ],{context:true});
}
function mission(){
  const u=hero(state),near=interaction(state),dest=state.solo.ledger?BRIEF.extraction:BRIEF.objective;
  const safe=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const objective=state.solo.ledger?'Return to extraction with the ledger.':'Reach the records office and secure the wage ledger.';
  showDialog(`<p class="eyebrow">MILL 04 / THE NIGHT LEDGER</p><h2>Your assignment.</h2><p>${objective}<br>${distance(u,dest).toFixed(1)} m to ${state.solo.ledger?'extraction':'the records office'}.</p><p class="menu-log-title">RECENT EVENTS</p><ol class="menu-log">${state.log.slice(0,8).map(line=>`<li>${safe(line)}</li>`).join('')}</ol>`,[
    ...(near?[[`${near.label}${near.cost?' · '+near.cost+' AP':''}`,()=>act(()=>interact(state)),'primary',!near.ok]]:[]),
    ['Back to menu',operationMenu],['Return to operation',()=>{}]
  ]);
}
$('menu').onclick=operationMenu;
function help(){showDialog('<p class="eyebrow">FIELD NOTES</p><h2>One animal.<br>Your decisions.</h2><ul><li>Use the center thumbstick to move freely in any direction. W A S D and arrow keys also work.</li><li>During combat, movement spends AP by the exact distance covered. Stop anywhere. End Turn is directly above Menu on the right.</li><li>Tap a visible guard to open the menu with aiming and firing options. Higher aim spends more AP.</li><li>Drag the world to look around. Use the arrows to zoom; tap RECENTER to follow your animal.</li><li>Tap the stance button to go standing → kneeling → prone → kneeling → standing. Tap movement for run ↔ off / walk ↔ sneak. Both switches cost 0 AP, even when you have no AP left.</li><li>Hold either button for large direct choices. Keyboard: focus the button and press the down arrow to open choices.</li><li>The eye counts visible opponents. Tap it to inspect each one, starting with nearby, clearly visible contacts. This only moves the camera; RECENTER or the thumbstick returns to your animal.</li><li>Menu holds inventory, weapon changes, reloads and treatment. Find your objective and recent events under Mission & combat log. Collect the ledger through the menu, then return to extraction.</li></ul>',[['Back to menu',operationMenu],['Return to operation',()=>{},'primary']]);}
$('minimap-button').onclick=()=>{showDialog('<p class="eyebrow">MILL 04 / TACTICAL MAP</p><h2>Find your way.</h2><canvas id="large-map" width="760" height="560" style="width:100%;height:auto;border:1px solid #535b46"></canvas><p>Cream: your animal. Orange: the objective and visible guards. Dark areas remain unexplored.</p>',[['Return to operation',()=>{},'primary']]);drawMinimap($('large-map'),state);};
function resetStick(){stick={x:0,y:0};$('stick-knob').style.transform='translate(-50%,-50%)';}
function updateStick(e){const r=$('joystick').getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,limit=r.width*.3,n=Math.hypot(dx,dy),scale=Math.min(1,limit/Math.max(1,n));stick=n<9?{x:0,y:0}:{x:dx*scale/limit,y:dy*scale/limit};$('stick-knob').style.transform=`translate(calc(-50% + ${stick.x*limit}px),calc(-50% + ${stick.y*limit}px))`;view?.center();}
$('joystick').onpointerdown=e=>{if(!state||paused||!Core.canControl(state,hero(state)))return;e.preventDefault();stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);Core.stop(state);selected=null;view.route([]);updateStick(e);};$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)updateStick(e);};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,e=>{if(e.pointerId===stickPointer){stickPointer=null;resetStick();}});
addEventListener('keydown',e=>{if(!active||paused||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(k===' '&&e.target.closest('button'))return;if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)){e.preventDefault();if(k===' '){if(!e.repeat)act(()=>Core.endTurn(state));}else keys.add(k);}if(k==='escape'){$('menu').click();}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>{resetStick();keys.clear();});document.addEventListener('visibilitychange',()=>{resetStick();keys.clear();if(document.hidden)storage.write();lastTime=performance.now();});addEventListener('pagehide',()=>storage.write());
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;if(!active||!view)return;if(!paused&&!document.hidden){let x=stick.x,y=stick.y;if(keys.size){x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);}const n=Math.max(1,Math.hypot(x,y));x/=n;y/=n;if(Math.hypot(x,y)>.1&&view.focusedId!=null)view.center();tick(state,dt,Math.hypot(x,y)>.1?{x:.7682*x+.6402*y,y:-.6402*x+.7682*y}:null);if(state.phase!==lastPhase){resetStick();keys.clear();Core.stop(state);lastPhase=state.phase;contextKey='';}if(now-lastSave>2500){storage.write();lastSave=now;}}view.sync(state,now);if(now-lastUI>100){renderBattle();lastUI=now;}}
renderPrep();requestAnimationFrame(frame);
