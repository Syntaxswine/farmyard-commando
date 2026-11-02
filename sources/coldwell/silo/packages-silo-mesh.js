// Original architectural art, authored as native solids/floor cells, then reduced
// by the declared source/game profile. No DOM, Three, I/O or gameplay authority.
import {SILO_NATIVE as N,SILO_PLAN as P,siloAsset,levelY,floorId} from './designs.js';
import {Surfaces,SILO_MATERIALS,add,sub,mul,dot,cross,length,unit,circle,rectangle,tileFloor} from './geometry.js';
export {SILO_MATERIALS};
const TAU=Math.PI*2,EPS=1e-7,round=n=>Math.round(n*1e6)/1e6;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const rotate=(p,yaw)=>[p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),p[1],-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw)];

function smoothQuad(s,points,normals,uv,material){
 if(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),normals[0])<0){points=[...points].reverse();normals=[...normals].reverse();uv=[...uv].reverse();}
 for(const ids of [[0,1,2],[0,2,3]])s.tri(...ids.map(i=>points[i]),material,ids.map(i=>normals[i]),ids.map(i=>uv[i]));
}
export function annularWall(s,{center,inner,outer,bottom,height,start=0,end=TAU,openings=[],material='concrete'}){
 if(inner<=0||outer<=inner||height<=0||end<=start||end-start>TAU+EPS)throw Error('Invalid annular wall.');
 const segments=s.lod==='source'?256:96,full=Math.abs(end-start-TAU)<EPS,cuts=[start,end];
 for(let i=1;i<segments;i++){const a=start+(end-start)*i/segments;cuts.push(a);}
 const apertures=openings.map(o=>({...o,half:Math.asin(Math.min(.99,o.width/(2*inner)))}));
 for(const o of apertures)for(const edge of [o.theta-o.half,o.theta+o.half])for(let k=-2;k<=2;k++){const a=edge+k*TAU;if(a>start+EPS&&a<end-EPS)cuts.push(a);}
 cuts.sort((a,b)=>a-b);
 const solid=(a,y)=>y>bottom-EPS&&y<bottom+height+EPS&&(full||(a>=start-EPS&&a<=end+EPS))&&!apertures.some(o=>Math.abs(angleDelta(a,o.theta))<o.half-EPS&&y>o.bottom+EPS&&y<o.bottom+o.height-EPS);
 const pt=(r,a,y)=>[center[0]+r*Math.cos(a),y,center[1]+r*Math.sin(a)];
 for(let i=1;i<cuts.length;i++){
  const a=cuts[i-1],b=cuts[i];if(b-a<EPS)continue;const middle=(a+b)/2,ys=[bottom,bottom+height];
  for(const o of apertures)if(Math.abs(angleDelta(middle,o.theta))<o.half){for(const y of [o.bottom,o.bottom+o.height])if(y>bottom&&y<bottom+height)ys.push(y);}
  ys.sort((a,b)=>a-b);const bands=[];
  for(let j=1;j<ys.length;j++)if(solid(middle,(ys[j-1]+ys[j])/2)){if(bands.length&&Math.abs(bands.at(-1)[1]-ys[j-1])<EPS)bands.at(-1)[1]=ys[j];else bands.push([ys[j-1],ys[j]]);}
  for(const [low,high]of bands){
   for(const [r,sign]of [[outer,1],[inner,-1]]){const pts=[pt(r,a,low),pt(r,b,low),pt(r,b,high),pt(r,a,high)],normals=[a,b,b,a].map(t=>[Math.cos(t)*sign,0,Math.sin(t)*sign]);
    const repeat=SILO_MATERIALS[material].repeat,uv=[[a*r*sign/repeat,low/repeat],[b*r*sign/repeat,low/repeat],[b*r*sign/repeat,high/repeat],[a*r*sign/repeat,high/repeat]];smoothQuad(s,pts,normals,uv,material);}
   s.face([pt(inner,a,low),pt(outer,a,low),pt(outer,b,low),pt(inner,b,low)],material,[0,-1,0]);
   s.face([pt(inner,a,high),pt(outer,a,high),pt(outer,b,high),pt(inner,b,high)],material,[0,1,0]);
   for(const [angle,side]of [[a,-1],[b,1]])if((!full&&(Math.abs(angle-start)<EPS||Math.abs(angle-end)<EPS))||!solid(angle+side*1e-5,(low+high)/2)){
    s.face([pt(inner,angle,low),pt(outer,angle,low),pt(outer,angle,high),pt(inner,angle,high)],material,[-Math.sin(angle)*side,0,Math.cos(angle)*side]);}
  }
 }
}

