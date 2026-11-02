import {LIMITS,WorldError,fail,fields,finite,integer,text,identifier,list,boolean,point,box,inside,inputData,ordered} from './validation.js';

export const WORLD_CONTRACT=Object.freeze({schemaId:'nautilus-extended-world',version:1,
  schemaUri:'urn:nautilus:schema:extended-world:1',profileId:'native-metres-v1',
  heightCapability:'nautilus-extended-height-v1',geometryCapability:'nautilus-world-aabb-v1',
  traversalCapability:'nautilus-world-traversal-links-v1',placementsCapability:'nautilus-world-placements-v1',
  coordinates:'x/y horizontal, h vertical; metres; Three maps to (x,h,y)',
  standardStoryHeightM:2.12,limits:LIMITS});
const rootFields=['kind','version','id','name','profileId','bounds','floors','surfaces','entities','links'];
function unique(records,path,seen){for(let i=0;i<records.length;i++){const record=records[i];identifier(record.id,path+'/'+i+'/id');if(seen.has(record.id))fail('DUPLICATE_ID',path+'/'+i+'/id','Record IDs must be unique throughout the world.');seen.add(record.id);}}
function worldPoint(position,state,path){point(position,path);if(!inside(position,{min:{x:0,y:0,h:state.bounds.minHeightM},max:{x:state.bounds.widthM,y:state.bounds.depthM,h:state.bounds.heightM}}))fail('OUTSIDE_WORLD',path,'Position is outside declared metre bounds.');}
function floorOf(id,floors,path){identifier(id,path);const floor=floors.get(id);if(!floor)fail('MISSING_FLOOR',path,'No floor has ID '+id+'.');return floor;}
function landing(value,state,floors,surfaces,path){
  fields(value,['floorId','surfaceId','position'],path);const floor=floorOf(value.floorId,floors,path+'/floorId');identifier(value.surfaceId,path+'/surfaceId');worldPoint(value.position,state,path+'/position');
  const surface=surfaces.get(value.surfaceId);
  if(!surface||!surface.supports||surface.supportFloorId!==floor.id||value.position.h!==floor.elevationM||!inside(value.position,surface.bounds)||value.position.h!==surface.bounds.max.h)fail('INVALID_LANDING',path,'Landing must lie on the named supporting top face at its explicit floor height.');
}
export function openWorld(input){
  const state=inputData(input);fields(state,rootFields,'');
  if(state.kind!==WORLD_CONTRACT.schemaId||state.version!==1)fail('UNSUPPORTED_SCHEMA','/version','Expected nautilus-extended-world version 1.');
  if(state.profileId!==WORLD_CONTRACT.profileId)fail('UNSUPPORTED_PROFILE','/profileId','Unsupported world height profile.');
  identifier(state.id,'/id');text(state.name,96,'/name');fields(state.bounds,['widthM','depthM','minHeightM','heightM'],'/bounds');
  finite(state.bounds.widthM,.001,LIMITS.extentM,'/bounds/widthM');finite(state.bounds.depthM,.001,LIMITS.extentM,'/bounds/depthM');finite(state.bounds.minHeightM,-LIMITS.heightM,0,'/bounds/minHeightM');finite(state.bounds.heightM,.001,LIMITS.heightM,'/bounds/heightM');
  list(state.floors,LIMITS.floors,'/floors');if(!state.floors.length)fail('MISSING_FLOORS','/floors','Declare at least one ordinary floor.');
  list(state.surfaces,LIMITS.surfaces,'/surfaces');list(state.entities,LIMITS.entities,'/entities');list(state.links,LIMITS.links,'/links');
  const seen=new Set();for(const key of ['floors','surfaces','entities','links']){for(let i=0;i<state[key].length;i++)fields(state[key][i],key==='floors'?['id','index','label','elevationM']:key==='surfaces'?['id','floorId','role','bounds','supports','supportFloorId']:key==='entities'?['id','kind','content','floorId','position','yawRadians','supportSurfaceId']:['id','kind','from','to','bidirectional'],'/'+key+'/'+i);unique(state[key],'/'+key,seen);}
  let previous=-1;const floors=new Map(),surfaces=new Map();
  state.floors.forEach((floor,index)=>{integer(floor.index,0,LIMITS.floors-1,'/floors/'+index+'/index');if(floor.index!==index)fail('INVALID_FLOOR_ORDER','/floors/'+index+'/index','Ordinary floor indices must be contiguous from zero; IDs remain independent.');text(floor.label,36,'/floors/'+index+'/label');finite(floor.elevationM,0,state.bounds.heightM,'/floors/'+index+'/elevationM');if(floor.elevationM<=previous)fail('INVALID_HEIGHT_ORDER','/floors/'+index+'/elevationM','Floor elevations must strictly increase. Basements need a future profile.');previous=floor.elevationM;floors.set(floor.id,floor);});
  state.surfaces.forEach((surface,index)=>{
    const path='/surfaces/'+index,floor=floorOf(surface.floorId,floors,path+'/floorId');
    if(!['floor','roof','solid'].includes(surface.role))fail('UNSUPPORTED_GEOMETRY',path+'/role','This provider supports floor/roof panels and axis-aligned solids only.');
    box(surface.bounds,path+'/bounds');worldPoint(surface.bounds.min,state,path+'/bounds/min');worldPoint(surface.bounds.max,state,path+'/bounds/max');
    if(surface.bounds.min.x===surface.bounds.max.x||surface.bounds.min.y===surface.bounds.max.y||(surface.role==='solid'&&surface.bounds.min.h===surface.bounds.max.h))fail('INVALID_GEOMETRY',path+'/bounds','Panels need positive horizontal area; solids also need positive height.');
    boolean(surface.supports,path+'/supports');
    if(surface.supportFloorId!==null){const supportFloor=floorOf(surface.supportFloorId,floors,path+'/supportFloorId');if(!surface.supports||supportFloor.elevationM!==surface.bounds.max.h)fail('INVALID_SUPPORT',path+'/supportFloorId','A confirmed support floor must match the supporting top height exactly.');}
    if(surface.role==='floor'&&(!surface.supports||surface.supportFloorId!==floor.id||surface.bounds.min.h!==floor.elevationM||surface.bounds.max.h!==floor.elevationM))fail('INVALID_FLOOR_SURFACE',path,'Floor panels must lie exactly on their ordinary floor height and provide support.');
    surfaces.set(surface.id,surface);
  });
  state.entities.forEach((entity,index)=>{
    const path='/entities/'+index;floorOf(entity.floorId,floors,path+'/floorId');worldPoint(entity.position,state,path+'/position');finite(entity.yawRadians,-Math.PI,Math.PI,path+'/yawRadians');
    if(!['actor','content'].includes(entity.kind))fail('UNSUPPORTED_ENTITY',path+'/kind','Only actor spawn anchors and content placements are defined.');
    fields(entity.content,['id','version'],path+'/content');identifier(entity.content.id,path+'/content/id');text(entity.content.version,96,path+'/content/version');
    if(entity.supportSurfaceId!==null)landing({floorId:entity.floorId,surfaceId:entity.supportSurfaceId,position:entity.position},state,floors,surfaces,path+'/support');
    else if(entity.kind==='actor')fail('INVALID_LANDING',path+'/supportSurfaceId','An actor spawn requires an explicit supported landing.');
  });
  state.links.forEach((link,index)=>{const path='/links/'+index;if(!['stairs','ladder','ramp'].includes(link.kind))fail('UNSUPPORTED_TRAVERSAL',path+'/kind','Only declared stair, ladder and ramp endpoint links are supported.');boolean(link.bidirectional,path+'/bidirectional');landing(link.from,state,floors,surfaces,path+'/from');landing(link.to,state,floors,surfaces,path+'/to');if(link.from.floorId===link.to.floorId)fail('INVALID_TRAVERSAL',path,'An inter-floor link must name distinct floors.');});
  return state;
}
export function createWorld(options){
  fields(options,['id','name','widthM','depthM','floorCount','storyHeightM','groundHeightM','heightM','minHeightM'],'/options',['id','name','widthM','depthM','floorCount','storyHeightM','groundHeightM','heightM']);
  integer(options.floorCount,1,LIMITS.floors,'/options/floorCount');finite(options.storyHeightM,.001,LIMITS.heightM,'/options/storyHeightM');finite(options.groundHeightM,0,LIMITS.heightM,'/options/groundHeightM');
  return openWorld({kind:WORLD_CONTRACT.schemaId,version:1,id:options.id,name:options.name,profileId:WORLD_CONTRACT.profileId,
    bounds:{widthM:options.widthM,depthM:options.depthM,minHeightM:Object.hasOwn(options,'minHeightM')?options.minHeightM:0,heightM:options.heightM},floors:Array.from({length:options.floorCount},(_,index)=>({id:'floor-'+index,index,label:String(index+1),elevationM:options.groundHeightM+index*options.storyHeightM})),surfaces:[],entities:[],links:[]});
}
export function validateWorld(input){try{openWorld(input);return [];}catch(error){return error.diagnostics||[{code:'INVALID_WORLD',path:'/',message:error.message,action:'Correct the world.'}];}}
export function serializeWorld(input){return JSON.stringify(ordered(openWorld(input)));}
export function worldRequirements(input){const state=openWorld(input),ids=[WORLD_CONTRACT.heightCapability];if(state.surfaces.length)ids.push(WORLD_CONTRACT.geometryCapability);if(state.entities.length)ids.push(WORLD_CONTRACT.placementsCapability);if(state.links.length)ids.push(WORLD_CONTRACT.traversalCapability);return {schema:{id:WORLD_CONTRACT.schemaId,version:1},required:ids.map(id=>({id,minVersion:1,maxVersion:1})),optional:[]};}
export function assertWorldCompatible(input,consumer){
  const state=openWorld(input),requirements=worldRequirements(state);consumer=inputData(consumer);fields(consumer,['id','version','contractVersion','schemas','capabilities'],'/consumer',['id','contractVersion','schemas','capabilities']);identifier(consumer.id,'/consumer/id');if(Object.hasOwn(consumer,'version'))text(consumer.version,96,'/consumer/version');if(consumer.contractVersion!==1)fail('INVALID_CONSUMER','/consumer/contractVersion','Expected consumer contract version 1.');
  for(const group of ['schemas','capabilities']){
    list(consumer[group],128,'/consumer/'+group);const ids=new Set();
    for(const [index,entry] of consumer[group].entries()){
      const path='/consumer/'+group+'/'+index;fields(entry,['id','versions','description'],path,['id','versions']);identifier(entry.id,path+'/id');if(Object.hasOwn(entry,'description'))text(entry.description,1000,path+'/description');
      if(ids.has(entry.id))fail('INVALID_CONSUMER',path+'/id','Duplicate supported ID.');ids.add(entry.id);list(entry.versions,32,path+'/versions');if(!entry.versions.length)fail('INVALID_CONSUMER',path+'/versions','Declare at least one version.');
      const versions=new Set();for(const [versionIndex,version] of entry.versions.entries()){const versionPath=path+'/versions/'+versionIndex;integer(version,1,1000000,versionPath);if(versions.has(version))fail('INVALID_CONSUMER',versionPath,'Duplicate supported version.');versions.add(version);}
    }
  }
  const diagnostics=[];if(!consumer.schemas.some(entry=>entry.id===requirements.schema.id&&entry.versions.includes(1)))diagnostics.push({code:'UNSUPPORTED_SCHEMA',path:'/schema',message:'Consumer does not implement extended-world v1.',action:'Use an explicitly compatible adapter; preserve the source world.'});
  for(const [index,required] of requirements.required.entries())if(!consumer.capabilities.some(entry=>entry.id===required.id&&entry.versions.includes(1)))diagnostics.push({code:'UNSUPPORTED_REQUIRED_FEATURE',path:'/required/'+index,message:'Missing '+required.id+'.',action:'Provide this semantic binding before opening the world.'});
  if(diagnostics.length){const error=new WorldError('INCOMPATIBLE_WORLD','/',diagnostics.map(item=>item.message).join(' '));error.diagnostics=diagnostics;throw error;}return state;
}
