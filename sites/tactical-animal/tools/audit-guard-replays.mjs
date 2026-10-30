// Reproduce the old golden runs from an exact Git module closure, then identify
// the first changed played-state/preview in each new run before writing goldens.
// node sites/tactical-animal/tools/audit-guard-replays.mjs [--write-baseline]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as candidate from '../dist/solo-game.js';
import {fuzzRun} from '../tests/neutral-fuzz.mjs';
const base='783f45baf935bed592f423e6bf8ed852648e5cfa',root=path.resolve('.'),dist='sites/tactical-animal/dist/',output=path.resolve('artifacts/guard-followups'),frozen=path.join(output,'base-'+base.slice(0,7)),visited=new Set();
fs.mkdirSync(output,{recursive:true});
function snapshot(file){if(visited.has(file))return;visited.add(file);const bytes=execFileSync('git',['show',base+':'+dist+file],{maxBuffer:16*1024*1024}),dest=path.join(frozen,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
  for(const [,relative] of bytes.toString().matchAll(/\bfrom\s*['"](\.\.?\/[^'"]+)['"]/g))snapshot(path.posix.normalize(path.posix.join(path.posix.dirname(file),relative)));
}
snapshot('solo-game.js');const previous=await import(pathToFileURL(path.join(frozen,'solo-game.js')).href),golden=JSON.parse(fs.readFileSync('sites/tactical-animal/tests/scenery-neutrality-baseline.json'));
const fields=['state','post','seenRound','alertClock','contact','lastHeard','search','returning','guardRoute','yieldRound','yieldWait','yieldRequest'];
function played(M,state){const saved=JSON.parse(M.encodeSave(state));for(const g of saved.units)if(g.team==='guard')for(const key of fields)delete g[key];return saved;}
function changes(a,b,at='state',out=[]){if(out.length>=8||JSON.stringify(a)===JSON.stringify(b))return out;if(!a||!b||typeof a!=='object'||typeof b!=='object'){out.push({path:at,before:a,after:b});return out;}
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){changes(a[key],b[key],at+'.'+key,out);if(out.length>=8)break;}return out;
}
const command=roll=>roll<.45?'manual move':roll<.55?'stance':roll<.65?'targeted shot':roll<.72?'grenade':roll<.78?'flame':roll<.84?'end turn':roll<.94?'click move':'interaction';
const sourceHashes=Object.fromEntries(['solo-game.js','guard-awareness.js','guard-coordination.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(dist,f),'utf8').replaceAll('\r\n','\n')).digest('hex')]));
const evidence={base,candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:'node sites/tactical-animal/tools/audit-guard-replays.mjs',sourceHashes,eventDefinition:'First difference after each public fuzz command. Played-state comparison omits only the listed newly saved guard fields; previews compare existing displayed fields.',omittedGuardFields:fields,rows:[]};
for(const row of golden.rows){
  const before=[],after=[];const capture=(M,into)=>({step,roll,state,previews})=>into.push({step,command:command(roll),played:played(M,state),previews});
  const oldHash=fuzzRun(previous,row.missionId,row.seed,row.steps,{onStep:capture(previous,before)});if(oldHash!==row.hash)throw Error('Old golden did not reproduce: '+row.missionId+' seed '+row.seed);
  const hash=fuzzRun(candidate,row.missionId,row.seed,row.steps,{onStep:capture(candidate,after)});
  const first=key=>{for(let i=0;i<before.length;i++)if(JSON.stringify(before[i][key])!==JSON.stringify(after[i][key]))return {step:i,command:after[i].command,changes:changes(before[i][key],after[i][key],key)};return null;};
  evidence.rows.push({...row,previousHash:oldHash,hash,firstPlayedChange:first('played'),firstPreviewChange:first('previews')});
}
const destination='docs/reviews/guard-followups-replays.json';fs.writeFileSync(path.join(output,'replays.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
if(process.argv.includes('--write-baseline')){
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n');
  fs.writeFileSync('sites/tactical-animal/tests/guard-followups-baseline.json',JSON.stringify({source:'Intentional guard-state, shot-exposure and report changes; original goldens remain in scenery-neutrality-baseline.json. See '+destination,base,runtimeRevision:evidence.candidate,sourceHashes,rows:evidence.rows.map(({missionId,seed,steps,hash})=>({missionId,seed,steps,hash}))},null,2)+'\n');
}
