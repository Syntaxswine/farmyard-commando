import {loadColdwell,requireColdwellCapabilities} from './coldwell-loader.js';
import {ColdwellProvider} from './coldwell-provider.js';
import {registerSpatialProvider} from './spatial-provider.js';
import {registerColdwellOperations} from './coldwell-operation.js';
let prepared;
export function prepareColdwell({playable=false}={}){
  prepared??=loadColdwell().then(bundle=>{const provider=new ColdwellProvider(bundle);registerSpatialProvider(provider.id,provider);registerColdwellOperations(provider);return provider;}).catch(error=>{prepared=null;throw error;});
  return prepared.then(provider=>playable?requireColdwellCapabilities(provider):provider);
}