function floor(s,sem,{id,index,outline,holes=[],material='floor',role='floor'}){
 const cells=tileFloor(outline,holes),top=levelY(index);s.channel('floor',index);
 for(const c of cells)if(c.full)s.box([c.x,top-N.slab/2,c.z],[1,N.slab,1],material);else for(const poly of c.polygons)s.prism(poly,top,N.slab,material);
 sem.floors.push({id,zone:s.zone,floorId:floorId(index),index,nativeTop:top,thickness:N.slab,role,outline,holes,cells,
  area:cells.reduce((n,c)=>n+c.area,0),fullTiles:cells.filter(c=>c.full).length,boundaryTiles:cells.filter(c=>!c.full).length,
  queryStatus:'Full squares and boundary polygons are authoring geometry. An annular/polygon query adapter is required before gameplay.'});
 return cells;
}
function railing(s,center,r,y,start=0,end=TAU,{gap=null,material='seafoam'}={}){
 const count=Math.ceil((end-start)*r/(s.lod==='source'?.65:1));
 for(let i=0;i<count;i++){const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count,m=(a+b)/2;if(gap&&Math.abs(angleDelta(m,gap.theta))<gap.half)continue;
  const p=t=>[center[0]+r*Math.cos(t),y,center[1]+r*Math.sin(t)];
  const pa=p(a),pb=p(b);s.rod(add(pa,[0,.08,0]),add(pa,[0,1.05,0]),.023,material);
  for(const h of [.53,1.05])s.rod(add(pa,[0,h,0]),add(pb,[0,h,0]),.023,material);
 }
}
function landing(sem,id,index,rect,kind='stairs'){
 sem.landings.push({id,floorId:floorId(index),index,nativeY:levelY(index),polygon:rectangle(rect),kind,
  anchor:[rect.x+rect.width/2,levelY(index),rect.z+rect.depth/2]});
}
function switchback(s,sem,{id,x,z,index,rails=true}){
 const base=levelY(index),rise=N.floorSpacing/12,width=.9;s.channel('stair',index,index+1);
 // Two six-riser parallel flights and a real midway landing. Native pitch is unchanged.
 for(let i=0;i<6;i++)for(const upper of [false,true]){
  const y=base+(i+1+(upper?6:0))*rise,cx=upper?x+2.5-(i+.5)*.25:x+1+(i+.5)*.25,cz=z+(upper?2.4:.6);
  s.box([cx,y-.035,cz],[.25,.07,width],'steel',true);
  s.box([cx+.11,y+.007,cz],[.025,.018,width],'yellow');
  if(s.lod==='source')for(let q=-.35;q<=.36;q+=.14)s.box([cx,y+.009,cz+q],[.17,.012,.025],'dark');
 }
 s.box([x+3.25,base+1.06-N.slab/2,z+1.5],[1.5,N.slab,2.8],'steel');
 for(const lane of [.6,2.4]){const a=[x+1,base-.06,z+lane],b=[x+2.5,base+1.0,z+lane],c=[x+2.5,base+1.0,z+lane],d=[x+1,base+2.06,z+lane];if(lane<1)s.rod(a,b,.04,'steel');else s.rod(c,d,.04,'steel');}
 if(rails)for(const [upper,lane,edge]of [[false,.6,-.49],[true,2.4,.49]]){
  const a=[x+1,base+(upper?2.12:0)+1,z+lane+edge],b=[x+2.5,base+1.06+1,z+lane+edge];s.rod(a,b,.026,'seafoam');
  for(let i=0;i<3;i++){const t=i/2,p=[x+1+t*1.5,base+(upper?2.12-t*1.06:t*1.06),z+lane+edge];s.rod(p,add(p,[0,1,0]),.022,'seafoam');}
 }
 sem.stairs.push({id,fromFloorId:floorId(index),toFloorId:floorId(index+1),fromY:base,toY:levelY(index+1),
  footprint:{x,z,width:4,depth:3},treads:12,rise,midLandingY:base+1.06,
  bottomAnchor:[x+.5,base,z+.6],topAnchor:[x+.5,levelY(index+1),z+2.4],
  integration:'Visual treads/landings; swept clearance and navigation remain consumer-owned.'});
}
function door(s,sem,rigs,{id,center,yaw=0,index=17}){
 const transform=p=>add(center,rotate(p,yaw));s.channel('door-frame',index);
 for(const x of [-.59,.59])s.box(transform([x,1.02,0]),[.18,2.04,.34],'steel',false,yaw);
 s.box(transform([0,2.07,0]),[1.36,.12,.34],'steel',false,yaw);
 const leaf=new Surfaces(s.lod,s.uvMode);leaf.zone=s.zone;leaf.channel('door',index);
 leaf.box([.53,1.0,0],[1.06,1.98,.24],'steel',true);leaf.box([.53,1.0,.132],[.83,1.61,.035],'seafoam',true);
 for(const y of [.25,1.75])leaf.box([.53,y,.17],[.88,.09,.07],'steel',true);
 for(const y of [.28,1.0,1.72])leaf.rod([.025,y-.08,0],[.025,y+.08,0],.06,'steel');
 const hub=[.62,1.02,.23];leaf.rod(hub,add(hub,[0,0,.08]),.045,'brass');
 const count=s.lod==='source'?32:12;for(let i=0;i<count;i++){const a=i/count*TAU,b=(i+1)/count*TAU,at=t=>[hub[0]+.18*Math.cos(t),hub[1]+.18*Math.sin(t),hub[2]+.08];leaf.rod(at(a),at(b),.014,'seafoam',6);if(i%(count/4)===0)leaf.rod(add(hub,[0,0,.08]),at(a),.012,'seafoam',6);}
 const pivot=transform([-.53,0,0]);rigs.push({id,kind:'door',level:index,highLevel:index+1,pivot,yaw,axis:[0,1,0],maximum:90,swingSign:1,batches:[...leaf.batches.values()]});
 sem.openings.push({id,type:'door',floorId:floorId(index),center,yaw,clearWidth:1,clearHeight:2,
  state:'visual independent hinge; dynamic collision/interlock policy unassigned'});
}

