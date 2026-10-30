import {playRoute} from './operation-scenarios.mjs';
const ground={h:46.64,floorId:'coldwell-datum-22'};
export const COLDWELL_APPROACH=[...[
  {x:104.5,y:166},{x:104.5,y:150},{x:94.5,y:144.4},
].map(p=>({...p,...ground})),{id:'coldwell-gatehouse-clue',action:'inspect'},...[
  {x:82,y:130},{x:73.5,y:118.6},{x:72,y:115.9},
].map(p=>({...p,...ground}))];
export const COLDWELL_DESCENT=Array.from({length:5},(_,i)=>{const floor=21-i,h=floor*2.12,floorId='coldwell-datum-'+floor;return [{x:72,y:114.1,h,floorId},...(i<4?[{x:72,y:115.9,h,floorId}]:[])];}).flat();
export const COLDWELL_RETURN=[...Array.from({length:5},(_,i)=>{const floor=18+i,h=floor*2.12,floorId='coldwell-datum-'+floor;return [{x:72,y:115.9,h,floorId},...(i<4?[{x:72,y:114.1,h,floorId}]:[])];}).flat(),...[
  {x:73.5,y:118.6},{x:82,y:130},{x:104.5,y:150},{x:104.5,y:166},{x:104.5,y:224.5},
].map(p=>({...p,...ground})),{id:'extraction',action:'extract'}];
export const COLDWELL_RECORDS=[{x:74,y:112.8,h:36.04,floorId:'coldwell-datum-17'},{id:'coldwell-records-chest',action:'open'},{id:'coldwell-records-chest',action:'take-all'}];
export const playColdwellRecon=(state,options)=>playRoute(state,[...COLDWELL_APPROACH,...COLDWELL_DESCENT,...COLDWELL_RECORDS,...COLDWELL_RETURN],options);
