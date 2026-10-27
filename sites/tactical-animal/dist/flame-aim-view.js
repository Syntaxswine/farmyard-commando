import * as T from './aft/tactics/vendor/three.module.js';
import {flameFogMask} from './flame-event.js';

const vertexShader=`varying vec2 field;void main(){vec4 world=modelMatrix*vec4(position,1.);field=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragmentShader=`uniform sampler2D fogMask;uniform vec3 tint;uniform float alpha;varying vec2 field;
void main(){vec2 uv=(floor(field+vec2(.5))+vec2(.5))/vec2(40.,30.);
if(any(lessThan(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.)))||texture2D(fogMask,uv).r<.5)discard;
gl_FragColor=vec4(tint,alpha);}`;

// Fixed buffers and one tiny fog texture are reused throughout an aiming session.
// Every fragment is masked, including outline segments beside narrow fog holes.
export class FlameConePreview {
  constructor(scene){
    this.bytes=new Uint8Array(40*30*4);this.fog=new T.DataTexture(this.bytes,40,30,T.RGBAFormat);
    this.fog.minFilter=this.fog.magFilter=T.NearestFilter;this.fog.generateMipmaps=false;
    const material=alpha=>new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{fogMask:{value:this.fog},tint:{value:new T.Color(0xf4b461)},alpha:{value:alpha}},transparent:true,depthWrite:false,side:T.DoubleSide});
    const geometry=size=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(size*3),3).setUsage(T.DynamicDrawUsage));g.setDrawRange(0,0);return g;};
    this.fill=new T.Mesh(geometry(108),material(.24));this.outline=new T.LineSegments(geometry(216),material(.9));
    this.root=new T.Group();this.root.name='Flamethrower aiming cone';this.root.visible=false;this.root.add(this.fill,this.outline);scene.add(this.root);
    this.fill.frustumCulled=this.outline.frustumCulled=false;this.disposed=false;
  }
  update(preview,visible){
    if(this.disposed)return;
    const shape=preview.shape;if(!shape){this.hide();return;}
    flameFogMask(shape,visible,this.bytes);this.fog.needsUpdate=true;
    const fill=this.fill.geometry.getAttribute('position'),edge=this.outline.geometry.getAttribute('position');let filled=0,lined=0;
    const point=(array,index,p)=>{array.setXYZ(index,p.x,.07,p.y);return index+1;};
    const open=i=>{const a=shape.rays[i],b=shape.rays[i+1];return !!a&&!!b&&a.kind!=='hidden'&&a.kind===b.kind&&Math.abs(a.distance-b.distance)<=1.05;};
    for(let i=0;i<shape.rays.length-1;i++){
      if(!open(i))continue;const a=shape.rays[i],b=shape.rays[i+1];
      for(const p of [shape.origin,a,b])filled=point(fill,filled,p);
      for(const p of [a,b,...(!open(i-1)?[shape.origin,a]:[]),...(!open(i+1)?[b,shape.origin]:[])])lined=point(edge,lined,p);
    }
    fill.needsUpdate=edge.needsUpdate=true;this.fill.geometry.setDrawRange(0,filled);this.outline.geometry.setDrawRange(0,lined);
    this.fill.material.uniforms.tint.value.setHex(preview.ok?0xf4b461:0xf08068);this.outline.material.uniforms.tint.value.copy(this.fill.material.uniforms.tint.value);
    this.root.visible=shape.sourceVisible&&filled>0;
  }
  hide(){this.root.visible=false;}
  dispose(){if(this.disposed)return;this.disposed=true;this.root.removeFromParent();for(const mesh of [this.fill,this.outline]){mesh.geometry.dispose();mesh.material.dispose();}this.fog.dispose();}
}
