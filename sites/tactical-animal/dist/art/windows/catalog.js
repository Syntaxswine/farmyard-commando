export const WINDOW_VERSION='industrial-windows/1';
export const WINDOW_METRICS=Object.freeze({wallHeight:2,wallThickness:.16,frameDepth:.20,post:.055,mullion:.035,glassThickness:.008});
export const WINDOW_HEIGHTS=Object.freeze([
 Object.freeze({id:'full',name:'Full-height',sill:.055,head:1.945}),
 Object.freeze({id:'waist',name:'Waist-up',sill:.90,head:1.945}),
]);
export const WINDOW_PATTERNS=Object.freeze([
 Object.freeze({id:'clear',name:'Uninterrupted glass',columns:1,rows:1}),
 Object.freeze({id:'vertical-2',name:'Two vertical lights',columns:2,rows:1}),
 Object.freeze({id:'vertical-3',name:'Three vertical lights',columns:3,rows:1}),
 Object.freeze({id:'horizontal-2',name:'Two horizontal bands',columns:1,rows:2}),
 Object.freeze({id:'grid-2x2',name:'Four-pane grid',columns:2,rows:2}),
 Object.freeze({id:'grid-3x2',name:'Six-pane grid',columns:3,rows:2}),
]);
export const WINDOW_SPANS=Object.freeze([1,2,3]);
export const WINDOW_FINISHES=Object.freeze([
 Object.freeze({id:'steel',name:'Oiled factory steel',color:0x514f3c,edge:0x9a9c83}),
 Object.freeze({id:'sage',name:'Sage enamel',color:0x65765c,edge:0xa5b093}),
 Object.freeze({id:'ivory',name:'Aged ivory enamel',color:0xc7c1a7,edge:0xf0e5c8}),
]);
export const WINDOW_WALLS=Object.freeze(['brick','concrete','corrugated']);
export const WINDOW_DEFINITIONS=Object.freeze(WINDOW_HEIGHTS.flatMap(height=>WINDOW_SPANS.flatMap(span=>WINDOW_PATTERNS.map(pattern=>Object.freeze({
 id:`window.${height.id}.${pattern.id}.${span}m`,name:`${height.name} · ${pattern.name}`,heightId:height.id,patternId:pattern.id,span,
 sill:height.sill,head:height.head,columns:pattern.columns,rows:pattern.rows,
})))));
export const WINDOW_IDS=Object.freeze(WINDOW_DEFINITIONS.map(d=>d.id));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const bounds=(x0,y0,z0,x1,y1,z1)=>({min:[x0,y0,z0],max:[x1,y1,z1]});

// IDs stay fixed within a definition, including when a neighbour uses a shared
// end post. Rows run bottom-up; columns run left-to-right from local +Z.
export function describeWindow(id,joins={}){
 const definition=WINDOW_DEFINITIONS.find(d=>d.id===id);
 if(!definition)throw Error('Unknown window definition: '+id);
 if(!joins||typeof joins!=='object'||Array.isArray(joins)||Object.keys(joins).some(k=>!['left','right'].includes(k))||['left','right'].some(k=>joins[k]!==undefined&&typeof joins[k]!=='boolean'))throw Error('Window joins must contain optional boolean left/right flags');
 const joined={left:joins.left??false,right:joins.right??false},m=WINDOW_METRICS,w=definition.span;
 const leftPost=m.post/(joined.left?2:1),rightPost=m.post/(joined.right?2:1),x0=-w/2+leftPost,x1=w/2-rightPost,y0=definition.sill,y1=definition.head;
 const solids=[],panes=[],solid=(id,role,box,material='frame')=>solids.push({id,role,material,bounds:box});
 solid('frame.left','frame',bounds(-w/2,y0-m.post,-m.frameDepth/2,x0,m.wallHeight,m.frameDepth/2));
 solid('frame.right','frame',bounds(x1,y0-m.post,-m.frameDepth/2,w/2,m.wallHeight,m.frameDepth/2));
 solid('frame.sill','sill',bounds(x0,y0-m.post,-m.frameDepth/2,x1,y0,m.frameDepth/2));
 solid('frame.head','frame',bounds(x0,y1,-m.frameDepth/2,x1,m.wallHeight,m.frameDepth/2));
 if(definition.heightId==='waist')solid('wall.lower','lower-wall',bounds(-w/2,0,-m.wallThickness/2,w/2,y0-m.post,m.wallThickness/2),'wall');
 const cellWidth=(x1-x0-(definition.columns-1)*m.mullion)/definition.columns,cellHeight=(y1-y0-(definition.rows-1)*m.mullion)/definition.rows;
 for(let c=1;c<definition.columns;c++){
  const x=x0+c*cellWidth+(c-1)*m.mullion;
  solid('mullion.v'+c,'mullion',bounds(x,y0,-m.frameDepth/2,x+m.mullion,y1,m.frameDepth/2));
 }
 for(let r=1;r<definition.rows;r++){
  const y=y0+r*cellHeight+(r-1)*m.mullion;
  solid('mullion.h'+r,'mullion',bounds(x0,y,-m.frameDepth/2,x1,y+m.mullion,m.frameDepth/2));
 }
 for(let r=0;r<definition.rows;r++)for(let c=0;c<definition.columns;c++){
  const x=x0+c*(cellWidth+m.mullion),y=y0+r*(cellHeight+m.mullion);
  panes.push({id:`r${r}c${c}`,row:r,column:c,bounds:bounds(x,y,-m.glassThickness/2,x+cellWidth,y+cellHeight,m.glassThickness/2),center:[x+cellWidth/2,y+cellHeight/2,0],width:cellWidth,height:cellHeight,normal:[0,0,1]});
 }
 return freeze({...definition,version:WINDOW_VERSION,joins:joined,cacheKey:`${id}:L${+joined.left}R${+joined.right}`,units:'metres',
  origin:'span centre on X, floor Y=0, glass centre plane Z=0, front normal +Z; rotations are Three +Y degrees',
  bounds:bounds(-w/2,0,-m.frameDepth/2,w/2,m.wallHeight,m.frameDepth/2),aperture:bounds(x0,y0,-m.glassThickness/2,x1,y1,m.glassThickness/2),
  wallHeight:m.wallHeight,wallThickness:m.wallThickness,frameDepth:m.frameDepth,panes,solids,
 });
}
