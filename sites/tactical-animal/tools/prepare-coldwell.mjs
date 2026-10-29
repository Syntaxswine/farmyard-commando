import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {buildWorld} from '../dist/aft/tactics/hybrid-world.js';
import {EDGES} from '../dist/aft/tactics/environment.js';

// Owned deterministic conversion. Donor modules are data/reference, never executed.
const root=path.resolve('sources/coldwell'),out=path.resolve('sites/tactical-animal/dist/coldwell');
const check=process.argv.includes('--check');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>fs.readFileSync(path.join(root,name));
const json=name=>JSON.parse(read(name));
const bundle=json('site/map.bundle.json'),companion=json('site/silo-companion.json');
const expected={outer:'4abaee28fa9070f53a8923db28e2f92f8618d7443dfe16c5ae4421e21de87b36',archive:'b489bb7439a22746281eb2dcc052cd124cc77917a9c00aeaa4c02ee5f1db873f'};
if(bundle.id!=='coldwell-site-v1'||bundle.version!==1||!bundle.companion.required||companion.id!==bundle.companion.id)throw Error('Coldwell requires its exact companion.');
for(const entry of bundle.files){
  if(path.basename(entry.file)!==entry.file)throw Error('Unsafe source file.');
  const bytes=read('site/'+entry.file);
  if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('Coldwell source changed: '+entry.file);
}
const meshBytes=read('silo/coldwell-complex.game-mesh.json.gz'),mesh=JSON.parse(gunzipSync(meshBytes));
const blueprint=json('silo/assets-silo-models-coldwell-complex.blueprint.json');
if(sha(meshBytes)!=='308aee971d3c455de286fa6a266a4de1b4fc7aa89b89e6b058ced48f0083aab8'||sha(read('silo/assets-silo-models-coldwell-complex.blueprint.json'))!=='6169b232434af445030cc399141a389b377311b8922e45aedc0d2841cb772e59')throw Error('Native source differs from its original delivery manifest.');
const infill=json('site/surface-infill.mesh.json'),surface=json('site/surface.map.rle.json');
const artRoot=path.resolve('sites/tactical-animal/dist/art/coldwell');
const artManifest=JSON.parse(fs.readFileSync(path.join(artRoot,'manifest.json'))),surfaceRigs=[],artSources=[];
if(artManifest.source?.outerSHA256!==expected.outer||artManifest.source?.siloSHA256!==expected.archive)throw Error('Coldwell art/runtime sources differ.');
for(const descriptor of artManifest.rigs.filter(r=>r.id.startsWith('surface-door:'))){
  const entry=artManifest.entries.find(e=>e.rigId===descriptor.id),bytes=fs.readFileSync(path.join(artRoot,entry.url));
  if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('Surface rig integrity mismatch.');
  const part=JSON.parse(gunzipSync(bytes));if(part.rigs.length!==1||part.rigs[0].id!==descriptor.id||descriptor.frame!=='site')throw Error('Unexpected surface rig.');
  surfaceRigs.push({...part.rigs[0],frame:'site'});artSources.push({file:'art/coldwell/'+entry.url,sha256:sha(bytes),bytes:bytes.length});
}
if(surfaceRigs.length!==3)throw Error('Three original surface doors are required.');
const fullSurface=json('site/surface.map.json');
const inherited=buildWorld(fullSurface);
if(inherited.diagnostics.length)throw Error('Inherited surface geometry refused: '+JSON.stringify(inherited.diagnostics));
const surfaceVolumes=inherited.boxes.filter(b=>!['floor','roof'].includes(b.kind)&&!surfaceRigs.some(r=>b.id==='edge:'+r.sourceEdge+':door')).map(b=>({...b,min:[b.min[0]+.5,b.min[1]+46.64,b.min[2]+.5],max:[b.max[0]+.5,b.max[1]+46.64,b.max[2]+.5]}));
// AFT's transparent fence bars use EDGES.solid for walking; retain that separate policy.
for(const [edge,kind]of Object.entries(fullSurface.edges))if(EDGES[kind]?.solid&&!EDGES[kind].opaque){
  const [axis,sx,sy]=edge.split(':'),x=+sx+.5,y=+sy+.5;
  surfaceVolumes.push({id:'walk-edge:'+edge,kind:'fence',material:kind,source:{edge},min:axis==='e'?[x+.42,46.64,y-.5]:[x-.5,46.64,y+.42],max:axis==='e'?[x+.58,48.64,y+.5]:[x+.5,48.64,y+.58],blocksSight:false,blocksShot:false,walkOnly:true});
}
// Merge contiguous tile support offline; do not allocate a 57,600-panel world BVH.
const surfacePanels=[];
for(let z=0;z<3;z++){
  const rows=Array.from({length:240},(_,y)=>Array.from({length:240},(_,x)=>z?!!fullSurface.upper[z-1]?.[`${x},${y}`]:fullSurface.terrain[y][x]!=='void'));
  let previous=new Map();
  for(let y=0;y<240;y++){
    const next=new Map();
    for(let x=0;x<240;x++)if(rows[y][x]){
      const start=x;while(x+1<240&&rows[y][x+1])x++;const key=start+','+(x+1);
      const panel=previous.get(key)||{id:'site-panel-'+surfacePanels.length,x:start,y,w:x+1-start,d:0,h:46.64+z*2.12,floorId:z?'coldwell-roof-'+z:'coldwell-datum-22'};
      if(!previous.has(key))surfacePanels.push(panel);panel.d++;next.set(key,panel);
    }
    previous=next;
  }
}
if(mesh.schema!=='nautilus-silo-artist-mesh'||mesh.version!==1||mesh.lod!=='game'||mesh.asset.id!=='coldwell-complex'||mesh.metresPerUnit!==1||mesh.sourceProfile.floorSpacing!==2.12)throw Error('Unsupported collision source.');
if(JSON.stringify(mesh.semantics)!==JSON.stringify(blueprint.semantics))throw Error('Mesh/blueprint semantics mismatch.');
const positions=[],batches=[];
function append(batch,{frame,rigId=null}={}){
  const start=positions.length;
  if(batch.positions.length%9||!batch.positions.every(Number.isFinite))throw Error('Invalid triangle source.');
  // Append in bounded loops; large spreads can exceed V8's stack.
  for(const n of batch.positions)positions.push(n);
  batches.push({id:`${rigId||frame}:${batches.length}`,frame,rigId,kind:batch.kind,zone:batch.zone,level:batch.level,highLevel:batch.highLevel,offset:start,count:positions.length-start});
}
for(const batch of mesh.batches)append(batch,{frame:'silo'});
for(const rig of mesh.rigs)for(const batch of rig.batches)append(batch,{frame:'rig',rigId:rig.id});
for(const rig of surfaceRigs)for(const batch of rig.batches)append(batch,{frame:'rig',rigId:rig.id});
for(const batch of infill.batches)append(batch,{frame:'site'});
const compactSemantics=sem=>({...sem,floors:sem.floors.map(({cells,queryStatus,...floor})=>floor)});
const data={schema:'farmyard-coldwell-data',version:1,bundle,companion,surface,surfacePanels,surfaceVolumes,
  plan:blueprint.plan,semantics:compactSemantics(mesh.semantics),infill:compactSemantics(infill.semantics),
  rigs:[...mesh.rigs.map(r=>({...r,frame:'silo'})),...surfaceRigs].map(({batches,...rig})=>rig),batches,sourceBounds:blueprint.bounds,motionBounds:blueprint.motionBounds};