function vault(s,sem,{id,a,b,index=17,diameter=3,extend=0,startExtend=extend,endExtend=extend}){
 const y=levelY(index),lo=a[0]-startExtend,hi=b[0]+endExtend,cz=a[1],centerY=y+1,r=diameter/2,outer=r+.16,segments=s.lod==='source'?96:40;
 s.channel('vault',index,index+1);
 for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU;
  for(const [radius,sign]of [[r,-1],[outer,1]]){const point=(x,t)=>[x,centerY+radius*Math.cos(t),cz+radius*Math.sin(t)],pts=[point(lo,a),point(hi,a),point(hi,b),point(lo,b)],normals=[a,a,b,b].map(t=>[0,Math.cos(t)*sign,Math.sin(t)*sign]);
   const repeat=SILO_MATERIALS.seafoam.repeat,uv=[[lo/repeat,a*radius/repeat],[hi/repeat,a*radius/repeat],[hi/repeat,b*radius/repeat],[lo/repeat,b*radius/repeat]];smoothQuad(s,pts,normals,uv,'seafoam');}
 }
 floor(s,sem,{id:id+'-deck',index,outline:rectangle({x:lo,z:cz-1,width:hi-lo,depth:2}),material:'steel'});
 s.channel('vault-detail',index,index+1);
 for(let x=lo+.25;x<hi-.1;x+=s.lod==='source'?2:4){
  for(let i=0;i<24;i++){const a=-1.95+i/24*3.9,b=-1.95+(i+1)/24*3.9;
   s.rod([x,centerY+r*Math.cos(a),cz+r*Math.sin(a)],[x,centerY+r*Math.cos(b),cz+r*Math.sin(b)],.026,'steel',6);}
  s.box([x,y+2.03,cz],[.42,.06,.36],'ivory',true);
 }
 for(const side of [-1,1])for(const h of [1.35,1.62])s.rod([lo+.02,y+h,cz+side*1.18],[hi-.02,y+h,cz+side*1.18],.045,'steel');
 sem.cableways.push({id,index,floorId:floorId(index),a,b,diameter,nominalLength:length(sub(a,b)),flatDeckWidth:2,
  interpretation:'Rounded 3 m cableway with a flat 2 m deck and open ends; cosmetic ribs/cable runs, no operational systems.'});
}

