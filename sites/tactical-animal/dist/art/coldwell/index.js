// Farmyard presentation adapter. Motion and native material/view code live upstream.
import {createSiloModel} from './upstream/silo-renderer.js';
import {biomePaint} from './upstream/biome-paint.js';
import {BIOME_PAINT} from './upstream/biome-foliage-data.js';
import {createGroundPaint} from './upstream/map-ground-paint.js';
import {COLDWELL_ART_VERSION,FRAMES,intersects,normalizeVisibleRegion} from './contract.js';
export {COLDWELL_ART_VERSION} from './contract.js';
const abortError=()=>new DOMException('Coldwell art load cancelled','AbortError');
const isAbort=e=>e?.name==='AbortError';
const safeAsset=asset=>{if(!asset||typeof asset.url!=='string'||asset.url.startsWith('/')||asset.url.includes('..')||!(/^[a-zA-Z0-9_:/.-]+$/).test(asset.url)||!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0)throw Error('Invalid Coldwell asset descriptor');return asset;};
async function digest(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function validateManifest(m){
 if(m?.schema!=='farmyard-coldwell-art'||m.version!==1||m.metresPerUnit!==1||!Array.isArray(m.entries)||!Array.isArray(m.rigs)||!m.prototypes||!m.groundWeights)throw Error('Unsupported Coldwell art manifest');
 const ids=new Set();for(const e of m.entries){if(!e.id||ids.has(e.id)||!['surface','silo'].includes(e.kind)||!e.bounds||!['canonical','site','silo'].includes(e.frame))throw Error('Invalid/duplicate Coldwell component');ids.add(e.id);safeAsset(e);for(const k of ['x','y','h'])if(!Number.isFinite(e.bounds.min?.[k])||!Number.isFinite(e.bounds.max?.[k])||e.bounds.min[k]>e.bounds.max[k])throw Error('Invalid Coldwell component bounds');}
 const rigs=new Set();for(const r of m.rigs){if(!r.id||rigs.has(r.id)||!Number.isFinite(r.maximum)||r.maximum<=0)throw Error('Invalid Coldwell rig');rigs.add(r.id);}
 for(const a of [m.prototypes,m.groundWeights,...Object.values(m.textures)])safeAsset(a);
 return m;
}
// Height unions are presentation clipping only. The original paint runs first.
function heightClip(T,material,region){
 const compile=material.onBeforeCompile,cache=material.customProgramCacheKey();
 material.customProgramCacheKey=()=>cache+'-coldwell-band-union-'+region.heightBands.length;
 material.onBeforeCompile=(s,r)=>{
  compile.call(material,s,r);s.uniforms.coldwellBands={value:region.heightBands.map(b=>new T.Vector2(b.min,b.max))};
  s.vertexShader='varying float vColdwellHeight;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`vec4 coldwellWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\ncoldwellWorld=instanceMatrix*coldwellWorld;\n#endif\nvColdwellHeight=(modelMatrix*coldwellWorld).y;\n#include <project_vertex>`);
  s.fragmentShader=`varying float vColdwellHeight;uniform vec2 coldwellBands[${region.heightBands.length}];\n`+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>\nbool coldwellKeep=false;for(int cw=0;cw<${region.heightBands.length};cw++){if(vColdwellHeight>=coldwellBands[cw].x-.00001&&vColdwellHeight<=coldwellBands[cw].y+.00001)coldwellKeep=true;}if(!coldwellKeep)discard;`);
 };
 const p=region.cutaway.plane;material.clippingPlanes=p?[new T.Plane(new T.Vector3(...p.normal),p.constant)]:[];material.clipShadows=true;material.needsUpdate=true;return material;
}
function geometry(T,d){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(d.positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(d.normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(d.uvs,2));if(d.indices)g.setIndex(d.indices);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function geometryBytes(g){return Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0);}
/** Host supplies its existing THREE. No renderer, timer, simulation, or vendor import. */
export async function createColdwellArt({THREE:T,assetBaseURL=new URL('./',import.meta.url),manifest,fetch:fetcher=globalThis.fetch,loadTexture}={}){
 if(!T?.Group||!T?.InstancedMesh||!T?.MeshStandardMaterial||typeof fetcher!=='function')throw Error('Supply the host Three namespace and fetch');
 const base=new URL(assetBaseURL,import.meta.url),lifetime=new AbortController();let disposed=false,generation=0,activeRequest=null,region=null,manifestData;
 const pending=new Set(),resident=new Map(),texturePool=new Map(),geometryPool=new Map(),counters={fetchedBytes:0,createdModels:0,disposedModels:0,createdGeometries:0,disposedGeometries:0,createdTextures:0,disposedTextures:0};
 const root=new T.Group();root.name='Coldwell art';root.userData={artVersion:COLDWELL_ART_VERSION,canonicalMetres:true};
 const alive=()=>{if(disposed)throw Error('Coldwell art is disposed');};
 const absolute=a=>new URL(a.url,base).href;
 async function bytes(asset,signal=lifetime.signal){safeAsset(asset);const response=await fetcher(absolute(asset),{signal});if(!response.ok)throw Error('Coldwell asset HTTP '+response.status+': '+asset.url);const buffer=await response.arrayBuffer();if(signal.aborted||disposed)throw abortError();if(buffer.byteLength!==asset.bytes||await digest(buffer)!==asset.sha256)throw Error('Coldwell asset integrity mismatch: '+asset.url);counters.fetchedBytes+=buffer.byteLength;return buffer;}
 async function packed(asset,signal=lifetime.signal){const buffer=await bytes(asset,signal);const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));const value=await new Response(stream).json();if(signal.aborted||disposed)throw abortError();return value;}
 const releaseTexture=key=>{const record=texturePool.get(key);if(!record)return;if(--record.refs<0)throw Error('Unbalanced Coldwell texture release');if(!record.refs&&record.texture){record.texture.dispose();counters.disposedTextures++;texturePool.delete(key);}};
 async function acquireTexture(key){
  let record=texturePool.get(key);
  if(!record){const asset=manifestData.textures[key];if(!asset)throw Error('Unknown Coldwell texture '+key);record={refs:0,texture:null};texturePool.set(key,record);
   record.promise=(async()=>{
    let texture;
    if(loadTexture)texture=await loadTexture(absolute(asset),{signal:lifetime.signal,asset});
    else{
     const buffer=await bytes(asset),blob=new Blob([buffer],{type:'image/png'});
     // Keep the image upright for the source panel-average sampler. Three's
     // normal HTML-image upload supplies flipY exactly as in the donor renderer.
     const url=URL.createObjectURL(blob);try{const image=await new Promise((resolve,reject)=>{
      const i=new Image(),cancel=()=>{i.src='';reject(abortError());};
      lifetime.signal.addEventListener('abort',cancel,{once:true});
      i.onload=()=>{lifetime.signal.removeEventListener('abort',cancel);resolve(i);};i.onerror=()=>{lifetime.signal.removeEventListener('abort',cancel);reject(Error('Coldwell image decode failed'));};i.src=url;
     });texture=new T.Texture(image);}finally{URL.revokeObjectURL(url);}
    }
    if(!texture?.isTexture)throw Error('Coldwell texture loader did not return a Three texture');counters.createdTextures++;record.texture=texture;texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
    if(disposed||!record.refs){texture.dispose();counters.disposedTextures++;texturePool.delete(key);throw abortError();}return texture;
   })();
  }
  record.refs++;try{return await record.promise;}catch(error){record.refs--;if(!record.refs&&texturePool.get(key)===record)texturePool.delete(key);throw error;}
 }
 const materialTexture=recipe=>recipe.type==='map-ground'?'ground':recipe.type==='cargo'?recipe.texture:recipe.type==='biome'?({original:'plants',foliage:'foliage',ground:'ground'}[BIOME_PAINT[recipe.paint]?.atlas]):null;
 function acquireGeometry(id,prototypes){let r=geometryPool.get(id);if(!r){const data=prototypes.geometries[id];if(!data)throw Error('Missing Coldwell prototype '+id);r={geometry:geometry(T,data),refs:0};geometryPool.set(id,r);counters.createdGeometries++;}r.refs++;return r.geometry;}
 function releaseGeometry(id){const r=geometryPool.get(id);if(!r)return;if(--r.refs===0){r.geometry.dispose();counters.disposedGeometries++;geometryPool.delete(id);}}
 let prototypes,weights,liveStyle=null;const poses=new Map();
 try{
  if(!manifest){const response=await fetcher(new URL('manifest.json',base).href,{signal:lifetime.signal});if(!response.ok)throw Error('Coldwell manifest HTTP '+response.status);manifest=await response.json();}
  manifestData=validateManifest(structuredClone(manifest));for(const r of manifestData.rigs)poses.set(r.id,0);
  [prototypes,weights]=await Promise.all([packed(manifestData.prototypes),packed(manifestData.groundWeights)]);
 }catch(error){lifetime.abort();disposed=true;throw error;}
 function makeMaterial(recipe,textures,resources){
  let material;
  if(recipe.type==='map-ground'){const paint=createGroundPaint(T,weights,textures.ground);resources.push(paint);material=paint.ground;}
  else if(recipe.type==='biome'){
   const all=biomePaint(T).createBiomeMaterials({original:textures.plants,foliage:textures.foliage,ground:textures.ground},[recipe.paint]);material=all[recipe.paint];for(const m of Object.values(all))if(m!==material)m.dispose();if(!material)throw Error('Unknown Coldwell plant paint');resources.push(material);
  }else if(recipe.type==='cargo'){
   let map=null;if(recipe.texture){map=textures[recipe.texture].clone();map.offset.fromArray(recipe.offset);map.repeat.fromArray(recipe.repeat);map.needsUpdate=true;resources.push(map);}
   material=new T.MeshStandardMaterial({color:new T.Color(...recipe.color),roughness:recipe.roughness,metalness:recipe.metalness,side:recipe.side,map});material.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',recipe.patch);};material.customProgramCacheKey=()=> 'coldwell-cargo-'+recipe.patch;resources.push(material);
  }else if(recipe.type==='pixels'){
   const texture=new T.DataTexture(new Uint8Array(recipe.data),recipe.width,recipe.height);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.NearestFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;resources.push(texture);material=new T.MeshStandardMaterial({map:texture,roughness:1});
   // Original hybrid world-space planar projection, applied after instancing.
   material.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\n#ifdef USE_MAP\nvec3 surfaceWorld=(instanceMatrix*vec4(position,1.)).xyz-vec3(.5,46.64,.5);vMapUv=abs(normal.y)>.5?surfaceWorld.xz:abs(normal.x)>.5?surfaceWorld.zy:surfaceWorld.xy;\n#endif`);};material.customProgramCacheKey=()=> 'coldwell-hybrid-world-uv';resources.push(material);
  }else throw Error('Unknown Coldwell material recipe');
  return material;
 }
 async function build(entry,data,next,request){
  const textureIds=new Set(entry.kind==='silo'?['silo']:data.batches.map(b=>materialTexture(prototypes.materials[b.material])).filter(Boolean)),borrowed=[],resources=[],prototypeIds=[];let model=null,group=null;
  const record={entry,model:null,root:null,resources,prototypeIds,borrowed,disposed:false,dispose(){if(this.disposed)return;this.disposed=true;this.root?.removeFromParent();if(model){counters.disposedGeometries+=model.geometries.size;model.dispose();}else{group?.traverse(m=>{if(m.isInstancedMesh)m.dispose();});group?.clear();}for(const r of resources)r.dispose();for(const id of prototypeIds)releaseGeometry(id);for(const key of borrowed)releaseTexture(key);if(this.root)counters.disposedModels++;}};
  try{
   const textures={};for(const id of textureIds){textures[id]=await acquireTexture(id);borrowed.push(id);}
   if(disposed||request.signal.aborted)throw abortError();
   if(entry.kind==='silo'){
    model=createSiloModel(T,data,{atlas:textures.silo});model.root.position.fromArray(FRAMES[entry.frame]);model.setView({roof:next.cutaway.roofs,display:next.cutaway.display});if(entry.rigId)model.setRigPose(entry.rigId,poses.get(entry.rigId));group=model.root;record.model=model;counters.createdGeometries+=model.geometries.size;
   }else{
    group=new T.Group();const materialCache=new Map();
    for(const b of data.batches){if(!materialCache.has(b.material)){const recipe=prototypes.materials[b.material];if(!recipe)throw Error('Missing Coldwell material');materialCache.set(b.material,makeMaterial(recipe,textures,resources));}
     const g=acquireGeometry(b.geometry,prototypes);prototypeIds.push(b.geometry);const mesh=new T.InstancedMesh(g,materialCache.get(b.material),b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,new T.Matrix4().fromArray(m)));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.userData.sourceIds=b.sourceIds;mesh.castShadow=entry.category!=='ground';mesh.receiveShadow=true;group.add(mesh);
    }
   }
   record.root=group;group.name=entry.id;group.userData.componentId=entry.id;
   const depth=heightClip(T,new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}),next),distance=heightClip(T,new T.MeshDistanceMaterial(),next);resources.push(depth,distance);const mats=new Set();
   group.traverse(m=>{if(!m.isMesh)return;m.userData.componentId=entry.id;if(entry.rigId)m.userData.rigId=entry.rigId;m.customDepthMaterial=depth;m.customDistanceMaterial=distance;mats.add(m.material);});for(const m of mats)heightClip(T,m,next);
   counters.createdModels++;return record;
  }catch(error){record.dispose();throw error;}
 }
 function diagnostics(){
  const gs=new Set(),ms=new Set(),ts=new Set();let drawObjects=0,triangles=0,instanceBytes=0;
  root.traverse(m=>{if(!m.isMesh)return;gs.add(m.geometry);ms.add(m.material);if(m.customDepthMaterial)ms.add(m.customDepthMaterial);if(m.customDistanceMaterial)ms.add(m.customDistanceMaterial);if(m.visible){drawObjects++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.isInstancedMesh?m.count:1);}if(m.instanceMatrix)instanceBytes+=m.instanceMatrix.array.byteLength;if(m.material.map)ts.add(m.material.map);});
  for(const r of texturePool.values())if(r.texture)ts.add(r.texture);
  return {version:COLDWELL_ART_VERSION,disposed,generation,region:region?structuredClone(region):null,residentEntries:resident.size,residentIds:[...resident.keys()],drawObjects,triangles,geometries:gs.size,materials:ms.size,textures:ts.size,geometryBytes:[...gs].reduce((n,g)=>n+geometryBytes(g),0),instanceBytes,texturePixels:[...ts].reduce((n,t)=>n+(t.image?.width||0)*(t.image?.height||0),0),pendingRequests:pending.size,poses:Object.fromEntries(poses),counters:{...counters},measurement:'Candidate geometry/resources; real renderer.info and GPU timing belong to the host.'};
 }
 function syncDynamicState(values){
  alive();const updates=values instanceof Map?[...values]:values&&Object.getPrototypeOf(values)===Object.prototype?Object.entries(values):null;if(!updates)throw Error('Supply a pose record or Map');
  const ranges=new Map(manifestData.rigs.map(r=>[r.id,r.maximum]));for(const [id,value]of updates)if(!ranges.has(id)||!Number.isFinite(value)||value<0||value>ranges.get(id))throw Error('Invalid Coldwell pose: '+id);
  for(const [id,value]of updates){poses.set(id,value);for(const r of resident.values())if(r.entry.rigId===id)r.model.setRigPose(id,value);}
 }
 function setVisibleRegion(input){
  alive();const next=normalizeVisibleRegion(input);if(root.position.lengthSq()>1e-16||root.quaternion.angleTo(new T.Quaternion())>1e-8||root.scale.distanceTo(new T.Vector3(1,1,1))>1e-8)throw Error('Coldwell root must retain the canonical identity transform');
  activeRequest?.abort();const request=new AbortController();activeRequest=request;const mine=++generation;
  const task=(async()=>{
   const staged=new Map(),reused=new Map(),style=JSON.stringify([next.heightBands,next.cutaway]);
   try{
    const wanted=manifestData.entries.filter(e=>intersects(e.bounds,next.rect,next.heightBands)&&(next.cutaway.canopies||e.category!=='canopy')&&(next.cutaway.roofs||e.category!=='roof')&&(next.cutaway.display||e.zone!=='display'));
    const missing=wanted.filter(e=>{if(style===liveStyle&&resident.has(e.id)){reused.set(e.id,resident.get(e.id));return false;}return true;});
    let cursor=0;const worker=async()=>{while(cursor<missing.length){if(request.signal.aborted||disposed)throw abortError();const entry=missing[cursor++],data=await packed(entry,request.signal),record=await build(entry,data,next,request);staged.set(entry.id,record);}};
    const results=await Promise.allSettled(Array.from({length:Math.min(6,missing.length)},worker));const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    if(disposed||mine!==generation||request.signal.aborted)throw abortError();
    for(const [id,r]of resident)if(!reused.has(id))r.dispose();resident.clear();for(const [id,r]of reused)resident.set(id,r);
    for(const [id,r]of staged){if(r.entry.rigId)r.model.setRigPose(r.entry.rigId,poses.get(r.entry.rigId));resident.set(id,r);root.add(r.root);}staged.clear();region=next;liveStyle=style;root.updateMatrixWorld(true);return {applied:true,...diagnostics()};
   }catch(error){request.abort();for(const r of staged.values())r.dispose();if(isAbort(error)||disposed||mine!==generation)return {applied:false,superseded:mine!==generation,disposed};throw error;}
  })();pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;
 }
 let disposal;
 function dispose(){if(disposal)return disposal;disposed=true;generation++;activeRequest?.abort();lifetime.abort();root.removeFromParent();for(const r of resident.values())r.dispose();resident.clear();root.clear();disposal=Promise.allSettled([...pending]).then(()=>{for(const [key,r]of texturePool){if(r.texture){r.texture.dispose();counters.disposedTextures++;}texturePool.delete(key);}for(const [key,r]of geometryPool){r.geometry.dispose();counters.disposedGeometries++;geometryPool.delete(key);}});return disposal;}
 return {root,setVisibleRegion,syncDynamicState,diagnostics,getManifest:()=>structuredClone(manifestData),dispose,whenIdle:()=>Promise.allSettled([...pending])};
}
