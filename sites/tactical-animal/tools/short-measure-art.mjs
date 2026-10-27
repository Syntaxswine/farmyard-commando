// Rebuild the review's machine-readable manifest and top-down proposal.
import fs from 'node:fs';
import {ART_VERSION,SOURCES,PLACEMENTS,GROUND_MARKINGS,STRUCTURES,CAMERAS} from '../dist/mission-art/short-measure/manifest.js';
const root='sites/tactical-animal/dist/mission-art/short-measure';
const blockout=JSON.parse(fs.readFileSync(`${root}/blockout.json`,'utf8'));
const manifest={version:ART_VERSION,stage:'Authoring proposal; runtime adapter not installed',units:'metres',axes:'x east, z south, y up; size is [width,height,depth]; footprint is [west,north,east,south]',orientation:'Yaw radians about +Y; 0 faces south (+Z)',wallHeight:2,blockoutSource:{commit:blockout.sourceCommit,path:blockout.sourcePath},sources:SOURCES,structures:STRUCTURES,placements:PLACEMENTS,groundMarkings:GROUND_MARKINGS,cameras:CAMERAS};
fs.writeFileSync(`${root}/placements.json`,JSON.stringify(manifest,null,2)+'\n');
const scale=23,ox=64,oz=110,X=x=>ox+x*scale,Z=z=>oz+z*scale;
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const text=(x,y,s,size=15,color='#e8ddbf',extra='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${escape(s)}</text>`;
const rect=(x,z,w,d,attrs)=>`<rect x="${X(x)}" y="${Z(z)}" width="${w*scale}" height="${d*scale}" ${attrs}/>`;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000"><title>Short Measure environment placement proposal</title><desc>Authored blockout with proposed art solids and stable interaction anchors. Coordinates in metres, east right and south down.</desc><defs><pattern id="grid" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse"><path d="M${scale} 0H0V${scale}" fill="none" stroke="#758471" stroke-width=".6" opacity=".27"/></pattern><pattern id="proposal" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 7L7 0M5 9L9 5" stroke="#c97c4c" stroke-width="1.5"/></pattern></defs><rect width="1440" height="1000" fill="#202a29"/><g font-family="Arial,Helvetica,sans-serif">`;
svg+=text(64,42,'FARMYARD COMMANDO / ENVIRONMENT ART 01',13,'#c4b07e','letter-spacing="2"')+text(64,80,'SHORT MEASURE — EAST FEED MILL',30)+text(1015,79,'PLACEMENT PROPOSAL',15,'#d89d6a');
svg+=rect(.5,.5,39,29,'fill="#b4b59c" stroke="#e2d6b3" stroke-width="2"')+rect(.5,.5,39,29,'fill="url(#grid)"');
for(let i=5;i<40;i+=5)svg+=text(X(i)-5,102,i,12,'#b4c1ad');
for(let i=5;i<30;i+=5)svg+=text(35,Z(i)+4,i,12,'#b4c1ad');
for(const room of blockout.rooms){
 const [x,z,w,d]=room.rect;
 svg+=rect(x-.5,z-.5,w,d,'fill="#d5c7a1" stroke="#3b493e" stroke-width="4"');
 for(const [dx,dz] of room.doors){const vertical=Math.abs(dx-(x-.5))<.001||Math.abs(dx-(x+w-.5))<.001;svg+=rect(dx-(vertical?.12:.50),dz-(vertical?.50:.12),vertical?.24:1,vertical?1:.24,'fill="#d5c7a1"');}
 svg+=text(X(x+w/2-.5),Z(z+1),room.id.toUpperCase().replaceAll('-',' '),13,'#3d4c3e','text-anchor="middle" font-weight="700"');
}
for(const [x,z,w,d] of blockout.cover)svg+=rect(x-.5,z-.5,w,d,'fill="#778773" stroke="#3b493e" stroke-width="2"');
for(const route of blockout.routes){const color={direct:'#30566c',alternate:'#9b7740',departure:'#4a7160'}[route.id];svg+=`<polyline points="${route.points.map(([x,z])=>`${X(x)},${Z(z)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="7 5" opacity=".85"/>`;}
PLACEMENTS.forEach((p,i)=>{
 const [w,n,e,s]=p.footprint,isNew=p.status==='solid-proposal';
 svg+=rect(w,n,e-w,s-n,`fill="${isNew?'url(#proposal)':p.status==='decorative'?'#d7cfb0':'#b29a66'}" stroke="${isNew?'#a55332':'#3b493e'}" stroke-width="2" ${isNew?'stroke-dasharray="5 3"':''}`);
 const cx=X((w+e)/2),cy=Z((n+s)/2);
 svg+=`<circle cx="${cx}" cy="${cy}" r="10" fill="#28372e" stroke="#eee0b7" stroke-width="1.5"/>`+text(cx,cy+4,i+1,12,'#f4e4b5','text-anchor="middle" font-weight="700"');
});
for(const [id,p,color] of [['ENTRY',blockout.spawn,'#345d63'],['EXIT',blockout.extraction,'#406a4b']])svg+=`<circle cx="${X(p[0])}" cy="${Z(p[1])}" r="10" fill="${color}" stroke="#eadbad" stroke-width="2"/>`+text(X(p[0]),Z(p[1])+28,id,11,'#263c34','text-anchor="middle" font-weight="700"');
svg+=`<path d="M${X(32)} ${Z(7)-8}l8 8-8 8-8-8Z" fill="#b45334" stroke="#ffebac" stroke-width="2"/>`;
for(const g of blockout.guardPosts)svg+=`<circle cx="${X(g.at[0])}" cy="${Z(g.at[1])}" r="5" fill="#a53b29"/>`;
svg+=text(68,850,'N ↑   x east / y south   ·   metres   ·   walls 2 m',13,'#b4c1ad');
svg+=text(68,882,'Dashed rust: proposed new collision. Olive: inherited cover. Numbers: art placements.',14);
svg+=text(68,908,'Blue / ochre: approaches. Green: departure. Red diamond: mandatory manifest use point.',14);
svg+=text(68,943,'Review cameras pan to the story props at the normal 13 m span; these are not spawn-camera captures.',14,'#d5b983');
svg+=text(1015,120,'ART / COLLISION CONTRACT',16,'#e1bd7e','font-weight="700"');
const names=['RIGGED RATION SCALE','INTACT FREIGHT SCALE','ARRIVAL FULL SACKS','SEALED LOAD / EXISTING COVER','COLLAPSED WORKER SACKS','DISPATCH DESK + MANIFEST'];
PLACEMENTS.forEach((p,i)=>{const y=162+i*105;svg+=text(1015,y,`${i+1}  ${names[i]}`,15,'#e8ddbf','font-weight="700"')+text(1015,y+23,p.id,13,'#c6b988')+text(1015,y+46,`${p.size[0]} × ${p.size[2]} m · height ${p.height} m`,13,'#b7c5ae')+text(1015,y+67,p.status==='decorative'?'Ground dressing / no collision':p.status==='existing-cover-replacement'?'Replace visual only after binding':'New solid / runtime binding required',12,'#d89d6a');});
svg+=text(1015,825,'UNCHANGED ANCHORS',15,'#e1bd7e','font-weight="700"')+text(1015,851,'worker-scale (8,20)',13)+text(1015,875,'sealed-load (28,20)',13)+text(1015,899,'shipping-manifest (32,7)',13)+text(1015,936,'No UI changes. No live deployment.',13,'#b7c5ae');
svg+='</g></svg>\n';
fs.writeFileSync(`${root}/placement.svg`,svg);
fs.mkdirSync('docs/art/short-measure',{recursive:true});
fs.writeFileSync('docs/art/short-measure/placement.svg',svg);
console.log('Short Measure placement manifest and top-down proposal regenerated.');