function rack(s,x,z,index,id='rack'){
 const y=levelY(index);s.channel('equipment',index);
 s.box([x,y+1,z],[1,2,1],'seafoam',true);s.box([x,y+1,z+.514],[.84,1.78,.035],'steel',true);
 for(let i=0;i<5;i++){const h=y+.28+i*.34;s.box([x,h,z+.543],[.73,.23,.025],'dark',true);s.box([x-.22,h,z+.564],[.18,.13,.015],'ivory');
  for(let j=0;j<3;j++){s.rod([x+.04+j*.11,h,z+.56],[x+.04+j*.11,h,z+.59],.035,j===0?'brass':'dark',8);}
  if(s.lod==='source')for(let j=0;j<5;j++)s.box([x-.04+j*.09,h-.07,z+.565],[.045,.012,.008],'ivory');}
 return {id,position:[x,y,z],dimensions:[1,2,1],meaning:'Nonfunctional visual equipment cabinet; no launch/weapon controls.'};
}
function consoleDesk(s,x,z,index,yaw=0){
 const y=levelY(index),T=p=>add([x,y,z],rotate(p,yaw));s.channel('furniture',index);
 for(const px of [-.72,.72])s.box(T([px,.42,0]),[.32,.84,.7],'seafoam',true,yaw);
 s.box(T([0,.88,.08]),[2,.12,1],'steel',true,yaw);s.box(T([0,1.1,-.20]),[1.9,.4,.32],'seafoam',true,yaw);
 for(const px of [-.62,0,.62]){s.box(T([px,1.15,.0]),[.40,.21,.025],'ivory',true,yaw);s.box(T([px,1.15,.018]),[.32,.14,.016],'glass',false,yaw);for(const dx of [-.12,.12])s.rod(T([px+dx,.965,.33]),T([px+dx,.985,.33]),.026,'brass',8);}
 // Existing-size office chair silhouette, not a new actor or operational control UI.
 s.box(T([0,.48,1.0]),[.62,.14,.62],'linen',true,yaw);s.box(T([0,.82,1.26]),[.62,.62,.11],'linen',true,yaw);for(const dx of [-.23,.23])for(const dz of [.77,1.23])s.rod(T([dx,.05,dz]),T([dx,.45,dz]),.024,'steel');
}
function dome(s,{center,outer,inner,bottom,height,index}){
 s.channel('roof',index,index+2);const around=s.lod==='source'?192:72,rings=s.lod==='source'?32:12;
 for(let j=0;j<rings;j++)for(let i=0;i<around;i++)for(const [radius,h,sign]of [[outer,height,1],[inner,height-.12,-1]]){
  const a=i/around*TAU,b=(i+1)/around*TAU,u=j/rings*Math.PI/2,v=(j+1)/rings*Math.PI/2;
  const pt=(t,q)=>[center[0]+radius*Math.cos(q)*Math.cos(t),bottom+h*Math.sin(q),center[1]+radius*Math.cos(q)*Math.sin(t)],normal=(t,q)=>mul(unit([Math.cos(q)*Math.cos(t)/radius,Math.sin(q)/h,Math.cos(q)*Math.sin(t)/radius]),sign);
  const pts=[pt(a,u),pt(b,u),pt(b,v),pt(a,v)],normals=[normal(a,u),normal(b,u),normal(b,v),normal(a,v)],uv=pts.map(p=>[p[0]/3,p[2]/3]);smoothQuad(s,pts,normals,uv,'concrete');
 }
}

function ringDeck(s,sem,index,{center=P.shaft.center,inner=P.shaft.voidRadius,outer=P.shaft.clearRadius,stair=true}={}){
 const segments=s.lod==='source'?256:96,holes=[circle(center,inner,segments)];if(stair)holes.push(rectangle(P.shaft.stair.hole));
 if(index===17&&center===P.shaft.center)holes.push(rectangle({x:102,z:17,width:2.5,depth:2}));
 floor(s,sem,{id:'shaft-deck-'+index,index,outline:circle(center,outer,segments),holes,material:index===0?'concrete':'floor'});
 s.channel('railing',index);railing(s,center,inner+.08,levelY(index),0,TAU,{gap:center===P.shaft.center&&P.shaft.platformIndices.includes(index)?{theta:0,half:Math.asin(.6/(inner+.08))}:null});
}
function servicePlatform(s,sem,rigs,index,center=P.shaft.center){
 // A small sliding service bridge. Its depicted travel is visual only.
 const part=new Surfaces(s.lod,s.uvMode);part.zone=s.zone;part.channel('service-bridge',index);
 const y=levelY(index);part.box([2.9,y-.04,0],[2.2,.08,1],'steel',true);
 for(let x=1.85;x<4.0;x+=s.lod==='source'?.07:.14)part.box([x,y+.01,0],[.025,.035,.94],'seafoam');
 for(const z of [-.49,.49]){part.rod([1.82,y+.02,z],[1.82,y+.95,z],.022,'seafoam');part.rod([1.82,y+.95,z],[3.95,y+.95,z],.022,'seafoam');}
 rigs.push({id:'service-bridge-'+index,kind:'platform',level:index,highLevel:index+1,pivot:[center[0],0,center[1]],yaw:0,axis:[1,0,0],travel:[1.5,0,0],maximum:1,batches:[...part.batches.values()]});
 sem.platforms.push({id:'service-bridge-'+index,index,floorId:floorId(index),interpretation:'Authored small service bridge, source-inspired; positions/collision and safety policy are not adopted.'});
}

