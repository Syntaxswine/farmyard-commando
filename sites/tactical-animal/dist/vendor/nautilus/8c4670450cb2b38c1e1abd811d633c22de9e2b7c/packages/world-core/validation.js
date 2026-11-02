// Plain-data boundary shared only by the optional, engine-owned world core.
export const LIMITS=Object.freeze({floors:32,surfaces:32768,entities:8192,links:4096,
  bytes:8000000,legacyBytes:4000000,nodes:2000000,depth:24,extentM:4096,heightM:2048,queryM:1000000});
export class WorldError extends TypeError {
  constructor(code,path,message,action='Correct the world data before loading or committing it.'){
    super(message);this.name='WorldError';this.code=code;this.diagnostics=[{code,path,message,action}];
  }
}
export const fail=(code,path,message,action)=>{throw new WorldError(code,path,message,action);};
export const escapeKey=key=>key.replaceAll('~','~0').replaceAll('/','~1');
export function fields(value,keys,path,required=keys){
  if(!value||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('INVALID_OBJECT',path,'Expected a plain data object.');
  const actual=Reflect.ownKeys(value);
  for(const key of actual){const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!keys.includes(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_FIELD',path,'Unknown or non-data field.');}
  for(const key of required)if(!Object.hasOwn(value,key))fail('MISSING_FIELD',path+'/'+key,'Missing required field: '+key+'.');
  return value;
}
export function finite(value,min,max,path){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('INVALID_NUMBER',path,'Expected a finite number from '+min+' to '+max+'.');return value;}
export function integer(value,min,max,path){finite(value,min,max,path);if(!Number.isSafeInteger(value))fail('INVALID_INTEGER',path,'Expected a safe integer.');return value;}
export function text(value,max,path){if(typeof value!=='string'||!value.length||value.length>max)fail('INVALID_TEXT',path,'Expected nonempty text of at most '+max+' characters.');return value;}
export function identifier(value,path){if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}(?![\s\S])/.test(value))fail('INVALID_ID',path,'Expected a stable ASCII identifier of 1–96 characters.');return value;}
export function list(value,max,path){if(!Array.isArray(value)||value.length>max)fail('INVALID_LIST',path,'Expected a dense array of at most '+max+' entries.');return value;}
export function boolean(value,path){if(typeof value!=='boolean')fail('INVALID_BOOLEAN',path,'Expected a boolean.');return value;}
export function point(value,path='/point'){
  fields(value,['x','y','h'],path);for(const key of ['x','y','h'])finite(value[key],-LIMITS.queryM,LIMITS.queryM,path+'/'+key);return value;
}
export function box(value,path='/bounds'){
  fields(value,['min','max'],path);point(value.min,path+'/min');point(value.max,path+'/max');
  for(const key of ['x','y','h'])if(value.min[key]>value.max[key])fail('INVALID_BOUNDS',path,'Minimum bounds must not exceed maximum bounds.');return value;
}
export const inside=(position,bounds)=>['x','y','h'].every(key=>position[key]>=bounds.min[key]&&position[key]<=bounds.max[key]);
export const overlaps=(a,b)=>['x','y','h'].every(key=>a.min[key]<=b.max[key]&&a.max[key]>=b.min[key]);
export const bytes=value=>new TextEncoder().encode(value).length;
function plain(value,path,ancestors,budget,depth){
  if(++budget.nodes>LIMITS.nodes||depth>LIMITS.depth)fail('INPUT_LIMIT',path,'Plain-data object/depth limit exceeded.');
  if(value===null||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return;
  if(typeof value==='string'){if(value.length>budget.maxBytes)fail('INPUT_LIMIT',path,'String exceeds the byte budget.');budget.strings+=value.length;if(budget.strings>budget.maxBytes)fail('INPUT_LIMIT',path,'Text exceeds the byte budget.');return;}
  if(typeof value!=='object'||ancestors.has(value)||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))fail('INVALID_JSON',path,'Expected finite, acyclic plain JSON.');
  if(Array.isArray(value)&&value.length>65536)fail('INPUT_LIMIT',path,'Array exceeds the bounded input size.');
  const keys=Reflect.ownKeys(value);if(keys.length>65537)fail('INPUT_LIMIT',path,'Object has too many fields.');
  for(const key of keys){if(Array.isArray(value)&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||(Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length)))fail('INVALID_JSON',path,'Accessors, hidden fields, symbols and non-data array properties are unsupported.');
    budget.strings+=key.length;if(budget.strings>budget.maxBytes)fail('INPUT_LIMIT',path,'Field names exceed the byte budget.');}
  ancestors.add(value);
  if(Array.isArray(value)){for(let index=0;index<value.length;index++){if(!Object.hasOwn(value,index))fail('INVALID_JSON',path,'Sparse JSON arrays are unsupported.');plain(value[index],path+'/'+index,ancestors,budget,depth+1);}}
  else for(const key of keys)plain(value[key],path+'/'+escapeKey(key),ancestors,budget,depth+1);
  ancestors.delete(value);
}
export function inputData(input,maxBytes=LIMITS.bytes){
  let value=input;if(typeof input==='string'){
    if(input.length>maxBytes||bytes(input)>maxBytes)fail('BYTE_LIMIT','/','World input exceeds '+maxBytes+' UTF-8 bytes.');
    try{value=JSON.parse(input);}catch{fail('INVALID_JSON','/','Malformed JSON.');}
  }
  plain(value,'',new Set(),{nodes:0,strings:0,maxBytes},0);
  if(bytes(JSON.stringify(value))>maxBytes)fail('BYTE_LIMIT','/','World input exceeds '+maxBytes+' UTF-8 bytes.');
  return structuredClone(value);
}
export function ordered(value){return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;}
