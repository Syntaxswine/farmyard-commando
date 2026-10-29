import {BIOME_GROUNDS} from './biome-foliage-data.js';
import {biomePaint} from './biome-paint.js';
export function createGroundPaint(T,weights,atlas){
const {atlasRect,panelAverage}=biomePaint(T),BIOME_ORDER=['jungle','temperate','snow','dry','wetlands'];
const biomeMixAt=(map,x,y)=>weights.cells[Math.max(0,Math.min(241,y+1))*242+Math.max(0,Math.min(241,x+1))];
function createMapGroundPaint(map,level,atlas){
 const size=(map.terrain||map.map).length,padded=size+2,a=new Uint8Array(padded*padded*4),b=new Uint8Array(a.length);
 for(let y=-1;y<=size;y++)for(let x=-1;x<=size;x++)for(const p of biomeMixAt(map,x,y,level)){
  const index=BIOME_ORDER.indexOf(p.family),offset=((y+1)*padded+x+1)*4;if(index<4)a[offset+index]=Math.round(p.weight*255);else b[offset]=Math.round(p.weight*255);
 }
 const make=data=>{const t=new T.DataTexture(data,padded,padded);t.minFilter=t.magFilter=T.LinearFilter;t.needsUpdate=true;return t;},weightsA=make(a),weightsB=make(b);
 const uniforms={biomeWeightsA:{value:weightsA},biomeWeightsB:{value:weightsB},biomeGroundAtlas:{value:atlas}};
 for(const [i,family]of BIOME_ORDER.entries())uniforms['biomeFar'+i]={value:panelAverage(atlas,BIOME_GROUNDS[family])};
 const shader=`uniform sampler2D biomeWeightsA,biomeWeightsB,biomeGroundAtlas;
 ${BIOME_ORDER.map((f,i)=>`uniform vec3 biomeFar${i};`).join('\n')}
 vec4 biomeWeights(vec2 p){return texture2D(biomeWeightsA,(p+1.5)/${padded.toFixed(1)});}
 vec3 biomeSample(vec2 uv,vec2 origin,vec2 span,float lod){return textureLod(biomeGroundAtlas,origin+(1.-abs(mod(uv,2.)-1.))*span,lod).rgb;}
 vec3 biomePeriodic(vec2 uv,vec2 offset,vec2 origin,vec2 span,float lod){vec2 p=uv+offset,w=smoothstep(vec2(.65),vec2(1.),uv);return mix(mix(biomeSample(p,origin,span,lod),biomeSample(p-vec2(1,0),origin,span,lod),w.x),mix(biomeSample(p-vec2(0,1),origin,span,lod),biomeSample(p-vec2(1,1),origin,span,lod),w.x),w.y);}
 vec3 biomePanel(vec2 world,vec2 origin,vec2 span,vec3 average){
  vec2 uv=fract(world/2.),cell=floor(world/2.),pixels=vec2(textureSize(biomeGroundAtlas,0));
  vec2 dx=dFdx(world/2.)*span*pixels,dy=dFdy(world/2.)*span*pixels;
  float footprint=log2(max(.0001,max(length(dx),length(dy)))),lod=clamp(footprint,0.,4.);
  vec3 base=biomePeriodic(uv,vec2(0),origin,span,lod);
  vec3 detail=biomePeriodic(uv,vec2(.237,.371)*mod(cell.x*7.+cell.y*11.,4.),origin,span,lod);
  float fade=pow(sin(uv.x*3.14159265)*sin(uv.y*3.14159265),2.);
  return mix(mix(base,detail,fade*.65),average,smoothstep(3.5,5.5,footprint));
 }
 vec3 mapBiomeGround(vec2 p){vec4 a=biomeWeights(p);float b=texture2D(biomeWeightsB,(p+1.5)/${padded.toFixed(1)}).r;
  vec3 color=vec3(0.);${BIOME_ORDER.map((family,i)=>{const r=atlasRect(BIOME_GROUNDS[family]),w=i<4?'a.'+'xyzw'[i]:'b';return `if(${w}>0.)color+=${w}*biomePanel(p,vec2(${r.origin.join(',')}),vec2(${r.size.join(',')}),biomeFar${i});`;}).join('\n')}
  return color/max(.001,dot(a,vec4(1.))+b);
 }`;
 const ground=new T.MeshStandardMaterial({map:atlas,roughness:1});ground.name='Environment ground';ground.customProgramCacheKey=()=>`map-biome-ground-${size}`;
 ground.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);s.vertexShader='varying vec2 vMapBiome;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMapBiome=(modelMatrix*vec4(position,1.)).xz-vec2(.5);');s.fragmentShader='varying vec2 vMapBiome;\n'+shader+'\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','diffuseColor.rgb*=mapBiomeGround(vMapBiome);');};
 ground.groundUnderlay={map:atlas,average:uniforms.biomeFar1.value,uniforms,shader:shader+'\nvec3 edgeGround(){return mapBiomeGround(vConnectedWorld);}'};
 return {ground,uniforms,shader,dispose(){ground.dispose();weightsA.dispose();weightsB.dispose();}};
}

return createMapGroundPaint({terrain:{length:240}},0,atlas);
}