function shaft(s,sem,rigs){
 s.zone='shaft';
 const c=P.shaft;
 for(let index=0;index<22;index++){s.channel('exterior',index);annularWall(s,{center:c.center,inner:c.clearRadius,outer:c.outerRadius,bottom:levelY(index),height:N.floorSpacing,openings:[c.servicePortal]});
  s.channel('shaft-services',index);for(const theta of [.2,1.7,3.9]){const x=c.center[0]+7.23*Math.cos(theta),z=c.center[1]+7.23*Math.sin(theta);s.rod([x,levelY(index),z],[x,levelY(index+1),z],.085,'seafoam');}
 }
 for(const index of c.deckIndices)ringDeck(s,sem,index);
 for(let index=0;index<=22;index++){
  const rect={x:c.stair.x,z:c.stair.z,width:1,depth:3};if(!c.deckIndices.includes(index)&&index!==22)floor(s,sem,{id:'shaft-stair-landing-'+index,index,outline:rectangle(rect),material:'steel'});landing(sem,'shaft-landing-'+index,index,rect);
  if(index<22)switchback(s,sem,{id:'shaft-stair-'+index,x:c.stair.x,z:c.stair.z,index});
 }
 for(const index of c.platformIndices)servicePlatform(s,sem,rigs,index);
 // Removable inert museum silhouette, with no weapon internals or function.
 s.zone='display';const missileHeight=31,missileBottom=levelY(21)-missileHeight,radius=1.5,segments=s.lod==='source'?128:48;
 for(let index=6;index<21;index++){
  const lo=Math.max(levelY(index),missileBottom),hi=Math.min(levelY(index+1),missileBottom+missileHeight-3);if(hi<=lo)continue;
  s.channel('display',index);annularWall(s,{center:c.center,inner:radius-.04,outer:radius,bottom:lo,height:hi-lo,material:index<10?'ivory':'steel'});
 }
 const tipBase=missileBottom+missileHeight-3;for(let i=0;i<segments;i++){
  const a=i/segments*TAU,b=(i+1)/segments*TAU;s.channel('display',19,21);
  s.tri([c.center[0]+radius*Math.cos(a),tipBase,c.center[1]+radius*Math.sin(a)],[c.center[0]+radius*Math.cos(b),tipBase,c.center[1]+radius*Math.sin(b)],[c.center[0],tipBase+3,c.center[1]],'ivory');
 }
 s.channel('display',5,7);for(const dx of [-1,1])for(const dz of [-1,1])s.rod([c.center[0]+dx,levelY(5),c.center[1]+dz],[c.center[0]+dx,missileBottom,c.center[1]+dz],.12,'steel');
 sem.display={name:'Inert display silhouette',diameter:3,height:31,role:'optional visual context; no internals, propulsion or launch behavior'};
}

function capsule(s,sem,rigs){
 s.zone='capsule';
 const c=P.capsule,segments=s.lod==='source'?256:96;
 for(let index=15;index<20;index++){s.channel('exterior',index);annularWall(s,{center:c.center,inner:c.clearRadius,outer:c.outerRadius,bottom:levelY(index),height:N.floorSpacing,openings:[c.portal]});}
 for(const index of c.plateIndices){const holes=index>15?[rectangle(c.stair.hole)]:[];if(index===17)holes.push(rectangle({x:15.5,z:17,width:3,depth:2}));
  floor(s,sem,{id:'capsule-floor-'+index,index,outline:circle(c.center,c.clearRadius,segments),holes,material:index===15?'floor':'ivory'});
 }
 for(let index=15;index<=19;index++){
  const rect={x:c.stair.x,z:c.stair.z,width:1,depth:3};
  if(!c.plateIndices.includes(index))floor(s,sem,{id:'capsule-stair-landing-'+index,index,outline:rectangle(rect),material:'steel'});
  landing(sem,'capsule-landing-'+index,index,rect);if(index<19)switchback(s,sem,{id:'capsule-stair-'+index,x:c.stair.x,z:c.stair.z,index});
 }
 dome(s,{center:c.center,outer:6,inner:5,bottom:levelY(20),height:2.12,index:20});
 for(const x of [9.5,11.5,13.5])rack(s,x,15,15);
 s.channel('equipment',15);s.box([14.5,levelY(15)+.8,20],[2,1.6,1.2],'seafoam',true);
 for(const x of [13.1,13.8,14.5])s.rod([x,levelY(15)+1.65,20],[x,levelY(17)-.2,20],.11,'steel');
 consoleDesk(s,12,14.7,17,0);consoleDesk(s,14.2,19.5,17,-Math.PI/2);
 // Original compact living bays, inspired by the source's three-room description.
 s.channel('partition',19);
 for(const a of [0,TAU/3,TAU*2/3])for(let i=0;i<3;i++){const r=2.5+i;s.box([c.center[0]+r*Math.cos(a),levelY(19)+1,c.center[1]+r*Math.sin(a)],[1,2,.16],'ivory',false,-a);}
 s.channel('furniture',19);
 for(const y of [.48,1.45]){s.box([14.1,levelY(19)+y,16],[.9,.16,2],'steel',true);s.box([14.1,levelY(19)+y+.14,16],[.86,.17,1.92],'linen',true);s.box([14.1,levelY(19)+y+.25,15.35],[.70,.12,.42],'ivory',true);}
 for(const x of [13.6,14.6])for(const z of [15,17])s.rod([x,levelY(19),z],[x,levelY(19)+2,z],.035,'steel');
 s.box([11,levelY(19)+.45,21],[2,.9,.7],'seafoam',true);s.box([11,levelY(19)+.96,21],[2.05,.12,.76],'ivory',true);
 sem.rooms.push({id:'capsule-utilities',index:15,diameter:10,use:'equipment and storage',source:'functional role supported; props/layout are original'},
  {id:'capsule-control',index:17,diameter:10,use:'control gallery',source:'functional role supported; nonfunctional desks are original'},
  {id:'capsule-living',index:19,diameter:10,use:'three suggested living bays',source:'source describes sleeping/kitchen/lavatory wedges; internal arrangement is an original grid adaptation'});
}

