// Optional artist renderer. The host owns Three, renderer, clock and any texture.
import {buildSiloMesh,SILO_MATERIALS} from './mesh.js';
import {levelY,SILO_PLAN} from './designs.js';
export function createSiloModel(T,input='coldwell-complex',{atlas=null,lod='game',uvMode='metres',grey=false}={}){
 if(!T?.Group||!T?.BufferGeometry||!T?.Plane||!T?.MeshStandardMaterial)throw Error('Supply the host Three namespace.');
 if(atlas!==null&&!atlas?.isTexture)throw Error('The borrowed atlas must be a Three texture.');
 const data=input?.schema==='nautilus-silo-artist-mesh'?structuredClone(input):buildSiloMesh(input,{lod,uvMode});
 const root=new T.Group(),materials=new Map(),geometries=new Set(),objects=[],rigs=[];let disposed=false;
 root.name=data.asset.id;root.userData={assetId:data.asset.id,artistGeometry:true,metresPerUnit:1,nativeToWorld:structuredClone(data.nativeToWorld),consumerIntegrated:false};
 const alive=()=>{if(disposed)throw Error('Silo model is disposed.');};
 const shaderToken='texture2D( map, vMapUv )';
 if(atlas&&!grey&&data.uvMode==='metres'&&!T.ShaderChunk.map_fragment.includes(shaderToken))throw Error('Host atlas shader is unsupported.');
 function material(batch){
  const key=batch.material+':'+batch.zone;if(materials.has(key))return materials.get(key);const spec=SILO_MATERIALS[batch.material];
  const m=new T.MeshStandardMaterial({name:key,color:grey?0xa5ada7:new T.Color(...spec.color),roughness:spec.roughness,metalness:spec.metalness||0,map:!grey&&spec.tile!==null?atlas:null});
  if(atlas&&!grey&&spec.tile!==null&&data.uvMode==='metres'){
   const offset=[(spec.tile%2+.02)/2,(1-Math.floor(spec.tile/2)+.02)/2],scale=[.48,.48];
   m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace(shaderToken,`textureGrad( map, vec2(${offset.join(',')}) + fract(vMapUv) * vec2(${scale.join(',')}), dFdx(vMapUv) * vec2(${scale.join(',')}), dFdy(vMapUv) * vec2(${scale.join(',')}) )`));};
   m.customProgramCacheKey=()=>`silo-atlas-v1:${spec.tile}`;
  }
  materials.set(key,m);return m;
 }
 function mesh(batch,parent){
  const g=new T.BufferGeometry();for(const [id,values,size]of [['position',batch.positions,3],['normal',batch.normals,3],['uv',batch.uvs,2]])g.setAttribute(id,new T.Float32BufferAttribute(values,size));
  g.computeBoundingBox();g.computeBoundingSphere();geometries.add(g);
  const object=new T.Mesh(g,material(batch));object.name=[batch.zone,batch.kind,batch.level,batch.material].join('-');
  object.userData={kind:batch.kind,zone:batch.zone,level:batch.level,highLevel:batch.highLevel,materialId:batch.material};object.castShadow=object.receiveShadow=true;parent.add(object);objects.push(object);return object;
 }
 try{
  for(const b of data.batches)mesh(b,root);
  for(const descriptor of data.rigs){const group=new T.Group();group.name=descriptor.id;group.position.fromArray(descriptor.pivot);group.rotation.y=descriptor.yaw;root.add(group);for(const b of descriptor.batches)mesh(b,group);rigs.push({descriptor,group,value:0});}
 }catch(error){for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();throw error;}
 let view={floorIndex:null,band:0,cutaway:false,roof:true,display:true};
 function setRigPose(id,value){
  alive();const rig=rigs.find(r=>r.descriptor.id===id);if(!rig)throw Error('Unknown silo rig: '+id);const d=rig.descriptor;
  if(!Number.isFinite(value)||value<0||value>d.maximum)throw Error('Rig pose outside its declared range.');
  rig.group.position.fromArray(d.pivot);rig.group.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),d.yaw);
  if(d.kind==='door')rig.group.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(...d.axis),value*Math.PI/180*d.swingSign));
  else rig.group.position.add(new T.Vector3(...d.travel).multiplyScalar(value));rig.value=value;root.updateMatrixWorld(true);
 }
 function setKind(kind,value){for(const r of rigs)if(r.descriptor.kind===kind)setRigPose(r.descriptor.id,value);}
 function setView(next={}){
  alive();for(const key of Object.keys(next))if(!['floorIndex','band','cutaway','roof','display'].includes(key))throw Error('Unknown silo view field: '+key);
  const candidate={...view,...next};if(candidate.floorIndex!==null&&(!Number.isInteger(candidate.floorIndex)||candidate.floorIndex<0||candidate.floorIndex>22))throw Error('Choose a declared silo floor index or null for overview.');
  if(!Number.isInteger(candidate.band)||candidate.band<0||candidate.band>3)throw Error('Use a floor band from zero to three.');
  for(const key of ['cutaway','roof','display'])if(typeof candidate[key]!=='boolean')throw Error('Silo view switches must be boolean.');
  if(root.scale.distanceTo(new T.Vector3(1,1,1))>1e-8)throw Error('Native asset scaling is unsupported; preserve metre geometry.');
  view=candidate;root.updateMatrixWorld(true);
  const low=candidate.floorIndex===null?-Infinity:Math.max(0,candidate.floorIndex-candidate.band),high=candidate.floorIndex===null?Infinity:Math.min(23,candidate.floorIndex+candidate.band+1);
  const planesByZone=new Map();
  for(const object of objects){const b=object.userData;object.visible=(candidate.roof||b.kind!=='roof')&&(candidate.display||b.kind!=='display')&&(candidate.floorIndex===null||(b.highLevel>=low&&b.level<high));
   if(!planesByZone.has(b.zone)){const planes=[];if(candidate.floorIndex!==null){planes.push(new T.Plane(new T.Vector3(0,1,0),-levelY(low)+.13),new T.Plane(new T.Vector3(0,-1,0),levelY(high)-.005));}
    if(candidate.cutaway&&b.zone!=='display'){const z=b.zone==='access'?29.5:b.zone==='component'?(data.bounds.min[2]+data.bounds.max[2])/2:18;planes.push(new T.Plane(new T.Vector3(0,0,-1),z));}
    planesByZone.set(b.zone,planes.map(p=>p.applyMatrix4(root.matrixWorld)));}
   object.material.clippingPlanes=planesByZone.get(b.zone);object.material.clipShadows=true;object.material.needsUpdate=true;
  }
  return {...view,visibleBatches:objects.filter(o=>o.visible).length,visibleTriangles:objects.filter(o=>o.visible).reduce((n,o)=>n+o.geometry.attributes.position.count/3,0)};
 }
 setView();
 return {root,data,asset:data.asset,rigs,materials,geometries,bounds:data.bounds,triangles:data.metrics.triangles,
  setRigPose,setDoorsOpen:open=>{alive();if(typeof open!=='boolean')throw Error('Door state must be boolean.');setKind('door',open?90:0);},
  setPlatformsRetracted:retracted=>{alive();if(typeof retracted!=='boolean')throw Error('Platform state must be boolean.');setKind('platform',retracted?1:0);},
  setCoverOpen:value=>setRigPose('silo-cover',value),setView,
  diagnostics(){alive();return {...data.metrics,visibleBatches:objects.filter(o=>o.visible).length,visibleTriangles:objects.filter(o=>o.visible).reduce((n,o)=>n+o.geometry.attributes.position.count/3,0),view:{...view},rigs:rigs.map(r=>({id:r.descriptor.id,value:r.value}))};},
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();geometries.clear();materials.clear();objects.length=0;rigs.length=0;}
 };
}
export const siloNativeToWorld=Object.freeze(structuredClone(SILO_PLAN.nativeToWorld));
