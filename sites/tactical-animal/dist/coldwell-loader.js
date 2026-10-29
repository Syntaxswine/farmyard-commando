export const COLDWELL_CAPABILITIES=Object.freeze(['artist-coldwell-surface-v1','nautilus-extended-height-v1','artist-coldwell-annular-support-v1','artist-coldwell-stair-clearance-v1','artist-coldwell-dynamic-parts-v1']);
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const fail=message=>{throw Error('Coldwell refused: '+message);};
const frozen=value=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
export function validateColdwellData(manifest,data){
  if(manifest?.schema!=='farmyard-coldwell-runtime'||manifest.version!==1||manifest.id!=='coldwell-site-v1'||manifest.units!=='metres'||!/^[a-f0-9]{64}$/.test(manifest.sourceDigest))fail('unsupported runtime identity.');
  if(data?.schema!=='farmyard-coldwell-data'||data.version!==1||data.bundle?.id!==manifest.id||data.companion?.id!==data.bundle.companion?.id||data.bundle.companion.required!==true||data.companion.required!==true)fail('the complete companion is required.');
  if(JSON.stringify(data.bundle.requiredCapabilities)!==JSON.stringify(COLDWELL_CAPABILITIES)||JSON.stringify(manifest.requiredCapabilities)!==JSON.stringify(COLDWELL_CAPABILITIES))fail('capability requirements changed.');
  const c=data.companion.coordinates,p=c?.placement;
  if(c?.units!=='metres'||JSON.stringify(c.nativeScale)!=='[1,1,1]'||p?.x!==38.5||p?.y!==85.5||p?.h!==46.64||c.legacySurfaceToWorld.x!==.5||c.legacySurfaceToWorld.y!==.5||c.legacySurfaceToWorld.h!==46.64)fail('native coordinate contract changed.');
  if(data.surface?.width!==240||data.surface?.height!==240||data.plan?.floors?.length!==23||data.plan.floors.some((f,i)=>f.index!==i||Math.abs(f.worldElevationM-i*2.12)>1e-7))fail('source dimensions or datums changed.');
  if(data.rigs?.length!==11||new Set(data.rigs.map(r=>r.id)).size!==11||data.semantics?.stairs?.length!==31||data.semantics.floors.length!==38||!data.infill?.floors?.length)fail('incomplete native geometry.');
  if(manifest.geometry?.format!=='float32-le-triangles'||!Number.isInteger(manifest.geometry.floats)||manifest.geometry.floats<9||manifest.geometry.floats%9||manifest.geometry.bytes!==manifest.geometry.floats*4)fail('invalid collision storage.');
  let offset=0;
  for(const batch of data.batches||[]){if(batch.offset!==offset||!Number.isInteger(batch.count)||batch.count%9||!['silo','site','rig'].includes(batch.frame)||batch.frame==='rig'&&!data.rigs.some(r=>r.id===batch.rigId))fail('invalid collision batch.');offset+=batch.count;}
  if(offset!==manifest.geometry.floats)fail('collision data is incomplete.');
  return true;
}
export function decodeColdwellTerrain(surface){
  const cells=[];
  for(const [kind,count]of surface.terrainRLE||[]){if(!['ground-grass','floor','ground-concrete','void','ground-dirt'].includes(kind)||!Number.isInteger(count)||count<1||cells.length+count>240*240)fail('invalid terrain runs.');for(let i=0;i<count;i++)cells.push(kind);}
  if(cells.length!==240*240)fail('incomplete surface terrain.');
  return Array.from({length:240},(_,i)=>cells.slice(i*240,(i+1)*240));
}
export async function loadColdwell({baseURL=new URL('./coldwell/',import.meta.url),fetcher=fetch,signal}={}){
  const base=new URL(baseURL,import.meta.url);
  async function read(file){const response=await fetcher(new URL(file,base),{signal});if(!response.ok)fail('could not load '+file+'.');return new Uint8Array(await response.arrayBuffer());}
  const manifest=JSON.parse(new TextDecoder().decode(await read('runtime.manifest.json')));
  if(!Array.isArray(manifest.files)||manifest.files.length!==2)fail('invalid file manifest.');
  const verified=new Map();
  for(const name of ['data.json','collision.bin.gz']){
    const entry=manifest.files.find(f=>f.file===name);if(!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>16*1024*1024)fail('invalid file declaration.');
    const bytes=await read(name);if(bytes.length!==entry.bytes||await digest(bytes)!==entry.sha256)fail('integrity check failed for '+name+'.');verified.set(name,bytes);
  }
  const data=JSON.parse(new TextDecoder().decode(verified.get('data.json')));validateColdwellData(manifest,data);
  const zipped=new Blob([verified.get('collision.bin.gz')]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buffer=await new Response(zipped).arrayBuffer();
  if(buffer.byteLength!==manifest.geometry.bytes||await digest(buffer)!==manifest.geometry.sha256)fail('decompressed collision integrity mismatch.');
  const view=new DataView(buffer),positions=new Float32Array(manifest.geometry.floats);
  for(let i=0;i<positions.length;i++){positions[i]=view.getFloat32(i*4,true);if(!Number.isFinite(positions[i]))fail('non-finite geometry.');}
  const terrain=decodeColdwellTerrain(data.surface);
  return Object.freeze({manifest:frozen(manifest),data:frozen(data),terrain:frozen(terrain),positions});
}
export function requireColdwellCapabilities(provider){
  for(const id of COLDWELL_CAPABILITIES)if(!provider?.capabilities?.includes(id))fail('missing provider '+id+'.');
  return provider;
}
