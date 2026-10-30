import * as THREE from './aft/tactics/vendor/three.module.js';
import {createColdwellArt} from './art/coldwell/index.js';
import {coldwellVisibleRegion} from './coldwell-residency.js';
import {ColdwellFog} from './coldwell-fog.js';

// Owns only the bridge into FieldView. The artist owns meshes, pose rendering,
// async region replacement, cancellation and complete GPU resource disposal.
export class ColdwellPresentation{
  constructor(state,{onLoading=()=>{},onError=()=>{},createArt=createColdwellArt}={}){
    this.root=new THREE.Group();this.root.name='Coldwell FieldView';this.disposed=false;this.request=0;this.onLoading=onLoading;this.onError=onError;this.state=state;
    if(!state.coldwellPreview){this.fog=new ColdwellFog();this.fog.update(state);}
    onLoading(true);
    const version=new URL(import.meta.url).searchParams.get('v');
    const versionedFetch=(input,options)=>{const url=new URL(input,import.meta.url);if(version)url.searchParams.set('v',version);return fetch(url,options);};
    this.ready=Promise.resolve().then(()=>createArt({THREE,fetch:versionedFetch})).then(async art=>{
      if(this.disposed){await art.dispose();return null;}
      this.art=art;this.manifest=art.getManifest();this.root.add(art.root);this.syncState(this.state);return art;
    });
    this.ready.catch(error=>{if(!this.disposed){onLoading(false);onError(error.message);}});
  }
  syncState(state){this.state=state;this.fog?.update(state);if(this.art){this.art.syncDynamicState(state.spatial.poses);this.fog?.install(this.art.root);}}
  update(state,focus,{height=focus.h,cutawayHeight=height,roofs=false,canopies=true,display=true,plane}={}){
    this.syncState(state);if(this.disposed)return Promise.resolve();
    const region=coldwellVisibleRegion({...focus,h:height},{roofs}),ceiling=plane||(cutawayHeight<46.63?{normal:[0,-1,0],constant:cutawayHeight+1.88}:null);region.cutaway={roofs,canopies,display,...(ceiling?{plane:ceiling}:{})};
    // Outdoor canopies cross several storey bands, with no occupied floors above
    // the ground. Keep their actual upper extent rather than clipping tree tops.
    if(height>=46.63&&canopies){region.heightBands[0].max=56;}
    const key=JSON.stringify([region.rect,region.heightBands,region.cutaway]);if(key===this.key)return this.pending||Promise.resolve();
    this.key=key;this.region=region;const request=++this.request;this.onLoading(true);
    this.pending=this.ready.then(async art=>{
      if(!art||this.disposed||request!==this.request)return;
      await art.setVisibleRegion(region);
      this.fog?.install(art.root);
      if(!this.disposed&&request===this.request)this.onLoading(false);
    }).catch(error=>{if(!this.disposed&&request===this.request){this.key=null;this.onLoading(false);if(error.name!=='AbortError')this.onError(error.message);}});
    return this.pending;
  }
  get picks(){const result=[];this.root.traverse(object=>{if(object.isMesh&&object.visible&&object.userData.rigId){object.userData.interactionId=object.userData.rigId;result.push(object);}});return result;}
  diagnostics(){return this.art?.diagnostics()||{loading:true};}
  async whenIdle(){await this.pending;await this.art?.whenIdle();}
  dispose(){
    if(this.retirement)return this.retirement;
    this.disposed=true;this.request++;this.root.removeFromParent();
    this.retirement=this.ready.then(async art=>{if(art)await art.dispose();this.root.clear();this.fog?.dispose();},()=>{this.root.clear();this.fog?.dispose();});return this.retirement;
  }
}
