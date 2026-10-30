import {loadColdwell} from './coldwell-loader.js';
import {ColdwellProvider} from './coldwell-provider.js';

const ready=loadColdwell().then(bundle=>new ColdwellProvider(bundle));
let previous;
self.addEventListener('message',async({data})=>{
  try{
    const provider=await ready;if(data.sourceDigest!==provider.bundle.manifest.sourceDigest)throw Error('Route source does not match the operation.');
    // Preserve static query caches between completed requests of the same pose.
    if(previous&&JSON.stringify(previous.spatial)===JSON.stringify(data.state.spatial))data.state.spatial=previous.spatial;
    previous=data.state;
    self.postMessage({type:'searching',generation:data.generation,sourceDigest:provider.bundle.manifest.sourceDigest});
    const route=provider.path(data.state,data.actor,data.destination,data.options);
    self.postMessage({generation:data.generation,sourceDigest:provider.bundle.manifest.sourceDigest,route,search:provider.lastSearch});
  }catch(error){self.postMessage({generation:data.generation,error:String(error.message||error)});}
});
