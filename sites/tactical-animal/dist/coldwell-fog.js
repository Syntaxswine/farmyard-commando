import * as T from './aft/tactics/vendor/three.module.js';

// The existing AFT instanced-cell tint cannot mask a native curved mesh. This
// adapter supplies the same unseen / remembered / visible policy per fragment,
// using the simulation's floor-qualified cells. It never discovers terrain.
const SIZE=240,COLUMNS=6,WIDTH=SIZE*COLUMNS,HEIGHT=SIZE*4;
export function coldwellFogOffset(floor,x,y){return ((Math.floor(floor/COLUMNS)*SIZE+y)*WIDTH+(floor%COLUMNS)*SIZE+x)*4;}
export class ColdwellFog{
  constructor(){
    this.bytes=new Uint8Array(WIDTH*HEIGHT*4);this.texture=new T.DataTexture(this.bytes,WIDTH,HEIGHT);this.texture.minFilter=this.texture.magFilter=T.NearestFilter;this.texture.generateMipmaps=false;
    this.materials=new WeakSet();this.uniform={value:this.texture};
  }
  update(state){
    if(this.seen===state.seen&&this.visible===state.visible)return;
    this.seen=state.seen;this.visible=state.visible;this.bytes.fill(0);
    const write=(set,value)=>{for(const key of set){const match=/^coldwell-(?:datum-(\d+)|roof-(1))@(\d+),(\d+)$/.exec(key);if(!match)continue;const floor=match[2]?23:+match[1],x=+match[3],y=+match[4];if(floor>23||x>=SIZE||y>=SIZE)continue;const i=coldwellFogOffset(floor,x,y);this.bytes[i]=value;this.bytes[i+3]=255;}};
    write(state.seen,97);write(state.visible,255);this.texture.needsUpdate=true;
  }
  install(root){
    root.traverse(object=>{if(!object.isMesh)return;for(const material of [...(Array.isArray(object.material)?object.material:[object.material]),object.customDepthMaterial,object.customDistanceMaterial].filter(Boolean))this.material(material);});
  }
  material(material){
    if(this.materials.has(material))return;this.materials.add(material);
    const compile=material.onBeforeCompile,cache=material.customProgramCacheKey(),shadow=material.isMeshDepthMaterial||material.isMeshDistanceMaterial;
    material.customProgramCacheKey=()=>cache+'-farmyard-height-fog-v1';
    material.onBeforeCompile=(shader,renderer)=>{
      compile.call(material,shader,renderer);shader.uniforms.coldwellFog=this.uniform;
      shader.vertexShader='varying vec3 vFarmyardWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 farmyardWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nfarmyardWorld=instanceMatrix*farmyardWorld;\n#endif\nvFarmyardWorld=(modelMatrix*farmyardWorld).xyz;\n#include <project_vertex>`);
      shader.fragmentShader='varying vec3 vFarmyardWorld;uniform sampler2D coldwellFog;\n'+shader.fragmentShader;
      const sample=`vec2 farmyardCell=floor(vFarmyardWorld.xz+vec2(.5));float farmyardFloor=clamp(floor((vFarmyardWorld.y+.025)/2.12),0.,22.);vec2 farmyardAtlas=vec2(mod(farmyardFloor,6.)*240.,floor(farmyardFloor/6.)*240.)+farmyardCell;float farmyardKnown=texture2D(coldwellFog,(farmyardAtlas+vec2(.5))/vec2(1440.,960.)).r;if(any(lessThan(farmyardCell,vec2(0.)))||any(greaterThanEqual(farmyardCell,vec2(240.)))||farmyardKnown<.01)discard;`;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+sample);
      if(!shadow)shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor.rgb*=farmyardKnown;\n#include <dithering_fragment>');
    };
    material.needsUpdate=true;
  }
  dispose(){this.texture.dispose();this.seen=this.visible=null;}
}
