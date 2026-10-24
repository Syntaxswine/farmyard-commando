import * as T from './aft/tactics/vendor/three.module.js';
import {PROP_ART} from './aft/tactics/prop-art.js';
import {doorFootprint} from './interactions.js';

// Reuse the parent game's chest paintings and timber surface. The simulation
// supplies the authoritative positions, open state, and physical footprints.
export class InteractionScenery {
  constructor(state,{onLoading,onError}){
    this.root=new T.Group();this.records=new Map();this.resources=[];this.disposed=false;
    const manager=new T.LoadingManager();manager.onStart=()=>{if(!this.disposed)onLoading(true);};manager.onLoad=()=>{if(!this.disposed)onLoading(false);};manager.onError=url=>{if(!this.disposed)onError('Interaction artwork could not load: '+url.split('/').at(-1));};
    const loader=new T.TextureLoader(manager),origin=new URL('./aft/assets/environment/',import.meta.url);
    const painted=name=>{
      const art=PROP_ART[name],texture=loader.load(new URL(art.file,origin).href,texture=>{
        const [x0,y0,x1,y1]=art.crop,w=texture.image.width,h=texture.image.height;
        texture.offset.set(x0/w,(h-y1)/h);texture.repeat.set((x1-x0)/w,(y1-y0)/h);texture.needsUpdate=true;
      });texture.colorSpace=T.SRGBColorSpace;this.resources.push(texture);return texture;
    };
    this.chestPaint={closed:painted('supply-chest-closed'),open:painted('supply-chest-open')};
    const wood=loader.load(new URL('hybrid-surfaces/wood-factory-v2.png',origin).href);wood.colorSpace=T.SRGBColorSpace;this.resources.push(wood);
    for(const object of state.interactables){
      if(object.kind==='chest'){
        const material=new T.SpriteMaterial({map:this.chestPaint.closed,alphaTest:.05,depthWrite:false}),sprite=new T.Sprite(material);
        sprite.center.set(.5,0);sprite.userData.interactionId=object.id;this.resources.push(material);this.root.add(sprite);this.records.set(object.id,{sprite});
      }else if(object.kind==='door'){
        const geometry=new T.BoxGeometry(1,1,1),material=new T.MeshStandardMaterial({map:wood,color:0xb5ad86,roughness:.9}),leaf=new T.Mesh(geometry,material);
        leaf.userData.interactionId=object.id;leaf.castShadow=leaf.receiveShadow=true;this.resources.push(geometry,material);this.root.add(leaf);this.records.set(object.id,{leaf});
      }
    }
    this.update(state);
  }
  update(state){
    for(const object of state.interactables){
      const record=this.records.get(object.id);if(!record)continue;
      const known=state.seen.has(`${Math.round(object.x)},${Math.round(object.y)}`)||object.kind==='door'&&state.seen.has(`${Math.floor(object.x)},${Math.round(object.y)}`);
      const visible=state.visible.has(`${Math.round(object.x)},${Math.round(object.y)}`);
      if(record.sprite){
        record.sprite.visible=known;record.sprite.position.set(object.x,.015,object.y);record.sprite.scale.set(1.15,object.open?1.1:.9,1);
        record.sprite.material.map=object.open?this.chestPaint.open:this.chestPaint.closed;record.sprite.material.color.setScalar(visible?1:.38);
      }else{
        const box=doorFootprint(object);record.leaf.visible=known;record.leaf.position.set((box.x0+box.x1)/2,box.height/2,(box.y0+box.y1)/2);record.leaf.scale.set(box.x1-box.x0,box.height,box.y1-box.y0);
      }
    }
  }
  get picks(){return [...this.records.values()].map(record=>record.sprite||record.leaf).filter(mesh=>mesh.visible);}
  dispose(){this.disposed=true;this.root.removeFromParent();for(const resource of this.resources)resource.dispose();this.root.clear();}
}