function wallRun(s,{a,b,index,height=2,material='concrete',holes=[]}){
 const axis=unit([b[0]-a[0],0,b[1]-a[1]]),run=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]),cuts=[0,run,...Array.from({length:Math.floor(run)},(_,i)=>i+1),...holes.flatMap(h=>[h.x-h.width/2,h.x+h.width/2])].filter(x=>x>=0&&x<=run).sort((a,b)=>a-b);
 s.channel('wall',index,Math.ceil(index+height/N.floorSpacing));
 for(let j=1;j<cuts.length;j++){const lo=cuts[j-1],hi=cuts[j],hole=holes.find(h=>(lo+hi)/2>h.x-h.width/2+EPS&&(lo+hi)/2<h.x+h.width/2-EPS),bottom=hole?hole.height:0;if(height<=bottom)continue;
  const width=hi-lo;if(width<EPS)continue;const heights=[bottom,height];for(let i=0;i<Math.ceil(height/2.12);i++)for(const y of [i*2.12,i*2.12+2])if(y>bottom+EPS&&y<height-EPS)heights.push(y);heights.sort((a,b)=>a-b);
  for(let k=1;k<heights.length;k++){const loY=heights[k-1],hiY=heights[k];if(hiY-loY<EPS)continue;const center=add([a[0],levelY(index)+(loY+hiY)/2,a[1]],mul(axis,(lo+hi)/2));s.box(center,[width,hiY-loY,.16],material,false,yaw);}}
}
function blastLock(s,sem,rigs){
 s.zone='blast-lock';
 const l=P.lock;floor(s,sem,{id:'blast-lock-floor',index:17,outline:rectangle(l),holes:[rectangle({x:31.5,z:17,width:1,depth:2}),rectangle({x:39.5,z:17,width:1,depth:2})],material:'floor'});
 wallRun(s,{a:[l.x,l.z],b:[l.x+l.width,l.z],index:17,height:4.24});
 wallRun(s,{a:[l.x,l.z+l.depth],b:[l.x+l.width,l.z+l.depth],index:17,height:4.24,holes:[{x:3.5,width:3,height:3}]});
 for(const x of [l.x,l.x+l.width])wallRun(s,{a:[x,l.z],b:[x,l.z+l.depth],index:17,height:4.24,holes:[{x:4.5,width:3,height:3}]});
 // Source-inspired dogleg: inner chamber with access in the south; west/east isolation leaves.
 wallRun(s,{a:[34.5,15.5],b:[34.5,20.5],index:17,height:2,holes:[{x:2.5,width:1,height:2}]});
 wallRun(s,{a:[37.5,15.5],b:[37.5,20.5],index:17,height:2,holes:[{x:2.5,width:1,height:2}]});
 for(const z of [15.5,20.5])wallRun(s,{a:[34.5,z],b:[37.5,z],index:17,height:2,holes:z>18?[{x:1.5,width:1,height:2}]:[]});
 door(s,sem,rigs,{id:'blast-door-west',center:[34.5,levelY(17),18],yaw:Math.PI/2});
 door(s,sem,rigs,{id:'blast-door-east',center:[37.5,levelY(17),18],yaw:Math.PI/2});
 door(s,sem,rigs,{id:'blast-door-inner',center:[36,levelY(17),20.5]});
 door(s,sem,rigs,{id:'blast-door-portal',center:[35,levelY(17),24.5]});
 floor(s,sem,{id:'portal-connector',index:17,outline:rectangle({x:33.5,z:22.5,width:3,depth:4}),material:'floor'});
 for(const x of [33.5,36.5])wallRun(s,{a:[x,22.5],b:[x,26.5],index:17,height:2});
 wallRun(s,{a:[33.5,24.5],b:[36.5,24.5],index:17,height:2,holes:[{x:1.5,width:1,height:2}]});
 sem.rooms.push({id:'blast-lock',index:17,width:9,depth:9,use:'source-inspired dogleg airlock; detailed chamber dimensions are original metre rounding'});
}
function accessPortal(s,sem){
 s.zone='access';
 const p=P.portal;
 for(let index=17;index<23;index++){
  for(const [a,b]of [[[p.x,p.z],[p.x+p.width,p.z]],[[p.x+p.width,p.z],[p.x+p.width,p.z+p.depth]],[[p.x+p.width,p.z+p.depth],[p.x,p.z+p.depth]],[[p.x,p.z+p.depth],[p.x,p.z]]]){
   const width=Math.hypot(b[0]-a[0],b[1]-a[1]);wallRun(s,{a,b,index,height:2.12,holes:index===17&&a[1]===p.z&&b[1]===p.z?[{x:width/2,width:3,height:2}]:index===22&&a[1]===p.z+p.depth&&b[1]===p.z+p.depth?[{x:width/2,width:1.2,height:2}]:[]});
  }
  const holes=index>17?[rectangle(p.stair.hole)]:[];
  if(index===17||index===22)floor(s,sem,{id:'portal-floor-'+index,index,outline:rectangle(p),holes,material:'concrete'});
  else floor(s,sem,{id:'portal-landing-'+index,index,outline:rectangle({x:p.stair.x,z:p.stair.z,width:1,depth:3}),material:'steel'});
  landing(sem,'portal-landing-'+index,index,{x:p.stair.x,z:p.stair.z,width:1,depth:3});
  if(index<22)switchback(s,sem,{id:'portal-stair-'+index,x:p.stair.x,z:p.stair.z,index});
 }
 s.channel('roof',22,23);s.box([p.x+p.width/2,2.12+.06,p.z+p.depth/2],[p.width+.32,.12,p.depth+.32],'concrete');
 sem.rooms.push({id:'access-portal',width:5,depth:6,fromIndex:17,toIndex:22,use:'five native intervals to the entry datum; sixty stair risers replace the source fifty-five as an explicit grid adaptation'});
}
function cover(s,sem,rigs){
 s.zone='shaft';
 const c=P.cover;s.channel('surface',22);
 // The surface plate finishes at the ground datum. Its stair well remains open;
 // a raised uncut collar would bury the upper landing and block the last flight.
 floor(s,sem,{id:'surface-collar',index:22,outline:circle(c.center,8.5,s.lod==='source'?256:96),holes:[circle(c.center,4,s.lod==='source'?256:96),rectangle(P.shaft.stair.hole)],material:'concrete'});
 s.channel('surface',22);
 // Keep fixed tracks outside the stair well. An open outrigger frame reaches
 // the tracks without a cross-member over the final midway landing.
 for(const z of [12.5,25.5]){s.box([117,.65,z],[24,.26,.28],'steel');for(let x=106;x<=128;x+=2)s.box([x,.28,z],[.6,.56,.6],'concrete',true);}
 const part=new Surfaces(s.lod,s.uvMode);part.zone=s.zone;part.channel('cover',22,23);part.box([111,1.55,18],[9,1,9],'concrete',true);
 for(const z of [12.5,25.5]){part.box([111,.97,z],[9.3,.2,.35],'steel',true);for(const x of [107,115])part.rod([x,.86,z-.11],[x,.86,z+.11],.085,'steel');}
 for(const x of [106.7,115.3])part.box([x,.97,19],[.3,.2,13.35],'steel',true);
 for(let i=0;i<9;i++)part.box([107+i,2.06,13.75],[.5,.025,.3],i%2?'dark':'yellow');
 rigs.push({id:'silo-cover',kind:'cover',level:22,highLevel:23,pivot:[0,0,0],yaw:0,axis:[1,0,0],travel:[12,0,0],maximum:1,batches:[...part.batches.values()]});
 sem.cover={id:'silo-cover',width:9,depth:9,height:1,travel:12,state:'visual slider only; no physical operating or blast-resistance claim'};
}

