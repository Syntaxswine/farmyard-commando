"""Prepare verified Coldwell inputs and reproducible source-only adapters.
Usage: python prepare.py VERIFIED_PACKAGE_DIR PINNED_NAUTILUS_CHECKOUT
No donor build script is executed. Donor checkouts are read only.
"""
from pathlib import Path
import sys,json,zipfile,hashlib,subprocess,re,gzip
root=Path(__file__).resolve().parents[1]
package=Path(sys.argv[1]); engine=Path(sys.argv[2]); revision='8c4670450cb2b38c1e1abd811d633c22de9e2b7c'
sha=lambda b:hashlib.sha256(b).hexdigest()
def put(name,data):
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data if isinstance(data,bytes) else data.encode('utf-8'))
outer=package.parent/'coldwell-map-farmyard-handoff.zip'
assert sha(outer.read_bytes())=='4abaee28fa9070f53a8923db28e2f92f8618d7443dfe16c5ae4421e21de87b36'
outer_zip=zipfile.ZipFile(outer)
for name in outer_zip.namelist():
 if not name.endswith('/'):
  assert (package/name).read_bytes()==outer_zip.read(name), 'Extracted input changed: '+name
archive=package/'maps/coldwell-site/coldwell-silo-v1.zip'
assert sha(archive.read_bytes())=='b489bb7439a22746281eb2dcc052cd124cc77917a9c00aeaa4c02ee5f1db873f'
z=zipfile.ZipFile(archive); provenance=[]
def donor(name,dest):
 b=z.read(name);put(dest,b);provenance.append(dict(source='silo/'+name,path=dest,sha256=sha(b),bytes=len(b)));return b.decode('utf-8') if name.endswith('.js') else b
src=donor('packages/silo/three.js','upstream/silo-three.original.js').replace('\r\n','\n')
g=donor('packages/silo/geometry.js','upstream/silo-geometry.original.js').replace('\r\n','\n')
donor('packages/silo/designs.js','upstream/silo-designs.original.js')
material=g[g.index('export const SILO_MATERIALS='):g.index('export const area=')]
put('upstream/silo-bindings.js',material+"\nexport const levelY=i=>Math.round((i-22)*2.12*1e6)/1e6;\nexport const SILO_PLAN={nativeToWorld:{translation:[0,46.64,0],inverseTranslation:[0,-46.64,0]}};\nexport function buildSiloMesh(){throw Error('Coldwell adapter requires verified prebuilt mesh data.');}\n")
adapted=src.replace("import {buildSiloMesh,SILO_MATERIALS} from './mesh.js';\nimport {levelY,SILO_PLAN} from './designs.js';","import {buildSiloMesh,SILO_MATERIALS,levelY,SILO_PLAN} from './silo-bindings.js';")
assert adapted!=src
put('upstream/silo-renderer.js','// Generated import bridge; rig and view implementation preserved. See tools/prepare.py.\n'+adapted)
for source,dest in [('assets/silo/models/coldwell-complex.game-mesh.json.gz','source/coldwell-complex.game-mesh.json.gz'),('assets/silo/painted-silo-materials-v1.png','textures/silo.png'),('assets/silo/catalogue.json','source/silo-catalogue.json'),('assets/silo/artist-binding.json','source/artist-binding.json'),('NOTICE.md','upstream/NAUTILUS-NOTICE.md'),('art/silo/NOTICE.md','upstream/SILO-NOTICE.md'),('art/silo/references.json','source/silo-references.json')]:donor(source,dest)
for name in ['map.bundle.json','silo-companion.json','height-reference.world.json','site-layout.json','surface.map.rle.json','site-plan.svg']:
 b=(package/'maps/coldwell-site'/name).read_bytes();put('source/'+name,b);provenance.append(dict(source='handoff/maps/coldwell-site/'+name,path='source/'+name,sha256=sha(b),bytes=len(b)))
for name in ['NOTICE.md','references.json','delivery-manifest.json']:
 b=(package/'art/coldwell-map'/name).read_bytes();put('source/map-'+name,b)
put('source/surface.map.json.gz',gzip.compress((package/'maps/coldwell-site/surface.map.json').read_bytes(),mtime=0))
put('source/surface-infill.mesh.json.gz',gzip.compress((package/'maps/coldwell-site/surface-infill.mesh.json').read_bytes(),mtime=0))
farmyard=root.parent.parent/'aft/tactics'
def frozen(name):
 p='vendor/aft/781246a668c723d5a4c5463e70534cc04b6a5641/dist/tactics/'+name
 b=subprocess.run(['git','-C',str(engine),'show',revision+':'+p],check=True,stdout=subprocess.PIPE).stdout
 local=(farmyard/name).read_bytes()
 assert local.replace(b'\r\n',b'\n')==b.replace(b'\r\n',b'\n'), 'Source differs: '+name
 provenance.append(dict(source='nautilus@'+revision+':'+p,path='../../aft/tactics/'+name,sha256=sha(b),farmyardByteSHA256=sha(local),bytes=len(b),comparison='LF-normalized equality'))
 return b.decode('utf-8').replace('\r\n','\n')
