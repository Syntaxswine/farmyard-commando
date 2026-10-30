import {gridDimensions} from './world-grid.js';
import {providerFor,spatialDistance} from './spatial-provider.js';
export const FUEL_BLAST_RADIUS=5;
export function tankExplosionChance(unit,zone){
  const carrying=unit.weapon==='flamethrower'||unit.pack?.some(i=>i.type==='weapon'&&i.kind==='flamethrower');
  if(!carrying||unit.tanksExploded||(unit.ammo?.flamethrower??0)<=0)return 0;
  return zone==='torso'?.25:zone==='weapon'&&unit.weapon==='flamethrower'?.9:0;
}
export function createFuelRules({kill,ignite,recordBurn,inside,log,windowBlast=()=>{}}){
  function explode(s,wearer){
    const weapon=wearer.weapon,origin={x:wearer.x,y:wearer.y,z:wearer.z||0,...(s.spatial?{h:wearer.h,floorId:wearer.floorId}:{})},provider=providerFor(s);
    windowBlast(s,origin,FUEL_BLAST_RADIUS,{ignoreWalls:true});
    wearer.tanksExploded=true;wearer.ammo.flamethrower=0;wearer.ammoPouch.flamethrower=0;
    wearer.pack=(wearer.pack||[]).filter(i=>i.kind!=='flamethrower');wearer.slots=(wearer.slots||[]).filter(id=>id!=='flamethrower');
    if(wearer.weapon==='flamethrower')wearer.weapon='hands';
    s.fires??=[];const fires=[],{width,height}=gridDimensions(s),offset=provider?.5:0;
    for(let y=Math.max(0,Math.ceil(origin.y-5-offset));y<=Math.min(height-1,Math.floor(origin.y+5-offset));y++)for(let x=Math.max(0,Math.ceil(origin.x-5-offset));x<=Math.min(width-1,Math.floor(origin.x+5-offset));x++){
      const point={x:x+offset,y:y+offset};if(!inside(s,point)||Math.hypot(point.x-origin.x,point.y-origin.y)>5)continue;
      const support=provider?.supportAt(s,{...point,h:origin.h},{radius:.04,maxDrop:.23,maxRise:.23});
      if(provider? !support||!provider.combat.blastAffects(s,origin,support,5):['void','water'].includes(s.map[y][x]))continue;
      const old=s.fires.find(p=>p.x===point.x&&p.y===point.y&&(p.z||0)===origin.z);
      if(old)old.turns=3;else{const p={...point,z:origin.z,turns:3,...(support?{h:support.h,floorId:support.floorId}:{})};s.fires.push(p);fires.push({...p});}
    }
    // Three integer-centred AFT cells span a physical 3 m square. Keep that
    // square centred on the actual fractional blast position; never snap actors.
    const victims=s.units.filter(u=>u.hp>0&&(u.z||0)===origin.z&&Math.abs(u.x-origin.x)<=1.5&&Math.abs(u.y-origin.y)<=1.5&&(!provider||provider.combat.blastAffects(s,origin,u,Math.SQRT2*1.5)));
    for(const u of victims){kill(s,u);if(u!==wearer)recordBurn(s,u,'ash');}
    for(const u of s.units)if(provider?provider.combat.blastAffects(s,origin,u,5):(u.z||0)===origin.z&&Math.hypot(u.x-origin.x,u.y-origin.y)<=5)ignite(s,u);
    const receipt=recordBurn(s,wearer,'tank');receipt.weapon=weapon;receipt.fires=fires;receipt.worn=weapon==='flamethrower';
    log(s,wearer.name+"'s fuel tanks exploded.");
    return {...origin,h:(origin.h??0)+.8,kind:'tank',unitId:wearer.id,fireSequence:receipt.sequence,burns:s.units.filter(u=>victims.includes(u)||u.burningTurns&&(provider?spatialDistance(u,origin)<=5:Math.hypot(u.x-origin.x,u.y-origin.y)<=5)).map(u=>u.id)};
  }
  function restore(s){
    for(const u of s.units)if(u.tanksExploded!==undefined&&(typeof u.tanksExploded!=='boolean'||u.tanksExploded&&(u.ammo?.flamethrower>0||u.ammoPouch?.flamethrower>0||u.weapon==='flamethrower'||u.pack?.some(i=>i.kind==='flamethrower')||u.slots?.includes('flamethrower'))))throw Error('Unsupported destroyed-tank save.');
  }
  return {explode,restore};
}