export function buildSiloMesh(id='coldwell-complex',{lod='game',uvMode='metres'}={}){
 const asset=siloAsset(id),s=new Surfaces(lod,uvMode),rigs=[],sem={floors:[],landings:[],stairs:[],openings:[],cableways:[],rooms:[],platforms:[]};
 switch(asset.kind){
  case 'complex':shaft(s,sem,rigs);capsule(s,sem,rigs);s.zone='cableway';for(const cable of P.cableways)vault(s,sem,{...cable,startExtend:cable.id==='short-cableway'?2:1,endExtend:cable.id==='long-cableway'?2:1});blastLock(s,sem,rigs);accessPortal(s,sem);cover(s,sem,rigs);break;
  case 'shaft':shaft(s,sem,rigs);cover(s,sem,rigs);break;
  case 'capsule':capsule(s,sem,rigs);break;
  case 'portal':accessPortal(s,sem);break;
  case 'lock':blastLock(s,sem,rigs);break;
  case 'cableway':vault(s,sem,{id:'repeat-cableway',a:[0,0],b:[4,0],index:22,diameter:3});break;
  case 'wall':s.channel('exterior',22);annularWall(s,{center:[0,0],inner:7.5,outer:8.5,bottom:0,height:2.12,start:0,end:Math.PI/2});break;
  case 'wall-portal':s.channel('exterior',22,23);annularWall(s,{center:[0,0],inner:7.5,outer:8.5,bottom:0,height:4.24,start:-Math.PI/4,end:Math.PI/4,openings:[{theta:0,width:3,bottom:0,height:3}]});break;
  case 'deck':ringDeck(s,sem,22,{center:[0,0],inner:4,outer:7.5,stair:false});break;
  case 'platform':servicePlatform(s,sem,rigs,22,[0,0]);break;
  case 'stair':switchback(s,sem,{id:'repeat-stair',x:0,z:0,index:22});for(const index of [22,23])floor(s,sem,{id:'stair-landing-'+index,index,outline:rectangle({x:0,z:0,width:1,depth:3}),material:'steel'});break;
  case 'door':door(s,sem,rigs,{id:'repeat-heavy-door',center:[0,0,0],index:22});break;
  case 'rack':rack(s,0,0,22);break;
  case 'console':consoleDesk(s,0,0,22);break;
  case 'cover':cover(s,sem,rigs);break;
  default:throw Error('Unsupported silo asset kind.');
 }
 const batches=[...s.batches.values()],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0;
 const expand=p=>{for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],p[i]);bounds.max[i]=Math.max(bounds.max[i],p[i]);}};
 for(const b of batches){triangles+=b.positions.length/9;for(let i=0;i<b.positions.length;i+=3)expand(b.positions.slice(i,i+3));}
 for(const rig of rigs)for(const b of rig.batches){triangles+=b.positions.length/9;for(let i=0;i<b.positions.length;i+=3)expand(add(rig.pivot,rotate(b.positions.slice(i,i+3),rig.yaw)));}
 const fullTiles=sem.floors.reduce((n,f)=>n+f.fullTiles,0),boundaryTiles=sem.floors.reduce((n,f)=>n+f.boundaryTiles,0);
 return {schema:'nautilus-silo-artist-mesh',version:1,asset,lod,uvMode,metresPerUnit:1,
  sourceProfile:{panel:1,wallHeight:2,wallThickness:.16,slab:.12,floorSpacing:2.12},nativeToWorld:structuredClone(P.nativeToWorld),
  bounds,metrics:{triangles,batches:batches.length,rigs:rigs.length,fullTiles,boundaryTiles,
   curveSegments:lod==='source'?256:96,maximumShaftChordErrorM:8.5*(1-Math.cos(Math.PI/(lod==='source'?256:96)))},
  semantics:sem,batches,rigs,integration:'Custom artist geometry only; curved query, navigation and dynamic collision capabilities remain unimplemented.'};
}
export function transformSiloRigPoint(rig,point,value=0){
 if(!Number.isFinite(value)||value<0||value>rig.maximum)throw Error('Invalid silo rig pose.');
 if(rig.kind==='door')return add(rig.pivot,rotate(point,rig.yaw+value*Math.PI/180*rig.swingSign));
 return add(add(rig.pivot,mul(rig.travel,value)),rotate(point,rig.yaw));
}
export function siloMotionBounds(data){
 const bounds=structuredClone(data.bounds);for(const rig of data.rigs){const steps=rig.kind==='door'?90:1;
  for(let i=0;i<=steps;i++)for(const batch of rig.batches)for(let k=0;k<batch.positions.length;k+=3){const p=transformSiloRigPoint(rig,batch.positions.slice(k,k+3),rig.maximum*i/steps);
   for(let axis=0;axis<3;axis++){bounds.min[axis]=Math.min(bounds.min[axis],p[axis]-.001);bounds.max[axis]=Math.max(bounds.max[axis],p[axis]+.001);}
  }
 }return bounds;
}
