import * as T from './aft/tactics/vendor/three.module.js';
import {BattleEnvironment} from './aft/tactics/battle-environment.js';
import {createWeaponSprite,weaponIcon} from './aft/tactics/weapon-icons.js';

const origin=new URL('./aft/tactics/',import.meta.url);
const key=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
// The parent game's room-art surface recipes and physical wall dimensions.
const surfaces={
  brick:{file:'hybrid-surfaces/brick-factory-v1.png',period:2,tint:0xd7c4ad},
  concrete:{file:'ground-concrete.png',period:2,tint:0xd4cfbe},
  gravel:{file:'ground-gravel.png',period:2,tint:0xd4cfbe},
  grass:{file:'ground-grass.png',period:1.5,tint:0xd4cfbe},
};

export function weaponArtwork(kind,height=34){
  const sprite=createWeaponSprite(kind,{height});
  const image=sprite.querySelector('img');
  if(image)image.src=new URL(weaponIcon(kind),origin).href;
  return sprite;
}

export function groundSurface(state,x,y){
  if(state.map[y][x]==='floor')return 'concrete';
  return x<3||x>36||y<3||y>26?'grass':'gravel';
}

export function wallKnown(state,wall){
  return state.seen.has(key(wall.x,wall.y))||state.seen.has(key(wall.x+(wall.axis==='e'?1:0),wall.y+(wall.axis==='s'?1:0)));
}

export function foregroundWall(wall,unit){
  const dx=wall.x+(wall.axis==='e'?.5:0)-unit.x,dy=wall.y+(wall.axis==='s'?.5:0)-unit.y;
  const depth=dx*.64+dy*.77;
  return depth>0&&depth<4.5&&Math.abs(dx*.77-dy*.64)<2;
}

// The same painted cargo renderer as AFT 3D. This adapter owns only presentation;
// map footprints, visibility and continuous movement remain the solo game's.
export class OriginalEnvironment {
  constructor(renderer,state,{onLoading=()=>{},onError=()=>{}}={}){
    this.root=new T.Group();this.root.name='Animal Factory Tactics original art';
    this.state=state;this.disposed=false;this.materials=[];this.textures=[];
    this.geometries=[];this.grounds=[];this.wallBatches=[];
    const manager=new T.LoadingManager();
    manager.onStart=()=>{if(!this.disposed)onLoading(true);};
    manager.onLoad=()=>{if(!this.disposed)onLoading(false);};
    manager.onError=url=>{if(!this.disposed)onError('Original artwork could not load: '+url.split('/').at(-1));};
    const loader=new T.TextureLoader(manager);loader.setPath(origin.href);
    const material=(kind,faded=false)=>{
      const surface=surfaces[kind];
      let texture=this.texturesByKind?.[kind];
      if(!this.texturesByKind)this.texturesByKind={};
      if(!texture){
        texture=loader.load('../assets/environment/'+surface.file);
        texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
        texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
        this.texturesByKind[kind]=texture;this.textures.push(texture);
      }
      const m=new T.MeshStandardMaterial({map:texture,color:surface.tint,roughness:.95,transparent:faded,opacity:faded?.24:1,depthWrite:!faded});
      // AFT's world-aligned surface UVs preserve the size of bricks across tiles.
      m.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
          #ifdef USE_MAP
          vec3 surfaceWorld=(instanceMatrix*vec4(position,1.0)).xyz;
          vMapUv=(abs(normal.y)>.5?surfaceWorld.xz:abs(normal.x)>.5?surfaceWorld.zy:surfaceWorld.xy)/${surface.period.toFixed(2)};
          #endif`);
      };
      m.customProgramCacheKey=()=>`aft-mobile-surface-${kind}-${faded}`;
      this.materials.push(m);return m;
    };
    const cube=new T.BoxGeometry(1,1,1);this.geometries.push(cube);
    const groups=new Map();
    for(let y=1;y<=28;y++)for(let x=1;x<=38;x++){
      const kind=groundSurface(state,x,y);if(!groups.has(kind))groups.set(kind,[]);
      groups.get(kind).push({x,y});
    }
    const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();
    for(const [kind,records]of groups){
      const mesh=new T.InstancedMesh(cube,material(kind),records.length);
      records.forEach((p,i)=>{matrix.compose(position.set(p.x,-.06,p.y),rotation,scale.set(1.006,.1,1.006));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new T.Color(0x080e09));});
      mesh.receiveShadow=true;mesh.userData.noShadow=true;this.root.add(mesh);this.grounds.push({mesh,records});
    }
    const walls=Object.entries(state.edges).filter(([,kind])=>kind!=='door').map(([edge])=>{const [axis,x,y]=edge.split(':');return {axis,x:+x,y:+y};});
    for(const axis of ['e','s'])for(const faded of [false,true]){
      const edges=walls.filter(w=>w.axis===axis);if(!edges.length)continue;
      const brick=material('brick',faded),cap=material('concrete',faded);
      const faces=axis==='e'?[brick,brick,cap,cap,cap,cap]:[cap,cap,cap,cap,brick,brick];
      const mesh=new T.InstancedMesh(cube,faces,edges.length);mesh.setColorAt(0,new T.Color(0xffffff));mesh.count=0;
      mesh.castShadow=mesh.receiveShadow=true;this.root.add(mesh);this.wallBatches.push({mesh,edges,axis,faded});
    }
    this.cargo=new BattleEnvironment(this.root,loader,()=>{
      if(!this.disposed)this.cargo.rebuild({...this.state,props:[]},0);
    },error=>{if(!this.disposed)onError(error.message||'Cargo artwork could not load.');});
    this.update(state,state.units.find(u=>u.team==='squad'));
  }

  update(state,unit){
    this.state=state;
    const color=new T.Color(),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();
    for(const {mesh,records}of this.grounds){
      records.forEach((p,i)=>{const known=state.seen.has(key(p.x,p.y)),lit=state.visible.has(key(p.x,p.y));color.setScalar(known?(lit?1:.38):.018);mesh.setColorAt(i,color);});
      mesh.instanceColor.needsUpdate=true;
    }
    for(const {mesh,edges,axis,faded}of this.wallBatches){
      let count=0;
      for(const wall of edges){
        if(!wallKnown(state,wall)||foregroundWall(wall,unit)!==faded)continue;
        matrix.compose(position.set(wall.x+(axis==='e'?.5:0),1,wall.y+(axis==='s'?.5:0)),rotation,scale.set(axis==='e'?.16:1.12,2,axis==='e'?1.12:.16));
        mesh.setMatrixAt(count,matrix);
        const lit=state.visible.has(key(wall.x,wall.y))||state.visible.has(key(wall.x+(axis==='e'?1:0),wall.y+(axis==='s'?1:0)));
        mesh.setColorAt(count++,color.setScalar(lit?1:.50));
      }
      mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
    this.cargo.rebuild({...state,props:[]},0);
  }

  dispose(){
    if(this.disposed)return;this.disposed=true;this.cargo.dispose();this.root.removeFromParent();
    for(const {mesh}of [...this.grounds,...this.wallBatches])mesh.dispose();
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    for(const texture of this.textures)texture.dispose();
    this.root.clear();
  }
}