const raw=Buffer.alloc(positions.length*4);positions.forEach((n,i)=>raw.writeFloatLE(n,i*4));
// zlib versions/platforms may produce different valid gzip containers. The
// canonical derivative is the exact decoded Float32 byte stream. Check that
// stream and retain the shipped container, whose own SHA remains in the manifest.
let packed;
if(check){packed=fs.readFileSync(path.join(out,'collision.bin.gz'));if(!gunzipSync(packed).equals(raw))throw Error('Coldwell decoded collision bytes are stale.');}
else packed=gzipSync(raw,{level:9});
const outputs=new Map([['data.json',Buffer.from(JSON.stringify(data)+'\n')],['collision.bin.gz',packed]]);
const sourceFiles=['site/map.bundle.json',...bundle.files.map(f=>'site/'+f.file),'silo/assets-silo-models-coldwell-complex.blueprint.json','silo/coldwell-complex.game-mesh.json.gz'];
const sources=[...sourceFiles.map(file=>({file,sha256:sha(read(file)),bytes:read(file).length})),...artSources];
const sourceDigest=sha(Buffer.from(JSON.stringify(sources)));
const manifest={schema:'farmyard-coldwell-runtime',version:1,id:bundle.id,units:'metres',axes:['x','y','h'],sourceDigest,
  source:{...bundle.source,archiveSHA256:expected.archive,handoffSHA256:expected.outer,files:sources},
  requiredCapabilities:bundle.requiredCapabilities,
  geometry:{format:'float32-le-triangles',floats:positions.length,bytes:raw.length,sha256:sha(raw),facets:mesh.metrics.curveSegments,maximumShaftChordErrorM:mesh.metrics.maximumShaftChordErrorM},
  files:[...outputs].map(([file,bytes])=>({file,sha256:sha(bytes),bytes:bytes.length})),
  art:{module:'../art/coldwell/index.js',manifest:'../art/coldwell/manifest.json'},
  inventory:{...bundle.inventory,siloFloors:23,siloRigs:mesh.rigs.length,surfaceDoorRigs:surfaceRigs.length,roofHeight:48.76}};
outputs.set('runtime.manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
for(const [file,bytes]of outputs){
  const target=path.join(out,file);
  if(check){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error('Coldwell derived file is stale: '+file);}
  else{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(target,bytes);}
}
console.log(`Coldwell ${check?'verified':'prepared'}: ${batches.length} geometry batches, ${mesh.rigs.length} rigs, ${positions.length/9} triangles; source ${sourceDigest.slice(0,12)}.`);
