// Original artist assembly, informed by the public, decommissioned museum plan.
// Dimensions/roles are art data, not a game collision or launch-system contract.
import {WALL_KIT} from '../map-core/wall-runs.js';
export const SILO_NATIVE=Object.freeze({tile:WALL_KIT.panel,wallHeight:WALL_KIT.height,wallThickness:WALL_KIT.thickness,
 slab:.12,floorSpacing:WALL_KIT.floorSpacing,intervals:22,verticalOffset:46.64,surfaceIndex:22,
 sourceWorldPin:'fbb57293805ecae34569ab3dd9f689ffea53beb0',profileId:'native-metres-v1'});
export const levelY=index=>Math.round((index-22)*SILO_NATIVE.floorSpacing*1e6)/1e6;
export const floorId=index=>'coldwell-datum-'+String(index).padStart(2,'0');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const SILO_PLAN=freeze({id:'coldwell-complex',name:'Coldwell Silo',units:'metres',
 source:'Titan II museum architectural arrangement; original rounded/grid adaptation, not an as-built reconstruction',
 shaft:{center:[111,18],outerRadius:8.5,clearRadius:7.5,voidRadius:4,wallThickness:1,deckIndices:[0,2,5,8,11,14,17,20],
  stair:{x:109,z:22,width:4,depth:3,hole:{x:110,z:22,width:3,depth:3}},
  servicePortal:{theta:Math.PI,width:3,bottom:levelY(17),height:3},
  platformIndices:[5,8,11,14,17,20]},
 capsule:{center:[11.5,18],outerRadius:6,clearRadius:5,plateIndices:[15,17,19],wallTopIndex:20,
  stair:{x:7,z:16.5,width:4,depth:3,hole:{x:8,z:16.5,width:3,depth:3}},
  roomUses:['utilities','control gallery','living quarters'],
  portal:{theta:0,width:3,bottom:levelY(17),height:3}},
 cableways:[{id:'short-cableway',a:[17.5,18],b:[31.5,18],length:14,diameter:3,index:17},
  {id:'long-cableway',a:[40.5,18],b:[102.5,18],length:62,diameter:3,index:17}],
 lock:{x:31.5,z:13.5,width:9,depth:9,index:17},
 portal:{x:32.5,z:26.5,width:5,depth:6,bottomIndex:17,topIndex:22,stair:{x:33,z:28,width:4,depth:3,hole:{x:34,z:28,width:3,depth:3}}},
 cover:{center:[111,18],width:9,depth:9,height:1,travel:12},
 nativeToWorld:{translation:[0,46.64,0],inverseTranslation:[0,-46.64,0],
  meaning:'Signed native local Y is preserved. Deepest plate maps to world h=0; native surface maps to world h=46.64. This is artist binding metadata, not a general terrain/basement implementation.'},
 floors:Array.from({length:23},(_,index)=>({id:floorId(index),index,label:index===22?'G':'B'+(22-index),
  nativeY:levelY(index),worldElevationM:Math.round(index*2.12*1e6)/1e6,
  roles:[...(index===22?['surface']:[]),...(index<=22?['shaft-stair-landing']:[]),...([0,2,5,8,11,14,17,20].includes(index)?['equipment-deck']:[]),
   ...([15,17,19].includes(index)?[['utilities','control','living'][[15,17,19].indexOf(index)]]:[]),...(index===17?['cableways','blast-lock','portal-base']:[])]})),
 requiredGeometry:['annular walls with explicit apertures','clipped boundary floor polygons','vaulted cableways','stair treads/landings','independent moving doors/cover'],
 integration:'Artist custom geometry provider. Current axis-aligned world queries cannot represent the curved structure exactly; game query/navigation adoption requires a separate reviewed capability.'});
export const SILO_ASSETS=freeze([
 {id:'coldwell-complex',name:'Coldwell Silo · complete complex',kind:'complex',levels:23},
 {id:'coldwell-shaft',name:'Silo shaft · eight decks and service stair',kind:'shaft',levels:23},
 {id:'coldwell-capsule',name:'Control capsule · three principal decks',kind:'capsule',levels:7},
 {id:'silo-access-portal',name:'Access portal · five descending intervals',kind:'portal',levels:6},
 {id:'silo-blast-lock',name:'Dogleg blast lock · four doors',kind:'lock',levels:1},
 {id:'silo-cableway',name:'Round cableway · 4 m repeat',kind:'cableway',levels:2},
 {id:'silo-wall-quarter',name:'Outer round wall · 90 degree sector',kind:'wall',levels:1},
 {id:'silo-wall-portal',name:'Round wall · service opening',kind:'wall-portal',levels:2},
 {id:'silo-annular-deck',name:'Annular deck · clipped metre tiles',kind:'deck',levels:1},
 {id:'silo-service-platform',name:'Retractable service bridge · art prop',kind:'platform',levels:1},
 {id:'silo-switchback',name:'Switchback stair · 4 × 3 m',kind:'stair',levels:2},
 {id:'silo-heavy-door',name:'Heavy door · independent hinge',kind:'door',levels:1},
 {id:'silo-equipment-rack',name:'Equipment rack · 1 × 1 m',kind:'rack',levels:1},
 {id:'silo-control-console',name:'Control desk and chair · 2 × 2 m bay',kind:'console',levels:1},
 {id:'silo-surface-cover',name:'Silo cover · sliding display',kind:'cover',levels:1}
]);
export function siloAsset(id='coldwell-complex'){
 const asset=SILO_ASSETS.find(a=>a.id===id);if(!asset)throw Error('Unknown silo asset: '+id);return structuredClone(asset);
}
