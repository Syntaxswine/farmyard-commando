import {ANIMALS,PRIMARY,SECONDARY,DEFAULT_BUILD,BRIEF,Core,normalizeBuild,buildStats,createSoloGame,hero,interaction,interact,dressing,tick,encodeSave,decodeSave,distance} from './solo-game.js';
import {FieldView,drawMinimap} from './field-view.js';
import {cycleStep,nextCameraFocus,bindPressHold} from './mobile-controls.js';
import {GrenadeAim,screenToGround} from './grenade-controls.js';
import {weaponArtwork} from './original-art.js';
import {STANCE_ICONS} from './aft/tactics/battle-control-icons.js';
import {selectInteractionTarget} from './interactions.js';
import {aimOptions,availableAim,flashAPShortage} from './shooting-controls.js';
const $=id=>document.getElementById(id),SAVE='tactical-animal-operation-v2',BUILD='tactical-animal-build-v1';
let build={...DEFAULT_BUILD},state=null,view=null,active=false,paused=false,selected=null,aim='hip',zone='torso',burst=false,contextKey='',lastTime=0,lastUI=0,lastSave=0,lastPhase='',stick={x:0,y:0},stickPointer=null,resultShown=false,aimViewport=null;
const grenadeAim=new GrenadeAim();
const keys=new Set(),overlay=$('overlay');
const picker=$('control-picker');
let pickerTrigger=null,stanceDirection=1,movementDirection=-1;
let interactionFocus=null,handTarget=null;
const safe=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const stanceValues=['standing','kneeling','prone'],movementValues=['run','walk','sneak'];
const stanceNames={standing:'Standing',kneeling:'Kneeling',prone:'Prone / crawl'},movementNames={run:'Run',walk:'Off / walk',sneak:'Sneak'};
const movementPoses={walk:'M18 4a3 3 0 1 0 0 .1M18 10l-2 12m2-9-8 7m8-7 7 6m-9 3-6 12m6-12 9 12',run:'M22 4a3 3 0 1 0 0 .1M21 10l-7 11m5-9-8-1-4 5m12-4 5 7 6-2M14 21l-7 5-4-4m11-1 9 5-2 8',sneak:'M17 9a3 3 0 1 0 0 .1M17 15l-3 7m2-5 10 3 3-3m-13 0-7 3M14 22l10 3-6 8m-4-11-7 8h8'};
const poseIcon=value=>STANCE_ICONS[value]?.replace('<svg ','<svg class="original-stance" ')||`<svg viewBox="0 0 36 38" aria-hidden="true"><path d="${movementPoses[value]}"/></svg>`;
try{build=normalizeBuild(JSON.parse(localStorage.getItem(BUILD)||'null'));}catch{}
const storage={read(){try{return localStorage.getItem(SAVE);}catch{return null;}},write(){if(!state)return;try{localStorage.setItem(SAVE,encodeSave(state));}catch{toast('Device storage is full. Keep this tab open to retain the operation.');}}};
const speciesLabel=s=>s.replaceAll('-',' '),short=k=>Core.WEAPONS[k].short;
function button(parent,label,cls,pressed,onClick){const b=document.createElement('button');b.type='button';b.className=cls;b.innerHTML=label;b.setAttribute('aria-pressed',String(pressed));b.onclick=onClick;parent.append(b);return b;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function renderPrep(){const p=ANIMALS.find(a=>a.id===build.animal),stats=buildStats(build);$('hero-portrait').src=`aft/assets/characters/armed/${p.species}-rifle.png`;$('hero-portrait').alt=`${p.name}, the ${speciesLabel(p.species)} worker`;$('hero-name').textContent=p.name;$('hero-species').textContent=speciesLabel(p.species);$('hero-role').textContent=p.label;document.querySelector('.portrait-number').textContent=String(ANIMALS.indexOf(p)+1).padStart(2,'0');$('stats').innerHTML=[['HEALTH',stats.maxHp],['ACTION POINTS',stats.maxAp],['PERCEPTION',stats.perception]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('animals').replaceChildren();for(const a of ANIMALS)button($('animals'),`<strong>${speciesLabel(a.species)}</strong><small>${a.name}</small>`,'animal-choice',a.id===build.animal,()=>{build.animal=a.id;renderPrep();});
  $('primary').replaceChildren();for(const k of PRIMARY){const w=Core.WEAPONS[k],choice=button($('primary'),`<strong>${w.short}</strong><small>${w.cost} AP / ${w.range} m / ${w.mag} rounds</small>`,'weapon-choice',k===build.primary,()=>{build.primary=k;renderPrep();});choice.setAttribute('aria-label',w.name);const art=weaponArtwork(k,35);art.classList.add('weapon-paint');choice.append(art);}
  $('secondary').replaceChildren();for(const k of SECONDARY){const choice=button($('secondary'),`<span>${short(k)}</span><small>${k==='knife'?'MELEE':'8 ROUNDS'}</small>`,'small-choice',k===build.secondary,()=>{build.secondary=k;renderPrep();});const art=weaponArtwork(k,22);art.classList.add('sidearm-paint');choice.prepend(art);}
  $('utility').replaceChildren();for(const [k,label,detail] of [['dressing','Field dressing','×2'],['grenade','Frag grenades','×3']])button($('utility'),`<span>${label}</span><small>${detail}</small>`,'small-choice',k===build.utility,()=>{build.utility=k;renderPrep();});
  const skill=['hmg','rpg','flamethrower'].includes(build.primary)?'heavyWeapons':'firearms';$('primary-summary').textContent=`${skill==='firearms'?'FIREARMS':'HEAVY WEAPONS'} ${p.stats[skill]}`;$('equipment-note').textContent=`${Core.WEAPONS[build.primary].name}. ${p.name}'s ${skill==='firearms'?'firearms':'heavy weapons'} skill: ${p.stats[skill]}/100. Movement spends AP by distance, with no tile snapping.`;$('build-summary').textContent=`${p.name} / ${speciesLabel(p.species)} · ${short(build.primary)} + ${short(build.secondary)}`;
  $('resume').hidden=!storage.read();try{localStorage.setItem(BUILD,JSON.stringify(build));}catch{}
}
$('grenade-art').append(weaponArtwork('grenade',32));
$('interaction-icon').append(weaponArtwork('hands',25));
function showDialog(html,actions=[],{context=false,mode=''}={}){
  if(picker.open)closePicker();
  cancelGrenade();
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
  if(context){contextKey='';renderContext();}
  if(!overlay.open)overlay.showModal();
}
function closeDialog(){overlay.close();paused=false;lastTime=performance.now();}
overlay.addEventListener('cancel',()=>{paused=false;lastTime=performance.now();renderBattle();});
function grenadeViewport(){
  if($('grenade-aim').hidden)return aimViewport;
  const r=$('viewport').getBoundingClientRect(),panel=$('grenade-aim').getBoundingClientRect(),controls=document.querySelector('.thumb-layout').getBoundingClientRect();
  const top=Math.max($('minimap-button').getBoundingClientRect().bottom,document.querySelector('.hero-strip').getBoundingClientRect().bottom),sidePanel=panel.right<=controls.left;
  aimViewport={left:sidePanel?panel.right-r.left+12:16,right:r.width-16,top:top-r.top+12,bottom:Math.max(top-r.top+72,(sidePanel?controls.top:panel.top)-r.top-12)};
  return aimViewport;
}
function start(s){try{view?.dispose();$('loading').textContent='Preparing the field…';$('loading').hidden=false;state=s;selected=null;interactionFocus=null;handTarget=null;grenadeAim.cancel();aimViewport=null;contextKey='';resultShown=false;stanceDirection=1;movementDirection=-1;$('prep').hidden=true;$('battle').hidden=false;document.body.classList.add('in-battle');active=true;paused=false;view=new FieldView($('viewport'),{onPick:pick,getAimViewport:grenadeViewport,onLoading:busy=>{$('loading').hidden=!busy;},onError:message=>{$('loading').hidden=false;$('loading').textContent='Animal artwork could not load. '+message;}});view.setGame(state);lastPhase=state.phase;lastTime=performance.now();lastUI=0;renderBattle();storage.write();}catch(error){active=false;view?.dispose();view=null;$('prep').hidden=false;$('battle').hidden=true;document.body.classList.remove('in-battle');toast('Cannot start 3D view: '+error.message);}}
function backToPrep(){storage.write();active=false;grenadeAim.cancel();resetStick();keys.clear();view?.dispose();view=null;$('battle').hidden=true;$('prep').hidden=false;document.body.classList.remove('in-battle');renderPrep();}
$('deploy').onclick=()=>start(createSoloGame(build));$('resume').onclick=()=>{try{const s=decodeSave(storage.read());if(s.solo.status!=='active'){toast('That operation has ended. Deploy a new animal to begin again.');return;}start(s);}catch{toast('This saved operation is from an older prototype. Deploy a new animal.');}};
function positionInteractionHand(){
  const button=$('interaction-hand');
  if(!handTarget||!active||paused||grenadeAim.active||!Core.canControl(state,hero(state))||!$('loading').hidden){button.hidden=true;return;}
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
  if(!state||paused||grenadeAim.active)return;
  resetStick();keys.clear();const result=Core.performInteraction(state,id,action,itemId);
  if(!result.ok){toast(result.reason);renderBattle();return;}
  selected=null;view.route([]);contextKey='';renderBattle();storage.write();
  if(result.loot)lootWindow(id);
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
  canUse:()=>!!handTarget&&!paused&&!grenadeAim.active&&Core.canControl(state,hero(state)),
  press:()=>{resetStick();keys.clear();Core.stop(state);},
  tap:()=>{if(handTarget)useInteraction(handTarget.id,handTarget.actions[0].id);},hold:interactionChoices,
});
function act(fn){if(!state||paused)return;resetStick();keys.clear();fn();contextKey='';renderBattle();storage.write();}
function pick(p){if(!state||paused||grenadeAim.active||state.phase==='enemy'||state.solo.status!=='active')return;resetStick();if(p.interactionId){focusInteraction(p.interactionId);return;}if(p.unitId!==undefined){if(p.unitId===0){operationMenu();return;}const target=state.units.find(u=>u.id===p.unitId);if(target?.hp<=0){focusInteraction('body:'+target.id);return;}if(!state.detected.has(target?.id))return;Core.stop(state);Core.turnTo(state,hero(state),Core.headingTo(hero(state),target));selected={targetId:target.id};burst=false;aim=availableAim(Core.WEAPONS[hero(state).weapon],hero(state).ap);zone='torso';}
  else{const path=Core.navigationPath(state,hero(state),p.x,p.y);if(!path){toast('No clear route to that point.');return;}view.route([hero(state),...path]);if(state.phase==='player')selected={point:p,path};else{Core.move(state,hero(state),p.x,p.y);selected=null;view.center();}}
  contextKey='';renderBattle();if(selected)selected.targetId!==undefined?shootingMenu():operationMenu();
}
function shootingMenu(){
  const u=hero(state),w=Core.WEAPONS[u.weapon];
  showDialog(`<p class="eyebrow">WEAPON CONTROL / OPERATION PAUSED</p><h2>${safe(w.short)}</h2><p class="shooting-resources">${u.ap.toFixed(1)} AP AVAILABLE${w.mag?` · ${u.ammo[u.weapon]??0} ROUNDS`:''}</p>`,[],{context:true,mode:'shooting'});
}
function renderContext(focusControl){if(!state)return;const u=hero(state),near=interaction(state),target=selected?.targetId!==undefined?state.units.find(v=>v.id===selected.targetId):null;
  if(target&&(!Core.alive(target)||!state.detected.has(target.id)))selected=null;
  if(target&&selected)aim=availableAim(Core.WEAPONS[u.weapon],u.ap,burst,aim);
  const p=target&&selected?Core.previewAttack(state,u,target,burst,zone,null,aim):null;
  const sig=JSON.stringify([selected,near,aim,zone,burst,p,u.ap.toFixed(2),u.weapon,state.phase,[...state.detected],Math.round(u.x*10),Math.round(u.y*10),target?.hp]);if(sig===contextKey)return;contextKey=sig;const root=$('context');root.replaceChildren();root.classList.toggle('shooting-panel',!!p);
  if(state.phase==='enemy')return;
  function content(title,detail,label,fn,disabled=false){const copy=document.createElement('div');copy.className='context-copy';const h=document.createElement('strong');h.textContent=title;const small=document.createElement('small');small.textContent=detail;copy.append(h,small);root.append(copy);const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{closeDialog();act(fn);};root.append(b);return copy;}
  if(p){
    const w=Core.WEAPONS[u.weapon],choices=aimOptions(w,u.ap,burst),chosen=choices.find(option=>option.id===aim);
    const readout=document.createElement('div');readout.className='shot-readout';
    const name=document.createElement('strong');name.textContent=`${target.name} · ${speciesLabel(target.species)} · ${Math.ceil(target.hp)} HP`;
    const detail=document.createElement('span');detail.textContent=`${p.distance?.toFixed(1)||distance(u,target).toFixed(1)} m · ${p.chance||0}% HIT · ${p.cost} AP`;
    readout.append(name,detail);root.append(readout);
    let restoreFocus;
    function hardware(parent,{control,label,paint,icon,mark,pressed,disabled=false,apShort=false,red=false,amber=false,lit,onClick,rerender=true}){
      const b=document.createElement('button');b.type='button';b.className='industrial-switch shooting-switch';b.dataset.control=control;
      const description=label+(apShort?' Not enough AP.':'');
      b.setAttribute('aria-label',description);if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));
      if(disabled||apShort)b.setAttribute('aria-disabled','true');
      if(red||amber)b.dataset.face=red?'red':'amber';if(lit!==undefined)b.dataset.lit=String(lit);
      // AP-blocked switches accept input solely to acknowledge the failed attempt.
      b.disabled=disabled&&!apShort;b.title=description;
      b.innerHTML=`<span class="switch-legend" aria-hidden="true"><span class="switch-icon"><svg class="switch-glyph" viewBox="0 0 32 32"><use href="assets/ui/industrial-switches/symbols.svg#${icon}"/></svg></span><span class="switch-label">${paint}</span><span class="switch-cost">${mark}</span></span>`;
      b.onclick=()=>{if(apShort){flashAPShortage(b);return;}if(disabled)return;onClick();if(rerender){contextKey='';renderContext(control);}};parent.append(b);if(control===focusControl)restoreFocus=b;return b;
    }
    function bank(label,cls,parent=root){
      const group=document.createElement('fieldset');group.className='shooting-group '+cls;
      const title=document.createElement('legend');title.textContent=label;
      const row=document.createElement('div');row.className='shooting-bank';group.append(title,row);parent.append(group);return row;
    }
    const columns=document.createElement('div');columns.className='shooting-columns';root.append(columns);
    const aiming=bank('AIM LEVEL','aim-bank',columns);
    for(const option of choices)hardware(aiming,{
      control:'aim-'+option.id,label:`${option.label}. ${option.cost} AP. +${option.accuracy} accuracy.`,
      paint:{hip:'QUICK SHOT',aimed:'AIMED',full:'FULL AIM'}[option.id],icon:'aim-'+option.id,mark:`${option.cost} AP`,pressed:aim===option.id,disabled:!option.available,apShort:!option.available,amber:true,onClick:()=>aim=option.id
    });
    const zones=bank('BODY LOCATION','zone-bank',columns);
    for(const value of ['torso','head','weapon','legs']){
      const preview=Core.previewAttack(state,u,target,burst,value,null,aim),label=Core.AIM_ZONES[value].label;
      hardware(zones,{control:'zone-'+value,label:`Target ${label.toLowerCase()}. ${preview.chance}% hit chance.`,paint:label.toUpperCase(),icon:'target-'+value,mark:`${preview.chance}% HIT`,pressed:zone===value,amber:true,onClick:()=>zone=value});
    }
    const fireRow=bank(w.burstRounds?'FIRE MODE / TRIGGER':'TRIGGER','trigger-bank');
    if(w.burstRounds)for(const firingBurst of [false,true]){
      const mode=firingBurst?'Burst':'Single',modeAim=availableAim(w,u.ap,firingBurst,aim),choice=aimOptions(w,u.ap,firingBurst).find(option=>option.id===modeAim);
      hardware(fireRow,{control:firingBurst?'burst':'single',label:`${mode} fire. ${firingBurst?w.burstRounds:1} round${firingBurst?'s':''}.`,paint:mode.toUpperCase(),icon:firingBurst?'fire-burst':'fire-single',mark:`${choice.cost} AP`,pressed:burst===firingBurst,apShort:!choice.available,onClick:()=>burst=firingBurst});
    }
    const ready=p.ok&&Core.canControl(state,u)&&chosen.available;
    hardware(fireRow,{control:'fire',label:`${burst?'Fire burst':'Fire'}. ${p.chance}% hit chance. ${p.cost} AP.`,paint:'FIRE',icon:'fire',mark:`${p.cost} AP`,red:true,lit:ready,disabled:!ready,apShort:!chosen.available,rerender:false,onClick:()=>{closeDialog();act(()=>Core.attack(state,u,target,burst,false,zone,false,aim));}});
    const warning=p.reason||(!chosen.available?'Not enough AP':'');
    if(warning||w.blast){const note=document.createElement('p');note.className='shooting-warning';note.setAttribute('role','status');note.textContent=[warning,w.blast?'BLAST CAN HURT YOU':''].filter(Boolean).join(' · ');root.append(note);}
    restoreFocus?.focus?.({preventScroll:true});
  }else if(selected?.point){const path=Core.navigationPath(state,u,selected.point.x,selected.point.y),cost=path?.reduce((n,p)=>n+p.cost,0)||0,d=cost/Core.movementRate(u);content('Move to this point',`${d.toFixed(1)} m · ${cost.toFixed(1)} AP${cost>u.ap?' · stops when AP runs out':''}`,'Move',()=>{Core.move(state,u,selected.point.x,selected.point.y);selected=null;view.center();},!path||u.ap<.01);
  }else if(near){content(near.label,near.cost?`${near.cost} AP · then return to extraction`:'Leave with the ledger to finish the operation',near.kind==='extract'?'Extract ↗':'Collect',()=>interact(state),!near.ok);}
  else if(state.detected.size){const guard=[...state.detected].map(id=>state.units.find(v=>v.id===id)).sort((a,b)=>distance(u,a)-distance(u,b))[0];content('Visible contact',`${guard.name} · ${distance(u,guard).toFixed(1)} m`,'Target',()=>pick({unitId:guard.id}));}
  if(selected){const cancel=document.createElement('button');cancel.className='cancel-context';cancel.textContent=p?'Cancel shot':'×';cancel.setAttribute('aria-label',p?'Cancel shot':'Cancel selection');cancel.onclick=()=>{selected=null;view.route([]);contextKey='';if(overlay.dataset.mode==='shooting')closeDialog();renderContext();};root.append(cancel);}
}
function renderBattle(){if(!state)return;const u=hero(state),combat=state.phase==='player'||state.phase==='enemy',can=Core.canControl(state,u);
  $('battle-name').textContent=u.name;$('battle-species').textContent=speciesLabel(u.species);
  $('hp-label').textContent=`${Math.ceil(u.hp)} / ${u.maxHp} HP`;$('hp-bar').style.width=`${u.hp/u.maxHp*100}%`;
  $('ap').textContent=combat?Math.max(0,u.ap).toFixed(1):'∞';$('ap-label').textContent=combat?'AP':'FREE MOVE';
  $('end-turn').disabled=state.phase!=='player'||grenadeAim.active;
  $('end-turn').dataset.lit=String(combat);
  $('end-turn').setAttribute('aria-description',combat?'Combat light on':'Combat light off');
  $('end-turn').setAttribute('aria-label',state.phase==='enemy'?'Guards are acting':'End turn');
  $('turn-label').innerHTML=state.phase==='enemy'?'GUARD<br>TURN':'END<br>TURN';
  $('joystick').classList.toggle('unavailable',!can);
  renderGrenadeControls();
  const mode=Core.movementModeOf(u);
  renderCycle('movement',mode,mode==='walk'?'OFF':mode.toUpperCase(),movementNames[mode],can&&!grenadeAim.active);
  renderCycle('stance',u.stance,{standing:'STAND',kneeling:'KNEEL',prone:'CRAWL'}[u.stance],stanceNames[u.stance],can&&!grenadeAim.active);
  const contacts=Core.visibleOpponents(state),focused=contacts.find(g=>g.id===view?.focusedId);
  const nextFocus=nextCameraFocus(contacts,view?.focusedId);
  $('visible-count').textContent=contacts.length;$('look').disabled=state.solo.status!=='active'||grenadeAim.active;
  $('look').classList.toggle('inspecting',!!focused);
  const viewing=focused?'Viewing '+focused.name:view?.follow?'Viewing your animal':'Camera panned';
  const nextAction=nextFocus?'View '+nextFocus.name:'Recenter on your animal';
  $('look').setAttribute('aria-label',`${contacts.length} visible opponent${contacts.length===1?'':'s'}. ${viewing}. Next: ${nextAction}.`);
  $('look').title=`${nextAction} · opponents, then your animal`;
  drawMinimap($('minimap'),state);renderContext();renderInteractionHand();
  if(state.solo.status!=='active'&&!resultShown){resultShown=true;storage.write();const win=state.solo.status==='extracted';showDialog(`<p class="eyebrow">OPERATION ${win?'COMPLETE':'LOST'}</p><h2>${win?'The books are open.':'One worker down.'}</h2><p>${win?`${u.name} returned with the wage ledger. ${Math.round(state.solo.distance)} metres travelled; ${state.round} combat rounds.`:'The factory kept its secrets this time. Try another animal, another loadout, or a quieter route.'}</p>`,[['Choose your next animal',backToPrep,'primary'],['Replay this loadout',()=>start(createSoloGame(state.solo.build))]]);}
}
$('end-turn').onclick=()=>act(()=>{selected=null;cancelGrenade();Core.endTurn(state);});
function renderGrenadeControls(){
  const u=hero(state),armed=grenadeAim.active,point=grenadeAim.point,p=armed&&point?Core.previewGrenade(state,u,point):null;
  const count=u.ammo.grenade||0,cost=Core.grenadeCost(u),adjusting=stickPointer!==null||keys.size>0;
  $('grenade-count').textContent=count;$('grenade-cost').textContent=`${cost} AP`;$('grenade-label').textContent=armed?'THROW':'GRENADE';
  $('grenade').disabled=!Core.canControl(state,u)||count<1||u.ap+1e-7<cost||armed&&(!p?.ok||adjusting);
  $('grenade').setAttribute('aria-pressed',String(armed));
  $('grenade').setAttribute('aria-label',`${armed?'Throw grenade':'Aim grenade'}. ${count} remaining. ${cost} AP.`);
  $('grenade').title=armed?(p?.reason||(!point?'Choose a landing point with the joystick':adjusting?'Release the aim controls, then throw':`Throw grenade · ${cost} AP`)):`Aim grenade · ${cost} AP · G`;
  $('grenade-aim').hidden=!armed;$('battle').classList.toggle('aiming-grenade',armed);
  $('stick-caption').textContent=armed?'AIM':'MOVE';
  $('joystick').setAttribute('aria-label',armed?'Grenade aim thumbstick. Direction aims; full displacement reaches maximum range. Release to hold your aim. Keyboard: W A S D or arrows, Enter to throw, Escape to cancel.':'Movement thumbstick. Drag from the center to move. Keyboard: W A S D or arrow keys.');
  $('viewport').setAttribute('aria-label',armed?'Grenade preview. Aim with the joystick, release to hold, then press Throw. Cancel leaves resources unchanged.':'Tactical map. Tap ground to move. Drag to look around. Tap a visible guard to target.');
  if(!armed)return;
  const detail=point?`${p.distance.toFixed(1)} / ${Core.WEAPONS.grenade.range} m · ${p.blast} m blast · ${cost} AP · ${count} left`:`Move the joystick to aim · ${cost} AP · ${count} left`;
  if($('grenade-detail').textContent!==detail)$('grenade-detail').textContent=detail;
  const warning=[p?.reason,p?.selfDanger?'Your animal is exposed to the blast.':''].filter(Boolean).join('. ');
  $('grenade-warning').hidden=!warning;$('grenade-warning').textContent=warning;
}
function updateGrenadePreview(){
  if(!grenadeAim.active)return;
  if(grenadeAim.point)view.previewGrenade(grenadeAim.point,Core.previewGrenade(state,hero(state),grenadeAim.point));
  renderGrenadeControls();
}
function cancelGrenade(){
  if(!grenadeAim.active)return;
  grenadeAim.cancel();resetStick();keys.clear();view?.endGrenadeAim();$('toast').hidden=true;
}
function armGrenade(){
  if(!state||paused||grenadeAim.active||!Core.canControl(state,hero(state)))return;
  const u=hero(state);if(!(u.ammo.grenade>0)||u.ap+1e-7<Core.grenadeCost(u))return;
  resetStick();keys.clear();Core.stop(state);selected=null;grenadeAim.start();view.beginGrenadeAim();$('toast').hidden=true;renderBattle();
}
function commitGrenade(){
  if(!state||paused||!grenadeAim.active||!grenadeAim.point||stickPointer!==null||keys.size)return;
  const u=hero(state),landing={...grenadeAim.point},p=Core.previewGrenade(state,u,landing);
  if(!p.ok){updateGrenadePreview();return;}
  if(!Core.throwGrenade(state,u,landing))return;
  grenadeAim.cancel();resetStick();keys.clear();view.endGrenadeAim({linger:800});contextKey='';renderBattle();storage.write();
}
$('grenade').onclick=()=>grenadeAim.active?commitGrenade():armGrenade();
$('cancel-grenade').onclick=()=>{cancelGrenade();renderBattle();};
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
  if(!state||paused||grenadeAim.active||!Core.canControl(state,hero(state)))return;
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
  canUse:()=>!!state&&!paused&&!grenadeAim.active&&Core.canControl(state,hero(state)),
  press:()=>{resetStick();keys.clear();Core.stop(state);},
  tap:()=>cycleControl(kind),hold:()=>openPicker(kind)
});
$('look').onclick=()=>{
  if(!state||paused||grenadeAim.active)return;const nextFocus=nextCameraFocus(Core.visibleOpponents(state),view.focusedId);
  resetStick();keys.clear();Core.stop(state);if(nextFocus)view.focusOpponent(nextFocus.id);else view.center();renderBattle();
};
$('zoom-in').onclick=()=>view?.zoom(.83);$('zoom-out').onclick=()=>view?.zoom(1.2);
function weaponSwapCost(u,kind){return Core.combatCosts(state)?u.slots.includes(kind)?2:3:0;}
function equipment(){
  const u=hero(state),can=Core.canControl(state,u);
  showDialog(`<p class="eyebrow">${u.name.toUpperCase()} / INVENTORY</p><h2>Equipment.</h2><p>${Math.round(u.stamina)} / ${u.maxStamina} stamina · ${u.ap.toFixed(1)} AP remaining.</p>`,[
    ...u.pack.map(i=>{
      if(i.kind==='grenade')return [`Throw grenade ×${u.ammo.grenade||0} · ${Core.grenadeCost(u)} AP`,armGrenade,'',!can||!(u.ammo.grenade>0)||u.ap<Core.grenadeCost(u)];
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
  showDialog(`<p class="eyebrow">OPERATION PAUSED</p><h2>Field menu.</h2><p class="menu-summary">${phase}<br>${u.name} · ${short(u.weapon)} · ${u.ap.toFixed(1)} AP</p>`,[
    ['Continue operation',()=>{},'primary'],
    ['Inventory & weapons',equipment],
    [`Switch to ${short(other)}${swapCost?' · '+swapCost+' AP':''}`,()=>act(()=>Core.equip(state,u,other)),'',!can||u.ap<swapCost],
    [`Reload ${short(u.weapon)} · ${u.ammo[u.weapon]??0}/${w.mag}${actionCost}`,()=>act(()=>Core.reload(state,u)),'',!can||!w.mag||u.ammo[u.weapon]>=w.mag||!(u.ammoPouch[u.weapon]>0)||costs&&u.ap<3],
    [`Use field dressing ×${state.solo.dressings}${actionCost}`,()=>act(()=>dressing(state)),'',!can||!state.solo.dressings||u.hp===u.maxHp||costs&&u.ap<3],
    [`Throw grenade ×${u.ammo.grenade||0} · ${Core.grenadeCost(u)} AP`,armGrenade,'',!can||!(u.ammo.grenade>0)||u.ap<Core.grenadeCost(u)],
    ['Mission & combat log',mission],['Controls',help],['Choose animal & loadout',backToPrep],['Title screen',()=>{storage.write();location.assign('./');}],['Restart this operation',()=>start(createSoloGame(state.solo.build))]
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
function help(){showDialog(`<p class="eyebrow">FIELD NOTES</p><h2>One animal.<br>Your decisions.</h2><ul>
  <li>Use the center thumbstick to move freely in any direction. W A S D and arrow keys also work.</li>
  <li>During combat, movement spends AP by the exact distance covered. Stop anywhere. The right buttons are End Turn, Grenade, then Options.</li>
  <li>Tap Grenade or press G to aim with the joystick. Direction aims the throw; displacement sets distance, up to 10 m. The animal stays still. Release to hold the preview, then tap Throw or press Enter. Cancel or Escape exits without spending AP or grenades. Choose frag grenades in your loadout to carry three.</li>
  <li>For keyboard aiming, hold W A S D or arrows to adjust direction and distance. Release to hold aim. The camera frames the arc and blast without rotating. Filled ground is exposed to the blast; walls and unexplored ground stop the fill. The outline shows the maximum radius.</li>
  <li>A grenade costs 5 AP, or 2.5 AP while a pistol or SMG is equipped. Throwing keeps that weapon in hand. Blast radius: 5 m. Your animal can be hurt by its own grenade. Blocked flight paths, solid obstacles, and unexplored landing points disable Throw.</li>
  <li>Tap a visible guard to open the weapon controls. Aim and target-zone switches show AP costs and hit chances. The highest affordable aim is selected initially; choose a lower level to save AP. Burst changes the cost. An unaffordable switch flashes red three times when pressed. Only a valid Fire action spends AP and ammunition.</li>
  <li>Drag the world to look around when not aiming a grenade. Use the arrows to zoom.</li>
  <li>Tap the stance button to go standing → kneeling → prone → kneeling → standing. Tap movement for run ↔ off / walk ↔ sneak. Both switches cost 0 AP, even when you have no AP left.</li>
  <li>Hold either button for large direct choices. Keyboard: focus the button and press the down arrow to open choices.</li>
  <li>The eye counts visible opponents. Each tap advances through them from nearby, clear contacts to farther, harder-to-see contacts, then recenters on your animal. The next tap starts the cycle again. With no visible opponents, it simply recenters. Camera inspection costs no AP; moving also returns to your animal.</li>
  <li>A hand appears above visible objects within clear reach. Tap its labelled action, or hold for choices. Tap another nearby object to focus it. Opening choices and loot windows is free; completing an action spends the shown AP in combat.</li>
  <li>Chests and fallen guards share a loot window with individual Take buttons and Take all. Transfers cost 1 AP in combat, including a bulk transfer. Doors open or close for 1 AP; opening a chest or searching a body costs 2 AP. Exploration interactions are free. A blocked doorway cannot close on an animal.</li>
  <li>Options holds inventory, weapon changes, reloads and treatment, including looted supplies. Find your objective and recent events under Mission & combat log. Use the hand to collect the ledger and extract.</li>
  </ul>`,[['Back to menu',operationMenu],['Return to operation',()=>{},'primary']]);}
$('minimap-button').onclick=()=>{showDialog('<p class="eyebrow">MILL 04 / TACTICAL MAP</p><h2>Find your way.</h2><div class="map-metal-frame map-expanded-frame"><canvas id="large-map" width="760" height="560" aria-label="Tactical map"></canvas></div><p>Cream: your animal. Orange: the objective and visible guards. Dark areas remain unexplored.</p>',[['Return to operation',()=>{},'primary']]);drawMinimap($('large-map'),state);};
function resetStick(){const pointer=stickPointer;stickPointer=null;if(pointer!==null&&$('joystick').hasPointerCapture(pointer))$('joystick').releasePointerCapture(pointer);stick={x:0,y:0};$('stick-knob').style.transform='translate(-50%,-50%)';}
function updateStick(e){
  const r=$('joystick').getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,limit=r.width*.3,n=Math.hypot(dx,dy),scale=Math.min(1,limit/Math.max(1,n));
  stick=n<(grenadeAim.active?limit*.12:9)?{x:0,y:0}:{x:dx*scale/limit,y:dy*scale/limit};$('stick-knob').style.transform=`translate(calc(-50% + ${stick.x*limit}px),calc(-50% + ${stick.y*limit}px))`;
  if(grenadeAim.active){grenadeAim.aim(hero(state),stick,Core.WEAPONS.grenade.range);updateGrenadePreview();}else view?.center();
}
$('joystick').onpointerdown=e=>{if(e.button!==0||stickPointer!==null||!state||paused||!Core.canControl(state,hero(state)))return;e.preventDefault();stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);Core.stop(state);selected=null;if(!grenadeAim.active)view.route([]);updateStick(e);};$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)updateStick(e);};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,e=>{if(e.pointerId===stickPointer){resetStick();if(grenadeAim.active)renderGrenadeControls();}});
addEventListener('keydown',e=>{
  if(!active||paused||e.defaultPrevented||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  const k=e.key.toLowerCase(),button=e.target.closest('button');
  if(k==='g'){e.preventDefault();if(!e.repeat)armGrenade();return;}
  if(k==='enter'&&grenadeAim.active&&!button){e.preventDefault();if(!e.repeat)commitGrenade();return;}
  if(k===' '&&button)return;
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)){
    e.preventDefault();if(k===' '){if(!e.repeat&&!grenadeAim.active)act(()=>Core.endTurn(state));}else keys.add(k);
  }
  if(k==='escape'){if(grenadeAim.active){cancelGrenade();renderBattle();}else $('menu').click();}
});
addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(grenadeAim.active)renderGrenadeControls();});
addEventListener('blur',()=>{resetStick();keys.clear();});document.addEventListener('visibilitychange',()=>{resetStick();keys.clear();if(document.hidden)storage.write();lastTime=performance.now();});addEventListener('pagehide',()=>storage.write());
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;if(!active||!view)return;
  if(!paused&&!document.hidden){
    let x=stick.x,y=stick.y;if(keys.size){x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);}
    const n=Math.max(1,Math.hypot(x,y));x/=n;y/=n;
    if(grenadeAim.active){
      if(!Core.canControl(state,hero(state)))cancelGrenade();
      else{Core.stop(state);if(keys.size){grenadeAim.nudge(hero(state),{x,y},Core.WEAPONS.grenade.range,dt);updateGrenadePreview();}}
      tick(state,dt);
    }else{if(Math.hypot(x,y)>.1&&view.focusedId!=null)view.center();tick(state,dt,Math.hypot(x,y)>.1?screenToGround(x,y):null);}
    if(state.phase!==lastPhase){resetStick();keys.clear();cancelGrenade();Core.stop(state);lastPhase=state.phase;contextKey='';}
    if(now-lastSave>2500){storage.write();lastSave=now;}
  }
  view.sync(state,now);positionInteractionHand();if(now-lastUI>100){renderBattle();lastUI=now;}
}
renderPrep();requestAnimationFrame(frame);