# All factories used by the compiler are the existing frozen modules.
for n in ['biome-foliage-models.js','foliage-models.js','environment-geometry.js','biome-plant-parts.js','biome-foliage-data.js','painted-cargo.js','painted-environment-scene.js','hybrid-world.js','environment-visuals.js','hybrid-materials.js','biome-ground-composition.js','biome-family.js','battle-environment.js']:frozen(n)
# Parameterize the original paint implementation with the host Three instance.
paint=frozen('biome-foliage-paint.js');avg=frozen('biome-atlas-lod.js');data=frozen('biome-foliage-data.js')
put('upstream/biome-foliage-data.js',data)
paint=re.sub(r'^import .*;\n','',paint,flags=re.M);avg=re.sub(r'^import .*;\n','',avg,flags=re.M)
paint=paint.replace('export ','');avg=avg.replace('export ','')
# Skip unused paints without changing the selected paint implementation.
paint=paint.replace('function createBiomeMaterials(textures){','function createBiomeMaterials(textures,ids=Object.keys(BIOME_PAINT)){')
paint=paint.replace('for(const [id,spec]of Object.entries(BIOME_PAINT)){','for(const [id,spec]of Object.entries(BIOME_PAINT)){if(!ids.includes(id))continue;')
# Keep the source paint phase after the one global site translation.
paint=paint.replace('vBiomePosition=(bm*vec4(transformed,1.)).xyz;','vBiomePosition=(bm*vec4(transformed,1.)).xyz-vec3(.5,46.64,.5);')
put('upstream/biome-paint.js',"import {BIOME_PAINT,BIOME_GROUNDS,GROUND_TILE_SIZE,GROUND_VARIANTS} from './biome-foliage-data.js';\nexport function biomePaint(T){\n"+avg+paint+"\nreturn {createBiomeMaterials,createBiomeGround,configureBiomeTexture,atlasRect,panelAverage};\n}\n")
# Preserve the full map-ground paint shader; build-time weights replace its map-core query closure.
mappaint=frozen('biome-map-paint.js');function=mappaint[mappaint.index('export function createMapGroundPaint'):].replace('export function createMapGroundPaint','function createMapGroundPaint')
function=function.replace('vMapBiome=(modelMatrix*vec4(position,1.)).xz;','vMapBiome=(modelMatrix*vec4(position,1.)).xz-vec2(.5);')
put('upstream/map-ground-paint.js',"import {BIOME_GROUNDS} from './biome-foliage-data.js';\nimport {biomePaint} from './biome-paint.js';\nexport function createGroundPaint(T,weights,atlas){\nconst {atlasRect,panelAverage}=biomePaint(T),BIOME_ORDER=['jungle','temperate','snow','dry','wetlands'];\nconst biomeMixAt=(map,x,y)=>weights.cells[Math.max(0,Math.min(241,y+1))*242+Math.max(0,Math.min(241,x+1))];\n"+function+"\nreturn createMapGroundPaint({terrain:{length:240}},0,atlas);\n}\n")
# Existing texture pixels are copied from immutable Nautilus objects, never re-encoded.
textures={'plants':'environment/painted/foliage-atlas-v1.png','foliage':'environment/biome-foliage/foliage-atlas-v1.png','ground':'environment/biome-foliage/ground-atlas-v1.png','cargo':'environment/painted-study/cargo-materials-v1.png','original':'environment/painted-study/material-atlas-v2.png'}
for key,path in textures.items():
 source='vendor/aft/781246a668c723d5a4c5463e70534cc04b6a5641/dist/assets/'+path
 b=subprocess.run(['git','-C',str(engine),'show',revision+':'+source],check=True,stdout=subprocess.PIPE).stdout
 put('textures/'+key+'.png',b);provenance.append(dict(source='nautilus@'+revision+':'+source,path='textures/'+key+'.png',sha256=sha(b),bytes=len(b)))
put('source/provenance.json',json.dumps({'version':1,'engineRevision':revision,'files':provenance},indent=2)+'\n')
print(json.dumps({'verifiedSourceFiles':len(provenance),'output':str(root)}))
