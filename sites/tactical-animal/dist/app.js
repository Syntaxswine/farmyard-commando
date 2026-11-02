import {ANIMALS,PRIMARY,SECONDARY,DEFAULT_BUILD,DEFAULT_MISSION_ID,getMission,missionForState,missionMap,objectiveSecured,missionDestination,Core,normalizeBuild,buildStats,createSoloGame,hero,interaction,interact,dressing,tick,encodeSave,decodeSave,distance} from './solo-game.js';
import {OPERATIONS} from './missions.js';
import {prepareColdwell} from './coldwell-runtime.js';
const coldwellTest=new URL(location.href).searchParams.get('coldwellTest'),privateColdwell=['traversal','recon'].includes(coldwellTest);
const MISSIONS=privateColdwell?[...OPERATIONS,getMission('coldwell-traversal')]:OPERATIONS;
import {FieldView,drawMinimap} from './field-view.js';
import {cycleStep,nextCameraFocus,bindPressHold} from './mobile-controls.js';
import {GrenadeAim,screenToGround} from './grenade-controls.js';
import {FlameAim} from './flame-controls.js';
import {weaponArtwork} from './original-art.js';
import {STANCE_ICONS} from './aft/tactics/battle-control-icons.js';
import {selectInteractionTarget} from './interactions.js';
import {aimOptions,availableAim,flashAPShortage,switchSymbol} from './shooting-controls.js';
import {createTargetMonitor} from './targeting-monitor.js';
import {createOperationStorage} from './operation-storage.js';
import {GuardContactTracker,GuardAlertIndicator} from './guard-alert.js';
const $=id=>document.getElementById(id);
let selectedMissionId=DEFAULT_MISSION_ID;
let build={...DEFAULT_BUILD},state=null,view=null,active=false,paused=false,selected=null,aim='hip',zone='torso',burst=false,contextKey='',lastTime=0,lastUI=0,lastSave=0,lastPhase='',stick={x:0,y:0},stickPointer=null,resultShown=false,aimViewport=null;
const grenadeAim=new GrenadeAim();
const flameAim=new FlameAim(),aiming=()=>grenadeAim.active||flameAim.active;
const keys=new Set(),overlay=$('overlay');
const picker=$('control-picker');
const guardContacts=new GuardContactTracker(),guardAlert=new GuardAlertIndicator($('look'),$('guard-alert-status'));
let pickerTrigger=null,stanceDirection=1,movementDirection=-1;
let lastHeldWeapon=null,areaPress=false;
let interactionFocus=null,handTarget=null;
const safe=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const stanceValues=['standing','kneeling','prone'],movementValues=['run','walk','sneak'];
const stanceNames={standing:'Standing',kneeling:'Kneeling',prone:'Prone / crawl'},movementNames={run:'Run',walk:'Off / walk',sneak:'Sneak'};
const movementPoses={walk:'M13 10h6l1 10 7 10h-6l-6-9-3 9H6l5-12-1-4-3 6H2v-4h3l5-6Z',run:'M15 10h6l3 6h5v4h-8l-3-5-2 6 7 6-3 4-9-8-3 8H2l7-15-3 3H2v-4h4l5-5Z',sneak:'M12 14h7l5 5h6v4h-8l-6-5-2 5h10v4l-6 5h-6l6-6h-8l-4 6H1l7-13Z'};
const poseIcon=value=>STANCE_ICONS[value]?.replace('<svg ','<svg class="original-stance" ')||`<svg class="original-stance" viewBox="0 0 32 34" aria-hidden="true"><circle cx="${value==='run'?20:16}" cy="${value==='sneak'?9:5}" r="3"/><path d="${movementPoses[value]}"/></svg>`;
let loadoutChoices=null;
// Resolve the browser's storage getter only inside the handled read/write paths:
// privacy settings can deny access to the property itself during startup.
const operationStorage=createOperationStorage({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)},{normalizeBuild,encodeSave,decodeSave});
const preparationBuilds=Object.fromEntries(MISSIONS.map(mission=>[mission.id,{...DEFAULT_BUILD}]));
try{const preferences=operationStorage.preferences();selectedMissionId=preferences.selectedMissionId;Object.assign(preparationBuilds,preferences.builds);build=normalizeBuild(preparationBuilds[selectedMissionId]);}catch(error){toast('Could not read preparation. You can still choose an operation and play in this tab.');}
function storageWriteFailure(subject,error){const reason=error?.name==='QuotaExceededError'?'Device storage is full.':error?.name==='SecurityError'?'Browser storage is blocked.':'Browser storage could not be written.';toast(`${reason} Could not save ${subject}. Keep this tab open to retain your changes.`);}
const storage={read(){return operationStorage.read(selectedMissionId);},write(){if(!state)return;try{operationStorage.write(state);}catch(error){storageWriteFailure('operation progress',error);}}};
const speciesLabel=s=>s.replaceAll('-',' '),short=k=>Core.WEAPONS[k].short;
function button(parent,label,cls,pressed,onClick){const b=document.createElement('button');b.type='button';b.className=cls;b.innerHTML=label;b.setAttribute('aria-pressed',String(pressed));b.onclick=onClick;parent.append(b);return b;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function renderMissionPreparation(){
  const mission=getMission(selectedMissionId),index=MISSIONS.indexOf(mission)+1;
  document.querySelector('.edition').innerHTML='<i></i> SOLO OPERATIONS / '+String(OPERATIONS.length).padStart(2,'0');
  $('operation-select').innerHTML=MISSIONS.map(m=>`<option value="${m.id}">${safe(m.title)}</option>`).join('');$('operation-select').value=mission.id;
  $('operation-number').textContent='OP. '+String(index).padStart(3,'0');$('mission-location').textContent=mission.location;
  $('mission-heading').textContent=mission.title;$('briefing-text').textContent=mission.briefing;
  $('mission-steps').innerHTML=mission.steps.map((step,i)=>`<li><b>${String(i+1).padStart(2,'0')}</b> ${safe(step)}</li>`).join('');
  $('deploy').setAttribute('aria-label','Deploy solo: '+mission.title);
  const map=missionMap(mission.id),seen=new Set(),bounds=mission.briefingBounds||map.worldBounds||{x:1,y:1,w:map.terrain[0].length-2,h:map.terrain.length-2};
  for(let y=bounds.y;y<bounds.y+bounds.h;y++)for(let x=bounds.x;x<bounds.x+bounds.w;x++)seen.add(Core.key(x,y));
  drawMinimap($('mission-preview'),{...map,worldBounds:bounds,map:map.terrain,seen,detected:new Set(),units:[{id:0,team:'squad',hp:1,...mission.spawn}],solo:{missionId:mission.id,layoutVersion:mission.layoutVersion??1,objectives:{}}});
  $('mission-preview').setAttribute('aria-label',mission.title+' layout. Arrival, objective and extraction.');
}
function renderPrep(){renderMissionPreparation();const p=ANIMALS.find(a=>a.id===build.animal),stats=buildStats(build);$('hero-portrait').src=`aft/assets/characters/armed/${p.species}-rifle.png`;$('hero-portrait').alt=`${p.name}, the ${speciesLabel(p.species)} worker`;$('hero-name').textContent=p.name;$('hero-species').textContent=speciesLabel(p.species);$('hero-role').textContent=p.label;document.querySelector('.portrait-number').textContent=String(ANIMALS.indexOf(p)+1).padStart(2,'0');$('stats').innerHTML=[['HEALTH',stats.maxHp],['ACTION POINTS',stats.maxAp],['PERCEPTION',stats.perception]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('animals').replaceChildren();for(const a of ANIMALS)button($('animals'),`<strong>${speciesLabel(a.species)}</strong><small>${a.name}</small>`,'animal-choice',a.id===build.animal,()=>{build.animal=a.id;renderPrep();});
  if(!loadoutChoices){loadoutChoices=[];
    $('primary').replaceChildren();for(const k of PRIMARY){const w=Core.WEAPONS[k],choice=button($('primary'),`<strong>${w.short}</strong><small>${w.cost} AP / ${w.range} m / ${w.mag} rounds</small>`,'weapon-choice',false,()=>{build.primary=k;renderPrep();});choice.setAttribute('aria-label',w.name);const art=weaponArtwork(k,35);art.classList.add('weapon-paint');choice.append(art);loadoutChoices.push({choice,slot:'primary',kind:k});}
    $('secondary').replaceChildren();for(const k of SECONDARY){const choice=button($('secondary'),`<span>${short(k)}</span><small>${k==='knife'?'MELEE':'8 ROUNDS'}</small>`,'small-choice',false,()=>{build.secondary=k;renderPrep();});const art=weaponArtwork(k,22);art.classList.add('sidearm-paint');choice.prepend(art);loadoutChoices.push({choice,slot:'secondary',kind:k});}
  }
  for(const {choice,slot,kind}of loadoutChoices)choice.setAttribute('aria-pressed',String(build[slot]===kind));
  $('utility').replaceChildren();for(const [k,label,detail] of [['dressing','Field dressing','×2'],['grenade','Frag grenades','×3']])button($('utility'),`<span>${label}</span><small>${detail}</small>`,'small-choice',k===build.utility,()=>{build.utility=k;renderPrep();});
  const skill=['hmg','rpg','flamethrower'].includes(build.primary)?'heavyWeapons':'firearms';$('primary-summary').textContent=`${skill==='firearms'?'FIREARMS':'HEAVY WEAPONS'} ${p.stats[skill]}`;$('equipment-note').textContent=`${Core.WEAPONS[build.primary].name}. ${p.name}'s ${skill==='firearms'?'firearms':'heavy weapons'} skill: ${p.stats[skill]}/100. Movement spends AP by distance, with no tile snapping.`;$('build-summary').textContent=`${p.name} / ${speciesLabel(p.species)} · ${short(build.primary)} + ${short(build.secondary)}`;
  try{
    const text=storage.read(),saved=text?JSON.parse(text):null,mission=getMission(selectedMissionId),previous=saved?.solo.status==='active'&&(saved.solo.layoutVersion??1)!==(mission.layoutVersion??1);
    $('resume').hidden=!saved||saved.solo.status!=='active';$('resume').textContent=previous?'Resume previous checkpoint ↗':'Resume '+mission.title+' ↗';
    if(previous)$('briefing-text').textContent+=' Your save uses the previous checkpoint. Deploy Solo starts the new approach map; Resume keeps your existing progress.';
  }catch(error){$('resume').hidden=true;toast('Could not read saved operations. You can still deploy and play in this tab.');}
  preparationBuilds[selectedMissionId]=normalizeBuild(build);
  try{operationStorage.savePreparation(selectedMissionId,build);}catch(error){storageWriteFailure('preparation changes',error);}
}
function prepareOperation(id){if(!getMission(id).spatialProvider)return null;$('deploy').disabled=true;return prepareColdwell({playable:!privateColdwell}).finally(()=>{$('deploy').disabled=false;});}
let operationRequest=0;
$('operation-select').onchange=()=>{
  const request=++operationRequest;try{const id=getMission($('operation-select').value).id,commit=()=>{if(request!==operationRequest)return;selectedMissionId=id;build=normalizeBuild(preparationBuilds[id]);renderPrep();},pending=prepareOperation(id);if(pending)pending.then(commit,error=>{if(request===operationRequest){renderPrep();toast(error.message);}});else commit();}catch(error){renderPrep();toast(error.message);}
};
$('interaction-icon').append(weaponArtwork('hands',25));
function showDialog(html,actions=[],{context=false,mode='',focusControl}={}){
  if(Core.navigationStatus(state)?.pending)Core.stop(state);
  if(picker.open)closePicker();
  guardAlert.stop();
  cancelAreaAim();
  paused=true;resetStick();keys.clear();$('interaction-hand').hidden=true;
  overlay.dataset.mode=mode;
  $('overlay-content').innerHTML=html;
  $('context').hidden=!context;
  const row=$('overlay-actions');row.replaceChildren();
  for(const [label,fn,cls,disabled=false,id] of actions){
    const b=document.createElement('button');b.textContent=label;b.className=cls||'';b.disabled=disabled;
    if(id)b.id=id;
    b.onclick=()=>{closeDialog();fn();};row.append(b);
  }
  if(!overlay.open)overlay.showModal();
  if(context){contextKey='';renderContext(focusControl);}
}
function closeDialog(){overlay.close();paused=false;lastTime=performance.now();}
function clearTargeting(){if(state?.spatial&&selected?.point)Core.stop(state);selected=null;view?.route([]);contextKey='';}
function exitTargeting(){clearTargeting();closeDialog();renderBattle();}
overlay.addEventListener('cancel',()=>{if(overlay.dataset.mode==='shooting')clearTargeting();paused=false;lastTime=performance.now();renderBattle();});
function grenadeViewport(){
  const element=flameAim.active?$('flame-aim'):$('grenade-aim');if(element.hidden)return aimViewport;
  const r=$('viewport').getBoundingClientRect(),panel=element.getBoundingClientRect(),controls=document.querySelector('.thumb-layout').getBoundingClientRect();
  const top=Math.max($('minimap-button').getBoundingClientRect().bottom,document.querySelector('.hero-strip').getBoundingClientRect().bottom),sidePanel=panel.right<=controls.left;
  const flameLandscape=flameAim.active&&sidePanel;
  const right=flameLandscape?document.querySelector('.right-controls').getBoundingClientRect().left-r.left-12:r.width-16;
  const bottom=flameLandscape?$('joystick').getBoundingClientRect().top:sidePanel?controls.top:panel.top;
  aimViewport={left:sidePanel?panel.right-r.left+12:16,right,top:top-r.top+12,bottom:Math.max(top-r.top+72,bottom-r.top-12)};
  return aimViewport;
}
function start(s,{resume=false}={}){try{
  if(state&&state!==s){storage.write();Core.disposeNavigation(state);}cancelAreaAim();resetStick();keys.clear();if(picker.open)closePicker();
  guardAlert.stop();guardContacts.reset([...(Array.isArray(s.solo.spottedGuardIds)?s.solo.spottedGuardIds:[]),...(resume?Core.visibleOpponents(s).map(guard=>guard.id):[])]);s.solo.spottedGuardIds=guardContacts.ids();
  view?.dispose();$('loading').textContent='Preparing the field…';$('loading').hidden=false;state=s;selectedMissionId=s.solo.missionId;build=normalizeBuild(s.solo.build);if(!resume||!s.spatial)Core.stop(s);delete s.effect;
  selected=null;interactionFocus=null;handTarget=null;grenadeAim.cancel();flameAim.cancel();lastHeldWeapon=hero(s).weapon;areaPress=false;aimViewport=null;contextKey='';resultShown=false;stanceDirection=1;movementDirection=-1;aim='hip';zone='torso';burst=false;
  $('prep').hidden=true;$('battle').hidden=false;document.body.classList.add('in-battle');active=true;paused=false;
  $('floor-controls').hidden=!s.spatial;view=new FieldView($('viewport'),{floorContainer:$('floor-controls'),onFloorChange:()=>{cancelAreaAim();resetStick();keys.clear();},onPick:pick,getAimViewport:grenadeViewport,onLoading:busy=>{$('loading').hidden=!busy;},onError:message=>{$('loading').hidden=false;$('loading').textContent='Animal artwork could not load. '+message;}});
  view.setGame(state);lastPhase=state.phase;lastTime=performance.now();lastUI=0;lastSave=lastTime;renderBattle();storage.write();
}catch(error){active=false;view?.dispose();view=null;$('prep').hidden=false;$('battle').hidden=true;document.body.classList.remove('in-battle');toast('Cannot start 3D view: '+error.message);}}
function backToPrep(){cancelAreaAim();resetStick();keys.clear();Core.stop(state);Core.disposeNavigation(state);storage.write();guardAlert.stop();active=false;view?.dispose();view=null;$('battle').hidden=true;$('prep').hidden=false;document.body.classList.remove('in-battle');renderPrep();}
$('deploy').onclick=()=>{const id=selectedMissionId,chosen={...build},deploy=()=>start(createSoloGame(chosen,1947,id));try{const pending=prepareOperation(id);if(pending)pending.then(deploy,error=>toast(error.message));else deploy();}catch(error){toast(error.message);}};$('resume').onclick=()=>{const id=selectedMissionId,resume=()=>{try{const s=operationStorage.load(id);if(s.solo.status!=='active'){toast('That operation has ended. Deploy a new animal to begin again.');return;}start(s,{resume:true});}catch(error){toast('Could not resume: '+error.message);}};try{const pending=prepareOperation(id);if(pending)pending.then(resume,error=>toast(error.message));else resume();}catch(error){toast('Could not resume: '+error.message);}};
function positionInteractionHand(){
  const button=$('interaction-hand');
  if(!handTarget||!active||paused||aiming()||!Core.canControl(state,hero(state))||!$('loading').hidden){button.hidden=true;return;}
  const anchor=view.interactionAnchor(handTarget);button.hidden=!anchor.visible;
  if(anchor.visible){button.style.left=anchor.x+'px';button.style.top=anchor.y+'px';}
}
function renderInteractionHand(){
  if(!state)return;
  handTarget=selectInteractionTarget(Core.nearbyInteractions(state),interactionFocus);interactionFocus=handTarget?.id||null;
  if(handTarget){
    const action=handTarget.actions[0],button=$('interaction-hand');
    $('interaction-label').textContent=action.label;$('interaction-cost').textContent=action.cost+' AP';
    button.setAttribute('aria-label',`${action.label} ${handTarget.name} · ${action.cost} AP. Hold for choices.`);
    button.title=action.reason||handTarget.name+' · tap to '+action.label.toLowerCase()+', hold for choices';button.classList.toggle('unaffordable',!action.ok);
  }
  positionInteractionHand();
}
function focusInteraction(id){
  if(!Core.nearbyInteractions(state).some(object=>object.id===id)){toast('Move within clear reach of the object.');return;}
  resetStick();keys.clear();Core.stop(state);selected=null;view.route([]);interactionFocus=id;renderBattle();
}
function useInteraction(id,action,itemId=null){
  if(!state||paused||aiming())return;
  resetStick();keys.clear();const result=Core.performInteraction(state,id,action,itemId);
  if(!result.ok){toast(result.reason);renderBattle();return;}
  selected=null;view.route([]);contextKey='';renderBattle();storage.write();
  if(result.loot)lootWindow(id);
  else if(result.message)showDialog(`<p class="eyebrow">FIELD NOTES</p><h2>${safe(result.name)}</h2><p>${safe(result.message)}</p>`,[['Return to operation',()=>{},'primary'],['Mission & combat log',mission]]);
}
function interactionChoices(){
  const object=Core.nearbyInteractions(state).find(object=>object.id===interactionFocus);if(!object)return;
  const others=Core.nearbyInteractions(state).filter(other=>other.id!==object.id);
  showDialog(`<p class="eyebrow">WITHIN REACH</p><h2>${safe(object.name)}</h2><p>Choose an action. Opening these choices costs 0 AP.</p>`,[
    ...object.actions.map(action=>[`${action.label} · ${action.cost} AP`,()=>useInteraction(object.id,action.id),'',!action.ok]),
    ...others.map(other=>[`Focus ${other.name}`,()=>focusInteraction(other.id)]),
    ['Return to operation',()=>{}],
  ]);
}
function itemLabel(item){
  if(item.type==='ammo')return `${Core.WEAPONS[item.kind].short} ammunition ×${item.quantity}`;
  if(item.type==='dressing')return `Field dressing ×${item.quantity}`;
  if(item.type==='grenade')return `Frag grenade ×${item.quantity}`;
  if(item.type==='mission')return item.name;
  return `${Core.WEAPONS[item.kind].name} · ${item.rounds} loaded`;
}
function lootWindow(id){
  const check=Core.previewInteraction(state,id,'loot'),object=check.object;if(!check.ok){toast(check.reason);return;}
  const all=Core.previewInteraction(state,id,'take-all');
  showDialog(`<p class="eyebrow">${object.kind==='body'?'BODY':'CHEST'} / LOOT</p><h2>${safe(object.name)}</h2><p>${object.inventory.length?'Take an item or collect everything.':'No items remain.'}</p><p class="loot-note">Transfers cost ${Core.combatCosts(state)?1:0} AP. Duplicate weapons contribute their loaded ammunition. Opening this window is free.</p>`,[
    ['Take all · '+all.cost+' AP',()=>useInteraction(id,'take-all'),'primary',!all.ok,'take-all'],
    ...object.inventory.map(item=>{const action=Core.previewInteraction(state,id,'take',item.id);return [`Take ${itemLabel(item)} · ${action.cost} AP`,()=>useInteraction(id,'take',item.id),'',!action.ok];}),
    ...(object.kind==='chest'?[[`Close chest · ${Core.previewInteraction(state,id,'close').cost} AP`,()=>useInteraction(id,'close'),'',!Core.previewInteraction(state,id,'close').ok]]:[]),
    ['Return to operation',()=>{}],
  ]);
}
bindPressHold($('interaction-hand'),{
  canUse:()=>!!handTarget&&!paused&&!aiming()&&Core.canControl(state,hero(state)),
  press:()=>{resetStick();keys.clear();Core.stop(state);},
  tap:()=>{if(handTarget)useInteraction(handTarget.id,handTarget.actions[0].id);},hold:interactionChoices,
});
function act(fn){if(!state||paused)return;view?.unlockSound?.();resetStick();keys.clear();fn();contextKey='';renderBattle();storage.write();}
function triggerReloadStatus(u){
  const w=Core.WEAPONS[u.weapon],empty=!!w.mag&&!w.thrown&&!(u.ammo[u.weapon]>0),cost=Core.combatCosts(state)?3:0,reserve=u.ammoPouch?.[u.weapon]||0,can=Core.canControl(state,u);
  const apShort=can&&reserve>0&&u.ap+1e-7<cost;
  const reason=!can?'Wait for your turn':!reserve?'No spare ammunition':apShort?'Not enough AP':'';
  return {empty,cost,reserve,apShort,ok:empty&&!reason,reason};
}
function reloadFromTrigger({targeting=false}={}){
  if(!state||paused&&!targeting)return false;
  if(!Core.reload(state,hero(state))){contextKey='';renderBattle();return false;}
  cancelAreaAim();resetStick();keys.clear();contextKey='';
  if(targeting)shootingMenu('fire');
  renderBattle();storage.write();return true;
}
function planSpatialMove(point){
  const current=state,currentView=view;selected=null;contextKey='';view.route([]);
  const pending=Core.requestNavigationPath(current,hero(current),point);renderBattle();
  pending.then(path=>{
    if(state!==current||view!==currentView||!active||paused)return;
    if(!path?.length){toast('No clear route to that point.');renderBattle();return;}
    view.route([hero(state),...path]);
    if(state.phase==='player'){selected={point,path};operationMenu();}
    else if(Core.acceptNavigationPath(state,hero(state),path)){selected=null;view.center();}
    contextKey='';renderBattle();
  },error=>{if(state!==current||!active)return;if(error.name!=='AbortError')toast(error.message);contextKey='';renderBattle();});
}
$('cancel-route').onclick=()=>{Core.stop(state);view?.route([]);renderBattle();};
addEventListener('pagehide',()=>Core.disposeNavigation(state));
function pick(p){if(!state||paused||aiming()||state.phase==='enemy'||state.solo.status!=='active')return;resetStick();if(p.interactionId){focusInteraction(p.interactionId);return;}if(p.unitId!==undefined){if(p.unitId===0){operationMenu();return;}const target=state.units.find(u=>u.id===p.unitId);if(target?.hp<=0){focusInteraction('body:'+target.id);return;}if(!state.detected.has(target?.id))return;if(hero(state).weapon==='flamethrower'){armFlame(Core.headingTo(hero(state),target));return;}Core.stop(state);Core.turnTo(state,hero(state),Core.headingTo(hero(state),target));selected={targetId:target.id};burst=false;aim=availableAim(Core.WEAPONS[hero(state).weapon],hero(state).ap);zone='torso';}
  else if(p.windowId){const u=hero(state);Core.stop(state);if(u.weapon==='flamethrower'){armFlame(Core.headingTo(u,p));return;}const target={...p,name:p.paneId?'Glass pane':'Window frame'},single=Core.previewPointAttack(state,u,target),burst=Core.previewPointAttack(state,u,target,true);showDialog(`<p class="eyebrow">WINDOW</p><h2>${safe(target.name)}</h2><p>Glass stops the first shot. Later shots pass through the opening. Frames and lower walls remain solid.</p>`,[[`Fire · ${single.cost} AP`,()=>act(()=>Core.attack(state,u,target)),'primary',!single.ok],...(Core.WEAPONS[u.weapon].burstRounds?[[`Burst · ${burst.cost} AP`,()=>act(()=>Core.attack(state,u,target,true)),'',!burst.ok]]:[]),['Return to operation',()=>{}]]);return;}
  else if(state.spatial){planSpatialMove(p);return;}
  else{const path=Core.navigationPath(state,hero(state),p.x,p.y,p);if(!path){toast('No clear route to that point.');return;}view.route([hero(state),...path]);if(state.phase==='player')selected={point:p,path};else{Core.move(state,hero(state),p.x,p.y,p);selected=null;view.center();}}
  contextKey='';renderBattle();if(selected)selected.targetId!==undefined?shootingMenu():operationMenu();
}
function shootingMenu(focusControl='zone-'+zone){
  const u=hero(state),w=Core.WEAPONS[u.weapon];
  showDialog(`<p class="eyebrow">TARGET CONTROL / PAUSED</p><h2>${safe(w.short)}</h2><p class="shooting-resources">${u.ap.toFixed(1)} AP${w.mag?` · ${u.ammo[u.weapon]??0} ROUNDS`:''}</p>`,[],{context:true,mode:'shooting',focusControl});
}
function renderContext(focusControl){if(!state)return;const u=hero(state),near=interaction(state),target=selected?.targetId!==undefined?state.units.find(v=>v.id===selected.targetId):null;
  if(target&&(!Core.alive(target)||!state.detected.has(target.id)))selected=null;
  if(target&&selected)aim=availableAim(Core.WEAPONS[u.weapon],u.ap,burst,aim);
  const p=target&&selected&&u.weapon!=='flamethrower'?Core.previewAttack(state,u,target,burst,zone,null,aim):null;
  const reload=triggerReloadStatus(u);
  const sig=JSON.stringify([selected,near,aim,zone,burst,p,reload,u.ap.toFixed(2),u.weapon,u.ammo[u.weapon],u.burningTurns,state.phase,[...state.detected],Math.round(u.x*10),Math.round(u.y*10),target?.hp,target?.species,target?.stance,target?.weapon]);if(sig===contextKey)return;contextKey=sig;const root=$('context');root.replaceChildren();root.classList.toggle('shooting-panel',!!p);
  if(state.phase==='enemy')return;
  function content(title,detail,label,fn,disabled=false){const copy=document.createElement('div');copy.className='context-copy';const h=document.createElement('strong');h.textContent=title;const small=document.createElement('small');small.textContent=detail;copy.append(h,small);root.append(copy);const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{closeDialog();act(fn);};root.append(b);return copy;}
  if(u.burningTurns){content('On fire',`${u.burningTurns} panic turns before burning to ash. Panic advances automatically.`,'Continue panic',()=>Core.endTurn(state));}
  else if(u.weapon==='flamethrower'&&!selected?.point){const flame=Core.previewFlame(state,u,u.heading);content('Flamethrower cone',`${flame.range} m · ${flame.spread}° spread · ${flame.cost} AP${flame.reason?' · '+flame.reason:''}`,'Aim cone',()=>armFlame(),!flame.ok);}
  else if(p){
    const w=Core.WEAPONS[u.weapon],choices=aimOptions(w,u.ap,burst),chosen=choices.find(option=>option.id===aim);
    const monitor=createTargetMonitor(state,target,p,zone);if(monitor)root.append(monitor);
    let restoreFocus;
    function hardware(parent,{control,label,paint,icon,mark,pressed,disabled=false,apShort=false,red=false,amber=false,bar=false,lit,onClick,rerender=true}){
      const b=document.createElement('button');b.type='button';b.className='industrial-switch shooting-switch'+(bar?' fire-bar':'');b.dataset.control=control;
      const description=label+(apShort?' Not enough AP.':'');
      b.setAttribute('aria-label',description);if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));
      if(disabled||apShort)b.setAttribute('aria-disabled','true');
      if(red||amber)b.dataset.face=red?'red':'amber';if(lit!==undefined)b.dataset.lit=String(lit);
      // AP-blocked switches accept input solely to acknowledge the failed attempt.
      b.disabled=disabled&&!apShort;b.title=description;
      b.innerHTML=`<span class="switch-legend" aria-hidden="true"><span class="switch-icon"><svg class="switch-glyph" viewBox="0 0 32 32"><use href="${switchSymbol(icon)}"/></svg></span><span class="switch-label">${paint}</span><span class="switch-cost">${mark}</span></span>`;
      b.onclick=()=>{if(apShort){flashAPShortage(b);return;}if(disabled)return;onClick();if(rerender){contextKey='';renderContext(control);}};parent.append(b);if(control===focusControl)restoreFocus=b;return b;
    }
    function bank(label,cls,parent=root){
      const group=document.createElement('fieldset');group.className='shooting-group '+cls;
      const title=document.createElement('legend');title.textContent=label;
      const row=document.createElement('div');row.className='shooting-bank';group.append(title,row);parent.append(group);return row;
    }
    const columns=document.createElement('div');columns.className='shooting-columns';root.append(columns);
    const zones=bank('BODY LOCATION','zone-bank',columns);
    for(const value of ['torso','head','weapon','legs']){
      const preview=Core.previewAttack(state,u,target,burst,value,null,aim),label=Core.AIM_ZONES[value].label;
      hardware(zones,{control:'zone-'+value,label:`Target ${label.toLowerCase()}. ${preview.chance}% hit chance.`,paint:label.toUpperCase(),icon:'target-'+value,mark:`${preview.chance}% HIT`,pressed:zone===value,amber:true,onClick:()=>zone=value});
    }
    const aiming=bank('AIM LEVEL','aim-bank',columns);
    for(const option of choices)hardware(aiming,{
      control:'aim-'+option.id,label:`${option.label}. ${option.cost} AP. +${option.accuracy} accuracy.`,
      paint:{hip:'QUICK SHOT',aimed:'AIMED',full:'FULL AIM'}[option.id],icon:'aim-'+option.id,mark:`${option.cost} AP`,pressed:aim===option.id,disabled:!option.available,apShort:!option.available,amber:true,onClick:()=>aim=option.id
    });
    const ready=reload.empty?reload.ok:p.ok&&Core.canControl(state,u)&&chosen.available;
    const fire=hardware(root,{control:'fire',label:reload.empty?`Reload ${w.short}. ${reload.cost} AP. ${reload.reserve} spare rounds.`:`${burst?'Fire burst':'Fire'}. ${p.chance}% hit chance. ${p.cost} AP.`,paint:reload.empty?'RELOAD':'FIRE',icon:reload.empty?'reload':'fire',mark:`${reload.empty?reload.cost:p.cost} AP`,bar:true,red:true,lit:false,disabled:!ready,apShort:reload.empty?reload.apShort:!chosen.available,rerender:false,onClick:()=>{
      if(reload.empty){reloadFromTrigger({targeting:true});return;}
      closeDialog();act(()=>Core.attack(state,u,target,burst,false,zone,false,aim));
      if(triggerReloadStatus(u).empty&&selected?.targetId===target.id&&Core.alive(target)&&state.detected.has(target.id)&&Core.canControl(state,u))shootingMenu('fire');
    }});
    fire.dataset.ready=String(ready);fire.dataset.action=reload.empty?'reload':'fire';
    const fireRow=bank('FIRE MODE / EXIT','trigger-bank');fireRow.dataset.burst=String(!!w.burstRounds);
    for(const firingBurst of w.burstRounds?[false,true]:[false]){
      const mode=firingBurst?'Burst':'Single',modeAim=availableAim(w,u.ap,firingBurst,aim),choice=aimOptions(w,u.ap,firingBurst).find(option=>option.id===modeAim);
      hardware(fireRow,{control:firingBurst?'burst':'single',label:`${mode} fire. ${firingBurst?w.burstRounds:1} round${firingBurst?'s':''}.`,paint:mode.toUpperCase(),icon:firingBurst?'fire-burst':'fire-single',mark:`${choice.cost} AP`,pressed:burst===firingBurst,apShort:!choice.available,onClick:()=>burst=firingBurst});
    }
    hardware(fireRow,{control:'exit',label:'Exit targeting without firing.',paint:'EXIT',icon:'exit',mark:'',rerender:false,onClick:exitTargeting});
    const warning=reload.empty?reload.reason:p.reason||(!chosen.available?'Not enough AP':'');
    if(warning||w.blast){const note=document.createElement('p');note.className='shooting-warning';note.setAttribute('role','status');note.textContent=[warning,w.blast?'BLAST CAN HURT YOU':''].filter(Boolean).join(' · ');root.append(note);}
    restoreFocus?.focus?.({preventScroll:true});
  }else if(selected?.point){const path=state.spatial?selected.path:Core.navigationPath(state,u,selected.point.x,selected.point.y,selected.point),cost=path?.reduce((n,p)=>n+p.cost,0)||0,d=cost/Core.movementRate(u);content('Move to this point',`${d.toFixed(1)} m · ${cost.toFixed(1)} AP${cost>u.ap?' · stops when AP runs out':''}`,'Move',()=>{if(state.spatial){if(!Core.acceptNavigationPath(state,u,path)){const point=selected.point;selected=null;planSpatialMove(point);return;}}else Core.move(state,u,selected.point.x,selected.point.y,selected.point);selected=null;view.center();},!path||u.ap<.01);
  }else if(near){const mission=missionForState(state);content(near.label,near.kind==='extract'?mission.extraction.name:`${near.cost} AP · ${mission.objective.after}`,near.kind==='extract'?'Extract ↗':'Collect',()=>interact(state),!near.ok);}
  else if(state.detected.size){const guard=[...state.detected].map(id=>state.units.find(v=>v.id===id)).sort((a,b)=>distance(u,a)-distance(u,b))[0];content('Visible contact',`${guard.name} · ${distance(u,guard).toFixed(1)} m`,'Target',()=>pick({unitId:guard.id}));}
  if(selected&&!p){const cancel=document.createElement('button');cancel.className='cancel-context';cancel.textContent='×';cancel.setAttribute('aria-label','Cancel selection');cancel.onclick=()=>{clearTargeting();renderContext();};root.append(cancel);}
}
function renderBattle(){if(!state)return;const u=hero(state),combat=state.phase==='player'||state.phase==='enemy',can=Core.canControl(state,u);
  $('route-planning').hidden=!Core.navigationStatus(state)?.pending;
  $('battle-name').textContent=u.name;$('battle-species').textContent=speciesLabel(u.species);
  $('hp-label').textContent=`${Math.ceil(u.hp)} / ${u.maxHp} HP`;$('hp-bar').style.width=`${u.hp/u.maxHp*100}%`;
  $('ap').textContent=combat?Math.max(0,u.ap).toFixed(1):'∞';$('ap-label').textContent=combat?'AP':'FREE MOVE';
  $('end-turn').disabled=state.phase!=='player'||aiming();
  $('end-turn').dataset.lit=String(combat);
  $('end-turn').setAttribute('aria-description',combat?'Combat light on':'Combat light off');
  $('end-turn').setAttribute('aria-label',state.phase==='enemy'?'Guards are acting':'End turn');
  $('turn-label').innerHTML=state.phase==='enemy'?'GUARD<br>TURN':'END<br>TURN';
  $('joystick').classList.toggle('unavailable',!can);
  renderGrenadeControls();renderFlameControls();
  const mode=Core.movementModeOf(u);
  renderCycle('movement',mode,mode==='walk'?'OFF':mode.toUpperCase(),movementNames[mode],can&&!aiming());
  renderCycle('stance',u.stance,{standing:'STAND',kneeling:'KNEEL',prone:'CRAWL'}[u.stance],stanceNames[u.stance],can&&!aiming());
  const contacts=Core.visibleOpponents(state),focused=contacts.find(g=>g.id===view?.focusedId);
  const nextFocus=nextCameraFocus(contacts,view?.focusedId);
  $('visible-count').textContent=contacts.length;$('look').disabled=state.solo.status!=='active'||aiming();
  $('look').dataset.lit=String(contacts.length>0);
  $('look').classList.toggle('inspecting',!!focused);
  const viewing=focused?'Viewing '+focused.name:view?.follow?'Viewing your animal':'Camera panned';
  const nextAction=nextFocus?'View '+nextFocus.name:'Recenter on your animal';
  $('look').setAttribute('aria-label',`${contacts.length} visible opponent${contacts.length===1?'':'s'}. ${viewing}. Next: ${nextAction}.`);
  $('look').title=`${nextAction} · opponents, then your animal`;
  drawMinimap($('minimap'),state,{floorId:view?.floorController?.state.selectedId});renderContext();renderInteractionHand();
  if(state.solo.status!=='active'&&!resultShown){resultShown=true;storage.write();const win=state.solo.status==='extracted',mission=missionForState(state);showDialog(`<p class="eyebrow">${safe(mission.title)} / OPERATION ${win?'COMPLETE':'LOST'}</p><h2>${win?mission.result.title:'One worker down.'}</h2><p>${win?`${u.name} ${mission.result.summary} ${Math.round(state.solo.distance)} metres travelled; ${state.round} combat rounds.`:'The factory kept its secrets this time. Try another animal, another loadout, or a quieter route.'}</p>${win?`<p>${mission.result.epilogue}</p>`:''}`,[['Choose your next operation',backToPrep,'primary'],['Replay this loadout',()=>start(createSoloGame(state.solo.build,1947,state.solo.missionId))]]);}
}
$('end-turn').onclick=()=>act(()=>{selected=null;cancelAreaAim();Core.endTurn(state);});
function renderGrenadeControls(){
  const u=hero(state),armed=grenadeAim.active,point=grenadeAim.point,p=armed&&point?Core.previewGrenade(state,u,point):null;
  const count=u.ammo.grenade||0,cost=Core.grenadeCost(u);
  $('grenade-aim').hidden=!armed;$('battle').classList.toggle('aiming-grenade',armed);
  $('stick-caption').textContent=armed?'AIM':'MOVE';
  $('joystick').setAttribute('aria-label',armed?'Grenade aim thumbstick. Direction aims; full displacement reaches maximum range. Release to hold your aim. Keyboard: W A S D or arrows, Enter to throw, Escape to cancel.':'Movement thumbstick. Drag from the center to move. Keyboard: W A S D or arrow keys.');
  $('viewport').setAttribute('aria-label',armed?'Grenade preview. Aim with the joystick, release to hold, then press Throw. Cancel leaves resources unchanged.':'Tactical map. Tap ground to move. Drag to look around. Tap a visible guard to target.');
  if(!armed){renderAreaButton();return;}
  const detail=point?`${p.distance.toFixed(1)} / ${Core.WEAPONS.grenade.range} m · ${p.blast} m blast · ${cost} AP · ${count} left`:`Move the joystick to aim · ${cost} AP · ${count} left`;
  if($('grenade-detail').textContent!==detail)$('grenade-detail').textContent=detail;
  const warning=[p?.reason,p?.selfDanger?'Your animal is exposed to the blast.':''].filter(Boolean).join('. ');
  $('grenade-warning').hidden=!warning;$('grenade-warning').textContent=warning;
  renderAreaButton();
}
function updateGrenadePreview(){
  if(!grenadeAim.active)return;
  if(grenadeAim.point)view.previewGrenade(grenadeAim.point,Core.previewGrenade(state,hero(state),grenadeAim.point));
  renderGrenadeControls();
}
function cancelGrenade(){
  if(!grenadeAim.active)return;
  grenadeAim.cancel();resetStick();keys.clear();view?.endGrenadeAim();clearAreaReadiness();$('toast').hidden=true;
}
function armGrenade(){
  if(!state||paused||grenadeAim.active||!Core.canControl(state,hero(state)))return;
  const u=hero(state);if(!(u.ammo.grenade>0)||u.ap+1e-7<Core.grenadeCost(u))return;
  cancelFlame();
  state.solo.areaWeapon='grenade';lastHeldWeapon=u.weapon;
  resetStick();keys.clear();Core.stop(state);selected=null;grenadeAim.start();view.beginGrenadeAim();$('toast').hidden=true;renderBattle();
}
function commitGrenade(){
  if(!state||paused||!grenadeAim.active||!grenadeAim.point||stickPointer!==null||keys.size)return;
  const u=hero(state),landing={...grenadeAim.point},p=Core.previewGrenade(state,u,landing);
  if(!p.ok){updateGrenadePreview();return;}
  if(!Core.throwGrenade(state,u,landing))return;
  grenadeAim.cancel();resetStick();keys.clear();view.endGrenadeAim({linger:800});contextKey='';renderBattle();storage.write();
}
$('cancel-grenade').onclick=()=>{cancelGrenade();renderBattle();};
function renderFlameControls(){
  const u=hero(state),armed=flameAim.active,count=u.ammo.flamethrower||0,p=armed?Core.previewFlame(state,u,flameAim.heading):null;
  $('flame-aim').hidden=!armed;$('battle').classList.toggle('aiming-flame',armed);
  if(!armed){renderAreaButton();return;}
  $('stick-caption').textContent='AIM';
  $('joystick').setAttribute('aria-label','Flamethrower aim thumbstick. Direction rotates the full 10 metre cone. Release to hold aim. Enter fires; Escape cancels.');
  $('viewport').setAttribute('aria-label','Flamethrower cone preview. Aim with the joystick, release to hold, then press Fire. Walls and fog clip the highlighted area.');
  const opponents=p.contacts.filter(contact=>contact.team!==u.team).length;
  $('flame-detail').textContent=`${p.range} m · ${p.spread}° cone · ${p.cost} AP · ${count} fuel · ${opponents} visible opponent${opponents===1?'':'s'} in cone`;
  const warning=[p.reason,p.contacts.some(contact=>contact.team===u.team)?'A friendly animal is in the cone.':''].filter(Boolean).join('. ');
  $('flame-warning').hidden=!warning;$('flame-warning').textContent=warning;view.previewFlame(flameAim.heading,p);
  renderAreaButton();
}
function cancelFlame(){
  if(!flameAim.active)return;
  flameAim.cancel();resetStick();keys.clear();view?.endFlameAim();clearAreaReadiness();$('toast').hidden=true;
}
function cancelAreaAim(){cancelGrenade();cancelFlame();clearAreaReadiness();}
function armFlame(heading){
  if(!state||paused||flameAim.active)return;
  const u=hero(state),direction=Number.isFinite(heading)?heading:u.heading;
  if(u.weapon==='flamethrower'&&triggerReloadStatus(u).empty&&Core.canControl(state,u)){cancelGrenade();state.solo.areaWeapon='flamethrower';lastHeldWeapon=u.weapon;renderBattle();return;}
  if(!Core.previewFlame(state,u,direction).ok)return;
  cancelGrenade();resetStick();keys.clear();Core.stop(state);selected=null;state.solo.areaWeapon='flamethrower';lastHeldWeapon=u.weapon;flameAim.start(direction);view.beginFlameAim();$('toast').hidden=true;renderBattle();
}
function commitFlame(){
  if(!state||paused||!flameAim.active||stickPointer!==null||keys.size)return;
  if(!Core.fireFlame(state,hero(state),flameAim.heading)){renderFlameControls();return;}
  flameAim.cancel();resetStick();keys.clear();view.endFlameAim({linger:1500});contextKey='';renderBattle();storage.write();
}
$('cancel-flame').onclick=()=>{cancelFlame();renderBattle();};
const areaNames={grenade:'Grenade',flamethrower:'Flamethrower'};
const areaIcons={grenade:'<svg class="switch-glyph" viewBox="0 0 32 32"><use href="assets/ui/industrial-switches/symbols.svg#grenade"/></svg>',flamethrower:'<svg class="switch-glyph" viewBox="0 0 32 32"><path d="M16 28 4 6Q16 0 28 6Z"/></svg>'};
function areaWeapon(){
  const u=hero(state);
  if(lastHeldWeapon!==u.weapon){state.solo.areaWeapon=u.weapon==='flamethrower'?'flamethrower':'grenade';lastHeldWeapon=u.weapon;}
  if(!Object.hasOwn(areaNames,state.solo.areaWeapon)||state.solo.areaWeapon==='flamethrower'&&u.weapon!=='flamethrower')state.solo.areaWeapon=u.weapon==='flamethrower'?'flamethrower':'grenade';
  return state.solo.areaWeapon;
}
function clearAreaReadiness(){const b=$('grenade');b.dataset.ready='false';b.dataset.lit='false';}
function renderAreaButton(){
  if(!state)return;
  const u=hero(state),kind=areaWeapon(),flame=kind==='flamethrower',armed=flame?flameAim.active:grenadeAim.active;
  const count=u.ammo[kind]||0,cost=flame?6:Core.grenadeCost(u),can=Core.canControl(state,u),adjusting=stickPointer!==null||keys.size>0||areaPress;
  const p=flame?Core.previewFlame(state,u,armed?flameAim.heading:u.heading):armed&&grenadeAim.point?Core.previewGrenade(state,u,grenadeAim.point):null;
  const reload=flame?triggerReloadStatus(u):null,reloading=!!reload?.empty;
  const ready=!!((reloading?reload.ok:armed&&p?.ok)&&!adjusting&&!paused&&!document.hidden&&can&&$('loading').hidden),b=$('grenade');
  // An unavailable shot must not prevent holding this shared control to switch.
  b.disabled=!can||!$('loading').hidden;b.dataset.ready=String(ready);b.dataset.lit=String(ready);b.setAttribute('aria-pressed',String(armed));
  const icon=reloading?'reload':kind;b.dataset.kind=kind;b.dataset.action=reloading?'reload':armed?'fire':'aim';
  if(b.dataset.icon!==icon){b.dataset.icon=icon;$('area-icon').innerHTML=reloading?`<svg class="switch-glyph" viewBox="0 0 32 32"><use href="${switchSymbol('reload')}"/></svg>`:areaIcons[kind];}
  const action=reloading?'Reload':armed?(flame?'Fire':'Throw'):'Aim';
  $('grenade-count').textContent=count;$('grenade-cost').textContent=`${reloading?reload.cost:cost} AP`;$('grenade-label').textContent=reloading?'RELOAD':armed?action.toUpperCase():flame?'CONE':'GRENADE';
  b.setAttribute('aria-label',reloading?`Reload flamethrower. ${reload.cost} AP. ${reload.reserve} spare fuel charges. Hold to switch weapon.`:`${action} ${flame?'flamethrower cone':'grenade'}. ${count} ${flame?'fuel':'grenades'} remaining. ${cost} AP. Hold to switch weapon.`);
  const reason=reloading?reload.reason:p?.reason||(!count?`No ${flame?'fuel':'grenades'} remaining`:u.ap+1e-7<cost?'Not enough AP':armed&&!p?'Choose a landing point with the joystick':armed&&adjusting?'Release the aim controls, then confirm':'');
  b.title=(ready?`Ready to ${action.toLowerCase()}`:reason||`Aim ${areaNames[kind].toLowerCase()}`)+' · hold to switch grenade / flamethrower';
  b.setAttribute('aria-description',(ready?`Ready to ${reloading?'reload':'fire'}. Yellow light pulses. `:reason?reason+'. ':'')+'Hold for weapon choices, or press Arrow Down.');
}
function areaChoice(kind){
  const u=hero(state),carried=u.weapon===kind||u.pack.some(item=>item.kind===kind)||(u.ammo[kind]||0)>0,cost=kind==='flamethrower'&&u.weapon!==kind?weaponSwapCost(u,kind):0;
  const reason=!carried?'Not carried':!Core.canControl(state,u)?'Wait for your turn':u.ap+1e-7<cost?'Not enough AP to equip':'';
  return {kind,cost,reason,ok:!reason};
}
function selectAreaWeapon(kind){
  const choice=areaChoice(kind);if(!choice.ok){toast(choice.reason);return false;}
  cancelAreaAim();resetStick();keys.clear();Core.stop(state);const u=hero(state);
  if(kind==='flamethrower'&&u.weapon!==kind&&!Core.equip(state,u,kind))return false;
  state.solo.areaWeapon=kind;lastHeldWeapon=u.weapon;selected=null;contextKey='';renderBattle();storage.write();return true;
}
function openAreaPicker(){
  if(!state||paused||!Core.canControl(state,hero(state)))return;
  guardAlert.stop();cancelAreaAim();resetStick();keys.clear();Core.stop(state);paused=true;
  pickerTrigger=$('grenade');pickerTrigger.setAttribute('aria-expanded','true');
  $('control-picker-title').textContent='AREA WEAPON';$('control-picker-cost').textContent='CHOOSE YOUR WEAPON';$('control-picker-hint').textContent='Select a weapon, then tap its button to aim.';
  const row=$('control-choices');row.replaceChildren();row.classList.add('area-choices');const current=areaWeapon(),u=hero(state);
  for(const kind of ['grenade','flamethrower']){
    const choice=areaChoice(kind),detail=choice.reason||`${u.ammo[kind]||0} ${kind==='grenade'?'grenades':'fuel'} · ${choice.cost?choice.cost+' AP to equip':'0 AP to select'}`;
    const b=button(row,`${areaIcons[kind]}<span>${areaNames[kind]}</span><small>${detail}</small>`,'',kind===current,()=>{closePicker();selectAreaWeapon(kind);});b.disabled=!choice.ok;b.setAttribute('aria-label',`${areaNames[kind]} · ${detail}`);if(kind===current)b.autofocus=true;
  }
  const bottom=innerHeight-pickerTrigger.getBoundingClientRect().top+10;picker.style.bottom=`${Math.max(12,Math.min(bottom,innerHeight-220))}px`;picker.showModal();
}
bindPressHold($('grenade'),{
  canUse:()=>!!state&&!paused&&$('loading').hidden&&Core.canControl(state,hero(state)),
  press:()=>{areaPress=true;clearAreaReadiness();},
  tap:()=>{if(areaWeapon()==='flamethrower'){
    const reload=triggerReloadStatus(hero(state));
    if(reload.empty){if(reload.apShort)flashAPShortage($('grenade'));else if(!reload.ok)toast(reload.reason);else reloadFromTrigger();}
    else if(flameAim.active)commitFlame();else armFlame();
  }else if(grenadeAim.active)commitGrenade();else armGrenade();},
  hold:openAreaPicker,
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('grenade').addEventListener(type,()=>{areaPress=false;renderAreaButton();});
function renderCycle(kind,value,label,name,can){
  const b=$(kind+'-cycle');b.disabled=!can;b.setAttribute('aria-label',`${kind==='stance'?'Stance':'Movement'}: ${name.toLowerCase()}. Tap to cycle; hold for choices.`);
  b.dataset.lit=String(kind==='stance'?value!=='standing':value!=='walk');
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
function pickerClosed(){paused=false;lastTime=performance.now();pickerTrigger?.setAttribute('aria-expanded','false');pickerTrigger=null;renderBattle();}
function closePicker(){picker.close();pickerClosed();}
picker.addEventListener('cancel',pickerClosed);
$('close-picker').onclick=closePicker;
picker.addEventListener('click',event=>{if(event.target!==picker)return;const r=picker.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePicker();});
function openPicker(kind){
  if(!state||paused||aiming()||!Core.canControl(state,hero(state)))return;
  guardAlert.stop();
  resetStick();keys.clear();Core.stop(state);paused=true;
  const u=hero(state),isStance=kind==='stance',values=isStance?stanceValues:movementValues,names=isStance?stanceNames:movementNames,current=isStance?u.stance:Core.movementModeOf(u);
  pickerTrigger=$(kind+'-cycle');pickerTrigger.setAttribute('aria-expanded','true');
  $('control-picker-title').textContent=isStance?'STANCE':'MOVEMENT';
  $('control-picker-cost').textContent='FREE SWITCH · 0 AP';
  $('control-picker-hint').textContent=isStance?'Standing ↔ Kneeling ↔ Prone':'Run ↔ Off / walk ↔ Sneak';
  const row=$('control-choices');row.replaceChildren();row.classList.remove('area-choices');
  for(const value of values){const b=button(row,`${poseIcon(value)}<span>${names[value]}</span>`,'',value===current,()=>{closePicker();changeControl(kind,value);});b.setAttribute('aria-label',names[value]);if(value===current)b.autofocus=true;}
  const bottom=innerHeight-pickerTrigger.getBoundingClientRect().top+10;
  picker.style.bottom=`${Math.max(12,Math.min(bottom,innerHeight-175))}px`;
  picker.showModal();
}
for(const kind of ['stance','movement'])bindPressHold($(kind+'-cycle'),{
  canUse:()=>!!state&&!paused&&!aiming()&&Core.canControl(state,hero(state)),
  press:()=>{resetStick();keys.clear();Core.stop(state);},
  tap:()=>cycleControl(kind),hold:()=>openPicker(kind)
});
$('look').onclick=()=>{
  if(!state||paused||aiming())return;const nextFocus=nextCameraFocus(Core.visibleOpponents(state),view.focusedId);
  resetStick();keys.clear();Core.stop(state);if(nextFocus)view.focusOpponent(nextFocus.id);else view.center();renderBattle();
};
$('zoom-in').onclick=()=>view?.zoom(.83);$('zoom-out').onclick=()=>view?.zoom(1.2);
function weaponSwapCost(u,kind){return Core.combatCosts(state)?u.slots.includes(kind)?2:3:0;}
function equipment(){
  const u=hero(state),can=Core.canControl(state,u);
  showDialog(`<p class="eyebrow">${u.name.toUpperCase()} / INVENTORY</p><h2>Equipment.</h2><p>${Math.round(u.stamina)} / ${u.maxStamina} stamina · ${u.ap.toFixed(1)} AP remaining.</p>`,[
    ...u.pack.map(i=>{
      if(i.kind==='grenade')return [`Select grenades · ${u.ammo.grenade||0} remaining${areaWeapon()==='grenade'?' · active':''}`,()=>selectAreaWeapon('grenade'),'',!can];
      const cost=weaponSwapCost(u,i.kind);
      const label=`${Core.WEAPONS[i.kind].name}${Core.WEAPONS[i.kind].mag?' · '+(u.ammo[i.kind]??0)+' loaded / '+(u.ammoPouch[i.kind]||0)+' reserve':''}${u.weapon===i.kind?' · equipped':cost?' · '+cost+' AP':''}`;
      return [label,()=>act(()=>Core.equip(state,u,i.kind)),'',!can||u.weapon===i.kind||u.ap<cost];
    }),
    [`Use field dressing ×${state.solo.dressings}${Core.combatCosts(state)?' · 3 AP':''}`,()=>act(()=>dressing(state)),'',!can||!state.solo.dressings||u.hp===u.maxHp||Core.combatCosts(state)&&u.ap<3],
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
  showDialog(`<p class="eyebrow">${safe(missionForState(state).title)} / OPERATION PAUSED</p><h2>Field menu.</h2><p class="menu-summary">${phase}<br>${u.name} · ${short(u.weapon)} · ${u.ap.toFixed(1)} AP</p>`,[
    ['Continue operation',()=>{},'primary'],
    ['Inventory & weapons',equipment],
    [`Area weapon: ${areaNames[areaWeapon()]} · Change`,openAreaPicker,'',!can],
    [`Switch to ${short(other)}${swapCost?' · '+swapCost+' AP':''}`,()=>act(()=>Core.equip(state,u,other)),'',!can||u.ap<swapCost],
    [`Reload ${short(u.weapon)} · ${u.ammo[u.weapon]??0}/${w.mag}${actionCost}`,()=>act(()=>Core.reload(state,u)),'',!can||!w.mag||u.ammo[u.weapon]>=w.mag||!(u.ammoPouch[u.weapon]>0)||costs&&u.ap<3],
    [`Use field dressing ×${state.solo.dressings}${actionCost}`,()=>act(()=>dressing(state)),'',!can||!state.solo.dressings||u.hp===u.maxHp||costs&&u.ap<3],
    [`Throw grenade ×${u.ammo.grenade||0} · ${Core.grenadeCost(u)} AP`,armGrenade,'',!can||!(u.ammo.grenade>0)||u.ap<Core.grenadeCost(u)],
    ['Mission & combat log',mission],['Controls',help],['Choose operation, animal & loadout',backToPrep],['Title screen',()=>{storage.write();location.assign('./');}],['Restart this operation',()=>start(createSoloGame(state.solo.build,1947,state.solo.missionId))]
  ],{context:true});
}
function mission(){
  const u=hero(state),near=interaction(state),definition=missionForState(state),secured=objectiveSecured(state),dest=missionDestination(state);
  const safe=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const objective=secured?definition.objective.after:definition.objective.instruction;
  showDialog(`<p class="eyebrow">${safe(definition.location)} / ${safe(definition.title.toUpperCase())}</p><h2>Your assignment.</h2><p>${safe(definition.briefing)}</p><p>${safe(objective)}<br>${distance(u,dest).toFixed(1)} m to ${safe(secured?definition.extraction.name:definition.objective.name)}.</p><p class="menu-log-title">RECENT EVENTS</p><ol class="menu-log">${state.log.slice(0,8).map(line=>`<li>${safe(line)}</li>`).join('')}</ol>`,[
    ...(near?[[`${near.label}${near.cost?' · '+near.cost+' AP':''}`,()=>act(()=>interact(state)),'primary',!near.ok]]:[]),
    ['Back to menu',operationMenu],['Return to operation',()=>{}]
  ]);
}
$('menu').onclick=operationMenu;
function help(){showDialog(`<p class="eyebrow">FIELD NOTES</p><h2>One animal.<br>Your decisions.</h2><ul>
  <li>Use the center thumbstick to move freely in any direction. W A S D and arrow keys also work.</li>
  <li>During combat, movement spends AP by the exact distance covered. Stop anywhere. The right buttons are End Turn, your area weapon, then Options.</li>
  <li>Grenade and flamethrower share one button. Hold it to choose which to use, or open Options → Area weapon / Inventory & weapons. Selecting grenades is free and keeps your held weapon. Equipping a flamethrower uses the usual weapon-change cost. The button slowly pulses yellow when a valid aim is held and ready to fire.</li>
  <li>Tap Grenade or press G to aim with the joystick. Direction aims the throw; displacement sets distance, up to 10 m. The animal stays still. Release to hold the preview, then tap Throw or press Enter. Cancel or Escape exits without spending AP or grenades. Choose frag grenades in your loadout to carry three.</li>
  <li>For keyboard aiming, hold W A S D or arrows to adjust direction and distance. Release to hold aim. The camera frames the arc and blast without rotating. Filled ground is exposed to the blast; walls and unexplored ground stop the fill. The outline shows the maximum radius.</li>
  <li>A grenade costs 5 AP, or 2.5 AP while a pistol or SMG is equipped. Throwing keeps that weapon in hand. Blast radius: 5 m. Your animal can be hurt by its own grenade. Blocked flight paths, solid obstacles, and unexplored landing points prevent throwing.</li>
  <li>With a flamethrower equipped, tap CONE or press F. The joystick rotates its full 10 m, 48° area of effect. Release to hold aim, then tap FIRE or press Enter. The cone stops at walls and fog. Firing costs 6 AP and one fuel charge, including when no opponent is inside. Cancel or Escape leaves resources unchanged. Tapping a visible guard starts the cone pointed toward them.</li>
  <li>Tap a visible guard to open the weapon controls. The green CRT shows that guard, the selected body location and its hit chance. Body locations are on the left and aim levels on the right. The highest affordable aim is selected initially; choose a lower level to save AP. Burst changes the cost. An unaffordable switch flashes red three times when pressed. The wide Fire bar is the only action that shoots. Exit or Escape closes targeting without spending AP or ammunition.</li>
  <li>When a gun is empty, FIRE becomes RELOAD. Reloading uses carried spare ammunition and costs 3 AP in combat, or 0 AP outside combat. It does not also shoot. An empty flamethrower shows the same Reload shortcut on its area button.</li>
  <li>Drag the world to look around when not aiming. Use the arrows to zoom.</li>
  <li>Tap the stance button to go standing → kneeling → prone → kneeling → standing. Tap movement for run ↔ off / walk ↔ sneak. Both switches cost 0 AP, even when you have no AP left.</li>
  <li>Hold either button for large direct choices. Keyboard: focus the button and press the down arrow to open choices.</li>
  <li>The eye counts visible opponents. It blinks red and plays a short alert when you first spot a guard. Known guards stay remembered when you resume. Each tap advances through visible opponents from nearby, clear contacts to farther, harder-to-see contacts, then recenters on your animal. The next tap starts the cycle again. With no visible opponents, it simply recenters. Camera inspection costs no AP; moving also returns to your animal.</li>
  <li>A hand appears above visible objects within clear reach. Tap its labelled action, or hold for choices. Tap another nearby object to focus it. Opening choices and loot windows is free; completing an action spends the shown AP in combat.</li>
  <li>Chests and fallen guards share a loot window with individual Take buttons and Take all. Transfers cost 1 AP in combat, including a bulk transfer. Doors open or close for 1 AP; opening a chest or searching a body costs 2 AP. Exploration interactions are free. A blocked doorway cannot close on an animal.</li>
  <li>Options holds inventory, weapon changes, reloads and treatment, including looted supplies. Find your objective and recent events under Mission & combat log. Use the hand to collect the mission evidence and extract.</li>
  </ul>`,[['Back to menu',operationMenu],['Return to operation',()=>{},'primary']]);}
$('minimap-button').onclick=()=>{showDialog(`<p class="eyebrow">${safe(missionForState(state).location)} / TACTICAL MAP</p><h2>Find your way.</h2><div class="map-metal-frame map-expanded-frame"><canvas id="large-map" width="760" height="560" aria-label="Tactical map"></canvas></div><p>Cream: your animal. Orange: the objective and visible guards. Green: extraction. Dark areas remain unexplored.</p>`,[['Return to operation',()=>{},'primary']]);drawMinimap($('large-map'),state,{floorId:view?.floorController?.state.selectedId});};
function resetStick(){const pointer=stickPointer;stickPointer=null;if(pointer!==null&&$('joystick').hasPointerCapture(pointer))$('joystick').releasePointerCapture(pointer);stick={x:0,y:0};$('stick-knob').style.transform='translate(-50%,-50%)';}
function updateStick(e){
  const r=$('joystick').getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,limit=r.width*.3,n=Math.hypot(dx,dy),scale=Math.min(1,limit/Math.max(1,n));
  stick=n<(aiming()?limit*.12:9)?{x:0,y:0}:{x:dx*scale/limit,y:dy*scale/limit};$('stick-knob').style.transform=`translate(calc(-50% + ${stick.x*limit}px),calc(-50% + ${stick.y*limit}px))`;
  if(flameAim.active){flameAim.aim(stick);renderFlameControls();}
  else if(grenadeAim.active){grenadeAim.aim(hero(state),stick,Core.WEAPONS.grenade.range);updateGrenadePreview();}else view?.center();
}
$('joystick').onpointerdown=e=>{if(e.button!==0||stickPointer!==null||!state||paused||!Core.canControl(state,hero(state)))return;e.preventDefault();stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);Core.stop(state);selected=null;if(!aiming())view.route([]);updateStick(e);};$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)updateStick(e);};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,e=>{if(e.pointerId===stickPointer){resetStick();if(grenadeAim.active)renderGrenadeControls();if(flameAim.active)renderFlameControls();}});
addEventListener('keydown',e=>{
  if(!active||paused||e.defaultPrevented||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  const k=e.key.toLowerCase(),button=e.target.closest('button');
  if(k==='g'){e.preventDefault();if(!e.repeat)armGrenade();return;}
  if(k==='escape'&&Core.navigationStatus(state)?.pending){e.preventDefault();Core.stop(state);view.route([]);renderBattle();return;}
  if(k==='f'){e.preventDefault();if(!e.repeat)armFlame();return;}
  if(k==='enter'&&aiming()&&!button){e.preventDefault();if(!e.repeat){if(flameAim.active)commitFlame();else commitGrenade();}return;}
  if(k===' '&&button)return;
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)){
    e.preventDefault();if(k===' '){if(!e.repeat&&!aiming())act(()=>Core.endTurn(state));}else keys.add(k);
  }
  if(k==='escape'){if(aiming()){cancelAreaAim();renderBattle();}else $('menu').click();}
});
addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(grenadeAim.active)renderGrenadeControls();if(flameAim.active)renderFlameControls();});
addEventListener('blur',()=>{areaPress=false;resetStick();keys.clear();clearAreaReadiness();guardAlert.stop();});document.addEventListener('visibilitychange',()=>{areaPress=false;resetStick();keys.clear();if(document.hidden){clearAreaReadiness();guardAlert.stop();storage.write();}lastTime=performance.now();});addEventListener('pagehide',event=>{storage.write();guardAlert.stop();if(!event.persisted)void guardAlert.dispose();});
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;if(!active||!view)return;
  if(!paused&&!document.hidden&&(!state.spatial||$('loading').hidden)){
    let x=stick.x,y=stick.y;if(keys.size){x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);}
    const n=Math.max(1,Math.hypot(x,y));x/=n;y/=n;
    if(aiming()){
      if(!Core.canControl(state,hero(state)))cancelAreaAim();
      else{Core.stop(state);if(keys.size){if(flameAim.active){flameAim.aim({x,y});renderFlameControls();}else{grenadeAim.nudge(hero(state),{x,y},Core.WEAPONS.grenade.range,dt);updateGrenadePreview();}}}
      tick(state,dt);
    }else{if(Math.hypot(x,y)>.1&&view.focusedId!=null)view.center();tick(state,dt,Math.hypot(x,y)>.1?screenToGround(x,y):null);}
    if(state.phase!==lastPhase){resetStick();keys.clear();cancelAreaAim();Core.stop(state);lastPhase=state.phase;contextKey='';}
    if(now-lastSave>2500){storage.write();lastSave=now;}
  }
  if(!paused&&!document.hidden&&state.solo.status==='active'){
    const fresh=guardContacts.observe(state.units.filter(guard=>guard.team==='guard'&&guard.hp>0&&state.detected.has(guard.id)));
    if(fresh.length){state.solo.spottedGuardIds=guardContacts.ids();guardAlert.notify(fresh);storage.write();}
  }
  view.sync(state,now);positionInteractionHand();if(now-lastUI>100){renderBattle();lastUI=now;}
}
function boot(){if(privateColdwell)selectedMissionId='coldwell-'+coldwellTest;const ready=()=>{renderPrep();requestAnimationFrame(frame);},fail=error=>{selectedMissionId=DEFAULT_MISSION_ID;ready();toast(error.message);};try{const pending=prepareOperation(selectedMissionId);if(pending)pending.then(ready,fail);else ready();}catch(error){fail(error);}}
void boot();

// Only the unlisted acceptance route exposes read-only snapshots/projection.
if(privateColdwell)globalThis.__coldwellGame=Object.freeze({
  snapshot(){return structuredClone({active,paused,navigation:Core.navigationStatus(state),aiming:{grenade:grenadeAim.active,flame:flameAim.active},effects:{flame:view?.flameEffects?.queue.length??0},mission:state?.solo.missionId,status:state?.solo.status,hero:state&&hero(state),units:state?.units,queue:state?.queue,phase:state?.phase,inspected:state?.solo.inspected,objectives:state?.solo.objectives,spatial:state?.spatial,seen:state?.seen.size,detected:state&&[...state.detected],fireAnimationSequence:state?.fireAnimationSequence,windowSequence:state?.windowSequence,art:view?.art?.diagnostics(),actors:view?.actors.size,pendingActors:view?.pending.size,failed:view&&[...view.failed],floor:view?.floorController?.state.selectedId,mode:view?.floorController?.state.mode,renderer:view&&{calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures}});},
  project:point=>view?.project(point),
  async whenIdle(){await view?.artReady;await view?.art?.whenIdle();}
});
