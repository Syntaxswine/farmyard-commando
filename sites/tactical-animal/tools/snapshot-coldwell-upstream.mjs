import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const commit='8c4670450cb2b38c1e1abd811d633c22de9e2b7c';
const target=path.resolve('sites/tactical-animal/dist/vendor/nautilus/'+commit);
const record=path.resolve('sites/tactical-animal/coldwell-upstream.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.argv.includes('--check')){
  const manifest=JSON.parse(fs.readFileSync(record));
  if(manifest.commit!==commit)throw Error('Unexpected Coldwell upstream revision.');
  for(const file of manifest.files){const bytes=fs.readFileSync(path.join(target,file.path));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Coldwell upstream changed: '+file.path);}
  const silo=JSON.parse(fs.readFileSync(path.resolve('sites/tactical-animal/coldwell-silo-upstream.json')));
  if(silo.commit!=='3b9d4004a7e51e5d345cded068fc46eab2f320a2'||silo.archiveSHA256!=='b489bb7439a22746281eb2dcc052cd124cc77917a9c00aeaa4c02ee5f1db873f')throw Error('Unexpected silo source identity.');
  for(const file of silo.files){const bytes=fs.readFileSync(path.join(silo.root,file.path));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Original silo implementation changed: '+file.path);}
  console.log('Coldwell optional upstream closure matches '+commit+'.');
}else{
  const source=process.argv[2];if(!source)throw Error('Supply the read-only Nautilus Git repository path.');
  if(fs.existsSync(record)||fs.existsSync(target))throw Error('Snapshot already exists; use --check.');
  const files=['NOTICE.md','packages/world-core/validation.js','packages/world-core/state.js','packages/world-core/queries.js','packages/floor-navigation/index.js','packages/floor-navigation/dom.js','packages/floor-navigation/style.css'];
  const manifest={repository:'https://github.com/Syntaxswine/nautilus-engine',commit,purpose:'Optional Coldwell height validation, AABB broad phase and floor controls; exact custom-geometry narrow phase remains an adapter.',files:[]};
  for(const file of files){const bytes=execFileSync('git',['-C',source,'show',commit+':'+file],{maxBuffer:8*1024*1024});const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);manifest.files.push({path:file,bytes:bytes.length,sha256:sha(bytes)});}
  fs.writeFileSync(record,JSON.stringify(manifest,null,2)+'\n');console.log('Preserved '+files.length+' upstream files from '+commit+'.');
}
